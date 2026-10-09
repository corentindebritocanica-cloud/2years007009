// Tableau de bord admin : suivi des 21 étapes, réponses de Lisa, journal du relais,
// déblocage manuel (étape 21 et secours), notifications de test, aperçu du jeu.
import { h, dateParis, dateCourte, toDate } from "./outils.js";
import { RELAIS_URL } from "./config.js";
import { verrouillerAdmin } from "./code.js";
import { demarrerJeu } from "./joueuse.js";

export function demarrerAdmin(racine, fb, jeu, user, { retour } = {}) {
  const { db, fs } = fb;
  const etat = { etapes: {}, prog: {}, reponses: {}, journal: [], appareils: {} };
  const desabos = [];
  let onglet = "suivi";
  let sousVue = null; // arrêt de l'aperçu en cours

  const suivre = (ref, cle, transf) => desabos.push(fs.onSnapshot(ref, (s) => {
    etat[cle] = transf(s); rendre();
  }, (e) => { console.error(cle, e); })); // une erreur sur une collection n'empêche pas le reste

  const parId = (s) => Object.fromEntries(s.docs.map((d) => [d.id, d.data()]));
  suivre(fs.collection(db, "etapes"), "etapes", parId);
  suivre(fs.collection(db, "progression"), "prog", parId);
  suivre(fs.collection(db, "reponses"), "reponses", parId);
  suivre(fs.collection(db, "appareils"), "appareils", parId);
  suivre(fs.query(fs.collection(db, "journal"), fs.orderBy("a", "desc"), fs.limit(40)), "journal",
    (s) => s.docs.map((d) => ({ id: d.id, ...d.data() })));

  fb.synchroniserAppareil().catch(() => {});

  // ---------- Relais ----------
  async function relais(action, extra = {}) {
    if (!RELAIS_URL) throw new Error("RELAIS_URL n'est pas encore renseignée dans js/config.js");
    const idToken = await fb.auth.currentUser.getIdToken();
    // text/plain = pas de pré-requête CORS (Apps Script ne la gère pas)
    const r = await fetch(RELAIS_URL, {
      method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action, idToken, ...extra }),
    });
    const d = await r.json().catch(() => ({ ok: false, erreur: `Réponse illisible (${r.status})` }));
    if (!d.ok) throw new Error(d.erreur || "Échec du relais");
    return d;
  }

  async function debloquer(n) {
    if (!confirm(`Débloquer l'étape ${n} maintenant ?${RELAIS_URL ? " Une notification partira." : "\n(Relais non configuré : aucune notification.)"}`)) return;
    try {
      if (RELAIS_URL) {
        await relais("debloquer", { etape: n });
      } else {
        await fs.setDoc(fs.doc(db, "etapes", String(n)), { debloqueeA: fs.serverTimestamp(), mode: "manuel" });
      }
      toast(`Étape ${n} débloquée`);
    } catch (e) { alert(e.message); }
  }

  // Ouvre d'un coup toutes les étapes pas encore ouvertes (sans notification). Pour tester ou en secours.
  async function debloquerTout() {
    const restantes = jeu.etapes.filter((e) => !etat.etapes[e.n]);
    if (!restantes.length) { toast("Toutes les étapes sont déjà ouvertes"); return; }
    if (!confirm(`Débloquer les ${restantes.length} étapes restantes d'un coup ? Aucune notification ne part, et Lisa pourra tout jouer immédiatement.`)) return;
    if (prompt("Tape TOUT pour confirmer") !== "TOUT") return;
    try {
      const lot = fs.writeBatch(db);
      restantes.forEach((e) => lot.set(fs.doc(db, "etapes", String(e.n)), { debloqueeA: fs.serverTimestamp(), mode: "manuel" }));
      await lot.commit();
      toast(`${restantes.length} étapes débloquées`);
    } catch (e) { alert(e.message); }
  }

  async function notifTest(cible) {
    try {
      const d = await relais("test", { cible, appareil: fb.idAppareil() });
      toast(d.message || "Notification envoyée");
    } catch (e) { alert(e.message); }
  }

  async function reinitialiser() {
    if (!confirm("Effacer TOUTE la progression, les réponses et les déblocages ? (pour repartir de zéro après les tests)")) return;
    if (prompt("Tape EFFACER pour confirmer") !== "EFFACER") return;
    const lot = fs.writeBatch(db);
    for (const col of ["etapes", "progression", "reponses"]) {
      const s = await fs.getDocs(fs.collection(db, col));
      s.forEach((d) => lot.delete(d.ref));
    }
    await lot.commit();
    toast("Données de jeu remises à zéro");
  }

  function apercu(n) {
    desabos.forEach((f) => f()); desabos.length = 0;
    if (n) history.replaceState(null, "", `?etape=${n}`);
    sousVue = demarrerJeu(racine, fb, jeu, user, {
      apercu: true,
      quitter: () => { sousVue?.(); sousVue = null; history.replaceState(null, "", location.pathname); demarrerAdmin(racine, fb, jeu, user, { retour }); },
    });
  }

  function toast(t) {
    const el = h("div", { class: "bandeau", style: "position:fixed;left:16px;right:16px;bottom:calc(var(--sb) + 16px);z-index:60;box-shadow:var(--ombre)" }, t);
    document.body.append(el); setTimeout(() => el.remove(), 2600);
  }

  // ---------- Rendu ----------
  function rendre() {
    if (sousVue) return;
    const y = window.scrollY;
    const tabs = [["suivi", "Suivi"], ["reponses", "Réponses"], ["journal", "Journal"], ["reglages", "Réglages"]];
    const contenu = { suivi: vueSuivi, reponses: vueReponses, journal: vueJournal, reglages: vueReglages }[onglet]();
    racine.replaceChildren(h("main", { class: "ecran" },
      h("header", { class: "entete" },
        h("button", { class: "icone-btn", "aria-label": "Retour à l'accueil", onclick: () => retour?.() }, "‹"),
        h("div", { style: "flex:1" }, h("div", { class: "surtitre" }, "Admin"), h("div", { class: "titre-app" }, "Tableau de bord")),
        h("button", { class: "btn secondaire petit", onclick: () => apercu() }, "👁 Aperçu")),

      h("nav", { class: "onglets" }, tabs.map(([id, nom]) =>
        h("button", { class: onglet === id ? "actif" : "", onclick: () => { onglet = id; rendre(); window.scrollTo(0, 0); } }, nom))),
      contenu));
    window.scrollTo(0, y);
  }

  function vueSuivi() {
    const finies = jeu.etapes.filter((e) => etat.prog[e.n]?.termineeA).length;
    const ouvertes = Object.keys(etat.etapes).length;
    return h("div", { class: "pile" },
      RELAIS_URL ? null : h("div", { class: "bandeau alerte" }, "Relais Apps Script non configuré : pas de notifications automatiques. Renseigne RELAIS_URL dans js/config.js."),
      h("div", { class: "carte ligne" },
        h("div", { class: "pile", style: "gap:2px" }, h("span", { class: "surtitre" }, "Ouvertes"), h("strong", { style: "font-size:1.4rem" }, `${ouvertes} / 21`)),
        h("span", { class: "espace" }),
        h("div", { class: "pile", style: "gap:2px;text-align:right" }, h("span", { class: "surtitre" }, "Terminées"), h("strong", { style: "font-size:1.4rem" }, `${finies} / 21`))),
      h("div", { class: "carte" }, jeu.etapes.map(ligneEtape)),
      h("button", { class: "btn secondaire plein", onclick: debloquerTout }, "🔓 Tout débloquer d'un coup"));
  }

  function ligneEtape(e) {
    const s = etat.etapes[e.n];
    const p = etat.prog[e.n] || {};
    const prevue = e.heure ? dateParis(e.date, e.heure) : null;
    const etats = [];
    if (s) {
      etats.push(h("span", { class: "etat a" }, `ouverte ${dateCourte(toDate(s.debloqueeA))}${s.mode === "manuel" ? " (manuel)" : ""}`));
      if (s.notifEnvoyeeA) etats.push(h("span", { class: "etat" }, "🔔 notif"));
      if (s.notifErreur) etats.push(h("span", { class: "etat r" }, `notif : ${s.notifErreur}`));
      if (s.relanceEnvoyeeA) etats.push(h("span", { class: "etat" }, "🔔 relance"));
    }
    if (p.questionOK) etats.push(h("span", { class: "etat v" }, "question ✓"));
    if (p.tentatives) etats.push(h("span", { class: "etat" }, `${p.tentatives} essai(s)`));
    if (p.termineeA) etats.push(h("span", { class: "etat v" }, `finie ${dateCourte(toDate(p.termineeA))}`));

    return h("div", { class: "ligne-etape" },
      h("div", { class: "num" + (p.termineeA ? " fin" : s ? " on" : "") }, e.n),
      h("div", {},
        h("div", { style: "font-weight:600" }, `${e.jeu.type} · ${e.question.type === "profonde" ? "P" : "V"}`),
        h("div", { class: "discret" }, e.manuel ? `${e.date} · manuel` : `${dateCourte(prevue)}`),
        h("div", { class: "etats" }, etats)),
      h("div", { class: "pile", style: "gap:6px" },
        s ? null : h("button", { class: "btn petit", onclick: () => debloquer(e.n) }, "Débloquer"),
        h("button", { class: "btn secondaire petit", onclick: () => apercu(e.n) }, "Voir")));
  }

  function vueReponses() {
    const liste = jeu.etapes.filter((e) => e.question.type === "profonde");
    return h("div", { class: "pile" }, liste.map((e) => {
      const r = etat.reponses[e.n];
      return h("article", { class: "carte pile" },
        h("span", { class: "surtitre" }, `Étape ${e.n} · ${r ? dateCourte(toDate(r.ecritA)) : "pas encore répondu"}`),
        h("p", { class: "doux" }, e.question.texte),
        r ? h("p", { class: "recompense" }, r.texte) : null);
    }));
  }

  function vueJournal() {
    if (!etat.journal.length) return h("div", { class: "carte doux" }, "Rien pour l'instant. Le relais écrit ici chaque envoi, erreur et déblocage.");
    return h("div", { class: "carte" }, etat.journal.map((j) =>
      h("div", { class: "journal-ligne" },
        h("div", { class: "ligne" }, h("strong", {}, j.type || "—"), h("span", { class: "espace" }), h("span", { class: "discret" }, dateCourte(toDate(j.a)))),
        j.etape ? h("div", { class: "doux" }, `Étape ${j.etape}`) : null,
        j.detail ? h("code", {}, typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail)) : null)));
  }

  async function oublierAppareil(id) {
    if (!confirm("Retirer cet appareil ? Il ne recevra plus de notifications jusqu'à sa prochaine ouverture de l'app.")) return;
    await fs.deleteDoc(fs.doc(db, "appareils", id)).catch((e) => alert(e.message));
  }

  function vueReglages() {
    const ici = fb.idAppareil();
    const role = fb.roleAppareil();
    const appareils = Object.entries(etat.appareils)
      .sort(([a], [b]) => (a === ici ? -1 : b === ici ? 1 : 0));
    const permission = fb.pushPossible() ? { granted: "autorisées", denied: "refusées", default: "pas encore demandées" }[Notification.permission] : "indisponibles";
    const btnPerm = h("button", { class: "btn secondaire plein" }, "Activer les notifications sur cet appareil");
    btnPerm.addEventListener("click", async () => {
      const p = await Notification.requestPermission();
      if (p === "granted") { await fb.synchroniserAppareil(true).catch((e) => alert(e.message)); toast("Appareil inscrit"); }
      rendre();
    });

    const choixRole = h("div", { class: "onglets", style: "position:static" },
      [["joueuse", "Joueuse"], ["admin", "Admin"]].map(([v, nom]) => h("button", {
        class: role === v ? "actif" : "",
        onclick: async () => {
          if (v === role) return;
          await fb.changerRoleAppareil(v).catch((e) => alert(e.message));
          toast(v === "admin" ? "Cet appareil est maintenant « admin »" : "Cet appareil est maintenant « joueuse »");
          rendre();
        },
      }, nom)));

    return h("div", { class: "pile" },
      h("section", { class: "carte pile" },
        h("h3", {}, "Cet appareil"),
        choixRole,
        h("p", { class: "doux" }, role === "admin"
          ? "Admin : reçoit aussi les notifs du jeu, mais l'accueil est en lecture seule (rien n'est enregistré à la place de Lisa)."
          : "Joueuse : reçoit les notifs du jeu, et sa progression est enregistrée. C'est le réglage de l'iPhone de Lisa."),
        h("p", { class: "discret" }, `Notifications ${permission}${fb.estInstallee() ? " · app installée" : " · ouvert dans le navigateur"}`),
        permission === "pas encore demandées" ? btnPerm : null),
      h("section", { class: "carte pile" },
        h("h3", {}, "Appareils inscrits"),
        appareils.length ? appareils.map(([id, a]) => h("div", { class: "journal-ligne" },
          h("div", { class: "ligne" },
            h("strong", {}, `${a.role === "admin" ? "Admin" : "Joueuse"}${id === ici ? " · cet appareil" : ""}`),
            h("span", { class: "espace" }),
            h("button", { class: "btn fantome petit", onclick: () => oublierAppareil(id) }, "Retirer")),
          h("div", { class: "discret" }, `màj ${dateCourte(toDate(a.majA))}${a.jeton ? "" : " · pas de notifications"}`),
          h("code", {}, (a.appareil || "").slice(0, 90)))) : h("p", { class: "doux" }, "Aucun appareil inscrit.")),
      h("section", { class: "carte pile" },
        h("h3", {}, "Notifications de test"),
        h("p", { class: "doux" }, "Passe par le relais Apps Script, comme les vraies."),
        h("button", { class: "btn secondaire plein", onclick: () => notifTest("appareil") }, "Tester sur cet appareil"),
        h("button", { class: "btn secondaire plein", onclick: () => notifTest("joueuse") }, "Tester sur les appareils « joueuse »")),
      h("section", { class: "carte pile" },
        h("h3", {}, "Tests"),
        h("p", { class: "doux" }, "Avant le lancement : remet le jeu à zéro (étapes, progression, réponses)."),
        h("button", { class: "btn danger plein", onclick: reinitialiser }, "Remettre le jeu à zéro")),
      h("section", { class: "carte pile" },
        h("p", { class: "discret" }, `Compte : ${user.email}`),
        h("button", { class: "btn secondaire plein", onclick: () => { verrouillerAdmin(); retour?.(); } }, "Verrouiller l'admin"),
        h("button", { class: "btn fantome", onclick: () => { if (confirm("Se déconnecter de cet appareil ?")) { verrouillerAdmin(); fb.deconnexion(); } } }, "Se déconnecter")));
  }

  rendre();
  return () => { desabos.forEach((f) => f()); sousVue?.(); };
}
