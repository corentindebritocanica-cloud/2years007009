# Jeu de piste — 2 ans

PWA iPhone (GitHub Pages) + Firebase (Auth, Firestore, FCM) + relais Google Apps Script.
21 étapes, une tous les 3 jours du 12 octobre au 11 décembre 2026.

## Accès

- **Un seul écran de connexion** (e-mail + mot de passe), persistant : l'appareil reste
  connecté tant qu'on ne se déconnecte pas (jeton Firebase en IndexedDB).
- **Rôle selon l'UID** : l'UID admin ouvre le tableau de bord, l'UID joueuse ouvre le jeu.
  Les deux UID sont déclarés dans `js/config.js`, `firestore.rules` et `relais/Code.gs`.
- L'admin peut **prévisualiser** tout le jeu (bouton « Aperçu ») sans rien écrire.

## Structure

| Fichier | Rôle |
|---|---|
| `index.html` | Coquille PWA (meta iOS, safe areas) |
| `js/app.js` | Connexion + routage par rôle |
| `js/joueuse.js` | Accueil, jauge, compte à rebours, déroulé d'une étape |
| `js/jeux.js` | Mini-jeux : grattage, mémoire, puzzle, cadenas, choix, carte, colis, gps |
| `js/admin.js` | Suivi, réponses, journal, déblocage manuel, notifs de test, remise à zéro |
| `js/firebase.js` | Init Firebase, persistance, jeton push |
| `js/config.js` | Config web Firebase (publique), UID admin, URL du relais |
| `sw.js` | Service worker **sans SDK Firebase** : affiche toujours la notif (règle iOS) |
| `jeu.json` | **Tout le contenu** : calendrier, questions, mini-jeux, récompenses |
| `firestore.rules` | Règles de sécurité (versionnées, **pas déployées automatiquement**) |
| `tests/regles.test.mjs` | Tests des règles sur l'émulateur |
| `relais/Code.gs` | Relais Apps Script : horloge, FCM, déblocage manuel, e-mail de repli |

## Contenu : `jeu.json`

Chaque étape :

```json
{
  "n": 1, "phase": "Nous", "date": "2026-10-12", "heure": "21:30", "manuel": false,
  "question": { "type": "verifiable", "texte": "…", "reponses": ["variante 1", "variante 2"], "indice": "après 3 erreurs" },
  "jeu": { "type": "grattage", "consigne": "…", "cache": "texte sous la couche à gratter" },
  "recompense": { "titre": "…", "texte": "…", "image": "img/jeu/xxx.jpg" }
}
```

- `question.type` : `verifiable` (comparée sans accents/majuscules/articles) ou `profonde` (toute réponse, enregistrée pour l'admin ; `motApres` optionnel).
- Mini-jeux et paramètres :
  - `grattage` : `cache`
  - `memoire` : `photos[]` `{image, legende}` (5 photos → 10 cartes, puis frise chronologique)
  - `puzzle` : `image` (carrée), `taille` (3)
  - `cadenas` : `code` (4 chiffres), `position` (1-4), `final` (true à l'étape 18)
  - `choix` : `options[]` `{id, nom, image}`, `elimine`, `dejaElimines[]`, `indice`
  - `carte` : `image` (floue puis nette en maintenant le doigt)
  - `colis` : `indice` (où trouver le colis)
  - `gps` : `adresse`
- Images : `img/jeu/`. Photos iPhone → JPG ~1200 px, < 300 Ko.

## Firestore

| Doc | Écrit par | Lu par |
|---|---|---|
| `etapes/{n}` | relais (ou admin en secours) | admin, joueuse |
| `progression/{n}` | joueuse, si l'étape est ouverte | admin, joueuse |
| `reponses/{n}` | joueuse, si l'étape est ouverte | admin, joueuse |
| `abonnes/{uid}` | chaque utilisateur pour lui-même | admin, relais |
| `journal/{id}` | relais | admin |

Coût : ~45 lectures à l'ouverture de l'app, puis cache local. Largement dans le plan Spark.

### Règles

```bash
npm install
npm run test:regles      # émulateur local, 23 cas
```

Puis publier `firestore.rules` à la main (console Firebase → Firestore → Règles) ou via l'API Firebase Rules.

## Mise en ligne

GitHub Pages sur la branche `main`, racine du dépôt :
`https://corentindebritocanica-cloud.github.io/2years007009/`

Relais : voir [`relais/README.md`](relais/README.md).

## Convention de commits

`feat:` · `fix:` · `refactor:` · `docs:` · `content:` (contenu de `jeu.json`/images) · `chore:`
