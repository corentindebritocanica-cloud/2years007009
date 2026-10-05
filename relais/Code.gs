/**
 * Relais du jeu de piste — Google Apps Script (gratuit, remplace les Cloud Functions).
 *
 * Rôles :
 *  - horloge : tick() toutes les 5 min débloque l'étape du jour dans Firestore
 *    puis envoie la notification FCM ; relance 30 min plus tard si pas finie ;
 *  - déblocage manuel (étape 21, secours) et notifications de test via doPost,
 *    réservés à l'UID admin (jeton Firebase vérifié) ;
 *  - repli e-mail si iOS a révoqué le jeton push.
 *
 * Installation : voir relais/README.md. La clé du compte de service va dans
 * Propriétés du script → SA_KEY (JSON sur une ligne), JAMAIS dans le dépôt.
 * Fuseau du projet Apps Script : Europe/Paris.
 */

// ===================================================================== CONFIG
var CONFIG = {
  PROJET: 'years-b3e18',
  API_KEY: 'AIzaSyD65D8kOjDkDY6pCZkyQ1f6Md40NORhGHA',     // clé web publique (vérif. des jetons)
  UID_COMPTE: 'wg2JcW2kfkTGr1AB7ROEubZtL9h1',            // compte unique partagé (Lisa + Corentin)
  EMAIL_ADMIN: 'corentin.debritocanica@gmail.com',
  EMAIL_JOUEUSE: '',                                       // e-mail de repli si la notif échoue
  URL_APP: 'https://corentindebritocanica-cloud.github.io/2years007009/',
  FENETRE_DEBUT: '21:25',                                  // hors fenêtre, tick() sort aussitôt
  FENETRE_FIN: '00:15',
  RELANCE_APRES_MIN: 30,
  RELANCE_MAX_MIN: 180                                     // pas de relance tardive après une panne
};
var TZ = 'Europe/Paris';

// ===================================================================== HORLOGE
function tick() {
  var verrou = LockService.getScriptLock();
  if (!verrou.tryLock(20000)) return;
  try {
    var maintenant = new Date();
    var hhmm = Utilities.formatDate(maintenant, TZ, 'HH:mm');
    var test = !!prop_('TEST_DEBUT');
    if (!test && !(hhmm >= CONFIG.FENETRE_DEBUT || hhmm <= CONFIG.FENETRE_FIN)) return;

    var cal = calendrier_();
    var etapes = listerEtapes_();
    var cle = Utilities.formatDate(maintenant, TZ, 'yyyy-MM-dd HH:mm');

    // 1) Déblocages dus (on n'avertit que pour la plus récente si plusieurs sont en retard)
    var dues = cal.filter(function (c) { return !c.manuel && c.quand <= cle && !etapes[c.n]; });
    dues.forEach(function (c, i) {
      debloquer_(c.n, 'auto', i === dues.length - 1);
    });

    // 2) Relances
    Object.keys(etapes).forEach(function (k) {
      var e = etapes[k];
      if (e.mode !== 'auto' || !e.debloqueeA || e.relanceEnvoyeeA || e.relanceSautee) return;
      var min = (maintenant - new Date(e.debloqueeA)) / 60000;
      if (min < CONFIG.RELANCE_APRES_MIN) return;
      if (min > CONFIG.RELANCE_MAX_MIN) { patcher_('etapes/' + k, { relanceSautee: true }); return; }
      var p = lireDoc_('progression/' + k);
      if (p && p.termineeA) { patcher_('etapes/' + k, { relanceSautee: true }); return; }
      var meta = meta_();
      var r = envoyerPush_('joueuse', {
        titre: meta.relanceTitre || "Tu n'as pas oublié ?",
        texte: meta.relanceTexte || 'Ton étape t\'attend toujours 💛',
        etape: String(k)
      });
      patcher_('etapes/' + k, r.ok ? { relanceEnvoyeeA: new Date() } : { relanceEnvoyeeA: new Date(), notifErreur: r.erreur });
      journal_(r.ok ? 'relance' : 'relance_erreur', Number(k), r.ok ? '' : r.erreur);
    });
  } catch (err) {
    journal_('erreur_tick', null, String(err && err.stack || err));
    throw err;
  } finally {
    verrou.releaseLock();
  }
}

