// Configuration publique de l'app (rien de secret ici : la config web Firebase
// est faite pour être embarquée côté client, la sécurité est dans firestore.rules).

export const FIREBASE = {
  apiKey: "AIzaSyD65D8kOjDkDY6pCZkyQ1f6Md40NORhGHA",
  authDomain: "years-b3e18.firebaseapp.com",
  projectId: "years-b3e18",
  storageBucket: "years-b3e18.firebasestorage.app",
  messagingSenderId: "186318477676",
  appId: "1:186318477676:web:ed48b1d662621dbfd83b49",
};

// Version du SDK Firebase servie par le CDN gstatic.
export const SDK = "https://www.gstatic.com/firebasejs/12.19.0";

// UID du compte unique partagé (Lisa et Corentin se connectent avec le même
// e-mail + mot de passe). Doit correspondre à firestore.rules et relais/Code.gs.
export const UID_COMPTE = "wg2JcW2kfkTGr1AB7ROEubZtL9h1";

// Code à 4 chiffres qui ouvre l'espace admin depuis le logo de l'accueil.
// Stocké en empreinte SHA-256 (sel "jeu-2ans:") pour ne pas apparaître en clair.
// C'est la seule barrière entre l'accueil et l'admin (compte unique partagé).
export const CODE_ADMIN_SHA256 = "3e19fbca585162609ed70502d09ab5681fb7e4909936bf30f55e0558a04c0c2d";

// URL « …/exec » du relais Apps Script, à coller après son déploiement.
// Tant qu'elle est vide, le déblocage manuel écrit directement dans Firestore
// (l'étape s'ouvre) mais aucune notification push ne part.
export const RELAIS_URL = "https://script.google.com/macros/s/AKfycbzYvy5ucqeMoDUCZ5EZaS2f7yMfG9PEz_lyMJ8tzP4qVUbZPS8tQ_JQPaE6yvNhn2rTiA/exec";

// Clé publique VAPID (Firebase → Paramètres → Cloud Messaging → Certificats Web Push).
// Laisser vide = clé par défaut de Firebase, qui fonctionne aussi.
export const VAPID_KEY = "";

// Lien YouTube de la bande-annonce (watch, youtu.be ou shorts). Montrée une seule
// fois par appareil après la connexion. Vide = pas de bande-annonce.
export const BANDE_ANNONCE = "";
