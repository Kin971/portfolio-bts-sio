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
import shutil
import subprocess
import threading
import time
import re
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from urllib.parse import parse_qs, unquote

PORT = 8080
BIND_ADDR = os.environ.get('PORTFOLIO_BIND', '127.0.0.1')
FILES_DIR_NAME = 'files'

# Taille maximale d'un corps de requête POST. Le plus gros envoi légitime
# est le rapport de stage encodé en base64 (+33 %) : 40 Mo laissent de la
# marge pour un .docx/.pdf d'une vingtaine de Mo. Au-delà, refus avant
# lecture — sinon n'importe qui peut faire allouer des Go au serveur via
# un Content-Length énorme sur /api/auth (route non authentifiée).
MAX_BODY_BYTES = 40 * 1024 * 1024

# Anti-bruteforce sur /api/auth : au-delà de LOGIN_MAX_FAILS échecs depuis
# la même IP sur LOGIN_WINDOW_S secondes, les tentatives sont refusées
# (429) sans même calculer le PBKDF2 — ce qui protège aussi le CPU.
LOGIN_MAX_FAILS = 5
LOGIN_WINDOW_S = 15 * 60

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
CONFIG_EXAMPLE_PATH = os.path.join(BASE_DIR, 'config.example.json')
FILES_DIR = os.path.join(BASE_DIR, FILES_DIR_NAME)
NOT_FOUND_PAGE = os.path.join(BASE_DIR, '404.html')

# Racine autorisée pour /viewer.php : ce endpoint n'a aucune authentification
# (les visiteurs du portfolio doivent pouvoir parcourir les projets sans se
# connecter), donc il ne doit JAMAIS pouvoir sortir de ce dossier. Sans ça
# n'importe qui peut lire un chemin absolu arbitraire sur le serveur
# (clés SSH, .env des autres services, etc.) — faille corrigée le 2026-09-09.
VIEWER_ROOT = os.path.realpath(os.path.join(BASE_DIR, 'cours'))

_W_NS = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}


def _fs_key(path):
    """Forme canonique d'un chemin disque, pour comparer deux chemins sans
    se faire piéger par un lien symbolique ou la casse (Windows)."""
    return os.path.normcase(os.path.realpath(path))


# Fichiers jamais servis statiquement (secrets ou code serveur). La
# comparaison se fait sur le chemin RÉEL résolu sur le disque, pas sur
# l'URL : l'ancienne version comparait la chaîne brute de l'URL, et
# /%63onfig.json (le « c » encodé) renvoyait config.json en entier, hash
# du mot de passe admin compris — idem /%2Egit/config pour le dépôt git.
# Corrigé le 2026-09-25.
_FORBIDDEN_FILES = {_fs_key(os.path.join(BASE_DIR, name)) for name in (
    'config.json', 'config.json.tmp', 'server.py',
)}


def _hash_password(password, salt=None):
    """PBKDF2-HMAC-SHA256, 200k itérations. Retourne (salt_hex, hash_hex)."""
    if salt is None:
        salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), bytes.fromhex(salt), 200_000)
    return salt, dk.hex()


def _verify_password(password, salt, expected_hash):
    try:
        _, computed = _hash_password(password, salt)
    except ValueError:
        # Sel non hexadécimal (valeur d'exemple jamais remplacée) : aucun
        # mot de passe ne peut correspondre, plutôt qu'une exception.
        return False
    return secrets.compare_digest(computed, expected_hash)


def _admin_is_configured(admin_cfg):
    """Vrai si la section admin contient un vrai sel + hash (et pas les
    valeurs d'exemple de config.example.json)."""
    salt = admin_cfg.get('salt', '')
    pw_hash = admin_cfg.get('password_hash', '')
    try:
        bytes.fromhex(salt)
        bytes.fromhex(pw_hash)
    except ValueError:
        return False
    return bool(salt and pw_hash)


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

