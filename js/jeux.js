// Les mini-jeux. Chaque fonction reçoit (zone, config, fini) et appelle fini()
// une seule fois quand le jeu est gagné. Elle renvoie une fonction de nettoyage.
import { h, melanger, vibrer } from "./outils.js";

export const MINI_JEUX = { grattage, memoire, puzzle, cadenas, anagramme, choix, carte, colis, gps };

export function lancerJeu(zone, cfg, fini) {
  const f = MINI_JEUX[cfg.type];
  if (!f) {
    zone.append(h("p", { class: "doux" }, `Mini-jeu inconnu : ${cfg.type}`));
    fini();
    return () => {};
  }
  let dejaFini = false;
  const unique = () => { if (!dejaFini) { dejaFini = true; vibrer(30); fini(); } };
  return f(zone, cfg, unique) || (() => {});
}

// ---------------------------------------------------------------- Grattage
function grattage(zone, cfg, fini) {
  const dessous = h("div", { class: "dessous" }, cfg.cache || "");
  const canvas = h("canvas");
  const boite = h("div", { class: "zone-jeu grattage" }, dessous, canvas);
  zone.append(boite);

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  let w, hh, dpr, actif = false, dernier = null, compteur = 0, termine = false;

  function peindre() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = boite.getBoundingClientRect();
    w = r.width; hh = r.height;
    canvas.width = w * dpr; canvas.height = hh * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const g = ctx.createLinearGradient(0, 0, w, hh);
    g.addColorStop(0, "#c9a36b"); g.addColorStop(0.5, "#f1d8a8"); g.addColorStop(1, "#b98a4f");
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, hh);
    // petites paillettes
    for (let i = 0; i < 160; i++) {
      ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.35})`;
      ctx.fillRect(Math.random() * w, Math.random() * hh, 2, 2);
    }
    ctx.fillStyle = "rgba(60,30,10,.75)";
    ctx.font = `600 ${Math.round(w / 15)}px Georgia, serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("✦ Gratte ici ✦", w / 2, hh / 2);
  }
  requestAnimationFrame(peindre);

  const pos = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  function gratter(p) {
    ctx.globalCompositeOperation = "destination-out";
    ctx.lineWidth = Math.max(34, w / 9); ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo((dernier || p).x, (dernier || p).y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    dernier = p;
    if (++compteur % 8 === 0) verifier();
  }
  function verifier() {
    if (termine) return;
    const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let vide = 0, total = 0;
    for (let i = 3; i < d.length; i += 4 * 24) { total++; if (d[i] === 0) vide++; }
    if (vide / total > 0.55) {
      termine = true;
      canvas.style.transition = "opacity .7s"; canvas.style.opacity = "0";
      setTimeout(fini, 500);
    }
  }
  canvas.addEventListener("pointerdown", (e) => { actif = true; dernier = null; canvas.setPointerCapture(e.pointerId); gratter(pos(e)); });
  canvas.addEventListener("pointermove", (e) => { if (actif) gratter(pos(e)); });
  const stop = () => { actif = false; dernier = null; verifier(); };
  canvas.addEventListener("pointerup", stop);
  canvas.addEventListener("pointercancel", stop);
}

// ---------------------------------------------------------------- Mémoire
function memoire(zone, cfg, fini) {
  const photos = cfg.photos || [];
  const cartes = melanger(photos.flatMap((p, i) => [{ i, p }, { i, p }]));
  const grille = h("div", { class: "memoire" });
  let ouvertes = [], verrou = false, trouvees = 0;

  cartes.forEach((c) => {
    const el = h("div", { class: "cm", role: "button", "aria-label": "Carte" },
      h("div", { class: "in" },
        h("div", { class: "face dos" }, "♡"),
        h("div", { class: "face recto" }, h("img", { src: c.p.image, alt: "", loading: "eager", draggable: "false" }))));
    el.addEventListener("click", () => {
      if (verrou || el.classList.contains("vue") || el.classList.contains("trouvee")) return;
      el.classList.add("vue"); ouvertes.push({ el, c });
      if (ouvertes.length < 2) return;
      verrou = true;
      const [a, b] = ouvertes;
      if (a.c.i === b.c.i) {
        setTimeout(() => {
          a.el.classList.add("trouvee"); b.el.classList.add("trouvee");
          ouvertes = []; verrou = false; trouvees++; vibrer(15);
          if (trouvees === photos.length) setTimeout(montrerFrise, 600);
        }, 350);
      } else {
        setTimeout(() => { a.el.classList.remove("vue"); b.el.classList.remove("vue"); ouvertes = []; verrou = false; }, 900);
      }
    });
    grille.append(el);
  });
  zone.append(grille);

  function montrerFrise() {
    const frise = h("div", { class: "frise" },
      photos.map((p) => h("figure", {}, h("img", { src: p.image, alt: "" }), h("figcaption", {}, p.legende || ""))));
    grille.replaceWith(h("div", { class: "pile" }, h("p", { class: "doux" }, "Dans l'ordre :"), frise));
    fini();
  }
}

