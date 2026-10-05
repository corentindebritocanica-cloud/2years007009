// Tests des règles Firestore (émulateur local, rien n'est déployé).
// npx firebase emulators:exec --only firestore --project demo-jeu "node tests/regles.test.mjs"
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { readFileSync } from "fs";
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp, collection, getDocs, Timestamp } from "firebase/firestore";
const env = await initializeTestEnvironment({ projectId: "demo-jeu", firestore: { rules: readFileSync(new URL("../firestore.rules", import.meta.url),"utf8").replace(/(function joueuse\(\)[^']*')[^']+'/, "$1lisaUID'"), host:"127.0.0.1", port:8085 } });
await env.withSecurityRulesDisabled(async c => { await setDoc(doc(c.firestore(),"etapes/1"),{debloqueeA:new Date(),mode:"auto"}); await setDoc(doc(c.firestore(),"journal/a"),{type:"x"}); });
const A = env.authenticatedContext("wg2JcW2kfkTGr1AB7ROEubZtL9h1").firestore();
const L = env.authenticatedContext("lisaUID").firestore();
const X = env.authenticatedContext("autre").firestore();
const U = env.unauthenticatedContext().firestore();
const t = [
 ["lisa lit etapes", assertSucceeds(getDocs(collection(L,"etapes")))],
 ["anonyme lit etapes", assertFails(getDoc(doc(U,"etapes/1")))],
 ["inconnu lit etapes", assertFails(getDoc(doc(X,"etapes/1")))],
 ["lisa cree etape", assertFails(setDoc(doc(L,"etapes/2"),{debloqueeA:serverTimestamp(),mode:"auto"}))],
 ["admin cree etape 3", assertSucceeds(setDoc(doc(A,"etapes/3"),{debloqueeA:serverTimestamp(),mode:"manuel"}))],
 ["admin etape 22", assertFails(setDoc(doc(A,"etapes/22"),{debloqueeA:serverTimestamp(),mode:"manuel"}))],
 ["lisa progression ouverte", assertSucceeds(setDoc(doc(L,"progression/1"),{questionOK:true,tentatives:1},{merge:true}))],
 ["lisa progression fermee", assertFails(setDoc(doc(L,"progression/2"),{questionOK:true}))],
 ["lisa progression champ interdit", assertFails(setDoc(doc(L,"progression/1"),{triche:1},{merge:true}))],
 ["lisa termine", assertSucceeds(setDoc(doc(L,"progression/1"),{jeuOK:true,termineeA:serverTimestamp()},{merge:true}))],
 ["admin ecrit progression", assertFails(setDoc(doc(A,"progression/1"),{questionOK:true}))],
 ["lisa reponse", assertSucceeds(setDoc(doc(L,"reponses/1"),{texte:"coucou",ecritA:serverTimestamp()}))],
 ["lisa reponse vide", assertFails(setDoc(doc(L,"reponses/1"),{texte:"",ecritA:serverTimestamp()}))],
 ["lisa reponse fermee", assertFails(setDoc(doc(L,"reponses/2"),{texte:"x",ecritA:serverTimestamp()}))],
 ["admin lit reponses", assertSucceeds(getDocs(collection(A,"reponses")))],
 ["lisa abonne", assertSucceeds(setDoc(doc(L,"abonnes/lisaUID"),{jeton:"t",majA:serverTimestamp(),appareil:"iPhone"}))],
 ["lisa abonne autre", assertFails(setDoc(doc(L,"abonnes/wg2JcW2kfkTGr1AB7ROEubZtL9h1"),{jeton:"t",majA:serverTimestamp(),appareil:"x"}))],
 ["inconnu abonne", assertFails(setDoc(doc(X,"abonnes/autre"),{jeton:"t",majA:serverTimestamp(),appareil:"x"}))],
 ["admin lit abonnes", assertSucceeds(getDocs(collection(A,"abonnes")))],
 ["lisa journal", assertFails(getDocs(collection(L,"journal")))],
 ["admin journal", assertSucceeds(getDocs(collection(A,"journal")))],
 ["autre collection", assertFails(getDoc(doc(A,"autre/x")))],
 ["admin supprime progression", assertSucceeds(deleteDoc(doc(A,"progression/1")))],
];
let ko=0;
for (const [n,p] of t) { try { await p; console.log("OK  ",n);} catch(e){ ko++; console.log("ECHEC",n,e.message.slice(0,120)); } }
await env.cleanup(); console.log(ko? `${ko} échec(s)`:"Toutes les règles se comportent comme prévu"); process.exit(ko?1:0);
