# Portfolio BTS SIO — Raphaël Tilacdhary-Jean

Portfolio scolaire présentant mon parcours en BTS Services Informatiques aux
Organisations : première année en option **SLAM** (développement), deuxième
année en option **SISR** (systèmes, réseaux, cybersécurité).

## Le site

Deux parcours, chacun avec ses pages :

- `/sisr/` — deuxième année : stage en mairie (missions, rapport téléchargeable),
  tableau de synthèse des compétences (Bloc 1 + Bloc 2 SISR), CV graphique imprimable
- `/slam/` — première année : à propos, compétences, projets, référentiel
  (Blocs 1, 2 SLAM et 3, intitulés officiels), cybersécurité
- `/contact/` — page de contact commune aux deux parcours
- `404.html` — page d'erreur aux couleurs du site

## Technique

Pas de framework, volontairement — tout est écrit à la main.

| Élément | Choix |
|---|---|
| Serveur | Python, `http.server.ThreadingHTTPServer` (`server.py`) |
| Front | HTML / CSS / JavaScript sans framework |
| Ressources | JetBrains Mono (`fonts/`, OFL) et highlight.js (`vendor/`, BSD) auto-hébergés : aucune requête tierce |
| Thème | « terminal », variables CSS, pluie Matrix sur canvas |
| Administration | `admin.html`, authentification PBKDF2-SHA256 (200 000 itérations) |
| Visualiseur | lecture de fichiers de cours en bac à sable (`viewer.php`) |

### Points d'implémentation

- **Visualiseur cloisonné** : toute lecture est confinée sous `cours/`, avec
  vérification par `realpath` — une tentative de remontée de répertoire est
  refusée avant tout accès disque. Les chemins renvoyés au navigateur sont
  relatifs à `cours/` (l'arborescence du serveur n'est jamais exposée).
- **Fichiers sensibles protégés sur le chemin réel** : `config.json`,
  `server.py` et tout chemin commençant par un point (`.git`, `.env`) sont
  refusés d'après le fichier réellement visé sur le disque, après décodage de
  l'URL — un simple `%63onfig.json` suffisait auparavant à contourner le filtre.
  Pas de listing automatique des dossiers.
- **Authentification** : anti-bruteforce (5 échecs / 15 min par IP, réponse 429
  sans calcul du hash), mot de passe de 12 caractères minimum, sessions fermées
  après un changement de mot de passe. Le hash n'est jamais envoyé au navigateur.
- **En-têtes de sécurité** sur toutes les réponses : `X-Content-Type-Options`,
  `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`.
- **Chemins relatifs à la profondeur** : le site est servi derrière un préfixe
  d'URL, donc aucun chemin absolu. Le JavaScript partagé calcule sa racine
  depuis `document.currentScript.src`.
- **Rechargement à chaud** : la page interroge `/api/site-version`. En local,
  elle se rafraîchit d'elle-même quand un fichier change ; en ligne, elle
  propose simplement un bouton « Recharger » (jamais de rechargement forcé
  pendant la lecture d'un visiteur).
- **Effets séparés du fonctionnel** : `effects.js` ne contient que du décor.
  S'il échoue, `script.js` et le site continuent de fonctionner. Sans
  JavaScript du tout, le contenu reste lisible (les écrans d'animation ne
  s'activent que si la classe `.js` est posée).

## Installation

```bash
python3 server.py                    # écoute sur le port 8080
```

Au premier lancement, `config.json` est créé depuis `config.example.json` et un
mot de passe admin aléatoire est généré puis affiché **une seule fois** dans la
console : à changer dès la première connexion (onglet « Sécurité » de `/admin`).

Voir `DEPLOIEMENT.md` pour la mise en production derrière un reverse proxy.

## Licence

Code réutilisable librement. Les contenus personnels (CV, rapport de stage,
supports de cours) ne sont pas inclus dans ce dépôt.
