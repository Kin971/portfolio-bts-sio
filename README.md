# Portfolio BTS SIO — Raphaël Tilacdhary-Jean

Portfolio scolaire présentant mon parcours en BTS Services Informatiques aux
Organisations : première année en option **SLAM** (développement), deuxième
année en option **SISR** (systèmes, réseaux, cybersécurité).

## Le site

Deux parcours, chacun avec ses pages :

- `/sisr/` — deuxième année, avec le CV présenté sous forme graphique
- `/slam/` — première année : à propos, compétences, projets, référentiel, cybersécurité
- `/contact/` — page de contact commune aux deux parcours

## Technique

Pas de framework, volontairement — tout est écrit à la main.

| Élément | Choix |
|---|---|
| Serveur | Python, `http.server.ThreadingHTTPServer` (`server.py`) |
| Front | HTML / CSS / JavaScript sans dépendance |
| Thème | « terminal », variables CSS, pluie Matrix sur canvas |
| Administration | `admin.html`, authentification PBKDF2-SHA256 (200 000 itérations) |
| Visualiseur | lecture de fichiers de cours en bac à sable (`viewer.php`) |

### Points d'implémentation

- **Visualiseur cloisonné** : toute lecture est confinée sous `cours/`, avec
  vérification par `realpath` — une tentative de remontée de répertoire est
  refusée avant tout accès disque.
- **Chemins relatifs à la profondeur** : le site est servi derrière un préfixe
  d'URL, donc aucun chemin absolu. Le JavaScript partagé calcule sa racine
  depuis `document.currentScript.src`.
- **Rechargement à chaud** : la page interroge `/api/site-version` et se
  rafraîchit d'elle-même quand un fichier change.
- **Effets séparés du fonctionnel** : `effects.js` ne contient que du décor.
  S'il échoue, `script.js` et le site continuent de fonctionner.

## Installation

```bash
cp config.example.json config.json   # puis renseigner ses propres valeurs
python3 server.py                    # écoute sur le port 8080
```

Voir `DEPLOIEMENT.md` pour la mise en production derrière un reverse proxy.

## Licence

Code réutilisable librement. Les contenus personnels (CV, rapport de stage,
supports de cours) ne sont pas inclus dans ce dépôt.