// ---------------------------------------------------------------- Puzzle (échange de pièces)
function puzzle(zone, cfg, fini) {
  const n = cfg.taille || 3;
  let ordre = [...Array(n * n).keys()];
  do { ordre = melanger(ordre); } while (ordre.every((v, i) => v === i));
  const grille = h("div", { class: "zone-jeu puzzle", style: `grid-template-columns:repeat(${n},1fr)` });
  let choisie = null;

  function dessiner() {
    grille.replaceChildren(...ordre.map((v, idx) => {
      const x = (v % n) / (n - 1) * 100, y = Math.floor(v / n) / (n - 1) * 100;
      const p = h("div", {
        class: "piece" + (choisie === idx ? " choisie" : ""),
        style: `background-image:url('${cfg.image}');background-size:${n * 100}% ${n * 100}%;background-position:${x}% ${y}%`,
      });
      p.addEventListener("click", () => toucher(idx));
      return p;
    }));
  }
  function toucher(idx) {
    if (grille.classList.contains("resolu")) return;
    if (choisie === null) { choisie = idx; vibrer(8); }
    else if (choisie === idx) choisie = null;
    else {
      [ordre[choisie], ordre[idx]] = [ordre[idx], ordre[choisie]];
      choisie = null; vibrer(12);
      if (ordre.every((v, i) => v === i)) { dessiner(); grille.classList.add("resolu"); setTimeout(fini, 700); return; }
    }
    dessiner();
  }
  dessiner();
  zone.append(grille);
}

// ---------------------------------------------------------------- Cadenas virtuel
// Étapes 10, 12, 14 : elle gagne un chiffre (position 1 à 3).
// Étape 18 (final) : elle gagne le 4e chiffre, puis compose le code complet pour ouvrir.
function cadenas(zone, cfg, fini) {
  const code = String(cfg.code || "0000");
  const pos = (cfg.position || 1) - 1;
  // Seul le chiffre du jour apparaît : les chiffres déjà gagnés ne sont JAMAIS rappelés,
  // c'est à elle de les retenir.
  const molettes = [...code].map((_, i) =>
    h("div", { class: "molette" + (i === pos ? " cible" : " cachee") },
      h("span", { class: "defile" }, i === pos ? "0" : "?")));
  const cadenasEl = h("div", { class: "grand-emoji cadenas-icone" }, "🔒");
  const rangee = h("div", { class: "molettes" }, molettes);
  const btn = h("button", { class: "btn" }, "Faire tourner");
  const info = h("p", { class: "doux", style: "text-align:center" }, `Chiffre ${pos + 1} sur 4`);
  const boite = h("div", { class: "cadenas" }, cadenasEl, rangee, info, btn);
  zone.append(boite);

  btn.addEventListener("click", () => {
    btn.disabled = true;
    const cible = Number(code[pos]);
    const span = molettes[pos].querySelector(".defile");
    const tours = 30 + cible; let k = 0;
    const tick = () => {
      span.textContent = String(k % 10); vibrer(4);
      if (k >= tours) {
        molettes[pos].classList.remove("cible");
        btn.remove();
        if (cfg.final) {
          info.textContent = `Le 4e chiffre est ${cible}. Retrouve les trois autres dans ta mémoire et ouvre le cadenas.`;
          setTimeout(composer, 1300);
        } else {
          info.textContent = `Le chiffre n°${pos + 1} est ${cible}. Retiens-le bien : il ne sera plus jamais affiché.`;
          setTimeout(fini, 600);
        }
        return;
      }
      k++;
      setTimeout(tick, 40 + Math.pow(k / tours, 3) * 260);
    };
    tick();
  });

  // Saisie du code complet sur 4 molettes (flèches ou glissé vertical).
  function composer() {
    const valeurs = [0, 0, 0, 0];
    const cases = valeurs.map((_, i) => {
      const chiffre = h("span", { class: "defile" }, "0");
      const maj = (d) => { valeurs[i] = (valeurs[i] + d + 10) % 10; chiffre.textContent = valeurs[i]; vibrer(5); };
      const haut = h("button", { class: "fleche", type: "button", "aria-label": `Chiffre ${i + 1} plus` }, "▲");
      const bas = h("button", { class: "fleche", type: "button", "aria-label": `Chiffre ${i + 1} moins` }, "▼");
      haut.addEventListener("click", () => maj(1));
      bas.addEventListener("click", () => maj(-1));
      const mol = h("div", { class: "molette saisie" }, chiffre);
      let y0 = null;
      mol.addEventListener("pointerdown", (e) => { y0 = e.clientY; mol.setPointerCapture(e.pointerId); });
      mol.addEventListener("pointermove", (e) => {
        if (y0 === null) return;
        const dy = e.clientY - y0;
        if (Math.abs(dy) > 22) { maj(dy < 0 ? 1 : -1); y0 = e.clientY; }
      });
      const lacher = () => { y0 = null; };
      mol.addEventListener("pointerup", lacher); mol.addEventListener("pointercancel", lacher);
      return h("div", { class: "colonne-molette" }, haut, mol, bas);
    });
    const msg = h("p", { class: "message", style: "text-align:center" });
    const ouvrir = h("button", { class: "btn" }, "Ouvrir le cadenas");
    rangee.replaceWith(h("div", { class: "molettes composer" }, cases));
    info.textContent = "Compose le code";
    boite.append(msg, ouvrir);

    let echecs = 0, indices = 0;
    const aide = h("p", { class: "discret", style: "text-align:center" });
    boite.append(aide);
    ouvrir.addEventListener("click", () => {
      if (valeurs.join("") === code) {
        ouvrir.remove(); msg.textContent = "";
        cadenasEl.textContent = "🔓"; cadenasEl.classList.add("ouvert");
        vibrer([20, 40, 60]);
        info.textContent = "Ouvert !";
        if (cfg.ouverture) boite.append(h("div", { class: "carte" }, h("p", { class: "recompense" }, cfg.ouverture)));
        setTimeout(fini, 700);
      } else {
        msg.className = "message erreur"; msg.textContent = "Ce n'est pas le bon code. Rassemble tes 4 chiffres.";
        echecs++;
        // Filet de sécurité : tous les 4 échecs, un chiffre est dévoilé (jamais le dernier).
        if (echecs % 4 === 0 && indices < 3) {
          indices++;
          aide.textContent = "Petit coup de pouce : " + [...code].slice(0, indices).map((c, i) => `chiffre n°${i + 1} = ${c}`).join(", ");
        }
        boite.classList.remove("secoue"); void boite.offsetWidth; boite.classList.add("secoue");
        vibrer([30, 50, 30]);
      }
    });
  }
}

