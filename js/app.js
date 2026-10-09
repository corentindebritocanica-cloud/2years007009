// Point d'entrée : connexion unique et persistante, puis routage selon le rôle
// (joueuse → le jeu, admin → le tableau de bord, qui peut aussi prévisualiser le jeu).
import { h, estIOS, tutoInstallation, activerRetourBoutons } from "./outils.js";
activerRetourBoutons();

const racine = document.getElementById("app");
const chargement = () => racine.replaceChildren(h("div", { class: "chargement" }, h("div", { class: "point" })));
chargement();

let fb;
try {
  fb = await import("./firebase.js");
} catch (e) {
  racine.replaceChildren(h("main", { class: "ecran centre" },
    h("h2", {}, "Pas de connexion"),
    h("p", { class: "doux" }, "Vérifie ton réseau puis rouvre l'app."),
    h("button", { class: "btn", onclick: () => location.reload() }, "Réessayer")));
  throw e;
}

fb.enregistrerSW().catch(() => {});

let jeuCache = null;
async function chargerJeu() {
  if (jeuCache) return jeuCache;
  const r = await fetch(`./jeu.json?v=${Date.now()}`, { cache: "no-store" });
  jeuCache = await r.json();
  return jeuCache;
}

let arreterVue = () => {};
fb.surAuth(async (user) => {
  arreterVue();
  arreterVue = () => {};
  if (!user) return ecranConnexion();
  chargement();
  const jeu = await chargerJeu();
  const { demarrerJeu } = await import("./joueuse.js");

  // Un seul accueil pour tout le monde. L'admin s'ouvre depuis le logo + code.
  const accueil = () => {
    arreterVue();
    arreterVue = demarrerJeu(racine, fb, jeu, user, {
      apercu: false,
      // Un appareil marqué « admin » voit l'état réel du jeu sans jamais écrire la progression.
      lectureSeule: fb.roleAppareil() === "admin",
      ouvrirAdmin: admin,
    });
  };
  const admin = async () => {
    arreterVue();
    history.replaceState(null, "", location.pathname);
    const { demarrerAdmin } = await import("./admin.js");
    arreterVue = demarrerAdmin(racine, fb, jeu, user, { retour: accueil });
  };
  accueil();
});

// ---------------------------------------------------------------- Connexion
function ecranConnexion() {
  const email = h("input", { class: "champ", type: "email", autocomplete: "username", inputmode: "email", placeholder: "E-mail", autocapitalize: "off", spellcheck: "false" });
  const mdp = h("input", { class: "champ", type: "password", autocomplete: "current-password", placeholder: "Mot de passe" });
  const msg = h("p", { class: "message" });
  const btn = h("button", { class: "btn plein", type: "submit" }, "Se connecter");

  const form = h("form", { class: "carte pile" }, email, mdp, msg, btn,
    h("button", { class: "btn fantome", type: "button", onclick: oublie }, "Mot de passe oublié ?"));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    msg.className = "message"; msg.textContent = "";
    btn.disabled = true;
    try {
      await fb.connexion(email.value, mdp.value);
    } catch (err) {
      btn.disabled = false;
      msg.className = "message erreur";
      msg.textContent = /invalid|wrong|user-not-found|credential/.test(err.code || "")
        ? "E-mail ou mot de passe incorrect."
        : err.code === "auth/too-many-requests" ? "Trop d'essais, patiente un peu." : "Connexion impossible. Vérifie ton réseau.";
      form.classList.remove("secoue"); void form.offsetWidth; form.classList.add("secoue");
    }
  });

  async function oublie() {
    if (!email.value.trim()) { msg.className = "message erreur"; msg.textContent = "Écris ton e-mail d'abord."; return; }
    try {
      await fb.motDePasseOublie(email.value);
      msg.className = "message ok"; msg.textContent = "E-mail de réinitialisation envoyé.";
    } catch { msg.className = "message erreur"; msg.textContent = "Impossible d'envoyer l'e-mail."; }
  }

  const logo = h("div", { class: "pile", style: "text-align:center;align-items:center" },
    h("img", { src: "img/icone-192.png", alt: "", width: 84, height: 84, class: "logo-connexion" }),
    h("h1", {}, "2 ANS"));

  // iPhone dans Safari : on installe D'ABORD l'app. Une connexion faite dans Safari
  // n'est pas reprise par l'app de l'écran d'accueil (iOS sépare leurs données).
  if (estIOS() && !fb.estInstallee()) {
    const lien = h("button", { class: "btn fantome", type: "button" }, "Me connecter ici quand même");
    const zoneForm = h("div", { class: "pile" });
    lien.addEventListener("click", () => { lien.remove(); zoneForm.append(form); form.classList.add("apparait"); email.focus(); });
    racine.replaceChildren(h("main", { class: "ecran ecran-install" }, logo, ecranInstallation(), zoneForm, lien,
      h("div", { class: "fleche-safari", "aria-hidden": "true" }, "↓")));
    return;
  }

  racine.replaceChildren(h("main", { class: "ecran centre" }, logo,
    h("p", { class: "doux", style: "text-align:center" }, "Connecte-toi une seule fois : l'app s'en souviendra."),
    form));
}

// ---------------------------------------------------------------- Installation (iPhone, Safari)
function ecranInstallation() {
  const icone = {
    partage: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3"/><path d="M8 7l4-4 4 4"/><path d="M7 10H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-1"/></svg>',
    plus: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M12 8v8M8 12h8"/></svg>',
    points: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><circle cx="5" cy="12" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="19" cy="12" r="1.9"/></svg>',
  };
  const ic = (n) => h("span", { class: "tuto-icone", html: icone[n] });
  const autreNavigateur = /CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(navigator.userAgent);
  const etapes = [
    [h("span", {}, "Touche ", ic("partage"), " ", h("b", {}, "Partager"), " en bas de l'écran"),
      h("small", {}, "Tu ne le vois pas ? Touche d'abord ", ic("points"), " puis Partager.")],
    [h("span", {}, "Fais défiler et choisis ", ic("plus"), " ", h("b", {}, "Sur l'écran d'accueil"))],
    [h("span", {}, "Laisse « Ouvrir en tant qu'app web » activé, puis touche ", h("b", {}, "Ajouter"))],
    [h("span", {}, "Ferme Safari et ouvre ", h("img", { src: "img/icone-192.png", alt: "", class: "tuto-mini" }), " ", h("b", {}, "2 ANS"), " depuis ton écran d'accueil"),
      h("small", {}, "C'est là que tu te connecteras, une seule fois.")],
  ];
  return h("section", { class: "carte pile install" },
    h("span", { class: "surtitre" }, "Avant de commencer"),
    h("h2", {}, "Installe l'app sur ton iPhone"),
    h("p", { class: "doux" }, "Comme ça, je pourrai te prévenir quand une nouvelle étape s'ouvre. Ça prend 20 secondes."),
    autreNavigateur ? h("div", { class: "bandeau alerte" }, "Ouvre d'abord ce lien dans Safari : c'est lui qui sait installer l'app.") : null,
    h("ol", { class: "install-etapes" }, etapes.map((contenu, k) =>
      h("li", { style: `--k:${k}` }, h("span", { class: "install-num" }, String(k + 1)), h("div", { class: "pile", style: "gap:4px" }, contenu)))));
}
