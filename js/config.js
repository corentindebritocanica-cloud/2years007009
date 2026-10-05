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

// UID du compte admin (Corentin). Doit correspondre à firestore.rules.
export const UID_ADMIN = "wg2JcW2kfkTGr1AB7ROEubZtL9h1";

// URL « …/exec » du relais Apps Script, à coller après son déploiement.
// Tant qu'elle est vide, le déblocage manuel écrit directement dans Firestore
// (l'étape s'ouvre) mais aucune notification push ne part.
export const RELAIS_URL = "";

// Clé publique VAPID (Firebase → Paramètres → Cloud Messaging → Certificats Web Push).
// Laisser vide = clé par défaut de Firebase, qui fonctionne aussi.
export const VAPID_KEY = "";
