# Relais Apps Script

Le seul « serveur » du jeu : il débloque les étapes à l'heure de Paris et envoie les notifications.
Gratuit (compte Google perso), pas de Cloud Functions, pas de plan Blaze.

## Installation (une fois, ~10 min)

1. https://script.google.com → **Nouveau projet**, nommé « Relais jeu de piste ».
2. ⚙️ **Paramètres du projet** :
   - Fuseau horaire : **Europe/Paris** ;
   - cocher « Afficher le fichier manifeste appsscript.json ».
3. Remplacer le contenu de `Code.gs` par [`Code.gs`](Code.gs) et celui de `appsscript.json` par [`appsscript.json`](appsscript.json).
4. Dans `CONFIG` en haut de `Code.gs`, renseigner `EMAIL_JOUEUSE` (e-mail de repli de Lisa).
5. ⚙️ **Propriétés du script** → ajouter `SA_KEY` = le JSON complet du compte de service, **sur une seule ligne**.
6. Exécuter `testerConnexion` (autoriser les accès demandés). Le journal doit afficher le calendrier.
7. Exécuter `installer` : crée le déclencheur `tick` toutes les 5 minutes.
8. **Déployer → Nouveau déploiement → Application Web** : exécuter en tant que *moi*, accès *Tout le monde*.
9. Copier l'URL `…/exec` dans `js/config.js` → `RELAIS_URL`, puis commit.

Toute modification ultérieure : **Gérer les déploiements → ✏️ → Nouvelle version** (jamais un nouveau déploiement, l'URL changerait).

## Fonctionnement

- `tick` (toutes les 5 min) sort aussitôt hors de la fenêtre 21h25 → 00h15.
- Dans la fenêtre : crée `etapes/{n}` si l'heure est passée (création atomique, jamais en double), puis envoie la notif.
- 30 min après, si `progression/{n}.termineeA` est vide : relance (une seule fois, jamais après 3 h).
- Notif en échec (`UNREGISTERED`, `NOT_FOUND`…) : e-mail à la joueuse + alerte à l'admin. L'étape reste ouverte.
- Chaque action est tracée dans `journal` (onglet Journal de l'admin).
- Le calendrier est lu dans `jeu.json` publié sur GitHub Pages (cache 1 h ; `viderCacheJeu` pour forcer).

## Mode test

Propriétés du script :

- `TEST_DEBUT` = `2026-10-06T20:00:00+02:00` → étape 1 à cette heure, puis une étape toutes les…
- `TEST_PAS` = `10` (minutes).

La fenêtre horaire est ignorée en mode test. **Supprimer `TEST_DEBUT`** et remettre le jeu à zéro (admin → Réglages) avant le 12 octobre.

## Fonctions utiles dans l'éditeur

`testerConnexion`, `testerNotifAdmin`, `testerNotifJoueuse`, `viderCacheJeu`, `installer`.
