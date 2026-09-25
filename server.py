#!/usr/bin/env python3
"""
server.py — Serveur du portfolio BTS SIO
Usage  : python3 server.py
Accès  : http://127.0.0.1:8080 (proxié par Apache en prod)
Admin  : /admin
Arrêt  : Ctrl+C
"""
import http.server
import json
import os
import base64
import hashlib
import secrets
import subprocess
import threading
import time
import re
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from urllib.parse import urlparse, parse_qs

PORT = 8080
BIND_ADDR = os.environ.get('PORTFOLIO_BIND', '127.0.0.1')
FILES_DIR_NAME = 'files'

TEXT_EXTS = {
    'py','java','sql','html','css','js','php','md','txt','json','xml',
    'sh','bat','ts','c','cpp','cs','rb','go','rs','h','hpp','yaml','yml',
    'ini','cfg','conf','log','toml','tf','r','scala','kt','swift','dart',
    'lua','pl','ps1','gitignore','env',
}
IMAGE_EXTS = {'jpg','jpeg','png','gif','webp','svg','bmp','ico'}
BINARY_EXTS = {'pdf','doc','odt','xlsx','xls','pptx','ppt','zip','rar','7z','exe','class','jar','pyc'}
MIME_MAP = {
    'svg':'image/svg+xml','gif':'image/gif','png':'image/png',
    'webp':'image/webp','bmp':'image/bmp','ico':'image/x-icon',
    'jpg':'image/jpeg','jpeg':'image/jpeg',
}

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(BASE_DIR, 'config.json')
FILES_DIR = os.path.join(BASE_DIR, FILES_DIR_NAME)

# Racine autorisée pour /viewer.php : ce endpoint n'a aucune authentification
# (les visiteurs du portfolio doivent pouvoir parcourir les projets sans se
# connecter), donc il ne doit JAMAIS pouvoir sortir de ce dossier. Sans ça
# n'importe qui peut lire un chemin absolu arbitraire sur le serveur
# (clés SSH, .env des autres services, etc.) — faille corrigée le 2026-09-09.
VIEWER_ROOT = os.path.realpath(os.path.join(BASE_DIR, 'cours'))

_W_NS = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}

# Fichiers/chemins jamais servis statiquement (contiennent des secrets ou du code serveur)
_FORBIDDEN_STATIC = {'/config.json', '/server.py'}


def _hash_password(password, salt=None):
    """PBKDF2-HMAC-SHA256, 200k itérations. Retourne (salt_hex, hash_hex)."""
    if salt is None:
        salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), bytes.fromhex(salt), 200_000)
    return salt, dk.hex()


def _verify_password(password, salt, expected_hash):
    _, computed = _hash_password(password, salt)
    return secrets.compare_digest(computed, expected_hash)


def _docx_plain_text(path):
    """Extrait le texte brut d'un fichier .docx (ZIP + word/document.xml)."""
    try:
        with zipfile.ZipFile(path, 'r') as z:
            xml_bytes = z.read('word/document.xml')
    except (KeyError, zipfile.BadZipFile, OSError):
        return None
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError:
        return None
    lines = []
    for para in root.findall('.//w:p', _W_NS):
        parts = []
        for node in para.findall('.//w:t', _W_NS):
            if node.text:
                parts.append(node.text)
            if node.tail:
                parts.append(node.tail)
        lines.append(''.join(parts))
    text = '\n'.join(lines)
    return text.strip() and text or None

# ── Session tokens: {token: expiry_datetime} ────────────────────────────────
_sessions = {}
_sessions_lock = threading.Lock()

TOKEN_TTL_HOURS = 24


def _create_token():
    token = secrets.token_hex(32)
    expiry = datetime.utcnow() + timedelta(hours=TOKEN_TTL_HOURS)
    with _sessions_lock:
        _sessions[token] = expiry
    return token


def _validate_token(token):
    with _sessions_lock:
        expiry = _sessions.get(token)
        if expiry and datetime.utcnow() < expiry:
            return True
        if token in _sessions:
            del _sessions[token]
        return False


