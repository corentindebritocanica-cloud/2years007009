// Vue joueuse : accueil (jauge, étapes, compte à rebours, notifications) et
// déroulé d'une étape (question → mini-jeu → récompense).
// En mode aperçu (admin), tout est débloqué et RIEN n'est écrit dans Firestore.
import {
  h, reponseCorrecte, dateParis, jourLong, heureCourte, compteARebours, toDate,
  estIOS, confettis, tutoInstallation, vibrer,
} from "./outils.js";
import { lancerJeu } from "./jeux.js";
import { demanderCode } from "./code.js";
import { BANDE_ANNONCE } from "./config.js";

export function demarrerJeu(racine, fb, jeu, user, { apercu = false, lectureSeule = false, quitter, ouvrirAdmin, testBandeAnnonce = false } = {}) {
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
    fb.synchroniserAppareil().catch(() => {});
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
    if (apercu || lectureSeule) return;
    const data = { ...champs };
    if (champs.termineeA === true) data.termineeA = fs.serverTimestamp();
    await fs.setDoc(fs.doc(db, "progression", String(n)), data, { merge: true });
  }
  async function ecrireReponse(n, texte) {
    if (apercu || lectureSeule) return;
    await fs.setDoc(fs.doc(db, "reponses", String(n)), { texte, ecritA: fs.serverTimestamp() });
  }

  const ouverte = (n) => etat.ouvertes.has(n);
  // Destinations déjà éliminées aux autres jeux « choix » (sauf l'étape `sauf`).
  const elimines = (sauf) => Object.entries(etat.prog).filter(([m, v]) => Number(m) !== sauf && v?.elimine).map(([, v]) => v.elimine);
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
        h("button", { class: "btn plein appel", onclick: () => aller({ etape: enCours.n }) }, "Ouvrir l'étape"));
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

    const grille = h("div", { class: "etapes" }, jeu.etapes.map((e, k) => {
      const cls = ["pastille", finie(e.n) ? "finie" : ouverte(e.n) ? "ouverte" : "", enCours?.n === e.n ? "actuelle" : ""].join(" ");
      const el = h("div", { class: cls, role: ouverte(e.n) ? "button" : null, "aria-label": `Étape ${e.n}`, style: `--k:${k}` }, finie(e.n) ? "✓" : e.n);
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
      apercu ? null : piedDePage()));
    proposerBandeAnnonce(proposerNotifications);
  }

  // Bande-annonce (vidéo du dépôt) : une seule fois par appareil, juste après la première connexion.
  // baEtat : null (pas encore montrée) → "encours" → "finie". Les données Firestore peuvent
  // redessiner l'accueil pendant la vidéo : on ne doit alors RIEN ouvrir par-dessus.
  let baEtat = null;
  // revoir = true : relancée depuis le bouton du bas de l'accueil (fermable à tout moment).
  function proposerBandeAnnonce(ensuite, revoir = false) {
    if (!revoir) {
      if (baEtat === "encours") return;
      if (baEtat === "finie") return ensuite();
      let deja = false;
      try { deja = !!localStorage.getItem("bande-annonce-vue"); } catch { /* rien */ }
      if ((!testBandeAnnonce && (apercu || deja)) || !BANDE_ANNONCE) { baEtat = "finie"; return ensuite(); }
      baEtat = "encours";
    } else if (document.querySelector(".ba-voile")) return;
    const video = h("video", { src: BANDE_ANNONCE, poster: "video/affiche.jpg", playsinline: true, "webkit-playsinline": true, preload: "auto" });
    const lecture = h("button", { class: "ba-lecture", "aria-label": "Lancer la bande-annonce" }, "▶");
    // Avant la lecture : pop-up « monte le son » au centre, la vidéo part depuis son bouton.
    lecture.addEventListener("click", () => {
      if (voile.querySelector(".ba-son")) return; // double appui
      if (revoir) { video.muted = false; video.play().catch(() => {}); return; }
      vibrer(15);
      const ok = h("button", { class: "btn plein" }, "C'est fait, lance !");
      const son = h("div", { class: "ba-son", role: "alertdialog", "aria-labelledby": "ba-son-titre" },
        h("div", { class: "ba-son-boite pile" },
          h("div", { class: "ba-son-icone", "aria-hidden": "true" }, "🔊"),
          h("h2", { id: "ba-son-titre" }, "Monte le son !"),
          h("p", { class: "doux" }, "Cette vidéo se regarde avec le son : monte le volume de ton iPhone avec les boutons sur le côté."),
          ok));
      ok.addEventListener("click", () => {
        son.classList.remove("visible");
        setTimeout(() => son.remove(), 250);
        video.muted = false;
        video.play().catch(() => {});
      });
      voile.append(son);
      requestAnimationFrame(() => son.classList.add("visible"));
    });
    video.addEventListener("play", () => { lecture.remove(); video.controls = true; });
    // « Je suis prête » n'apparaît qu'à la fin de la vidéo (ou si elle ne peut pas se lire).
    const fin = h("button", { class: `btn plein ba-fin${revoir ? " visible" : ""}` }, revoir ? "Fermer" : "Je suis prête ✨");
    const montrerFin = () => { fin.classList.add("visible", "ba-pulse"); vibrer([20, 30, 50]); };
    video.addEventListener("ended", montrerFin);
    video.addEventListener("error", montrerFin);
    const fermer = () => {
      if (!testBandeAnnonce) try { localStorage.setItem("bande-annonce-vue", "1"); } catch { /* rien */ }
      video.pause();
      voile.classList.remove("visible");
      setTimeout(() => { voile.remove(); if (!revoir) { baEtat = "finie"; ensuite(); } }, 350);
    };
    fin.addEventListener("click", fermer);
    const voile = h("div", { class: "ba-voile", role: "dialog", "aria-modal": "true", "aria-label": "Bande-annonce" },
      h("span", { class: "surtitre" }, revoir ? "Bande-annonce" : "Avant de commencer"),
      h("div", { class: "ba-cadre" }, video, lecture), fin);
    document.body.append(voile);
    requestAnimationFrame(() => voile.classList.add("visible"));
  }

  // Pop-up unique après la connexion dans l'app installée. iOS exige un appui
  // pour demander l'autorisation : on la demande depuis le bouton de la pop-up.
  let notifProposee = false;
  let fermerPopNotif = () => {};
  // iOS peut ne jamais répondre : on n'attend pas plus de 20 s.
  function demanderPermission() {
    return Promise.race([
      Promise.resolve(Notification.requestPermission()).catch(() => Notification.permission),
      new Promise((r) => setTimeout(() => r(Notification.permission), 20000)),
    ]);
  }
  // Inscription du jeton push, jamais bloquante : 15 s max par essai, 3 essais.
  function inscrirePush(essai = 1) {
    Promise.race([fb.synchroniserAppareil(true), new Promise((_, ko) => setTimeout(() => ko(new Error("délai")), 15000))])
      .catch((e) => { console.error(e); if (essai < 3) setTimeout(() => inscrirePush(essai + 1), 4000 * essai); });
  }
  function proposerNotifications() {
    if (apercu || notifProposee || !fb.pushPossible() || Notification.permission !== "default") return;
    try { if (sessionStorage.getItem("notif-plus-tard")) return; } catch { /* rien */ }
    notifProposee = true;
    const msg = h("p", { class: "message" });
    const oui = h("button", { class: "btn plein" }, "Activer les notifications");
    const non = h("button", { class: "btn fantome" }, "Plus tard");
    const voile = h("div", { class: "pop-voile", role: "dialog", "aria-modal": "true", "aria-labelledby": "pop-titre" },
      h("div", { class: "pop-boite pile" },
        h("div", { class: "pop-cloche", "aria-hidden": "true" }, "🔔"),
        h("h2", { id: "pop-titre" }, "Je te préviens ?"),
        h("p", { class: "doux" }, "Une nouvelle étape s'ouvre tous les 3 jours, le soir. Autorise les notifications pour ne jamais en rater une."),
        h("div", { class: "pop-exemple", "aria-hidden": "true" },
          h("img", { src: "img/icone-192.png", alt: "" }),
          h("div", {}, h("strong", {}, jeu.meta?.notif?.titre || "Une nouvelle étape t'attend"), h("span", {}, jeu.meta?.notif?.texte || "Ouvre l'app quand tu es prête ✨"))),
        oui, msg, non));
    let fermee = false;
    const fermer = () => { if (fermee) return; fermee = true; voile.classList.remove("visible"); setTimeout(() => voile.remove(), 300); };
    fermerPopNotif = fermer;
    oui.addEventListener("click", async () => {
      oui.disabled = true;
      const p = await demanderPermission();
      if (p === "granted") {
        inscrirePush(); // en arrière-plan : ne bloque jamais la pop-up
        voile.querySelector(".pop-cloche").textContent = "✅";
        voile.querySelector("#pop-titre").textContent = "C'est tout bon !";
        vibrer([20, 30, 50]);
        setTimeout(() => { fermer(); rendre(); }, 1100);
      } else { fermer(); rendre(); }
    });
    non.addEventListener("click", () => { try { sessionStorage.setItem("notif-plus-tard", "1"); } catch { /* rien */ } fermer(); });
    setTimeout(() => { document.body.append(voile); requestAnimationFrame(() => voile.classList.add("visible")); }, 900);
  }

  // Logo en bas de l'accueil : ouvre le pavé à code, puis l'espace admin.
  function piedDePage() {
    const logo = h("button", { class: "logo-pied", "aria-label": "2 ANS" },
      h("img", { src: "img/icone-192.png", alt: "", width: 44, height: 44 }));
    logo.addEventListener("click", async () => {
      if (!ouvrirAdmin) return;
      if (await demanderCode()) ouvrirAdmin();
    });
    const revoir = BANDE_ANNONCE
      ? h("button", { class: "btn fantome petit", onclick: () => proposerBandeAnnonce(() => {}, true) }, "🎬 Revoir la bande-annonce")
      : null;
    return h("footer", { class: "pied" }, revoir, logo,
      lectureSeule ? h("p", { class: "discret" }, "Appareil admin · tes actions ici ne sont pas enregistrées") : null);
  }

  function carteNotifications() {
    if (!fb.pushPossible()) {
      return estIOS() && !fb.estInstallee() ? tutoInstallation() : null;
    }
    if (Notification.permission === "granted") return null;
    if (Notification.permission === "denied") {
      return h("div", { class: "bandeau alerte" },
        "Les notifications sont bloquées. Réactive-les dans Réglages → Notifications → 2 ANS.");
    }
    const msg = h("p", { class: "message" });
    const btn = h("button", { class: "btn plein" }, "Activer les notifications");
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      const p = await demanderPermission();
      if (p === "granted") { inscrirePush(); vibrer([20, 30, 50]); }
      fermerPopNotif();
      rendre();
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
        [0, 1, 2].map((i) => h("span", { class: i < phase ? "fait" : i === phase ? "fait nouveau" : "" }))),
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
            form.replaceChildren(h("span", { class: "surtitre apparait" }, "Merci 💛"),
              h("p", { class: "recompense mot-apres" }, q.motApres),
              h("button", { class: "btn plein apparait", style: "animation-delay:.9s", type: "button", onclick: () => rendre() }, "Continuer"));
            vibrer(20);
            return;
          }
          return rendre();
        }
        essais++;
        if (reponseCorrecte(val, q.reponses)) {
          await ecrireProgression(n, { questionOK: true, tentatives: essais });
          champ.blur();
          form.classList.add("juste");
          msg.textContent = "";
          btn.replaceWith(h("div", { class: "juste-badge" }, h("span", {}, "✓"), "Bonne réponse !"));
          vibrer([20, 30, 50]);
          await new Promise((r) => setTimeout(r, 1100));
          return rendre();
        }
        ecrireProgression(n, { tentatives: essais }).catch(() => {});
        // Réponse « piège » prévue à l'avance : animation dédiée.
        const piege = (q.pieges || []).find((p) => reponseCorrecte(val, p.reponses));
        if (piege) {
          await animationRate(piege);
          btn.disabled = false; champ.value = ""; msg.textContent = "";
          champ.focus({ preventScroll: true });
          return;
        }
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

  // Grand tampon « RATÉ » plein écran. Les mots entre *astérisques* sont mis en valeur.
  function animationRate(piege) {
    return new Promise((fini) => {
      const message = h("p", { class: "rate-message" });
      String(piege.message || "").split(/(\*[^*]+\*)/).forEach((bout) => {
        if (/^\*[^*]+\*$/.test(bout)) message.append(h("strong", {}, bout.slice(1, -1)));
        else if (bout) message.append(bout);
      });
      const bouton = h("button", { class: "btn plein" }, piege.bouton || "Je réessaie");
      const voile = h("div", { class: "rate-voile", role: "alertdialog", "aria-live": "assertive" },
        h("div", { class: "rate-boite" },
          h("div", { class: "rate-tampon" }, piege.tampon || "RATÉ"),
          h("h2", { class: "rate-titre" }, piege.titre || "Raté !"),
          message,
          bouton));
      document.body.append(voile);
      try { navigator.vibrate?.([60, 40, 60, 40, 160]); } catch { /* iOS : sans effet */ }
      requestAnimationFrame(() => voile.classList.add("visible"));
      bouton.addEventListener("click", () => {
        voile.classList.remove("visible");
        setTimeout(() => { voile.remove(); fini(); }, 250);
      });
    });
  }

  function etapeJeu(n, e, corps) {
    const zone = h("div", { class: "pile" });
    const suite = h("button", { class: "btn plein", style: "display:none" }, "Voir ma récompense");
    corps.append(h("p", { class: "doux" }, e.jeu.consigne || ""), zone, suite);
    nettoyerJeu = lancerJeu(zone, e.jeu, async () => {
      try { await ecrireProgression(n, { jeuOK: true, termineeA: true }); }
      catch (err) { console.error(err); }
      suite.style.display = ""; suite.classList.add("apparait", "appel");
      suite.scrollIntoView({ behavior: "smooth", block: "end" });
    }, {
      dejaElimines: elimines(n), propre: etat.prog[n]?.elimine,
      enregistrer: (id) => ecrireProgression(n, { elimine: id }),
    });
    suite.addEventListener("click", () => { rendre(); confettis(); });
  }

  function etapeRecompense(n, e, corps) {
    const r = e.recompense || {};
    corps.append(h("article", { class: "carte pile recompense-carte" },
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
      nettoyerJeu = lancerJeu(zone, e.jeu, () => {}, { dejaElimines: elimines(n) });
    });
    corps.append(h("button", { class: "btn plein", onclick: () => aller({ accueil: true }) }, "Retour au chemin"));
    if (!["gps", "colis", "cadenas"].includes(e.jeu.type)) corps.append(rejouer);
  }

  function rappelJeu(j) {
    if (j.type === "cadenas") {
      // Aucun rappel des chiffres : elle doit les avoir retenus.
      return j.final ? h("div", { class: "bandeau" }, "🔓 Cadenas ouvert") : null;
    }
    if (j.type === "colis") return h("div", { class: "bandeau" }, `📦 ${j.indice}`);
    if (j.type === "gps") {
      const zone = h("div", { class: "pile" });
      lancerJeu(zone, j, () => {}, { rappel: true });
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