// Débloque l'étape n (création atomique : jamais deux fois), puis notifie.
function debloquer_(n, mode, notifier) {
  var cree = creerDoc_('etapes', String(n), { debloqueeA: new Date(), mode: mode });
  if (!cree) return { ok: false, erreur: 'déjà ouverte' };
  journal_('deblocage_' + mode, n, '');
  if (notifier === false) return { ok: true };

  var meta = meta_();
  var r = envoyerPush_('joueuse', {
    titre: meta.titre || 'Une nouvelle étape t\'attend',
    texte: meta.texte || 'Ouvre l\'app quand tu es prête ✨',
    etape: String(n)
  });
  if (r.ok) {
    patcher_('etapes/' + n, { notifEnvoyeeA: new Date() });
    journal_('notif', n, '');
  } else {
    patcher_('etapes/' + n, { notifErreur: r.erreur });
    journal_('notif_erreur', n, r.erreur);
    repliEmail_(n, r.erreur);
  }
  return { ok: true, notif: r.ok, erreur: r.erreur };
}

// ===================================================================== WEB APP
function doGet() {
  return json_({ ok: true, relais: 'jeu de piste', heureParis: Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss') });
}

function doPost(e) {
  try {
    var corps = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var uid = verifierJeton_(corps.idToken);
    if (uid !== CONFIG.UID_COMPTE) return json_({ ok: false, erreur: 'Accès refusé' });

    if (corps.action === 'debloquer') {
      var n = Number(corps.etape);
      if (!(n >= 1 && n <= 21)) return json_({ ok: false, erreur: 'Étape invalide' });
      var r = debloquer_(n, 'manuel', true);
      if (!r.ok) return json_({ ok: false, erreur: r.erreur });
      return json_({ ok: true, notif: r.notif, message: r.notif ? 'Débloquée et notifiée' : 'Débloquée, notif échouée : ' + r.erreur });
    }

    if (corps.action === 'test') {
      var cible = corps.cible === 'joueuse' ? 'joueuse' : { appareil: String(corps.appareil || '') };
      var t = envoyerPush_(cible, { titre: 'Notification de test', texte: 'Si tu lis ça, tout fonctionne 🎉', etape: '' });
      journal_(t.ok ? 'test' : 'test_erreur', null, (corps.cible || 'appareil') + (t.ok ? ' (' + t.envoyes + ' appareil(s))' : ' : ' + t.erreur));
      return json_(t.ok ? { ok: true, message: 'Notification envoyée' } : { ok: false, erreur: t.erreur });
    }

    return json_({ ok: false, erreur: 'Action inconnue' });
  } catch (err) {
    return json_({ ok: false, erreur: String(err.message || err) });
  }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

// Vérifie un jeton d'identification Firebase et renvoie l'UID.
function verifierJeton_(idToken) {
  if (!idToken) throw new Error('Jeton manquant');
  var r = UrlFetchApp.fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + CONFIG.API_KEY, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    payload: JSON.stringify({ idToken: idToken })
  });
  if (r.getResponseCode() !== 200) throw new Error('Jeton invalide');
  var u = JSON.parse(r.getContentText()).users;
  return u && u[0] && u[0].localId;
}

// ===================================================================== FCM
// cible : 'joueuse' (tous les appareils joueuse), 'admin', ou { appareil: id }.
// Un jeton révoqué par iOS (UNREGISTERED / NOT_FOUND) est retiré de Firestore.
function envoyerPush_(cible, data) {
  var appareils = listerAppareils_().filter(function (a) {
    if (!a.jeton) return false;
    if (cible && cible.appareil) return a.id === cible.appareil;
    return a.role === cible;
  });
  var vus = {};
  appareils = appareils.filter(function (a) { if (vus[a.jeton]) return false; vus[a.jeton] = true; return true; });
  if (!appareils.length) return { ok: false, erreur: 'AUCUN_APPAREIL', envoyes: 0 };

  var envoyes = 0, erreurs = [];
  appareils.forEach(function (a) {
    var r = envoyerFcm_(a.jeton, data);
    if (r.ok) { envoyes++; return; }
    erreurs.push(r.erreur);
    if (r.erreur === 'UNREGISTERED' || r.erreur === 'NOT_FOUND') {
      fs_('delete', 'appareils/' + a.id);
      journal_('appareil_retire', null, a.id + ' : ' + r.erreur);
    }
  });
  return envoyes ? { ok: true, envoyes: envoyes } : { ok: false, erreur: erreurs.join(', '), envoyes: 0 };
}

function envoyerFcm_(jeton, data) {
  var message = {
    message: {
      token: jeton,
      // Données uniquement : sw.js affiche lui-même la notification (règle iOS).
      data: { titre: String(data.titre), texte: String(data.texte), etape: String(data.etape || '') },
      webpush: { headers: { Urgency: 'high', TTL: '86400' } }
    }
  };
  var r = UrlFetchApp.fetch('https://fcm.googleapis.com/v1/projects/' + CONFIG.PROJET + '/messages:send', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + jetonGoogle_() },
    payload: JSON.stringify(message)
  });
  var code = r.getResponseCode();
  if (code === 200) return { ok: true };
  var statut = '';
  try {
    var err = JSON.parse(r.getContentText()).error;
    statut = (err.details || []).map(function (d) { return d.errorCode; }).filter(String)[0] || err.status || '';
  } catch (_) { statut = ''; }
  return { ok: false, erreur: statut || ('HTTP_' + code) };
}