# ── Session tokens: {token: expiry_timestamp} ───────────────────────────────
_sessions = {}
_sessions_lock = threading.Lock()

TOKEN_TTL_HOURS = 24


def _create_token():
    token = secrets.token_hex(32)
    expiry = time.time() + TOKEN_TTL_HOURS * 3600
    with _sessions_lock:
        _sessions[token] = expiry
    return token


def _validate_token(token):
    with _sessions_lock:
        expiry = _sessions.get(token)
        if expiry and time.time() < expiry:
            return True
        if token in _sessions:
            del _sessions[token]
        return False


def _revoke_token(token):
    with _sessions_lock:
        _sessions.pop(token, None)


def _revoke_other_tokens(keep):
    """Après un changement de mot de passe : toute autre session ouverte
    (éventuellement par quelqu'un qui connaissait l'ancien) est fermée."""
    with _sessions_lock:
        for t in [t for t in _sessions if t != keep]:
            del _sessions[t]


# ── Anti-bruteforce : {ip: [horodatages des échecs récents]} ────────────────
_login_failures = {}
_login_lock = threading.Lock()


def _login_blocked(ip):
    """Retourne le nombre de secondes d'attente restantes, ou 0."""
    now = time.time()
    with _login_lock:
        recent = [t for t in _login_failures.get(ip, []) if now - t < LOGIN_WINDOW_S]
        if recent:
            _login_failures[ip] = recent
        else:
            _login_failures.pop(ip, None)
        if len(recent) >= LOGIN_MAX_FAILS:
            return int(LOGIN_WINDOW_S - (now - recent[0])) + 1
        return 0


def _login_record_failure(ip):
    with _login_lock:
        _login_failures.setdefault(ip, []).append(time.time())


def _login_reset(ip):
    with _login_lock:
        _login_failures.pop(ip, None)


def _load_config():
    return _load_json_config(CONFIG_PATH)


def _load_json_config(path):
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {}


def _save_config(data):
    # Écriture atomique : fichier temporaire puis remplacement. Un arrêt
    # brutal pendant l'écriture ne peut plus laisser un config.json tronqué
    # (et donc un site vide + un admin inaccessible).
    tmp = CONFIG_PATH + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, CONFIG_PATH)


def _config_without_admin(cfg):
    """Return config dict without the admin section."""
    return {k: v for k, v in cfg.items() if k != 'admin'}


def _public_config(cfg):
    """Config servie aux visiteurs via /config.js : sans la section admin,
    ni le texte intégral extrait du rapport (rapport.preview, ~30 Ko que
    le site n'affiche nulle part mais que chaque page téléchargeait)."""
    pub = _config_without_admin(cfg)
    if isinstance(pub.get('rapport'), dict):
        pub['rapport'] = {k: v for k, v in pub['rapport'].items() if k != 'preview'}
    return pub


def _config_for_admin_client(cfg):
    """Config envoyée au panneau admin : le sel et le hash du mot de passe
    n'ont rien à faire côté navigateur, seul l'identifiant est utile."""
    pub = _config_without_admin(cfg)
    pub['admin'] = {'username': cfg.get('admin', {}).get('username', '')}
    return pub


