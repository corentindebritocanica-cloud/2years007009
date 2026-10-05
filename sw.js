/* Service worker du jeu — volontairement SANS SDK Firebase.
 * Règle d'or iOS : chaque push reçu DOIT afficher une notification,
 * sinon Safari révoque l'abonnement après 3 push « silencieux ».
 */
const CACHE = "jeu-v3";
const COQUILLE = ["./", "./index.html", "./css/app.css", "./manifest.json", "./img/icone-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(COQUILLE)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((cles) => Promise.all(cles.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Réseau d'abord (le contenu doit toujours être à jour), cache en secours hors ligne.
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req)
      .then((rep) => {
        if (rep.ok) {
          const copie = rep.clone();
          caches.open(CACHE).then((c) => c.put(req, copie));
        }
        return rep;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match("./index.html")))
  );
});

self.addEventListener("push", (e) => {
  let d = {};
  try {
    const brut = e.data ? e.data.json() : {};
    // FCM place le bloc data soit à la racine, soit sous .data
    d = brut.data || brut.notification || brut;
  } catch {
    d = { body: e.data ? e.data.text() : "" };
  }
  const titre = d.titre || d.title || "Une nouvelle étape t'attend";
  const options = {
    body: d.texte || d.body || "Ouvre l'app quand tu es prête ✨",
    icon: "./img/icone-192.png",
    badge: "./img/icone-192.png",
    tag: d.etape ? `etape-${d.etape}` : "jeu",
    renotify: true,
    data: { url: d.etape ? `./?etape=${d.etape}` : "./" },
  };
  // TOUJOURS afficher, quoi qu'il arrive.
  e.waitUntil(self.registration.showNotification(titre, options));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const cible = new URL(e.notification.data?.url || "./", self.registration.scope).href;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((fenetres) => {
      for (const f of fenetres) {
        if ("focus" in f) {
          f.navigate?.(cible);
          return f.focus();
        }
      }
      return self.clients.openWindow(cible);
    })
  );
});
