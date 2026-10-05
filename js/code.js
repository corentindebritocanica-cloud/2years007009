// Pavé à 4 chiffres pour ouvrir l'espace admin depuis l'accueil.
// Le déverrouillage tient jusqu'à la fermeture de l'app (sessionStorage).
import { h, vibrer } from "./outils.js";
import { CODE_ADMIN_SHA256 } from "./config.js";

const CLE_SESSION = "admin-deverrouille";

async function empreinte(code) {
  const octets = new TextEncoder().encode(`jeu-2ans:${code}`);
  const hash = await crypto.subtle.digest("SHA-256", octets);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function dejaDeverrouille() {
  try { return sessionStorage.getItem(CLE_SESSION) === CODE_ADMIN_SHA256; } catch { return false; }
}

// Renvoie une promesse : true si le bon code est saisi, false si on ferme.
export function demanderCode() {
  if (dejaDeverrouille()) return Promise.resolve(true);

  return new Promise((resoudre) => {
    let saisie = "";
    let occupe = false;
    const points = h("div", { class: "pin-points", "aria-live": "polite" },
      [0, 1, 2, 3].map(() => h("span")));
    const carte = h("div", { class: "pin-carte", role: "dialog", "aria-modal": "true", "aria-label": "Code d'accès" },
      h("p", { class: "surtitre" }, "Accès réservé"),
      h("h2", {}, "Code"),
      points);

    const touches = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];
    const pave = h("div", { class: "pin-pave" }, touches.map((t) => {
      if (!t) return h("span");
      const b = h("button", { class: "pin-touche" + (t === "⌫" ? " effacer" : ""), type: "button", "aria-label": t === "⌫" ? "Effacer" : t }, t);
      b.addEventListener("click", () => taper(t));
      return b;
    }));
    const annuler = h("button", { class: "btn fantome", type: "button" }, "Annuler");
    carte.append(pave, annuler);

    const voile = h("div", { class: "pin-voile" }, carte);
    document.body.append(voile);
    requestAnimationFrame(() => voile.classList.add("visible"));

    const clavier = (e) => {
      if (/^[0-9]$/.test(e.key)) taper(e.key);
      else if (e.key === "Backspace") taper("⌫");
      else if (e.key === "Escape") fermer(false);
    };
    document.addEventListener("keydown", clavier);
    voile.addEventListener("click", (e) => { if (e.target === voile) fermer(false); });
    annuler.addEventListener("click", () => fermer(false));

    function dessiner() {
      [...points.children].forEach((p, i) => p.classList.toggle("plein", i < saisie.length));
    }

    async function taper(t) {
      if (occupe) return;
      if (t === "⌫") { saisie = saisie.slice(0, -1); dessiner(); return; }
      if (saisie.length >= 4) return;
      saisie += t; vibrer(8); dessiner();
      if (saisie.length < 4) return;
      occupe = true;
      const ok = (await empreinte(saisie)) === CODE_ADMIN_SHA256;
      if (ok) {
        try { sessionStorage.setItem(CLE_SESSION, CODE_ADMIN_SHA256); } catch { /* sans effet */ }
        points.classList.add("ok");
        setTimeout(() => fermer(true), 250);
      } else {
        vibrer([30, 50, 30]);
        carte.classList.remove("secoue"); void carte.offsetWidth; carte.classList.add("secoue");
        setTimeout(() => { saisie = ""; dessiner(); occupe = false; }, 420);
      }
    }

    function fermer(resultat) {
      document.removeEventListener("keydown", clavier);
      voile.classList.remove("visible");
      setTimeout(() => voile.remove(), 200);
      resoudre(resultat);
    }
  });
}

export function verrouillerAdmin() {
  try { sessionStorage.removeItem(CLE_SESSION); } catch { /* sans effet */ }
}