def _ensure_admin_credentials():
    """Premier lancement : crée config.json depuis l'exemple s'il manque, et
    génère un mot de passe admin aléatoire si aucun n'est encore défini
    (config.example.json ne contient que des valeurs factices). Le mot de
    passe est affiché une seule fois dans la console."""
    if not os.path.isfile(CONFIG_PATH) and os.path.isfile(CONFIG_EXAMPLE_PATH):
        shutil.copyfile(CONFIG_EXAMPLE_PATH, CONFIG_PATH)
    cfg = _load_config()
    admin_cfg = cfg.get('admin', {})
    if _admin_is_configured(admin_cfg):
        return
    password = secrets.token_urlsafe(12)
    salt, pw_hash = _hash_password(password)
    admin_cfg['username'] = admin_cfg.get('username') or 'admin'
    admin_cfg['salt'] = salt
    admin_cfg['password_hash'] = pw_hash
    cfg['admin'] = admin_cfg
    _save_config(cfg)
    print('Premier lancement : identifiants admin générés')
    print(f'  identifiant  : {admin_cfg["username"]}')
    print(f'  mot de passe : {password}')
    print('  → à changer dès la première connexion (onglet « Sécurité »).\n')


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

    # Types MIME avec charset explicite : les fichiers texte du site sont
    # en UTF-8 (accents dans les chaînes JS, commentaires CSS…).
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.html': 'text/html; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.txt': 'text/plain; charset=utf-8',
        '.md': 'text/plain; charset=utf-8',
        '.svg': 'image/svg+xml',
        '.woff2': 'font/woff2',
    }

    # En-têtes de sécurité ajoutés à TOUTES les réponses (pages, JSON,
    # erreurs). Pas de Content-Security-Policy stricte pour l'instant : les
    # pages utilisent encore des attributs onclick="…" en ligne.
    _SECURITY_HEADERS = (
        ('X-Content-Type-Options', 'nosniff'),
        ('X-Frame-Options', 'SAMEORIGIN'),
        ('Referrer-Policy', 'strict-origin-when-cross-origin'),
        ('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()'),
    )

    def end_headers(self):
        for name, value in self._SECURITY_HEADERS:
            self.send_header(name, value)
        super().end_headers()

    def _url_path(self):
        """Chemin de la requête, sans query ni fragment, NON décodé.
        (urlparse() n'est pas utilisé : il lit « //x » comme un nom d'hôte.)"""
        return self.path.split('?', 1)[0].split('#', 1)[0]

    def _is_forbidden(self, url_path):
        # 1) Aucun segment commençant par un point, APRÈS décodage : .git,
        #    .env, et aussi « .. ». Décoder d'abord est indispensable, sinon
        #    %2Egit passe (cf. _FORBIDDEN_FILES).
        decoded = unquote(url_path, errors='surrogatepass')
        if any(seg.startswith('.') for seg in decoded.replace('\\', '/').split('/') if seg):
            return True
        # 2) Le fichier réellement visé sur le disque, quelle que soit
        #    l'écriture de l'URL (encodage, double slash, casse, lien…).
        try:
            return _fs_key(self.translate_path(url_path)) in _FORBIDDEN_FILES
        except ValueError:
            # Octet nul (%00) dans l'URL : chemin invalide, refusé net
            # plutôt qu'une exception qui coupe la connexion.
            return True

    def _client_ip(self):
        """IP du visiteur. Derrière le reverse proxy (connexion depuis la
        boucle locale), c'est le DERNIER élément de X-Forwarded-For : celui
        ajouté par notre proxy, les précédents pouvant être forgés par le
        client (voir DEPLOIEMENT.md pour la configuration Nginx/Apache)."""
        peer = self.client_address[0]
        if peer in ('127.0.0.1', '::1', '::ffff:127.0.0.1'):
            fwd = self.headers.get('X-Forwarded-For', '')
            last = fwd.split(',')[-1].strip()
            if last:
                return last
        return peer

    def list_directory(self, path):
        # Pas de listing automatique : /files/ exposait la liste de tous les
        # documents déposés (rapport, CV…), /js/ ou /css/ la structure du site.
        self.send_error(404, 'File not found')
        return None

    def send_error(self, code, message=None, explain=None):
        # Page 404 aux couleurs du site (404.html) pour les navigateurs ;
        # les routes /api/ gardent des réponses JSON.
        if code == 404 and self.command == 'GET' and os.path.isfile(NOT_FOUND_PAGE) \
                and not self._url_path().startswith('/api/'):
            try:
                with open(NOT_FOUND_PAGE, 'r', encoding='utf-8') as f:
                    html = f.read()
            except OSError:
                return super().send_error(code, message, explain)
            # Les chemins de 404.html sont relatifs à la racine du site ; la
            # page pouvant être servie à n'importe quelle profondeur (et
            # derrière un préfixe d'URL inconnu), on calcule un <base>
            # relatif : autant de « ../ » que de dossiers dans l'URL.
            depth = max(self._url_path().count('/') - 1, 0)
            html = html.replace('<base href="./">', f'<base href="{"../" * depth or "./"}">', 1)
            body = html.encode('utf-8')
            self.send_response(404)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().send_error(code, message, explain)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.send_header('Content-Length', '0')
        self.end_headers()

    def do_HEAD(self):
        if self._is_forbidden(self._url_path()):
            self.send_response(403)
            self.send_header('Content-Length', '0')
            self.end_headers()
            return
        super().do_HEAD()

    def do_GET(self):
        path = self._url_path()
        query = self.path.partition('?')[2].split('#', 1)[0]

        if self._is_forbidden(path):
            self._json({'error': 'Accès refusé.'}, status=403)

        elif path in ('/viewer.php', '/portfolio/viewer.php'):
            params = parse_qs(query)
            raw = params.get('path', [''])[0]
            self._handle_viewer(raw)

        elif path == '/config.js':
            cfg = _load_config()
            pub = _public_config(cfg)
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
            self._json(_config_for_admin_client(_load_config()))

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
        path = self._url_path()
        try:
            length = int(self.headers.get('Content-Length', 0))
        except ValueError:
            length = -1
        if length < 0 or length > MAX_BODY_BYTES:
            # Corps non lu : la connexion ne peut pas être réutilisée.
            self.close_connection = True
            self._json({'error': 'Requête trop volumineuse ou invalide.'}, status=413)
            return
        raw_body = self.rfile.read(length) if length else b''
        try:
            body = json.loads(raw_body) if raw_body else {}
        except Exception:
            body = {}
        if not isinstance(body, dict):
            body = {}

        if path == '/api/auth':
            ip = self._client_ip()
            wait = _login_blocked(ip)
            if wait:
                self._json(
                    {'error': f'Trop de tentatives. Réessayez dans {wait // 60 + 1} min.'},
                    status=429, extra_headers={'Retry-After': str(wait)},
                )
                return
            cfg = _load_config()
            admin_cfg = cfg.get('admin', {})
            expected_user = admin_cfg.get('username', '')
            salt = admin_cfg.get('salt', '')
            expected_hash = admin_cfg.get('password_hash', '')
            given_user = str(body.get('username', ''))
            given_pw = str(body.get('password', ''))
            ok = bool(salt and expected_hash) \
                and secrets.compare_digest(given_user.encode(), expected_user.encode()) \
                and _verify_password(given_pw, salt, expected_hash)
            if ok:
                _login_reset(ip)
                token = _create_token()
                self._json({'token': token})
            else:
                _login_record_failure(ip)
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
                # La section admin (sel + hash) ne se modifie QUE via
                # /api/admin/credentials. Avant, le panneau renvoyait la
                # config entière qu'il avait chargée : après un changement
                # de mot de passe, le moindre « Sauvegarder » (thème,
                # projets…) réécrivait l'ANCIEN hash et annulait le
                # changement sans prévenir.
                body['admin'] = _load_config().get('admin', {})
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
        current_password = str(body.get('current_password', ''))
        new_username = str(body.get('new_username') or '').strip()
        new_password = str(body.get('new_password', ''))

        salt = admin_cfg.get('salt', '')
        expected_hash = admin_cfg.get('password_hash', '')
        if not (salt and expected_hash and _verify_password(current_password, salt, expected_hash)):
            self._json({'error': 'Mot de passe actuel incorrect'}, status=401)
            return
        if not new_password:
            self._json({'error': 'Le nouveau mot de passe est vide'}, status=400)
            return
        # Le panneau renvoie le mot de passe actuel quand seul l'identifiant
        # change : la longueur minimale ne s'applique qu'à un vrai nouveau
        # mot de passe.
        if new_password != current_password and len(new_password) < 12:
            self._json({'error': 'Le nouveau mot de passe doit faire au moins 12 caractères'}, status=400)
            return

        new_salt, new_hash = _hash_password(new_password)
        admin_cfg['username'] = new_username or admin_cfg.get('username', '')
        admin_cfg['salt'] = new_salt
        admin_cfg['password_hash'] = new_hash
        cfg['admin'] = admin_cfg
        _save_config(cfg)
        auth = self.headers.get('Authorization', '')
        _revoke_other_tokens(auth[7:] if auth.startswith('Bearer ') else None)
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
        rapport['updated'] = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')

        cfg['rapport'] = rapport
        _save_config(cfg)
        self._json({'ok': True, 'rapport': rapport})

    def _json(self, data, status=200, extra_headers=None):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        # Réponses dynamiques (config, jetons, version du site) : jamais en cache.
        self.send_header('Cache-Control', 'no-store')
        for name, value in (extra_headers or {}).items():
            self.send_header(name, value)
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
            self._json({'error': f'Fichier introuvable : {os.path.basename(raw_norm)}'})
            return

        # Les chemins renvoyés au navigateur sont RELATIFS à cours/ : les
        # chemins absolus exposaient l'arborescence du VPS (/var/www/…) dans
        # l'interface. Le client les renvoie tels quels, et ils sont résolus
        # depuis VIEWER_ROOT comme n'importe quel chemin relatif.
        def rel(p):
            return os.path.relpath(p, VIEWER_ROOT).replace(os.sep, '/')

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
                items.append({'name': e, 'path': rel(fp), 'isDir': is_d, 'ext': fext,
                              'size': os.path.getsize(fp) if os.path.isfile(fp) else None})
            items.sort(key=lambda x: (not x['isDir'], x['name'].lower()))
            self._json({'type': 'dir', 'name': name, 'path': rel(path), 'items': items})
            return

        # ── Image ────────────────────────────────────────────────
        if ext in IMAGE_EXTS:
            try:
                with open(path, 'rb') as f:
                    data = f.read()
                mime = MIME_MAP.get(ext, 'image/jpeg')
                self._json({'type': 'image', 'name': name, 'path': rel(path), 'ext': ext,
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
                    'type': 'text', 'name': name, 'path': rel(path), 'ext': 'txt',
                    'content': plain, 'lines': plain.count('\n') + 1,
                    'size': len(plain.encode('utf-8')),
                    'note': 'Contenu extrait du fichier Word (.docx)',
                })
                return
            self._json({
                'type': 'binary', 'name': name, 'path': rel(path), 'ext': ext,
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
                    'type': 'pdf', 'name': name, 'path': rel(path), 'ext': ext,
                    'size': len(data),
                    'data': f'data:application/pdf;base64,{base64.b64encode(data).decode()}',
                })
            except Exception:
                self._json({'error': "Impossible de lire le PDF."})
            return

        # ── Binaire ──────────────────────────────────────────────
        if ext in BINARY_EXTS:
            self._json({'type': 'binary', 'name': name, 'path': rel(path), 'ext': ext,
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
        self._json({'type': 'text', 'name': name, 'path': rel(path), 'ext': ext,
                    'content': content, 'lines': content.count('\n') + 1,
                    'size': len(content.encode('utf-8'))})

    def log_message(self, fmt, *args):
        if args and str(args[1]) not in ('200', '304'):
            super().log_message(fmt, *args)


if __name__ == '__main__':
    os.chdir(BASE_DIR)
    os.makedirs(FILES_DIR, exist_ok=True)
    _ensure_admin_credentials()
    print(f'Portfolio  →  http://{BIND_ADDR}:{PORT}')
    print(f'Admin      →  http://{BIND_ADDR}:{PORT}/admin')
    print('Ctrl+C pour arrêter.\n')
    with http.server.ThreadingHTTPServer((BIND_ADDR, PORT), PortfolioHandler) as httpd:
        httpd.serve_forever()