// ---------------------------------------------------------------- Anagramme
// Les lettres d'un mot-indice sont mélangées : elle les touche dans l'ordre pour le reformer.
function anagramme(zone, cfg, fini) {
  const mot = String(cfg.mot || "").toUpperCase();
  const lettres = [...mot].filter((c) => c !== " ");
  let ordre = lettres.map((c, i) => ({ c, i }));
  if (lettres.length > 1) {
    do { ordre = melanger(ordre); } while (ordre.map((o) => o.c).join("") === lettres.join(""));
  }
  const placees = []; // indices dans `ordre`
  const cases = h("div", { class: "anag-cases" });
  const reserve = h("div", { class: "anag-reserve" });
  const msg = h("p", { class: "message", style: "text-align:center" });
  const effacer = h("button", { class: "btn secondaire petit", type: "button" }, "Tout effacer");
  if (cfg.indice) zone.append(h("div", { class: "bandeau" }, cfg.indice));
  zone.append(cases, reserve, h("div", { style: "display:flex;justify-content:center" }, effacer), msg);

  function dessiner() {
    cases.replaceChildren(...lettres.map((_, k) => {
      const idx = placees[k];
      const el = h("button", { class: "anag-case" + (idx !== undefined ? " pleine" : ""), type: "button" }, idx !== undefined ? ordre[idx].c : "");
      if (idx !== undefined) el.addEventListener("click", () => { placees.splice(k, 1); msg.textContent = ""; dessiner(); });
      return el;
    }));
    reserve.replaceChildren(...ordre.map((o, idx) => {
      const prise = placees.includes(idx);
      const el = h("button", { class: "anag-lettre" + (prise ? " prise" : ""), type: "button", disabled: prise }, o.c);
      el.addEventListener("click", () => {
        if (prise || placees.length >= lettres.length) return;
        placees.push(idx); vibrer(6); dessiner();
        if (placees.length === lettres.length) verifier();
      });
      return el;
    }));
  }
  function verifier() {
    const essai = placees.map((i) => ordre[i].c).join("");
    if (essai === lettres.join("")) {
      cases.classList.add("ok");
      [...reserve.children].forEach((b) => { b.disabled = true; });
      effacer.remove();
      msg.className = "message ok"; msg.textContent = cfg.revelation || "Bravo !";
      setTimeout(fini, 700);
    } else {
      msg.className = "message erreur"; msg.textContent = "Presque… réessaie.";
      cases.classList.remove("secoue"); void cases.offsetWidth; cases.classList.add("secoue");
      vibrer([30, 50, 30]);
    }
  }
  effacer.addEventListener("click", () => { placees.length = 0; msg.textContent = ""; dessiner(); });
  dessiner();
}

