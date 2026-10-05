// Petits utilitaires partagés.

// Création d'élément : h("div", {class:"x", onclick: fn}, enfant1, [enfants…], "texte")
export function h(tag, attrs = {}, ...enfants) {
  const el = tag === "svg"
    ? document.createElementNS("http://www.w3.org/2000/svg", "svg")
    : document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (k === "html") el.innerHTML = v;
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  const ajouter = (c) => {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) c.forEach(ajouter);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  };
  enfants.forEach(ajouter);
  return el;
}

export function melanger(t) {
  const a = [...t];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function vibrer(motif) {
  try { navigator.vibrate?.(motif); } catch { /* iOS ne vibre pas : sans effet */ }
}

// Normalisation pour comparer les réponses : minuscules, sans accents,
// ponctuation → espace, espaces multiples réduits, articles en tête retirés.
export function normaliser(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[’'`´]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/^(le|la|les|l|un|une|des|du|de|d)\s+/, "")
    .trim()
    .replace(/\s+/g, " ");
}

export function reponseCorrecte(saisie, acceptees = []) {
  const s = normaliser(saisie);
  if (!s) return false;
  return acceptees.some((a) => normaliser(a) === s);
}

// ---------- Dates en heure de Paris ----------
// Convertit "2026-10-12" + "21:30" (heure de Paris) en Date absolue, DST compris.
export function dateParis(date, heure = "00:00") {
  const [y, m, d] = date.split("-").map(Number);
  const [H, M] = heure.split(":").map(Number);
  const naif = Date.UTC(y, m - 1, d, H, M);
  const decalage = (t) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Paris", hourCycle: "h23", year: "numeric", month: "2-digit",
      day: "2-digit", hour: "2-digit", minute: "2-digit",
    }).formatToParts(new Date(t)).map((x) => [x.type, x.value]));
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - t;
  };
  let t = naif - decalage(naif);
  t = naif - decalage(t);
  return new Date(t);
}

const fmtJour = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long" });
const fmtHeure = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" });
const fmtCourt = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export const jourLong = (d) => fmtJour.format(d);
export const heureCourte = (d) => fmtHeure.format(d).replace(":", "h");
export const dateCourte = (d) => (d ? fmtCourt.format(d).replace(" ", " · ") : "—");

export function toDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v.toDate === "function") return v.toDate();
  if (typeof v === "string" || typeof v === "number") return new Date(v);
  return null;
}

export function compteARebours(cible) {
  const ms = Math.max(0, cible - Date.now());
  const j = Math.floor(ms / 86400000);
  const hh = Math.floor((ms % 86400000) / 3600000);
  const mm = Math.floor((ms % 3600000) / 60000);
  const ss = Math.floor((ms % 60000) / 1000);
  const p = (n) => String(n).padStart(2, "0");
  return j > 0 ? `${j} j ${p(hh)} h ${p(mm)}` : `${p(hh)}:${p(mm)}:${p(ss)}`;
}

export function estIOS() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function confettis() {
  const c = h("canvas", { class: "confettis" });
  document.body.append(c);
  const ctx = c.getContext("2d");
  const dpr = Math.min(devicePixelRatio || 1, 2);
  c.width = innerWidth * dpr; c.height = innerHeight * dpr; ctx.scale(dpr, dpr);
  const couleurs = ["#a8201a", "#1f3a5f", "#5a3e1b", "#e3b23c", "#f1e7d3"];
  const parts = Array.from({ length: 120 }, () => ({
    x: innerWidth / 2 + (Math.random() - 0.5) * 80, y: innerHeight * 0.35,
    vx: (Math.random() - 0.5) * 9, vy: -Math.random() * 11 - 4,
    r: Math.random() * 6 + 3, c: couleurs[(Math.random() * couleurs.length) | 0], a: Math.random() * 6,
  }));
  let t0 = performance.now();
  (function anim(t) {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    parts.forEach((p) => {
      p.vy += 0.32; p.x += p.vx; p.y += p.vy; p.a += 0.1;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c;
      ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); ctx.restore();
    });
    if (t - t0 < 2600) requestAnimationFrame(anim); else c.remove();
  })(t0);
}

export function tutoInstallation() {
  return h("div", { class: "bandeau tuto pile" },
    h("strong", {}, "Installe d'abord l'app sur ton écran d'accueil"),
    h("ol", {},
      h("li", {}, "Touche ", h("span", { class: "partage" }, "⇪"), " Partager en bas de Safari"),
      h("li", {}, "Choisis « Sur l'écran d'accueil »"),
      h("li", {}, "Ouvre l'app depuis sa nouvelle icône et connecte-toi là-bas")),
    h("p", { class: "discret" }, "Sans ça, l'iPhone ne peut pas t'envoyer les notifications."));
}

// Rayons art déco + étoile rouge (en-têtes).
export function rayons() {
  const svg = h("svg", { class: "rayons", viewBox: "0 0 300 46", "aria-hidden": "true" });
  svg.innerHTML = `<g fill="none" stroke="currentColor" stroke-width="1">
    <line x1="150" y1="44" x2="20" y2="10"/><line x1="150" y1="44" x2="60" y2="4"/><line x1="150" y1="44" x2="105" y2="1"/>
    <line x1="150" y1="44" x2="150" y2="0"/><line x1="150" y1="44" x2="195" y2="1"/><line x1="150" y1="44" x2="240" y2="4"/>
    <line x1="150" y1="44" x2="280" y2="10"/></g>
    <path class="etoile" d="M150 14 L154 26 L166 26 L156 33 L160 45 L150 38 L140 45 L144 33 L134 26 L146 26 Z"/>`;
  return svg;
}