function repliEmail_(n, erreur) {
  var lien = CONFIG.URL_APP + '?etape=' + n;
  try {
    if (CONFIG.EMAIL_JOUEUSE) {
      MailApp.sendEmail({
        to: CONFIG.EMAIL_JOUEUSE,
        subject: 'Une nouvelle étape t\'attend ✨',
        htmlBody: '<p>Une nouvelle étape vient de s\'ouvrir.</p><p><a href="' + lien + '">Ouvre l\'app</a> (depuis son icône sur ton écran d\'accueil).</p>'
      });
    }
    MailApp.sendEmail(CONFIG.EMAIL_ADMIN, '[Jeu] Notif étape ' + n + ' échouée : ' + erreur,
      'L\'étape ' + n + ' est bien débloquée, mais la notification push a échoué (' + erreur + ').\n' +
      (CONFIG.EMAIL_JOUEUSE ? 'Un e-mail de repli lui a été envoyé.\n' : 'Pas d\'e-mail de repli (EMAIL_JOUEUSE vide).\n') +
      'Pense à lui faire rouvrir l\'app pour rafraîchir son jeton.');
    journal_('repli_email', n, erreur);
  } catch (err) {
    journal_('repli_email_erreur', n, String(err));
  }
}

// ===================================================================== CALENDRIER
// Lu depuis jeu.json publié sur GitHub Pages (source unique), en cache 1 h.
function jeu_() {
  var cache = CacheService.getScriptCache();
  var brut = cache.get('jeu');
  if (!brut) {
    var r = UrlFetchApp.fetch(CONFIG.URL_APP + 'jeu.json?t=' + Date.now(), { muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) throw new Error('jeu.json inaccessible (' + r.getResponseCode() + ')');
    brut = r.getContentText();
    if (brut.length < 95000) cache.put('jeu', brut, 3600);
  }
  return JSON.parse(brut);
}

function meta_() {
  try { return jeu_().meta.notif || {}; } catch (_) { return {}; }
}

// [{n, quand:'yyyy-MM-dd HH:mm' (heure de Paris), manuel}]
// Mode test : propriété TEST_DEBUT = '2026-10-06T20:00:00+02:00' et TEST_PAS = 10 (minutes).
function calendrier_() {
  var etapes = jeu_().etapes;
  var debut = prop_('TEST_DEBUT');
  if (debut) {
    var pas = Number(prop_('TEST_PAS') || 10);
    var t0 = new Date(debut).getTime();
    return etapes.map(function (e, i) {
      return { n: e.n, manuel: !!e.manuel, quand: Utilities.formatDate(new Date(t0 + i * pas * 60000), TZ, 'yyyy-MM-dd HH:mm') };
    });
  }
  return etapes.map(function (e) {
    return { n: e.n, manuel: !!e.manuel || !e.heure, quand: e.date + ' ' + (e.heure || '99:99') };
  });
}

// ===================================================================== FIRESTORE REST
function base_() {
  return 'https://firestore.googleapis.com/v1/projects/' + CONFIG.PROJET + '/databases/(default)/documents/';
}

function fs_(methode, chemin, corps) {
  var opts = {
    method: methode, muteHttpExceptions: true, contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + jetonGoogle_() }
  };
  if (corps) opts.payload = JSON.stringify(corps);
  var r = UrlFetchApp.fetch(base_() + chemin, opts);
  return { code: r.getResponseCode(), data: r.getContentText() ? JSON.parse(r.getContentText()) : {} };
}

function listerAppareils_() {
  var r = fs_('get', 'appareils?pageSize=50');
  if (r.code !== 200) throw new Error('Liste appareils : ' + r.code);
  return (r.data.documents || []).map(function (d) {
    var o = decoder_(d.fields || {});
    o.id = d.name.split('/').pop();
    return o;
  });
}

function lireDoc_(chemin) {
  var r = fs_('get', chemin);
  if (r.code === 404) return null;
  if (r.code !== 200) throw new Error('Lecture ' + chemin + ' : ' + r.code);
  return decoder_(r.data.fields || {});
}

function listerEtapes_() {
  var r = fs_('get', 'etapes?pageSize=50');
  if (r.code !== 200) throw new Error('Liste etapes : ' + r.code);
  var res = {};
  (r.data.documents || []).forEach(function (d) {
    res[d.name.split('/').pop()] = decoder_(d.fields || {});
  });
  return res;
}

