// Tests des règles Firestore (émulateur local, rien n'est déployé).
// npm run test:regles
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { readFileSync } from "fs";
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp, collection, getDocs } from "firebase/firestore";

const UID = "wg2JcW2kfkTGr1AB7ROEubZtL9h1"; // compte unique partagé
const env = await initializeTestEnvironment({
  projectId: "demo-jeu",
  firestore: { rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8"), host: "127.0.0.1", port: 8085 },
});
await env.withSecurityRulesDisabled(async (c) => {
  await setDoc(doc(c.firestore(), "etapes/1"), { debloqueeA: new Date(), mode: "auto" });
  await setDoc(doc(c.firestore(), "journal/a"), { type: "x" });
});
const C = env.authenticatedContext(UID).firestore();
const X = env.authenticatedContext("autre-compte").firestore();
const U = env.unauthenticatedContext().firestore();
const appareil = { jeton: "t", role: "joueuse", majA: serverTimestamp(), appareil: "iPhone" };

const tests = [
  ["compte lit etapes", assertSucceeds(getDocs(collection(C, "etapes")))],
  ["anonyme lit etapes", assertFails(getDoc(doc(U, "etapes/1")))],
  ["autre compte lit etapes", assertFails(getDoc(doc(X, "etapes/1")))],
  ["déblocage manuel", assertSucceeds(setDoc(doc(C, "etapes/3"), { debloqueeA: serverTimestamp(), mode: "manuel" }))],
  ["déblocage déguisé en auto", assertFails(setDoc(doc(C, "etapes/4"), { debloqueeA: serverTimestamp(), mode: "auto" }))],
  ["étape 22", assertFails(setDoc(doc(C, "etapes/22"), { debloqueeA: serverTimestamp(), mode: "manuel" }))],
  ["modifier une étape", assertFails(setDoc(doc(C, "etapes/1"), { debloqueeA: serverTimestamp(), mode: "manuel" }))],
  ["progression étape ouverte", assertSucceeds(setDoc(doc(C, "progression/1"), { questionOK: true, tentatives: 1 }, { merge: true }))],
  ["progression étape fermée", assertFails(setDoc(doc(C, "progression/2"), { questionOK: true }))],
  ["progression destination éliminée", assertSucceeds(setDoc(doc(C, "progression/1"), { elimine: "l2" }, { merge: true }))],
  ["progression champ interdit", assertFails(setDoc(doc(C, "progression/1"), { triche: 1 }, { merge: true }))],
  ["étape terminée", assertSucceeds(setDoc(doc(C, "progression/1"), { jeuOK: true, termineeA: serverTimestamp() }, { merge: true }))],
  ["autre compte écrit progression", assertFails(setDoc(doc(X, "progression/1"), { questionOK: true }))],
  ["réponse", assertSucceeds(setDoc(doc(C, "reponses/1"), { texte: "coucou", ecritA: serverTimestamp() }))],
  ["réponse vide", assertFails(setDoc(doc(C, "reponses/1"), { texte: "", ecritA: serverTimestamp() }))],
  ["réponse étape fermée", assertFails(setDoc(doc(C, "reponses/2"), { texte: "x", ecritA: serverTimestamp() }))],
  ["lire réponses", assertSucceeds(getDocs(collection(C, "reponses")))],
  ["autre compte lit réponses", assertFails(getDocs(collection(X, "reponses")))],
  ["inscrire un appareil", assertSucceeds(setDoc(doc(C, "appareils/abcdef0123456789"), appareil))],
  ["appareil rôle inconnu", assertFails(setDoc(doc(C, "appareils/abcdef0123456789"), { ...appareil, role: "dieu" }))],
  ["appareil id trop court", assertFails(setDoc(doc(C, "appareils/abc"), appareil))],
  ["autre compte inscrit un appareil", assertFails(setDoc(doc(X, "appareils/abcdef0123456789"), appareil))],
  ["retirer un appareil", assertSucceeds(deleteDoc(doc(C, "appareils/abcdef0123456789")))],
  ["lire journal", assertSucceeds(getDocs(collection(C, "journal")))],
  ["écrire journal", assertFails(setDoc(doc(C, "journal/b"), { type: "faux" }))],
  ["collection inconnue", assertFails(getDoc(doc(C, "autre/x")))],
  ["remise à zéro progression", assertSucceeds(deleteDoc(doc(C, "progression/1")))],
];

let ko = 0;
for (const [nom, p] of tests) {
  try { await p; console.log("OK   ", nom); }
  catch (e) { ko++; console.log("ECHEC", nom, e.message.slice(0, 120)); }
}
await env.cleanup();
console.log(ko ? `${ko} échec(s) sur ${tests.length}` : `Les ${tests.length} cas se comportent comme prévu`);
process.exit(ko ? 1 : 0);
