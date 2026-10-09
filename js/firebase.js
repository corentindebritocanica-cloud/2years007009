// Initialisation Firebase : auth persistante (connexion unique, à vie sur l'appareil),
// Firestore avec cache hors ligne, messaging pour le jeton push.
import { FIREBASE, SDK, VAPID_KEY } from "./config.js";

const { initializeApp } = await import(`${SDK}/firebase-app.js`);
const authMod = await import(`${SDK}/firebase-auth.js`);
const fs = await import(`${SDK}/firebase-firestore.js`);

export const app = initializeApp(FIREBASE);

// indexedDB d'abord (survit aux fermetures de l'app), localStorage en repli.
// Le jeton de rafraîchissement Firebase n'expire pas : l'appareil reste connecté
// tant qu'on ne se déconnecte pas et que le mot de passe ne change pas.
export const auth = authMod.initializeAuth(app, {
  persistence: [authMod.indexedDBLocalPersistence, authMod.browserLocalPersistence],
});

let db;
try {
  db = fs.initializeFirestore(app, {
    localCache: fs.persistentLocalCache({ tabManager: fs.persistentSingleTabManager() }),
  });
} catch {
  db = fs.getFirestore(app);
}
// Développement uniquement : http://localhost:8000/?emu → émulateur Firestore local.
if (location.hostname === "localhost" && new URLSearchParams(location.search).has("emu")) {
  fs.connectFirestoreEmulator(db, "127.0.0.1", 8085);
}
export { db, fs, authMod };

export const connexion = (email, mdp) =>
  authMod.signInWithEmailAndPassword(auth, email.trim(), mdp);
export const deconnexion = () => authMod.signOut(auth);
export const surAuth = (cb) => authMod.onAuthStateChanged(auth, cb);
export const motDePasseOublie = (email) => authMod.sendPasswordResetEmail(auth, email.trim());

// ---------- Notifications push ----------
// sw.js n'embarque PAS le SDK Firebase (piège iOS : révocation après 3 push
// sans notification affichée). Le SDK sert uniquement à obtenir le jeton FCM
// lié à NOTRE service worker.
export async function enregistrerSW() {
  if (!("serviceWorker" in navigator)) return null;
  return navigator.serviceWorker.register("./sw.js", { scope: "./" });
}

export function pushPossible() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function estInstallee() {
  return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
}

export async function obtenirJeton(reg) {
  const msg = await import(`${SDK}/firebase-messaging.js`);
  if (!(await msg.isSupported())) return null;
  const messaging = msg.getMessaging(app);
  const opts = { serviceWorkerRegistration: reg };
  if (VAPID_KEY) opts.vapidKey = VAPID_KEY;
  return msg.getToken(messaging, opts);
}

// ---------- Appareils ----------
// Le compte est partagé : chaque iPhone a son propre identifiant et son propre
// document appareils/{id}, avec un rôle. Les notifs du jeu partent vers tous
// les appareils ; un appareil « admin » n'écrit jamais la progression.
const CLE_ID = "appareil-id";
const CLE_ROLE = "appareil-role";

export function idAppareil() {
  let id = null;
  try { id = localStorage.getItem(CLE_ID); } catch { /* stockage indisponible */ }
  if (!id) {
    id = (crypto.randomUUID?.() || String(Date.now()) + Math.random().toString(16).slice(2)).replace(/-/g, "");
    try { localStorage.setItem(CLE_ID, id); } catch { /* sans effet */ }
  }
  return id;
}

export function roleAppareil() {
  try { return localStorage.getItem(CLE_ROLE) === "admin" ? "admin" : "joueuse"; } catch { return "joueuse"; }
}

export async function changerRoleAppareil(role) {
  try { localStorage.setItem(CLE_ROLE, role === "admin" ? "admin" : "joueuse"); } catch { /* sans effet */ }
  await synchroniserAppareil(true);
}

// À chaque ouverture : iOS peut changer le jeton sans prévenir.
// N'écrit que si le jeton ou le rôle a changé (une écriture max par ouverture).
export async function synchroniserAppareil(forcer = false) {
  const ref = fs.doc(db, "appareils", idAppareil());
  let jeton = null;
  if (pushPossible() && Notification.permission === "granted") {
    const reg = await enregistrerSW();
    await navigator.serviceWorker.ready;
    jeton = await obtenirJeton(reg);
  }
  const snap = await fs.getDoc(ref).catch(() => null);
  const avant = snap?.exists() ? snap.data() : null;
  const role = roleAppareil();
  if (!jeton && !avant && !forcer) return null;
  if (forcer || !avant || avant.jeton !== (jeton || avant.jeton) || avant.role !== role) {
    await fs.setDoc(ref, {
      jeton: jeton || avant?.jeton || "",
      role,
      majA: fs.serverTimestamp(),
      appareil: navigator.userAgent.slice(0, 180),
    });
  }
  return jeton;
}
