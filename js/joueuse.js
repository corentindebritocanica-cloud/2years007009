// Vue joueuse : accueil (jauge, étapes, compte à rebours, notifications) et
// déroulé d'une étape (question → mini-jeu → récompense).
// En mode aperçu (admin), tout est débloqué et RIEN n'est écrit dans Firestore.
import {
  h, reponseCorrecte, dateParis, jourLong, heureCourte, compteARebours, toDate,
  estIOS, confettis, tutoInstallation,
} from "./outils.js";
import { lancerJeu } from "./jeux.js";

export function demarrerJeu(racine, fb, jeu, user, { apercu = false, quitter } = {}) {
  const { db, fs } = fb;
  const N = jeu.etapes.length;
  const etat = { ouvertes: new Map(), prog: {}, pret: { e: false, p: false } };
  const desabos = [];
  let minuteur = null;
  let nettoyerJeu = () => {};
  let vue = lireRoute();

  // ---------- Données ----------
  if (apercu) {
    jeu.etapes.forEach((e) => etat.ouvertes.set(e.n, { debloqueeA: new Date() }));
    etat.pret = { e: true, p: true };
  } else {
    desabos.push(fs.onSnapshot(fs.collection(db, "etapes"), (s) => {
      etat.ouvertes = new Map(s.docs.map((d) => [Number(d.id), d.data()]));
      etat.pret.e = true; surDonnees();
    }, erreurDonnees));
    desabos.push(fs.onSnapshot(fs.collection(db, "progression"), (s) => {
      etat.prog = Object.fromEntries(s.docs.map((d) => [Number(d.id), d.data()]));
      etat.pret.p = true; surDonnees();
    }, erreurDonnees));
    fb.synchroniserJeton(user.uid).catch(() => {});
  }

  function erreurDonnees(e) {
    console.error(e);
    racine.replaceChildren(h("main", { class: "ecran centre" },
      h("h2", {}, "Accès refusé"),
      h("p", { class: "doux" }, "Ce compte n'a pas accès au jeu (règles Firestore)."),
      h("button", { class: "btn secondaire", onclick: () => fb.deconnexion() }, "Se déconnecter")));
  }

  async function ecrireProgression(n, champs) {
    etat.prog[n] = { ...(etat.prog[n] || {}), ...champs };
    if (apercu) return;
    const data = { ...champs };
    if (champs.termineeA === true) data.termineeA = fs.serverTimestamp();
    await fs.setDoc(fs.doc(db, "progression", String(n)), data, { merge: true });
  }
  async function ecrireReponse(n, texte) {
    if (apercu) return;
    await fs.setDoc(fs.doc(db, "reponses", String(n)), { texte, ecritA: fs.serverTimestamp() });
  }

  const ouverte = (n) => etat.ouvertes.has(n);
  const finie = (n) => !!etat.prog[n]?.termineeA;

  // ---------- Routage ----------
  function lireRoute() {
    const n = Number(new URLSearchParams(location.search).get("etape"));
    return n >= 1 && n <= N ? { etape: n } : { accueil: true };
  }
  function aller(v) {
    vue = v;
    if (!apercu) {
      const url = v.etape ? `?etape=${v.etape}` : location.pathname;
      history.pushState(null, "", url);
    }
    rendre();
  }
  const surRetour = () => { vue = lireRoute(); rendre(); };
  window.addEventListener("popstate", surRetour);

  let premierRendu = true;
  function surDonnees() {
    if (!etat.pret.e || !etat.pret.p) return;
    // Sur l'accueil, on suit les changements en direct. Dans une étape, on ne
    // re-dessine pas (on casserait un mini-jeu en cours).
    if (premierRendu || vue.accueil) { premierRendu = false; rendre(); }
  }

  function rendre() {
    clearInterval(minuteur);
    nettoyerJeu(); nettoyerJeu = () => {};
    window.scrollTo(0, 0);
    if (vue.etape && ouverte(vue.etape)) return rendreEtape(vue.etape);
    vue = { accueil: true };
    rendreAccueil();
  }
  if (apercu) rendre();

  function bandeauApercu() {
    return apercu ? h("div", { class: "apercu-bandeau" }, "👁 Aperçu — rien n'est enregistré",
      h("button", { onclick: () => quitter?.() }, "Quitter")) : null;
  }

  // ---------- Accueil ----------
  function rendreAccueil() {
    const nbFinies = jeu.etapes.filter((e) => finie(e.n)).length;
    const enCours = jeu.etapes.find((e) => ouverte(e.n) && !finie(e.n));
    const prochaine = jeu.etapes.find((e) => !ouverte(e.n));
    const heure = Number(new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "numeric" }).format(new Date()));
    const salut = heure >= 18 || heure < 5 ? "Bonsoir" : "Bonjour";

    const rempli = h("div", { class: "rempli" });
    const jauge = h("div", { class: "jauge carte" },
      h("div", { class: "ligne" }, h("span", { class: "surtitre" }, "Jauge d'impatience"), h("span", { class: "espace" }),
        h("strong", {}, `${nbFinies} / ${N}`)),
      h("div", { class: "barre" }, rempli));
    requestAnimationFrame(() => requestAnimationFrame(() => { rempli.style.width = `${(nbFinies / N) * 100}%`; }));

    let principal;
    if (enCours) {
      principal = h("div", { class: "carte pile" },
        h("span", { class: "surtitre" }, enCours.phase),
        h("h2", {}, `L'étape ${enCours.n} t'attend`),
        h("p", { class: "doux" }, etat.prog[enCours.n]?.questionOK ? "Tu l'as commencée, il te reste le mini-jeu." : "Installe-toi confortablement."),
        h("button", { class: "btn plein", onclick: () => aller({ etape: enCours.n }) }, "Ouvrir l'étape"));
    } else if (prochaine) {
      const compte = h("div", { class: "compte" });
      let texte;
      if (prochaine.manuel || !prochaine.heure) {
        texte = "La dernière étape s'ouvrira au moment parfait. Garde ton téléphone près de toi.";
      } else {
        const cible = dateParis(prochaine.date, prochaine.heure);
        texte = `Prochaine étape ${jourLong(cible)} à ${heureCourte(cible)}`;
        const maj = () => { compte.textContent = compteARebours(cible); };
        maj(); minuteur = setInterval(maj, 1000);
      }
      principal = h("div", { class: "carte pile attente" },
        h("div", { class: "lune" }, nbFinies === 0 ? "✨" : "🌙"),
        nbFinies === 0 && jeu.meta?.accueil ? h("p", { class: "recompense", style: "text-align:center" }, jeu.meta.accueil) : null,
        compte.textContent || prochaine.heure ? compte : null,
        h("p", { class: "doux" }, texte));
    } else {
      principal = h("div", { class: "carte pile attente" },
        h("div", { class: "lune" }, "💛"),
        h("h2", {}, "Tout est terminé"),
        h("p", { class: "doux" }, "Il ne reste plus qu'à vivre la suite."));
    }

    const grille = h("div", { class: "etapes" }, jeu.etapes.map((e) => {
      const cls = ["pastille", finie(e.n) ? "finie" : ouverte(e.n) ? "ouverte" : "", enCours?.n === e.n ? "actuelle" : ""].join(" ");
      const el = h("div", { class: cls, role: ouverte(e.n) ? "button" : null, "aria-label": `Étape ${e.n}` }, finie(e.n) ? "✓" : e.n);
      if (ouverte(e.n)) el.addEventListener("click", () => aller({ etape: e.n }));
      return el;
    }));

    racine.replaceChildren(h("main", { class: "ecran" },
      bandeauApercu(),
      h("header", { class: "entete" },
        h("div", {}, h("div", { class: "surtitre" }, `${salut} ${jeu.meta?.prenom || ""}`.trim()),
          h("div", { class: "titre-app" }, jeu.meta?.nomJeu || "Notre jeu"))),
      apercu ? null : carteNotifications(),
      principal,
      jauge,
      h("section", { class: "pile" }, h("span", { class: "surtitre" }, "Le chemin"), grille),
      apercu ? null : h("button", {
        class: "btn fantome", style: "align-self:center",
        onclick: () => { if (confirm("Se déconnecter de l'app ?")) fb.deconnexion(); },
      }, "Se déconnecter")));
  }

  function carteNotifications() {
    if (!fb.pushPossible()) {
      return estIOS() && !fb.estInstallee() ? tutoInstallation() : null;
    }
    if (Notification.permission === "granted") return null;
    if (Notification.permission === "denied") {
      return h("div", { class: "bandeau alerte" },
        "Les notifications sont bloquées. Réactive-les dans Réglages → Notifications → Notre jeu.");
    }
    const msg = h("p", { class: "message" });
    const btn = h("button", { class: "btn plein" }, "Activer les notifications");
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      const p = await Notification.requestPermission();
      if (p === "granted") {
        try { await fb.synchroniserJeton(user.uid); rendre(); }
        catch (e) { console.error(e); btn.disabled = false; msg.className = "message erreur"; msg.textContent = "Échec de l'inscription, réessaie."; }
      } else rendre();
    });
    return h("div", { class: "bandeau pile" },
      h("strong", {}, "Une étape s'ouvre tous les 3 jours"),
      h("span", {}, "Autorise les notifications pour être prévenue au bon moment."), btn, msg);
  }

  // ---------- Étape ----------
  function rendreEtape(n) {
    const e = jeu.etapes[n - 1];
    const p = etat.prog[n] || {};
    const phase = !p.questionOK ? 0 : !p.jeuOK ? 1 : 2;
    const corps = h("div", { class: "pile" });

    const ecran = h("main", { class: "ecran" },
      bandeauApercu(),
      h("header", { class: "entete" },
        h("button", { class: "icone-btn", "aria-label": "Retour", onclick: () => aller({ accueil: true }) }, "‹"),
        h("div", { style: "text-align:center" }, h("div", { class: "surtitre" }, e.phase), h("div", { class: "titre-app" }, e.titre || `Étape ${n}`)),
        h("div", { style: "width:44px" })),
      h("div", { class: "progression-etape", "aria-hidden": "true" },
        [0, 1, 2].map((i) => h("span", { class: i <= phase ? "fait" : "" }))),
      corps);
    racine.replaceChildren(ecran);

    if (phase === 0) return etapeQuestion(n, e, corps);
    if (phase === 1) return etapeJeu(n, e, corps);
    return etapeRecompense(n, e, corps);
  }

  function etapeQuestion(n, e, corps) {
    const q = e.question;
    const msg = h("p", { class: "message" });
    const profonde = q.type === "profonde";
    const champ = profonde
      ? h("textarea", { class: "champ", placeholder: "Prends ton temps…", rows: 6 })
      : h("input", { class: "champ", type: "text", autocomplete: "off", autocapitalize: "off", spellcheck: "false", placeholder: "Ta réponse", enterkeyhint: "done" });
    const btn = h("button", { class: "btn plein", type: "submit" }, profonde ? "Envoyer ma réponse" : "Valider");
    const form = h("form", { class: "carte pile" },
      h("span", { class: "surtitre" }, profonde ? "Question à cœur ouvert" : "Question"),
      h("p", { class: "question" }, q.texte), champ, msg, btn);
    corps.append(form);
    setTimeout(() => champ.focus({ preventScroll: true }), 350);

    let essais = etat.prog[n]?.tentatives || 0;
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const val = champ.value.trim();
      if (!val) { msg.className = "message erreur"; msg.textContent = profonde ? "Écris quelque chose, même court." : "Il manque ta réponse."; return; }
      btn.disabled = true;
      try {
        if (profonde) {
          await ecrireReponse(n, val);
          await ecrireProgression(n, { questionOK: true });
          if (q.motApres) {
            form.replaceChildren(h("p", { class: "recompense" }, q.motApres),
              h("button", { class: "btn plein", type: "button", onclick: () => rendre() }, "Continuer"));
            return;
          }
          return rendre();
        }
        essais++;
        if (reponseCorrecte(val, q.reponses)) {
          await ecrireProgression(n, { questionOK: true, tentatives: essais });
          return rendre();
        }
        ecrireProgression(n, { tentatives: essais }).catch(() => {});
        btn.disabled = false;
        msg.className = "message erreur";
        msg.textContent = essais >= 3 && q.indice ? `Indice : ${q.indice}` : "Ce n'est pas ça… réessaie.";
        form.classList.remove("secoue"); void form.offsetWidth; form.classList.add("secoue");
      } catch (err) {
        console.error(err);
        btn.disabled = false;
        msg.className = "message erreur"; msg.textContent = "Enregistrement impossible. Vérifie ton réseau et réessaie.";
      }
    });
  }

  function etapeJeu(n, e, corps) {
    const zone = h("div", { class: "pile" });
    const suite = h("button", { class: "btn plein", style: "display:none" }, "Voir ma récompense");
    corps.append(h("p", { class: "doux" }, e.jeu.consigne || ""), zone, suite);
    nettoyerJeu = lancerJeu(zone, e.jeu, async () => {
      try { await ecrireProgression(n, { jeuOK: true, termineeA: true }); }
      catch (err) { console.error(err); }
      suite.style.display = "";
      suite.scrollIntoView({ behavior: "smooth", block: "end" });
    });
    suite.addEventListener("click", () => { rendre(); confettis(); });
  }

  function etapeRecompense(n, e, corps) {
    const r = e.recompense || {};
    corps.append(h("article", { class: "carte pile" },
      h("span", { class: "surtitre" }, r.titre || "Ta récompense"),
      h("p", { class: "recompense" }, r.texte || ""),
      r.image ? h("img", { src: r.image, alt: "", style: "width:100%;border-radius:14px" }) : null));

    const rappel = rappelJeu(e.jeu);
    if (rappel) corps.append(rappel);

    const rejouer = h("button", { class: "btn secondaire plein" }, "Rejouer le mini-jeu");
    rejouer.addEventListener("click", () => {
      rejouer.remove();
      const zone = h("div", { class: "pile" });
      corps.append(zone);
      nettoyerJeu = lancerJeu(zone, e.jeu, () => {});
    });
    corps.append(h("button", { class: "btn plein", onclick: () => aller({ accueil: true }) }, "Retour au chemin"));
    if (!["gps", "colis"].includes(e.jeu.type)) corps.append(rejouer);
  }

  function rappelJeu(j) {
    if (j.type === "cadenas") {
      const pos = j.position || 1;
      return h("div", { class: "bandeau" }, j.final
        ? `🔒 Code complet : ${j.code}`
        : `🔒 Chiffre ${pos} du cadenas : ${String(j.code)[pos - 1]}`);
    }
    if (j.type === "colis") return h("div", { class: "bandeau" }, `📦 ${j.indice}`);
    if (j.type === "gps") {
      const zone = h("div", { class: "pile" });
      lancerJeu(zone, j, () => {});
      return zone;
    }
    return null;
  }

  return () => {
    desabos.forEach((f) => f());
    clearInterval(minuteur);
    nettoyerJeu();
    window.removeEventListener("popstate", surRetour);
  };
}
