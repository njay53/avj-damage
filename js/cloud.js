/* cloud.js — Abgleich mit dem Server (Supabase)
 *
 * Bewusst ohne die supabase-js-Bibliothek: die App soll offline vollständig
 * funktionieren und keine Datei von einem fremden Server nachladen. Supabase
 * stellt eine gewöhnliche REST-Schnittstelle bereit, die sich mit fetch
 * bedienen lässt.
 *
 * Grundsatz: IndexedDB ist führend. Ohne Netz arbeitet die App normal weiter,
 * beim nächsten erfolgreichen Abgleich gehen die Änderungen raus. Es gibt
 * keinen Zustand, in dem ungespeicherte Daten verloren gehen können.
 *
 * Ablauf eines Abgleichs:
 *   1. pull  — alles vom Server holen, was neuer ist als der letzte Abgleich
 *   2. merge — pro Datensatz gewinnt der jüngere Zeitstempel (siehe store.js)
 *   3. push  — alles hochladen, was lokal neuer ist
 */
(function (App) {
  "use strict";

  var cfg = null;          // { url, anonKey }
  var session = null;      // { access_token, refresh_token, expires_at, email }
  var lastSync = 0;
  var pushTimer = null;
  var syncing = false;
  var listeners = [];

  function emit() {
    listeners.forEach(function (fn) { fn(statusInfo()); });
  }

  function statusInfo() {
    return {
      konfiguriert: !!(cfg && cfg.url && cfg.anonKey),
      angemeldet: !!(session && session.access_token),
      email: session ? session.email : "",
      online: navigator.onLine !== false,
      lastSync: lastSync,
      syncing: syncing
    };
  }

  // ---------------------------------------------------------------- Konfiguration

  function loadConfig() {
    return Promise.all([
      App.Store.idbGet("cloudConfig"),
      App.Store.idbGet("cloudSession"),
      App.Store.idbGet("lastSync")
    ]).then(function (res) {
      cfg = res[0] || null;
      session = res[1] || null;
      lastSync = res[2] || 0;
      emit();
    });
  }

  function saveConfig(url, anonKey) {
    var clean = String(url || "").trim().replace(/\/+$/, "");
    if (!/^https:\/\/.+/.test(clean)) {
      return Promise.reject(new Error("Die Projekt-URL muss mit https:// beginnen."));
    }
    if (!String(anonKey || "").trim()) {
      return Promise.reject(new Error("Der Projekt-Schlüssel fehlt."));
    }
    cfg = { url: clean, anonKey: String(anonKey).trim() };
    return App.Store.idbSet("cloudConfig", cfg).then(emit);
  }

  function clearConfig() {
    cfg = null;
    session = null;
    lastSync = 0;
    return Promise.all([
      App.Store.idbSet("cloudConfig", null),
      App.Store.idbSet("cloudSession", null),
      App.Store.idbSet("lastSync", 0)
    ]).then(emit);
  }

  // ---------------------------------------------------------------- Anmeldung

  function login(email, password) {
    if (!cfg) return Promise.reject(new Error("Erst Projekt-URL und Schlüssel eintragen."));
    return fetch(cfg.url + "/auth/v1/token?grant_type=password", {
      method: "POST",
      headers: { "apikey": cfg.anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email: email, password: password })
    }).then(readJson).then(function (data) {
      if (!data.access_token) {
        throw new Error(data.error_description || data.msg || data.message || "Anmeldung fehlgeschlagen.");
      }
      session = {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: Date.now() + (data.expires_in || 3600) * 1000,
        email: email
      };
      return App.Store.idbSet("cloudSession", session);
    }).then(function () {
      emit();
      return sync();
    });
  }

  function logout() {
    session = null;
    return App.Store.idbSet("cloudSession", null).then(emit);
  }

  function refreshSession() {
    if (!session || !session.refresh_token) return Promise.reject(new Error("Nicht angemeldet."));
    return fetch(cfg.url + "/auth/v1/token?grant_type=refresh_token", {
      method: "POST",
      headers: { "apikey": cfg.anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: session.refresh_token })
    }).then(readJson).then(function (data) {
      if (!data.access_token) throw new Error("Sitzung abgelaufen — bitte neu anmelden.");
      session.access_token = data.access_token;
      session.refresh_token = data.refresh_token || session.refresh_token;
      session.expires_at = Date.now() + (data.expires_in || 3600) * 1000;
      return App.Store.idbSet("cloudSession", session);
    });
  }

  function ensureToken() {
    if (!session) return Promise.reject(new Error("Nicht angemeldet."));
    if (Date.now() < (session.expires_at || 0) - 60000) return Promise.resolve();
    return refreshSession();
  }

  function readJson(res) {
    return res.text().then(function (t) {
      var data;
      try { data = t ? JSON.parse(t) : {}; } catch (e) { data = { raw: t }; }
      if (!res.ok && !data.error_description && !data.message && !data.msg) {
        data.message = "HTTP " + res.status + " " + res.statusText;
      }
      return data;
    });
  }

  function rest(pfad, options) {
    var opt = options || {};
    return ensureToken().then(function () {
      return fetch(cfg.url + "/rest/v1/" + pfad, {
        method: opt.method || "GET",
        headers: Object.assign({
          "apikey": cfg.anonKey,
          "Authorization": "Bearer " + session.access_token,
          "Content-Type": "application/json"
        }, opt.headers || {}),
        body: opt.body ? JSON.stringify(opt.body) : undefined
      });
    }).then(function (res) {
      return res.text().then(function (t) {
        if (!res.ok) {
          var msg = t;
          try { msg = JSON.parse(t).message || t; } catch (e) { /* Rohtext behalten */ }
          throw new Error("Server meldet " + res.status + ": " + msg);
        }
        return t ? JSON.parse(t) : [];
      });
    });
  }

  // ---------------------------------------------------------------- Umformung

  /* Die Datenbank speichert flach (eine Zeile pro Schaden), lokal hängen die
     Schäden am Fahrzeug. Diese beiden Funktionen übersetzen dazwischen. */

  function toRows(daten) {
    var vehicleRows = [];
    var damageRows = [];
    daten.vehicles.forEach(function (v) {
      vehicleRows.push({
        id: v.id, name: v.name, plate: v.plate || "",
        category_id: v.categoryId || "", hidden: !!v.hidden, zustand: !!v.zustand,
        deleted: !!v.deleted, updated_at: v.updatedAt || 0
      });
      (v.damages || []).forEach(function (d) {
        damageRows.push({
          id: d.id, vehicle_id: v.id,
          images: d.images || [], count: parseInt(d.count, 10) || 1,
          description: d.description || "",
          date: d.date || "", date_mode: d.dateMode || "exact",
          created_at: d.createdAt || 0, area: d.area || "",
          kind: d.kind === "zustand" ? "zustand" : "schaden",
          deleted: !!d.deleted, updated_at: d.updatedAt || 0
        });
      });
    });
    var snapshotRows = daten.snapshots.map(function (s) {
      return {
        id: s.id, code: s.code, vehicle_id: s.vehicleId,
        vehicle_name: s.vehicleName, vehicle_plate: s.vehiclePlate || "",
        reference: s.reference || "", created_at: s.createdAt,
        damages: s.damages, deleted: !!s.deleted, updated_at: s.updatedAt || 0
      };
    });
    var categoryRows = (daten.categories || []).map(function (c) {
      return {
        id: c.id, name: c.name || "", sort: c.sort || 0,
        deleted: !!c.deleted, updated_at: c.updatedAt || 0
      };
    });
    return {
      vehicleRows: vehicleRows, damageRows: damageRows,
      snapshotRows: snapshotRows, categoryRows: categoryRows
    };
  }

  function fromRows(vehicleRows, damageRows, snapshotRows, categoryRows) {
    var byId = {};
    var vehicles = (vehicleRows || []).map(function (r) {
      var v = {
        id: r.id, name: r.name, plate: r.plate || "",
        categoryId: r.category_id || "", hidden: !!r.hidden, zustand: !!r.zustand,
        deleted: !!r.deleted, updatedAt: Number(r.updated_at) || 0, damages: []
      };
      byId[r.id] = v;
      return v;
    });
    /* Schäden zu Fahrzeugen, die der Pull nicht mitgeliefert hat (weil dort
       nichts Neues war), kommen als eigenes Fahrzeug-Fragment — der Merge in
       store.js hängt sie ans vorhandene Fahrzeug an. */
    (damageRows || []).forEach(function (r) {
      /* Ältere Zeilen haben noch image/note statt images/description —
         normalisiereSchaden bügelt das glatt. */
      var d = App.Store.normalisiereSchaden({
        id: r.id,
        images: Array.isArray(r.images) ? r.images : null,
        image: r.image || "",
        count: r.count,
        description: r.description,
        note: r.note || "",
        date: r.date || "",
        dateMode: r.date_mode || "exact",
        createdAt: Number(r.created_at) || 0,
        area: r.area || "",
        kind: r.kind === "zustand" ? "zustand" : "schaden",
        deleted: !!r.deleted,
        updatedAt: Number(r.updated_at) || 0
      });
      if (!byId[r.vehicle_id]) {
        byId[r.vehicle_id] = { id: r.vehicle_id, name: "", plate: "", updatedAt: 0, damages: [] };
        vehicles.push(byId[r.vehicle_id]);
      }
      byId[r.vehicle_id].damages.push(d);
    });

    var snapshots = (snapshotRows || []).map(function (r) {
      return {
        id: r.id, code: r.code, vehicleId: r.vehicle_id,
        vehicleName: r.vehicle_name, vehiclePlate: r.vehicle_plate || "",
        reference: r.reference || "", createdAt: Number(r.created_at) || 0,
        damages: r.damages || [], deleted: !!r.deleted,
        updatedAt: Number(r.updated_at) || 0
      };
    });

    var categories = (categoryRows || []).map(function (r) {
      return {
        id: r.id, name: r.name || "", sort: Number(r.sort) || 0,
        deleted: !!r.deleted, updatedAt: Number(r.updated_at) || 0
      };
    });

    return { vehicles: vehicles, snapshots: snapshots, categories: categories };
  }

  /* Fahrzeug-Fragmente ohne Namen dürfen ein vorhandenes Fahrzeug nicht
     überschreiben — updatedAt 0 sorgt dafür, dass der Merge sie ignoriert. */

  // ---------------------------------------------------------------- Abgleich

  function pull() {
    var seit = lastSync;
    return Promise.all([
      rest("vehicles?select=*&updated_at=gt." + seit),
      rest("damages?select=*&updated_at=gt." + seit),
      rest("snapshots?select=*&updated_at=gt." + seit),
      rest("categories?select=*&updated_at=gt." + seit)
    ]).then(function (res) {
      return App.Store.mergeAll(fromRows(res[0], res[1], res[2], res[3]));
    });
  }

  function push() {
    var daten = App.Store.changedSince(lastSync);
    var rows = toRows(daten);
    var aufgaben = [];
    var kopf = { "Prefer": "resolution=merge-duplicates,return=minimal" };

    if (rows.vehicleRows.length) {
      aufgaben.push(rest("vehicles", { method: "POST", headers: kopf, body: rows.vehicleRows }));
    }
    if (rows.damageRows.length) {
      /* In Paketen, damit einzelne Anfragen mit vielen Fotos nicht zu gross werden. */
      for (var i = 0; i < rows.damageRows.length; i += 15) {
        aufgaben.push(rest("damages", {
          method: "POST", headers: kopf, body: rows.damageRows.slice(i, i + 15)
        }));
      }
    }
    if (rows.snapshotRows.length) {
      for (var j = 0; j < rows.snapshotRows.length; j += 5) {
        aufgaben.push(rest("snapshots", {
          method: "POST", headers: kopf, body: rows.snapshotRows.slice(j, j + 5)
        }));
      }
    }
    if (rows.categoryRows.length) {
      aufgaben.push(rest("categories", { method: "POST", headers: kopf, body: rows.categoryRows }));
    }
    return Promise.all(aufgaben).then(function () {
      return rows.vehicleRows.length + rows.damageRows.length +
        rows.snapshotRows.length + rows.categoryRows.length;
    });
  }

  /* Heute reicht die Uhrzeit — steht dagegen noch der Stand von gestern da,
     will man das auf einen Blick sehen und nicht "14:32" für bare Münze nehmen. */
  function zeitstempel(ts) {
    var d = ts ? new Date(ts) : new Date();
    var uhr = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
    var heute = new Date();
    var gleicherTag = d.getDate() === heute.getDate() &&
      d.getMonth() === heute.getMonth() && d.getFullYear() === heute.getFullYear();
    if (gleicherTag) return uhr;
    return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }) + " " + uhr;
  }

  function sync(still) {
    var info = statusInfo();
    if (!info.konfiguriert || !info.angemeldet) return Promise.resolve(false);
    if (syncing) return Promise.resolve(false);
    if (!navigator.onLine) {
      App.Store.setStatus("Offline — wird nachgeholt", "warn");
      return Promise.resolve(false);
    }

    syncing = true;
    emit();
    if (!still) App.Store.setStatus("Synchronisiere …", "busy");

    /* Der Stempel wird VOR dem Abgleich genommen: was währenddessen entsteht,
       geht beim nächsten Durchlauf raus statt verloren. */
    var stempel = Date.now();

    return pull()
      .then(push)
      .then(function (anzahl) {
        lastSync = stempel;
        return App.Store.idbSet("lastSync", lastSync).then(function () {
          App.Store.setStatus("Synchronisiert " + zeitstempel(), "ok");
          return anzahl;
        });
      })
      .catch(function (err) {
        console.warn("Sync fehlgeschlagen:", err);
        var text = String(err && err.message || err);
        if (/Failed to fetch|NetworkError/i.test(text)) {
          App.Store.setStatus("Kein Netz — wird nachgeholt", "warn");
        } else if (/JWT|401|Nicht angemeldet|abgelaufen/i.test(text)) {
          App.Store.setStatus("Anmeldung abgelaufen", "warn");
        } else {
          App.Store.setStatus("Sync fehlgeschlagen", "warn");
        }
        return false;
      })
      .then(function (r) {
        syncing = false;
        emit();
        return r;
      });
  }

  function schedulePush() {
    if (!statusInfo().angemeldet) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(function () { sync(true); }, 2000);
  }

  /* Kommt die App in den Vordergrund, wird nachgesehen, was die anderen Geräte
     inzwischen gemacht haben. Die Sperre verhindert, dass schnelles Hin- und
     Herschalten zwischen Apps eine Anfrage nach der anderen auslöst. */
  var VORDERGRUND_SPERRE = 15000;

  function beiVordergrund() {
    if (document.visibilityState !== "visible") return;
    if (!statusInfo().angemeldet) return;
    if (Date.now() - lastSync < VORDERGRUND_SPERRE) return;
    sync(true);
  }

  /* Verbindungsprobe für die Einstellungsseite */
  function testConnection() {
    if (!cfg) return Promise.reject(new Error("Erst Projekt-URL und Schlüssel eintragen."));
    return rest("vehicles?select=id&limit=1").then(function () {
      return "Verbindung steht, Tabellen sind erreichbar.";
    });
  }

  function init() {
    return loadConfig().then(function () {
      window.addEventListener("online", function () {
        App.Store.setStatus("Wieder online", "info");
        sync();
      });
      window.addEventListener("offline", function () {
        App.Store.setStatus("Offline — Änderungen bleiben lokal", "warn");
        emit();
      });

      /* Wer das Telefon zwischendurch weglegt, bekommt beim Zurückkommen den
         Stand der anderen Geräte. Ohne das hätte man auf dem iPad im Büro
         stundenlang einen alten Stand vor sich, ohne es zu merken. */
      document.addEventListener("visibilitychange", beiVordergrund);
      if (statusInfo().angemeldet) return sync();
    });
  }

  App.Cloud = {
    init: init,
    onStatus: function (fn) { listeners.push(fn); },
    status: statusInfo,
    saveConfig: saveConfig,
    clearConfig: clearConfig,
    config: function () { return cfg; },
    login: login,
    logout: logout,
    sync: sync,
    schedulePush: schedulePush,
    zeitstempel: zeitstempel,
    _beiVordergrund: beiVordergrund,
    _setzeVordergrundSperre: function (ms) { VORDERGRUND_SPERRE = ms; },
    testConnection: testConnection,
    _toRows: toRows,
    _fromRows: fromRows
  };

})(window.App = window.App || {});