def _revoke_token(token):
    with _sessions_lock:
        _sessions.pop(token, None)


def _load_config():
    return _load_json_config(CONFIG_PATH)


def _load_json_config(path):
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {}


def _save_config(data):
    with open(CONFIG_PATH, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def _config_without_admin(cfg):
    """Return config dict without the admin section."""
    return {k: v for k, v in cfg.items() if k != 'admin'}


# ── Tunnel manager ────────────────────────────────────────────────────────────
class TunnelManager:
    def __init__(self):
        self.status = 'stopped'   # stopped | starting | running | error
        self.url = None
        self.error = None
        self._proc = None
        self._thread = None

    def start(self):
        if self.status in ('starting', 'running'):
            return
        self.status = 'starting'
        self.url = None
        self.error = None
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def stop(self):
        if self._proc:
            try:
                self._proc.terminate()
            except Exception:
                pass
            self._proc = None
        self.status = 'stopped'
        self.url = None
        self.error = None

    def get_status(self):
        return {
            'status': self.status,
            'url': self.url,
            'error': self.error,
        }

    def _find_cloudflared(self):
        import shutil
        # Cherche d'abord dans le dossier du serveur
        local = os.path.join(BASE_DIR, 'cloudflared.exe')
        if os.path.isfile(local):
            return local
        # Puis dans le PATH système
        return shutil.which('cloudflared')

    def _run(self):
        url_pattern = re.compile(r'https://[a-z0-9\-]+\.trycloudflare\.com')
        cf = self._find_cloudflared()
        if not cf:
            self.status = 'error'
            self.error = 'cloudflared non trouvé. Placez cloudflared.exe dans le dossier portfolio.'
            return
        try:
            self._proc = subprocess.Popen(
                [cf, 'tunnel', '--url', f'http://localhost:{PORT}'],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,   # stderr séparé pour le lire en parallèle
                text=True,
                encoding='utf-8',
                errors='replace',
            )
        except Exception as e:
            self.status = 'error'
            self.error = str(e)
            return

        def _scan(stream):
            for line in stream:
                m = url_pattern.search(line)
                if m and self.status != 'running':
                    self.url = m.group(0)
                    self.status = 'running'

        # Lire stdout ET stderr en parallèle (l'URL est dans stderr)
        t_out = threading.Thread(target=_scan, args=(self._proc.stdout,), daemon=True)
        t_err = threading.Thread(target=_scan, args=(self._proc.stderr,), daemon=True)
        t_out.start()
        t_err.start()

        self._proc.wait()          # Attend la fin du processus
        t_out.join(timeout=2)
        t_err.join(timeout=2)

        if self.status not in ('running', 'stopped'):
            self.status = 'error'
            if not self.error:
                self.error = 'Le tunnel s\'est arrêté de façon inattendue.'
        self._proc = None


tunnel = TunnelManager()


import mimetypes
mimetypes.add_type('text/css',               '.css')
mimetypes.add_type('application/javascript', '.js')
mimetypes.add_type('text/html',              '.html')
mimetypes.add_type('application/json',       '.json')


# ── HTTP Handler ──────────────────────────────────────────────────────────────
class PortfolioHandler(http.server.SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        # Aucun segment commençant par un point n'est servi. Sans ça, un dossier
        # .git dans ce répertoire serait intégralement téléchargeable (historique
        # compris, donc d'anciennes versions de config.json et ses identifiants) ;
        # idem pour un éventuel .env. Vérifié le 2026-09-25 : ces chemins
        # répondaient 200 avant ce correctif.
        if path in _FORBIDDEN_STATIC or any(seg.startswith('.') for seg in path.split('/') if seg):
            self._json({'error': 'Accès refusé.'}, status=403)

        elif path in ('/viewer.php', '/portfolio/viewer.php'):
            params = parse_qs(parsed.query)
            raw = params.get('path', [''])[0]
            self._handle_viewer(raw)

        elif path == '/config.js':
            cfg = _load_config()
            pub = _config_without_admin(cfg)
            body = ('window.PORTFOLIO_CONFIG = ' + json.dumps(pub, ensure_ascii=False) + ';').encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/javascript; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(body)

        elif path == '/api/config':
            if not self._check_auth():
                return
            self._json(_load_config())

        elif path == '/api/tunnel/status':
            if not self._check_auth():
                return
            self._json(tunnel.get_status())

        elif path == '/admin':
            admin_path = os.path.join(BASE_DIR, 'admin.html')
            if not os.path.isfile(admin_path):
                self._json({'error': 'admin.html introuvable'}, status=404)
                return
            with open(admin_path, 'rb') as f:
                body = f.read()
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        elif path == '/api/site-version':
            # Rechargement automatique du site (voir js/effects.js) : chaque
            # page interroge cette route toutes les quelques secondes. Pas de
            # bookkeeping manuel — la "version" est juste la date de
            # modification la plus récente parmi les fichiers qui composent
            # le site ; elle change donc automatiquement dès qu'un fichier
            # est édité, sans rien à mettre à jour ici à la main.
            watched = [
                'index.html', 'sisr/index.html', 'slam/index.html', 'contact/index.html',
                'slam/apropos/index.html', 'slam/competences/index.html', 'slam/projets/index.html',
                'slam/referentiel/index.html', 'slam/cybersecurite/index.html',
                'css/style.css', 'js/script.js', 'js/effects.js',
            ]
            latest = 0.0
            for rel in watched:
                p = os.path.join(BASE_DIR, rel)
                try:
                    latest = max(latest, os.path.getmtime(p))
                except OSError:
                    pass
            self._json({'v': latest})

        else:
            super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        length = int(self.headers.get('Content-Length', 0))
        raw_body = self.rfile.read(length) if length else b''
        try:
            body = json.loads(raw_body) if raw_body else {}
        except Exception:
            body = {}

        if path == '/api/auth':
            cfg = _load_config()
            admin_cfg = cfg.get('admin', {})
            expected_user = admin_cfg.get('username', '')
            salt = admin_cfg.get('salt', '')
            expected_hash = admin_cfg.get('password_hash', '')
            given_user = body.get('username', '')
            given_pw = body.get('password', '')
            ok = bool(salt and expected_hash) \
                and secrets.compare_digest(given_user, expected_user) \
                and _verify_password(given_pw, salt, expected_hash)
            if ok:
                token = _create_token()
                self._json({'token': token})
            else:
                self._json({'error': 'Identifiant ou mot de passe incorrect'}, status=401)

        elif path == '/api/logout':
            auth = self.headers.get('Authorization', '')
            if auth.startswith('Bearer '):
                _revoke_token(auth[7:])
            self._json({'ok': True})

        elif path == '/api/config':
            if not self._check_auth():
                return
            try:
                _save_config(body)
                self._json({'ok': True})
            except Exception as e:
                self._json({'error': str(e)}, status=500)

        elif path == '/api/tunnel/start':
            if not self._check_auth():
                return
            tunnel.start()
            self._json(tunnel.get_status())

        elif path == '/api/tunnel/stop':
            if not self._check_auth():
                return
            tunnel.stop()
            self._json(tunnel.get_status())

        elif path == '/api/report':
            if not self._check_auth():
                return
            try:
                self._save_report(body)
            except Exception as e:
                self._json({'error': str(e)}, status=500)

        elif path == '/api/admin/credentials':
            if not self._check_auth():
                return
            self._change_credentials(body)

        else:
            self._json({'error': 'Route inconnue'}, status=404)

    def _change_credentials(self, body):
        cfg = _load_config()
        admin_cfg = cfg.get('admin', {})
        current_password = body.get('current_password', '')
        new_username = (body.get('new_username') or '').strip()
        new_password = body.get('new_password', '')

        salt = admin_cfg.get('salt', '')
        expected_hash = admin_cfg.get('password_hash', '')
        if not (salt and expected_hash and _verify_password(current_password, salt, expected_hash)):
            self._json({'error': 'Mot de passe actuel incorrect'}, status=401)
            return
        if not new_password:
            self._json({'error': 'Le nouveau mot de passe est vide'}, status=400)
            return

        new_salt, new_hash = _hash_password(new_password)
        admin_cfg['username'] = new_username or admin_cfg.get('username', '')
        admin_cfg['salt'] = new_salt
        admin_cfg['password_hash'] = new_hash
        cfg['admin'] = admin_cfg
        _save_config(cfg)
        self._json({'ok': True})

    def _save_report(self, body):
        title = (body.get('title') or '').strip()
        description = (body.get('description') or '').strip()
        filename = body.get('filename')
        content_b64 = body.get('content_base64')

        cfg = _load_config()
        rapport = cfg.get('rapport', {})

        if filename and content_b64:
            safe_name = re.sub(r'[^A-Za-z0-9_.\-]', '_', filename)
            os.makedirs(FILES_DIR, exist_ok=True)
            try:
                data = base64.b64decode(content_b64)
            except Exception:
                self._json({'error': 'Fichier invalide (base64).'}, status=400)
                return
            dest = os.path.join(FILES_DIR, safe_name)
            with open(dest, 'wb') as f:
                f.write(data)

            preview = None
            if safe_name.lower().endswith('.docx'):
                preview = _docx_plain_text(dest)

            rapport['filename'] = safe_name
            rapport['url'] = f'/{FILES_DIR_NAME}/{safe_name}'
            rapport['preview'] = preview
            rapport['size'] = len(data)

        rapport['title'] = title or rapport.get('title', 'Rapport de stage')
        rapport['description'] = description
        rapport['updated'] = datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')

        cfg['rapport'] = rapport
        _save_config(cfg)
        self._json({'ok': True, 'rapport': rapport})

    def _json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)

    def _check_auth(self):
        auth = self.headers.get('Authorization', '')
        if auth.startswith('Bearer ') and _validate_token(auth[7:]):
            return True
        self._json({'error': 'Non autorisé'}, status=401)
        return False

    def _handle_viewer(self, raw):
        try:
            self._do_handle_viewer(raw)
        except Exception as e:
            self._json({'error': f'Erreur interne : {str(e)}'}, status=500)

    def _do_handle_viewer(self, raw):
        if not raw:
            self._json({'error': 'Aucun chemin fourni.'})
            return

        # `raw` peut arriver avec des séparateurs Windows (chemins copiés
        # depuis config.json, écrit à l'origine pour un usage local sous
        # Windows) : normalisés en '/' avant tout traitement.
        raw_norm = raw.replace('\\', '/')
        os.makedirs(VIEWER_ROOT, exist_ok=True)

        if os.path.isabs(raw_norm):
            # Chemin déjà résolu, renvoyé par un appel précédent (clic sur un
            # élément listé en naviguant dans un dossier) : doit déjà pointer
            # sous VIEWER_ROOT, vérifié juste après.
            path = os.path.realpath(raw_norm)
        else:
            # Chemin relatif (config.json, écrit pour un usage local Windows
            # à l'origine) : résolu depuis la racine autorisée.
            path = os.path.realpath(os.path.join(VIEWER_ROOT, raw_norm.lstrip('/')))

        # Endpoint public, sans authentification : quoi qu'il arrive, le
        # résultat doit rester sous VIEWER_ROOT. Bloque tout `..` ou lien
        # symbolique qui tenterait d'en sortir (accès au reste du VPS).
        if path != VIEWER_ROOT and not path.startswith(VIEWER_ROOT + os.sep):
            self._json({'error': 'Chemin non autorisé.'}, status=403)
            return

        if not os.path.exists(path):
            self._json({
                'error': f'Fichier introuvable : {os.path.basename(raw)}',
                'tip': 'Vérifiez le chemin racine dans ⚙️ Configuration.',
            })
            return

        name = os.path.basename(path)
        ext  = os.path.splitext(name)[1].lstrip('.').lower()

        # ── Dossier ──────────────────────────────────────────────
        if os.path.isdir(path):
            try:
                entries = os.listdir(path)
            except PermissionError:
                self._json({'error': 'Permission refusée.'})
                return
            items = []
            for e in entries:
                fp    = os.path.join(path, e)
                is_d  = os.path.isdir(fp)
                fext  = '' if is_d else os.path.splitext(e)[1].lstrip('.').lower()
                items.append({'name': e, 'path': fp, 'isDir': is_d, 'ext': fext,
                              'size': os.path.getsize(fp) if os.path.isfile(fp) else None})
            items.sort(key=lambda x: (not x['isDir'], x['name'].lower()))
            self._json({'type': 'dir', 'name': name, 'path': path, 'items': items})
            return

        # ── Image ────────────────────────────────────────────────
        if ext in IMAGE_EXTS:
            try:
                with open(path, 'rb') as f:
                    data = f.read()
                mime = MIME_MAP.get(ext, 'image/jpeg')
                self._json({'type': 'image', 'name': name, 'path': path, 'ext': ext,
                            'data': f'data:{mime};base64,{base64.b64encode(data).decode()}'})
            except Exception:
                self._json({'error': "Impossible de lire l'image."})
            return

        # ── Word .docx → texte affichable ───────────────────────
        if ext == 'docx':
            plain = _docx_plain_text(path)
            if plain is not None:
                plain = plain.replace('\0', '')
                self._json({
                    'type': 'text', 'name': name, 'path': path, 'ext': 'txt',
                    'content': plain, 'lines': plain.count('\n') + 1,
                    'size': len(plain.encode('utf-8')),
                    'note': 'Contenu extrait du fichier Word (.docx)',
                })
                return
            self._json({
                'type': 'binary', 'name': name, 'path': path, 'ext': ext,
                'size': os.path.getsize(path),
                'tip': 'Impossible d’extraire le texte de ce .docx.',
            })
            return

        # ── PDF → affiché directement dans le lecteur (comme les images),
        # pas juste un message "impossible à afficher". Le navigateur sait
        # rendre nativement un data: URI application/pdf dans un <embed>.
        # Plafond à 20 Mo : au-delà, l'encodage base64 + le JSON deviennent
        # lourds pour peu d'intérêt (une lettre de motivation ou un rapport
        # de stage pèsent quelques centaines de Ko) — on retombe alors sur
        # le comportement "binaire" classique avec juste le chemin copiable.
        if ext == 'pdf' and os.path.getsize(path) <= 20 * 1024 * 1024:
            try:
                with open(path, 'rb') as f:
                    data = f.read()
                self._json({
                    'type': 'pdf', 'name': name, 'path': path, 'ext': ext,
                    'size': len(data),
                    'data': f'data:application/pdf;base64,{base64.b64encode(data).decode()}',
                })
            except Exception:
                self._json({'error': "Impossible de lire le PDF."})
            return

        # ── Binaire ──────────────────────────────────────────────
        if ext in BINARY_EXTS:
            self._json({'type': 'binary', 'name': name, 'path': path, 'ext': ext,
                        'size': os.path.getsize(path)})
            return

        # ── Texte / Code ─────────────────────────────────────────
        content = None
        for enc in ('utf-8', 'windows-1252', 'iso-8859-1'):
            try:
                with open(path, 'r', encoding=enc, errors='strict') as f:
                    content = f.read()
                break
            except (UnicodeDecodeError, LookupError):
                continue
        if content is None:
            with open(path, 'r', encoding='utf-8', errors='replace') as f:
                content = f.read()
        content = content.replace('\0', '')
        self._json({'type': 'text', 'name': name, 'path': path, 'ext': ext,
                    'content': content, 'lines': content.count('\n') + 1,
                    'size': len(content.encode('utf-8'))})

    def log_message(self, fmt, *args):
        if args and str(args[1]) not in ('200', '304'):
            super().log_message(fmt, *args)


if __name__ == '__main__':
    os.chdir(BASE_DIR)
    os.makedirs(FILES_DIR, exist_ok=True)
    print(f'Portfolio  →  http://{BIND_ADDR}:{PORT}')
    print(f'Admin      →  http://{BIND_ADDR}:{PORT}/admin')
    print('Ctrl+C pour arrêter.\n')
    with http.server.ThreadingHTTPServer((BIND_ADDR, PORT), PortfolioHandler) as httpd:
        httpd.serve_forever()