// Crée seulement si absent. Renvoie false si le document existe déjà.
function creerDoc_(collection, id, champs) {
  var r = fs_('post', collection + '?documentId=' + encodeURIComponent(id), { fields: encoder_(champs) });
  if (r.code === 409) return false;
  if (r.code !== 200) throw new Error('Création ' + collection + '/' + id + ' : ' + r.code + ' ' + JSON.stringify(r.data));
  return true;
}

function patcher_(chemin, champs) {
  var masque = Object.keys(champs).map(function (k) { return 'updateMask.fieldPaths=' + encodeURIComponent(k); }).join('&');
  var r = fs_('patch', chemin + '?' + masque + '&currentDocument.exists=true', { fields: encoder_(champs) });
  if (r.code !== 200) throw new Error('Mise à jour ' + chemin + ' : ' + r.code);
}

function journal_(type, etape, detail) {
  try {
    var champs = { type: type, a: new Date() };
    if (etape) champs.etape = Number(etape);
    if (detail) champs.detail = String(detail).slice(0, 1500);
    fs_('post', 'journal', { fields: encoder_(champs) });
  } catch (_) { /* le journal ne doit jamais faire échouer un envoi */ }
}

function encoder_(o) {
  var f = {};
  Object.keys(o).forEach(function (k) {
    var v = o[k];
    if (v instanceof Date) f[k] = { timestampValue: v.toISOString() };
    else if (typeof v === 'boolean') f[k] = { booleanValue: v };
    else if (typeof v === 'number') f[k] = Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    else if (v === null) f[k] = { nullValue: null };
    else f[k] = { stringValue: String(v) };
  });
  return f;
}

function decoder_(fields) {
  var o = {};
  Object.keys(fields).forEach(function (k) {
    var v = fields[k];
    if ('timestampValue' in v) o[k] = v.timestampValue;
    else if ('booleanValue' in v) o[k] = v.booleanValue;
    else if ('integerValue' in v) o[k] = Number(v.integerValue);
    else if ('doubleValue' in v) o[k] = v.doubleValue;
    else if ('stringValue' in v) o[k] = v.stringValue;
    else o[k] = null;
  });
  return o;
}

// ===================================================================== AUTH GOOGLE (compte de service)
function jetonGoogle_() {
  var cache = CacheService.getScriptCache();
  var j = cache.get('jeton_google');
  if (j) return j;
  var sa = JSON.parse(prop_('SA_KEY'));
  var maintenant = Math.floor(Date.now() / 1000);
  var b64 = function (s) { return Utilities.base64EncodeWebSafe(s).replace(/=+$/, ''); };
  var entete = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  var charge = b64(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token', iat: maintenant, exp: maintenant + 3600
  }));
  var signature = Utilities.base64EncodeWebSafe(
    Utilities.computeRsaSha256Signature(entete + '.' + charge, sa.private_key)).replace(/=+$/, '');
  var r = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post', muteHttpExceptions: true,
    payload: { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: entete + '.' + charge + '.' + signature }
  });
  if (r.getResponseCode() !== 200) throw new Error('Jeton Google : ' + r.getContentText());
  j = JSON.parse(r.getContentText()).access_token;
  cache.put('jeton_google', j, 3000);
  return j;
}

function prop_(k) { return PropertiesService.getScriptProperties().getProperty(k); }

// ===================================================================== OUTILS (à lancer depuis l'éditeur)
// 1 fois après installation : crée le déclencheur « toutes les 5 minutes ».
function installer() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'tick') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('tick').timeBased().everyMinutes(5).create();
  Logger.log('Déclencheur tick installé (toutes les 5 min). Fuseau : ' + Session.getScriptTimeZone());
}

function testerConnexion() {
  Logger.log('Jeton Google OK : ' + !!jetonGoogle_());
  Logger.log('Étapes ouvertes : ' + JSON.stringify(Object.keys(listerEtapes_())));
  Logger.log('Appareils : ' + JSON.stringify(listerAppareils_().map(function (a) { return a.id.slice(0, 6) + ' ' + a.role + (a.jeton ? '' : ' (sans jeton)'); })));
  Logger.log('Calendrier (3 premières) : ' + JSON.stringify(calendrier_().slice(0, 3)));
}

function testerNotifAdmin() {
  Logger.log(JSON.stringify(envoyerPush_('admin', { titre: 'Test relais', texte: 'Envoyé depuis Apps Script ✅', etape: '' })));
}

function testerNotifJoueuse() {
  Logger.log(JSON.stringify(envoyerPush_('joueuse', { titre: 'Test', texte: 'Notification de test 💛', etape: '' })));
}

function viderCacheJeu() {
  CacheService.getScriptCache().remove('jeu');
  Logger.log('Cache jeu.json vidé');
}
