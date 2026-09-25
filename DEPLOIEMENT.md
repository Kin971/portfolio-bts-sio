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

### Avec Nginx
```nginx
server {
    listen 80;
    server_name tondomaine.fr;
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## 4. HTTPS (recommandé)
```bash
sudo certbot --apache -d tondomaine.fr    # ou --nginx
```

## Identifiants admin actuels
- URL : `/admin`
- Identifiant : `<votre identifiant>`
- Mot de passe : celui généré et communiqué séparément (change-le depuis l'onglet
  "Sécurité" du panneau admin dès le premier accès sur le VPS).

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
- Reste à faire (vu dans tes notes perso `x`) : ajouter CV + attestation de stage,
  alléger le portfolio, plus d'images, mieux mettre en valeur les compétences —
  on verra ça dans la refonte visuelle à venir.
