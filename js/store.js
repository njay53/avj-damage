/* store.js — Datenschicht
 *
 * Inhalt der Datenbank: Fahrzeuge, Schäden, eingefrorene Schadensstände.
 * Bewusst KEINE Kundendaten — keine Namen, keine Unterschriften. Damit ist
 * der Datenbestand reine Betriebsmitteldokumentation und darf ohne weitere
 * Datenschutzauflagen zwischen Geräten synchronisiert werden.
 *
 * IndexedDB ist führend: die App funktioniert vollständig offline, der
 * Abgleich mit dem Server (cloud.js) läuft nebenher.
 *
 * Löschungen werden als Tombstone (deleted:true) gespeichert, sonst würde ein
 * Gerät mit altem Stand gelöschte Einträge wieder auferstehen lassen.
 */
(function (App) {
  "use strict";

  /* Gemeinsamer Element-Zugriff für alle Module.
     Wirft mit Klartext, wenn ein Element fehlt — sonst landet man bei einem
     nichtssagenden "Cannot read properties of null". */
  App.el = function (id, modul) {
    var node = document.getElementById(id);
    if (!node) {
      throw new Error('HTML-Element fehlt: #' + id + (modul ? ' (benötigt von ' + modul + ')' : ''));
    }
    return node;
  };

  var DB_NAME = "jansen-fahrzeuge";
  var DB_VERSION = 1;
  var STORE = "kv";

  /* Kennungen für Schadensstände: ohne 0/O/1/I/5/S, damit auf Papier nichts
     verwechselt wird. */
  var CODE_ALPHABET = "ACDEFGHJKLMNPQRTUVWXYZ2346789";

  var db = null;
  var statusListeners = [];
  var changeListeners = [];

  var state = {
    vehicles: [],
    snapshots: []
  };

  // ---------------------------------------------------------------- IndexedDB

  function openDb() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function () {
        var d = req.result;
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function idbGet(key) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(STORE, "readonly");
      var req = tx.objectStore(STORE).get(key);
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function idbSet(key, value) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(STORE, "readwrite");
      var req = tx.objectStore(STORE).put(value, key);
      req.onsuccess = function () { resolve(); };
      req.onerror = function () { reject(req.error); };
    });
  }

  // ---------------------------------------------------------------- Helfer

  function uid(prefix) {
    return (prefix || "id") + "-" + Date.now().toString(36) + "-" +
      Math.random().toString(36).slice(2, 8);
  }

  function now() { return Date.now(); }

  function setStatus(text, kind) {
    statusListeners.forEach(function (fn) { fn(text, kind || "info"); });
  }

  function emitChange() {
    changeListeners.forEach(function (fn) { fn(); });
  }

  function randomCode(len) {
    var out = "";
    var buf = new Uint32Array(len);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(buf);
    } else {
      for (var j = 0; j < len; j++) buf[j] = Math.floor(Math.random() * 0xffffffff);
    }
    for (var i = 0; i < len; i++) {
      out += CODE_ALPHABET.charAt(buf[i] % CODE_ALPHABET.length);
    }
    return out;
  }

  function uniqueCode() {
    for (var versuch = 0; versuch < 200; versuch++) {
      var code = randomCode(4);
      var belegt = state.snapshots.some(function (s) { return s.code === code; });
      if (!belegt) return code;
    }
    return randomCode(6);   // extrem unwahrscheinlich, aber dann eben länger
  }

  // ---------------------------------------------------------------- Fahrzeuge

  function vehicles() {
    return state.vehicles
      .filter(function (v) { return !v.deleted; })
      .sort(function (a, b) { return (a.name || "").localeCompare(b.name || "", "de"); });
  }

  function getVehicle(id) {
    return state.vehicles.find(function (v) { return v.id === id; }) || null;
  }

  function damagesOf(vehicleId) {
    var v = getVehicle(vehicleId);
    if (!v) return [];
    /* Sortiert nach Erfassungszeitpunkt — der ist immer vorhanden. Nach dem
       Schadensdatum zu sortieren würde alle Einträge ohne Datum ans Ende
       schieben, obwohl sie gerade erst erfasst wurden. */
    return v.damages
      .filter(function (d) { return !d.deleted; })
      .sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
  }

  function addVehicle(data) {
    var v = {
      id: uid("veh"),
      name: data.name,
      plate: data.plate || "",
      damages: [],
      updatedAt: now()
    };
    state.vehicles.push(v);
    return save().then(function () { return v; });
  }

  function updateVehicle(id, data) {
    var v = getVehicle(id);
    if (!v) return Promise.resolve();
    v.name = data.name;
    v.plate = data.plate || "";
    v.updatedAt = now();
    return save();
  }

  function deleteVehicle(id) {
    var v = getVehicle(id);
    if (!v) return Promise.resolve();
    v.deleted = true;
    v.updatedAt = now();
    return save();
  }

  /* Überführt einen Schaden ins aktuelle Format.
     Früher: ein Bild in "image", Text in "note".
     Heute:  Bilderliste in "images", Text in "description", dazu "count" für
     den Fall, dass ein Foto mehrere Schäden zeigt.
     Wird beim Laden und nach jedem Abgleich angewendet, damit alte und neue
     Datensätze nebeneinander bestehen können. */
  function normalisiereSchaden(d) {
    if (!d) return d;
    if (!Array.isArray(d.images)) {
      d.images = d.image ? [d.image] : [];
    }
    if (typeof d.description !== "string") {
      d.description = d.note || "";
    }
    var n = parseInt(d.count, 10);
    d.count = (isNaN(n) || n < 1) ? 1 : n;
    delete d.image;
    delete d.note;
    return d;
  }

  function normalisiereAlles() {
    state.vehicles.forEach(function (v) {
      (v.damages || []).forEach(normalisiereSchaden);
    });
    state.snapshots.forEach(function (s) {
      (s.damages || []).forEach(normalisiereSchaden);
    });
  }

  /* Ein Fahrzeug kann mehr Schäden haben als Einträge — ein Foto vom Heck mit
     drei Kratzern ist ein Eintrag mit Anzahl 3. */
  function damageCount(vehicleId) {
    return damagesOf(vehicleId).reduce(function (summe, d) {
      return summe + (parseInt(d.count, 10) || 1);
    }, 0);
  }

  function addDamage(vehicleId, damage) {
    var v = getVehicle(vehicleId);
    if (!v) return Promise.resolve(null);
    /* dateMode trennt zwei Dinge, die oft verwechselt werden:
         date      — wann der Schaden entstanden ist (kann unbekannt sein)
         createdAt — wann du ihn fotografiert hast (immer bekannt)
       Für den Nachweis zählt createdAt, deshalb wird es immer gesetzt. */
    var bilder = Array.isArray(damage.images)
      ? damage.images.slice()
      : (damage.image ? [damage.image] : []);
    var anzahl = parseInt(damage.count, 10);

    var d = {
      id: uid("dmg"),
      images: bilder,
      count: (isNaN(anzahl) || anzahl < 1) ? 1 : anzahl,
      description: damage.description || damage.note || "",
      date: damage.date || "",
      dateMode: damage.dateMode || (damage.date ? "exact" : "unknown"),
      area: damage.area || "",
      createdAt: now(),
      updatedAt: now()
    };
    v.damages.push(d);
    v.updatedAt = now();
    return save().then(function () { return d; });
  }

  function updateDamage(vehicleId, damageId, patch) {
    var v = getVehicle(vehicleId);
    if (!v) return Promise.resolve();
    var d = v.damages.find(function (x) { return x.id === damageId; });
    if (!d) return Promise.resolve();
    Object.keys(patch).forEach(function (k) { d[k] = patch[k]; });
    d.updatedAt = now();
    v.updatedAt = now();
    return save();
  }

  function deleteDamage(vehicleId, damageId) {
    return updateDamage(vehicleId, damageId, { deleted: true });
  }

  // ------------------------------------------------------------ Schadensstände

  /* Friert den aktuellen Zustand eines Fahrzeugs ein. Das Ergebnis ist
     unveränderlich: es enthält eigene Kopien der Bilder. Spätere Änderungen
     am Register berühren einen bestehenden Stand nicht. */
  function createSnapshot(vehicleId, reference) {
    var v = getVehicle(vehicleId);
    if (!v) return Promise.resolve(null);

    var snap = {
      id: uid("std"),
      code: uniqueCode(),
      vehicleId: v.id,
      vehicleName: v.name,
      vehiclePlate: v.plate || "",
      reference: (reference || "").trim(),
      createdAt: now(),
      updatedAt: now(),
      damages: damagesOf(v.id).map(function (d) {
        return {
          id: d.id,
          images: (d.images || []).slice(),
          count: parseInt(d.count, 10) || 1,
          description: d.description || "",
          date: d.date || "",
          dateMode: d.dateMode || "exact",
          createdAt: d.createdAt || 0,
          area: d.area || ""
        };
      })
    };
    state.snapshots.push(snap);
    return save().then(function () { return snap; });
  }

  function snapshots(vehicleId) {
    return state.snapshots
      .filter(function (s) { return !s.deleted && (!vehicleId || s.vehicleId === vehicleId); })
      .sort(function (a, b) { return b.createdAt - a.createdAt; });
  }

  function getSnapshot(id) {
    return state.snapshots.find(function (s) { return s.id === id; }) || null;
  }

  function findSnapshotByCode(code) {
    var needle = String(code || "").trim().toUpperCase().replace(/\s/g, "");
    if (!needle) return null;
    return state.snapshots.find(function (s) {
      return !s.deleted && s.code === needle;
    }) || null;
  }

  /* Der Inhalt eines Standes bleibt unantastbar. Löschen ist möglich, ändern nicht. */
  function deleteSnapshot(id) {
    var s = getSnapshot(id);
    if (!s) return Promise.resolve();
    s.deleted = true;
    s.updatedAt = now();
    return save();
  }

  // ---------------------------------------------------------------- Speichern

  function save() {
    return Promise.all([
      idbSet("vehicles", state.vehicles),
      idbSet("snapshots", state.snapshots)
    ]).then(function () {
      emitChange();
      if (App.Cloud && App.Cloud.schedulePush) App.Cloud.schedulePush();
    });
  }

  /* Von cloud.js benutzt: nach dem Zusammenführen speichern, ohne erneut zu pushen. */
  function persistOnly() {
    return Promise.all([
      idbSet("vehicles", state.vehicles),
      idbSet("snapshots", state.snapshots)
    ]).then(emitChange);
  }

  // ---------------------------------------------------------------- Zusammenführen

  /* Regel: pro Datensatz gewinnt der jüngere Zeitstempel. Tombstones zählen
     wie normale Änderungen, damit Löschungen sich durchsetzen. */
  function mergeVehicles(incoming) {
    var changed = false;
    var byId = {};
    state.vehicles.forEach(function (v) { byId[v.id] = v; });

    (incoming || []).forEach(function (rv) {
      var local = byId[rv.id];
      if (!local) {
        state.vehicles.push(rv);
        byId[rv.id] = rv;
        changed = true;
        return;
      }
      if ((rv.updatedAt || 0) > (local.updatedAt || 0)) {
        local.name = rv.name;
        local.plate = rv.plate;
        local.deleted = rv.deleted;
        local.updatedAt = rv.updatedAt;
        changed = true;
      }
      var dmgById = {};
      local.damages.forEach(function (d) { dmgById[d.id] = d; });
      (rv.damages || []).forEach(function (rd) {
        var ld = dmgById[rd.id];
        if (!ld) {
          local.damages.push(rd);
          changed = true;
        } else if ((rd.updatedAt || 0) > (ld.updatedAt || 0)) {
          Object.keys(rd).forEach(function (k) { ld[k] = rd[k]; });
          changed = true;
        }
      });
    });
    return changed;
  }

  function mergeSnapshots(incoming) {
    var changed = false;
    var byId = {};
    state.snapshots.forEach(function (s) { byId[s.id] = s; });

    (incoming || []).forEach(function (rs) {
      var local = byId[rs.id];
      if (!local) {
        state.snapshots.push(rs);
        changed = true;
        return;
      }
      /* Der eingefrorene Inhalt wird nie überschrieben — nur der Tombstone
         und die Referenz können sich ändern. */
      if ((rs.updatedAt || 0) > (local.updatedAt || 0)) {
        local.deleted = rs.deleted;
        local.reference = rs.reference;
        local.updatedAt = rs.updatedAt;
        changed = true;
      }
    });
    return changed;
  }

  function mergeAll(payload) {
    var a = mergeVehicles(payload && payload.vehicles);
    var b = mergeSnapshots(payload && payload.snapshots);
    var changed = a || b;
    /* Von einem Gerät mit älterem Build können Datensätze im alten Format
       hereinkommen — die werden hier gleich überführt. */
    if (changed) normalisiereAlles();
    return (changed ? persistOnly() : Promise.resolve()).then(function () { return changed; });
  }

  /* Alles, was seit einem Zeitpunkt geändert wurde — Grundlage für den Push. */
  function changedSince(ts) {
    return {
      vehicles: state.vehicles.filter(function (v) {
        if ((v.updatedAt || 0) > ts) return true;
        return (v.damages || []).some(function (d) { return (d.updatedAt || 0) > ts; });
      }),
      snapshots: state.snapshots.filter(function (s) { return (s.updatedAt || 0) > ts; })
    };
  }

  function allData() {
    return { vehicles: state.vehicles, snapshots: state.snapshots };
  }

  // ------------------------------------------------- Sicherung als Datei

  function exportDownload() {
    var payload = {
      format: "jansen-fahrzeuge",
      version: 2,
      exportedAt: now(),
      vehicles: state.vehicles,
      snapshots: state.snapshots
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "fahrzeugdaten-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function importFile(file) {
    return file.text().then(function (text) {
      var parsed = JSON.parse(text);
      if (!parsed || !Array.isArray(parsed.vehicles)) {
        throw new Error("Datei enthält keine Fahrzeugdaten im erwarteten Format.");
      }
      return mergeAll(parsed);
    });
  }

  // ---------------------------------------------------------------- Start

  function init() {
    return openDb().then(function (d) {
      db = d;
      return Promise.all([idbGet("vehicles"), idbGet("snapshots")]);
    }).then(function (res) {
      if (Array.isArray(res[0])) state.vehicles = res[0];
      if (Array.isArray(res[1])) state.snapshots = res[1];
      normalisiereAlles();
    });
  }

  App.Store = {
    init: init,
    uid: uid,
    idbGet: idbGet,
    idbSet: idbSet,
    onStatus: function (fn) { statusListeners.push(fn); },
    onChange: function (fn) { changeListeners.push(fn); },
    setStatus: setStatus,

    vehicles: vehicles,
    getVehicle: getVehicle,
    damagesOf: damagesOf,
    damageCount: damageCount,
    normalisiereSchaden: normalisiereSchaden,
    addVehicle: addVehicle,
    updateVehicle: updateVehicle,
    deleteVehicle: deleteVehicle,
    addDamage: addDamage,
    updateDamage: updateDamage,
    deleteDamage: deleteDamage,

    createSnapshot: createSnapshot,
    snapshots: snapshots,
    getSnapshot: getSnapshot,
    findSnapshotByCode: findSnapshotByCode,
    deleteSnapshot: deleteSnapshot,

    mergeAll: mergeAll,
    changedSince: changedSince,
    allData: allData,
    persistOnly: persistOnly,

    exportDownload: exportDownload,
    importFile: importFile
  };

})(window.App = window.App || {});
