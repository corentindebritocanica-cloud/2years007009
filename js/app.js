// Point d'entrée : connexion unique et persistante, puis routage selon le rôle
// (joueuse → le jeu, admin → le tableau de bord, qui peut aussi prévisualiser le jeu).
import { h, estIOS, tutoInstallation, rayons } from "./outils.js";

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

  const pasInstallee = estIOS() && !fb.estInstallee();
  racine.replaceChildren(h("main", { class: "ecran centre" },
    h("div", { class: "pile", style: "text-align:center;align-items:center" },
      h("div", { class: "hero", style: "border:0" }, rayons(), h("div", { class: "petit" }, "Nos"), h("h1", {}, "2 ans"),
        h("div", { class: "manuscrit" }, "— entre, c'est ici que tout commence —")),
      h("p", { class: "doux" }, "Connecte-toi une seule fois : l'app s'en souviendra.")),
    pasInstallee ? tutoInstallation() : null,
    form));
}
