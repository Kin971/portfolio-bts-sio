# Déploiement sur un VPS

## Prérequis sur le VPS
- Python 3.8+ (aucune dépendance externe, tout est en stdlib)
- Un reverse proxy : Apache (mod_proxy / mod_proxy_http) ou Nginx
- (optionnel) un nom de domaine + certificat SSL (Let's Encrypt / certbot)

## 1. Copier les fichiers
Envoie tout le contenu de ce dossier dans `/var/www/portfolio` (ou équivalent) sur le VPS,
par exemple avec `scp -r . user@vps:/var/www/portfolio`.

## 2. Lancer le backend Python
Le fichier `server.py` gère : les pages statiques, la connexion admin, l'édition du
rapport de stage, et bloque l'accès direct à `config.json`.

Test rapide :
```bash
cd /var/www/portfolio
python3 server.py
```
Par défaut il écoute sur `127.0.0.1:8080` (variable d'env `PORTFOLIO_BIND` pour changer).

### En service permanent (systemd)
Crée `/etc/systemd/system/portfolio.service` :
```ini
[Unit]
Description=Portfolio BTS SIO
After=network.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/var/www/portfolio
Environment=PORTFOLIO_BIND=127.0.0.1
ExecStart=/usr/bin/python3 /var/www/portfolio/server.py
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```
Puis :
```bash
sudo chown -R www-data:www-data /var/www/portfolio
sudo systemctl daemon-reload
sudo systemctl enable --now portfolio.service
```

## 3. Reverse proxy

### Avec Apache
```apache
<VirtualHost *:80>
    ServerName tondomaine.fr
    ProxyPreserveHost On
    ProxyPass / http://127.0.0.1:8080/
    ProxyPassReverse / http://127.0.0.1:8080/
</VirtualHost>
```
Puis : `sudo a2enmod proxy proxy_http && sudo systemctl reload apache2`

Apache ajoute lui-même l'IP du visiteur à la fin de `X-Forwarded-For` : c'est
cette dernière valeur que `server.py` utilise pour limiter les tentatives de
connexion à l'admin (5 échecs / 15 min par IP).

### Avec Nginx
```nginx
server {
    listen 80;
    server_name tondomaine.fr;
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        # REMPLACE l'en-tête (au lieu d'ajouter à celui du client) : server.py
        # en lit la dernière valeur pour l'anti-bruteforce de /api/auth.
        proxy_set_header X-Forwarded-For $remote_addr;
    }
}
```

## 4. HTTPS (recommandé)
```bash
sudo certbot --apache -d tondomaine.fr    # ou --nginx
```
Une fois le HTTPS en place, ajouter l'en-tête HSTS au niveau du reverse proxy
(`server.py` ne le pose pas, il ne voit que du HTTP local) :
- Nginx : `add_header Strict-Transport-Security "max-age=31536000" always;`
- Apache : `Header always set Strict-Transport-Security "max-age=31536000"`

## Identifiants admin
- URL : `/admin` (plus aucun lien public ne pointe vers cette page)
- Premier lancement : si `config.json` n'a pas encore de mot de passe, `server.py`
  en génère un et l'affiche une seule fois dans la console — sous systemd :
  `sudo journalctl -u portfolio.service | grep "mot de passe"`.
- Change-le depuis l'onglet « Sécurité » dès le premier accès (12 caractères
  minimum ; les autres sessions ouvertes sont alors déconnectées).

## À savoir
- `config.json` contient le hash du mot de passe admin (jamais en clair) et n'est
  jamais servi directement (`/config.json` renvoie 403) — utilise `/config.js` qui
  filtre automatiquement la section admin.
- Le rapport de stage se gère depuis l'onglet "Rapport de stage" de l'admin
  (remplace le fichier .pdf/.docx, modifie titre/description).
- `viewer.php` (ancien lecteur de fichiers PHP) n'est plus utilisé — `server.py`
  fait tout, y compris sur un VPS sans PHP installé.
- Dossier `tp cracking de mot passe/` : contenu d'un TP cybersécurité, pas encore
  intégré comme fiche projet dans `config.json` — à ajouter si tu veux l'afficher.
- Le rapport de stage déposé dans l'admin s'affiche maintenant sur la page SISR
  (section « Stage », bouton « Télécharger »).
- Les compétences des projets (onglet « Projets » de l'admin) doivent utiliser les
  codes officiels : B1.1 à B1.6, B2.1 à B2.3, B3.1 à B3.5. Les anciens codes
  B2.4, B2.5, B2.6 et B6 n'existent pas dans le référentiel (voir
  `config.example.json` pour des libellés corrigés).
- Reste à faire (vu dans tes notes perso `x`) : ajouter CV + attestation de stage,
  plus d'images (photo de profil : voir le commentaire dans
  `slam/apropos/index.html`), page de veille technologique.