// ---------------------------------------------------------------- Choix piège
function choix(zone, cfg, fini) {
  const deja = new Set(cfg.dejaElimines || []);
  const msg = h("p", { class: "message" });
  if (cfg.indice) zone.append(h("div", { class: "bandeau" }, cfg.indice));
  const liste = h("div", { class: "choix" });
  (cfg.options || []).forEach((o) => {
    const el = h("div", { class: "option" + (deja.has(o.id) ? " eliminee" : ""), role: "button" },
      h("img", { src: o.image, alt: "" }), h("div", { class: "nom" }, o.nom));
    el.addEventListener("click", () => {
      if (liste.dataset.fini) return;
      if (o.id === cfg.elimine) {
        liste.dataset.fini = "1";
        el.classList.add("eliminee");
        msg.className = "message ok"; msg.textContent = "Bien vu. Ce n'est pas là.";
        setTimeout(fini, 900);
      } else {
        el.classList.remove("non"); void el.offsetWidth; el.classList.add("non");
        msg.className = "message erreur"; msg.textContent = "Non… celle-là reste en lice. Relis l'indice.";
        vibrer([20, 40, 20]);
      }
    });
    liste.append(el);
  });
  zone.append(liste, msg);
}

// ---------------------------------------------------------------- Carte floue
function carte(zone, cfg, fini) {
  const img = h("img", { src: cfg.image, alt: "", draggable: "false" });
  const C = 2 * Math.PI * 22;
  const anneau = h("svg", { class: "anneau", viewBox: "0 0 54 54", "aria-hidden": "true" });
  anneau.innerHTML = `<circle cx="27" cy="27" r="22" fill="rgba(0,0,0,.35)" stroke="rgba(255,255,255,.25)" stroke-width="4"/>
    <circle class="arc" cx="27" cy="27" r="22" fill="none" stroke="#f3c98b" stroke-width="4" stroke-linecap="round"
    stroke-dasharray="${C}" stroke-dashoffset="${C}" transform="rotate(-90 27 27)"/>`;
  const boite = h("div", { class: "zone-jeu carte-floue" }, img, anneau);
  zone.append(boite);
  const arc = anneau.querySelector(".arc");
  let p = 0, appui = false, dernier = 0, raf, termine = false;
  const DUREE = 3500;

  function rendre() {
    img.style.filter = `blur(${(1 - p) * 26}px) saturate(${0.6 + p * 0.4})`;
    img.style.transform = `scale(${1 + (1 - p) * 1.2})`;
    arc.setAttribute("stroke-dashoffset", String(C * (1 - p)));
  }
  function boucle(t) {
    if (appui && !termine) {
      p = Math.min(1, p + (t - dernier) / DUREE);
      if (Math.random() < 0.15) vibrer(3);
      rendre();
      if (p >= 1) { termine = true; fini(); return; }
    }
    dernier = t;
    raf = requestAnimationFrame(boucle);
  }
  rendre();
  raf = requestAnimationFrame((t) => { dernier = t; boucle(t); });
  boite.addEventListener("pointerdown", (e) => { appui = true; boite.setPointerCapture(e.pointerId); });
  const lacher = () => { appui = false; };
  boite.addEventListener("pointerup", lacher);
  boite.addEventListener("pointercancel", lacher);
  boite.addEventListener("contextmenu", (e) => e.preventDefault());
  return () => cancelAnimationFrame(raf);
}

// ---------------------------------------------------------------- Colis
function colis(zone, cfg, fini) {
  const boite = h("div", { class: "boite", role: "button", "aria-label": "Ouvrir" }, "🎁");
  const aide = h("p", { class: "discret", style: "text-align:center" }, "Touche le paquet");
  zone.append(boite, aide);
  boite.addEventListener("click", () => {
    if (boite.classList.contains("ouvre")) return;
    boite.classList.add("ouvre"); vibrer([10, 30, 10]);
    setTimeout(() => {
      boite.replaceWith(h("div", { class: "carte pile" }, h("div", { class: "grand-emoji" }, "📦"), h("p", { class: "recompense" }, cfg.indice || "")));
      aide.remove();
      fini();
    }, 850);
  });
}

// ---------------------------------------------------------------- GPS (final)
function gps(zone, cfg, fini) {
  const q = encodeURIComponent(cfg.adresse || "");
  zone.append(
    h("div", { class: "carte pile", style: "text-align:center" },
      h("div", { class: "grand-emoji" }, "📍"),
      h("p", { class: "question" }, cfg.adresse || ""),
      h("a", { class: "btn plein", href: `https://maps.apple.com/?daddr=${q}&dirflg=d` }, "Ouvrir dans Plans"),
      h("a", { class: "btn secondaire plein", href: `https://www.google.com/maps/dir/?api=1&destination=${q}` }, "Ouvrir dans Google Maps")));
  fini();
}
