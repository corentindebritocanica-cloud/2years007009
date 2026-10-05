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

// Enregistre / rafraîchit le jeton dans abonnes/{uid}. À chaque ouverture,
// car iOS peut changer le jeton sans prévenir. Écrit seulement s'il a changé.
export async function synchroniserJeton(uid) {
  if (!pushPossible() || Notification.permission !== "granted") return null;
  const reg = await enregistrerSW();
  await navigator.serviceWorker.ready;
  const jeton = await obtenirJeton(reg);
  if (!jeton) return null;
  const ref = fs.doc(db, "abonnes", uid);
  const snap = await fs.getDoc(ref).catch(() => null);
  if (!snap || !snap.exists() || snap.data().jeton !== jeton) {
    await fs.setDoc(ref, {
      jeton,
      majA: fs.serverTimestamp(),
      appareil: navigator.userAgent.slice(0, 180),
    });
  }
  return jeton;
}
