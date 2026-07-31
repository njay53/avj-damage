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
    snapshots: [],
    categories: []
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

  /* opts.mitVersteckten — Langzeitmieten sind normalerweise ausgeblendet
     opts.kategorie      — Kennung einer Kategorie, "" heisst alle */
  function vehicles(opts) {
    var o = opts || {};
    return state.vehicles
      .filter(function (v) {
        if (v.deleted) return false;
        if (v.hidden && !o.mitVersteckten) return false;
        if (o.kategorie && (v.categoryId || "") !== o.kategorie) return false;
        return true;
      })
      .sort(function (a, b) { return (a.name || "").localeCompare(b.name || "", "de"); });
  }

  function versteckteAnzahl(kategorie) {
    return state.vehicles.filter(function (v) {
      if (v.deleted || !v.hidden) return false;
      if (kategorie && (v.categoryId || "") !== kategorie) return false;
      return true;
    }).length;
  }

  function getVehicle(id) {
    return state.vehicles.find(function (v) { return v.id === id; }) || null;
  }

  function damagesOf(vehicleId, art) {
    var v = getVehicle(vehicleId);
    if (!v) return [];
    /* Sortiert nach Erfassungszeitpunkt — der ist immer vorhanden. Nach dem
       Schadensdatum zu sortieren würde alle Einträge ohne Datum ans Ende
       schieben, obwohl sie gerade erst erfasst wurden. */
    return v.damages
      .filter(function (d) {
        if (d.deleted) return false;
        if (art && (d.kind || "schaden") !== art) return false;
        return true;
      })
      .sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
  }

  function addVehicle(data) {
    var v = {
      id: uid("veh"),
      name: data.name,
      plate: data.plate || "",
      categoryId: data.categoryId || "",
      vin: data.vin || "",
      photo: data.photo || "",
      hidden: !!data.hidden,
      /* Zustandsaufnahmen sind der Sonderfall (Langzeitmiete), nicht die Regel —
         deshalb je Fahrzeug einzeln einzuschalten. */
      zustand: !!data.zustand,
      damages: [],
      updatedAt: now()
    };
    state.vehicles.push(v);
    return save().then(function () { return v; });
  }

  function updateVehicle(id, data) {
    var v = getVehicle(id);
    if (!v) return Promise.resolve();
    if (typeof data.name === "string") v.name = data.name;
    if (typeof data.plate === "string") v.plate = data.plate;
    if ("categoryId" in data) v.categoryId = data.categoryId || "";
    if ("vin" in data) v.vin = data.vin || "";
    if ("photo" in data) v.photo = data.photo || "";
    if ("hidden" in data) v.hidden = !!data.hidden;
    if ("zustand" in data) v.zustand = !!data.zustand;
    v.updatedAt = now();
    return save();
  }

  function deleteVehicle(id) {
    var v = getVehicle(id);
    if (!v) return Promise.resolve();
    v.deleted = true;
    v.updatedAt = now();
    entruempele();
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
    /* Zwei Arten von Eintrag: ein Schaden — oder eine Aufnahme vom Zustand,
       die gerade KEINEN Schaden zeigt. Alte Datensätze sind immer Schäden. */
    if (d.kind !== "zustand") d.kind = "schaden";
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

  /* Ein gelöschter Datensatz braucht seine Fotos nicht mehr.

     Die Löschmarke selbst muss bleiben, sonst käme der Eintrag beim nächsten
     Abgleich vom anderen Gerät zurück. Die Bilder daran braucht dafür aber
     niemand — und die machen praktisch den gesamten Platz aus. Ein gelöschtes
     Leasingfahrzeug gibt so seinen Speicher wieder her.

     Läuft bewusst über den gesamten Bestand statt nur über den eben
     gelöschten Eintrag: dann räumt es beim ersten Start auch alles ab, was
     unter älteren Ständen der App gelöscht wurde und bis heute mitgeschleppt
     wird. */
  function entruempele() {
    var geaendert = false;
    state.vehicles.forEach(function (v) {
      if (v.deleted && v.damages && v.damages.length) {
        v.damages = [];
        geaendert = true;
        return;
      }
      (v.damages || []).forEach(function (d) {
        if (d.deleted && d.images && d.images.length) {
          d.images = [];
          geaendert = true;
        }
      });
    });
    state.snapshots.forEach(function (s) {
      if (s.deleted && s.damages && s.damages.length) {
        s.damages = [];
        geaendert = true;
      }
    });
    return geaendert;
  }

  /* Belegter Platz in Byte, getrennt nach Fotos und übrigem Inhalt.

     Gezählt wird die Länge der Zeichenketten, denn genau so liegen die Daten
     auch auf dem Server: ein Foto ist dort eine Base64-Zeichenkette. Damit
     entspricht die Zahl dem, was gegen das Speicherlimit zählt — anders als
     die Grösse der ursprünglichen JPEG-Datei. */
  function speicherbedarf() {
    var fotos = 0, anzahlFotos = 0;

    function zaehleBilder(d) {
      (d.images || []).forEach(function (b) {
        fotos += (b || "").length;
        anzahlFotos++;
      });
    }
    state.vehicles.forEach(function (v) { (v.damages || []).forEach(zaehleBilder); });
    state.snapshots.forEach(function (s) { (s.damages || []).forEach(zaehleBilder); });

    /* Der Rest ist im Vergleich winzig, wird aber ehrlich mitgezählt: einmal
       alles serialisieren und die Fotos wieder abziehen. */
    var gesamt = 0;
    try {
      gesamt = JSON.stringify({ vehicles: state.vehicles, snapshots: state.snapshots }).length;
    } catch (e) {
      gesamt = fotos;
    }
    var rest = Math.max(0, gesamt - fotos);

    return {
      fotos: fotos,
      anzahlFotos: anzahlFotos,
      rest: rest,
      gesamt: fotos + rest,
      fahrzeuge: vehicles().length,
      staende: snapshots().length
    };
  }

  /* Ein Fahrzeug kann mehr Schäden haben als Einträge — ein Foto vom Heck mit
     drei Kratzern ist ein Eintrag mit Anzahl 3. */
  function damageCount(vehicleId) {
    return damagesOf(vehicleId, "schaden").reduce(function (summe, d) {
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
      kind: damage.kind === "zustand" ? "zustand" : "schaden",
      /* Nur bei Zustandsaufnahmen gefragt, aber am Schaden nicht verboten:
         wer den Stand kennt, kann ihn eintragen. */
      km: damage.km || "",
      anlass: damage.anlass || "",
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
    /* images gleich mit leeren, damit schon der nächste Abgleich die schlanke
       Fassung überträgt statt die Fotos ein letztes Mal hochzuladen. */
    return updateDamage(vehicleId, damageId, { deleted: true, images: [] });
  }

  // ---------------------------------------------------------------- Kategorien

  /* Frei pflegbar statt fest verdrahtet: der Fuhrpark ändert sich, und eine
     Liste im Code zu ändern hiesse jedes Mal ein neuer Build. */
  function categories() {
    return state.categories
      .filter(function (c) { return !c.deleted; })
      .sort(function (a, b) {
        var d = (a.sort || 0) - (b.sort || 0);
        return d !== 0 ? d : (a.name || "").localeCompare(b.name || "", "de");
      });
  }

  function getCategory(id) {
    return state.categories.find(function (c) { return c.id === id; }) || null;
  }

  function categoryName(id) {
    var c = getCategory(id);
    return c && !c.deleted ? c.name : "";
  }

  function addCategory(name) {
    var sauber = String(name || "").trim();
    if (!sauber) return Promise.resolve(null);
    var hoechste = state.categories.reduce(function (m, c) {
      return Math.max(m, c.sort || 0);
    }, 0);
    var c = { id: uid("kat"), name: sauber, sort: hoechste + 10, updatedAt: now() };
    state.categories.push(c);
    return save().then(function () { return c; });
  }

  function updateCategory(id, name) {
    var c = getCategory(id);
    if (!c) return Promise.resolve();
    c.name = String(name || "").trim() || c.name;
    c.updatedAt = now();
    return save();
  }

  function moveCategory(id, richtung) {
    var liste = categories();
    var i = liste.findIndex(function (c) { return c.id === id; });
    var j = i + (richtung < 0 ? -1 : 1);
    if (i === -1 || j < 0 || j >= liste.length) return Promise.resolve();
    var a = getCategory(liste[i].id), b = getCategory(liste[j].id);
    var merk = a.sort || 0;
    a.sort = b.sort || 0;
    b.sort = merk;
    a.updatedAt = now();
    b.updatedAt = now();
    return save();
  }

  /* Fahrzeuge verlieren nur ihre Zuordnung — gelöscht wird nie ein Fahrzeug,
     weil eine Kategorie verschwindet. */
  function deleteCategory(id) {
    var c = getCategory(id);
    if (!c) return Promise.resolve();
    c.deleted = true;
    c.updatedAt = now();
    state.vehicles.forEach(function (v) {
      if (v.categoryId === id) {
        v.categoryId = "";
        v.updatedAt = now();
      }
    });
    return save();
  }

  function categoryCount(id) {
    return state.vehicles.filter(function (v) {
      return !v.deleted && (v.categoryId || "") === id;
    }).length;
  }

  function mergeCategories(incoming) {
    var changed = false;
    var byId = {};
    state.categories.forEach(function (c) { byId[c.id] = c; });
    (incoming || []).forEach(function (rc) {
      var local = byId[rc.id];
      if (!local) {
        state.categories.push(rc);
        byId[rc.id] = rc;
        changed = true;
        return;
      }
      if ((rc.updatedAt || 0) > (local.updatedAt || 0)) {
        local.name = rc.name;
        local.sort = rc.sort;
        local.deleted = rc.deleted;
        local.updatedAt = rc.updatedAt;
        changed = true;
      }
    });
    return changed;
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
      damages: damagesOf(v.id, "schaden").map(function (d) {
        return {
          id: d.id,
          images: (d.images || []).slice(),
          count: parseInt(d.count, 10) || 1,
          description: d.description || "",
          date: d.date || "",
          dateMode: d.dateMode || "exact",
          createdAt: d.createdAt || 0,
          area: d.area || "",
          km: d.km || ""
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
    entruempele();
    return save();
  }

  // ---------------------------------------------------------------- Speichern

  function save() {
    return Promise.all([
      idbSet("vehicles", state.vehicles),
      idbSet("snapshots", state.snapshots),
      idbSet("categories", state.categories)
    ]).then(function () {
      emitChange();
      if (App.Cloud && App.Cloud.schedulePush) App.Cloud.schedulePush();
    });
  }

  /* Von cloud.js benutzt: nach dem Zusammenführen speichern, ohne erneut zu pushen. */
  function persistOnly() {
    return Promise.all([
      idbSet("vehicles", state.vehicles),
      idbSet("snapshots", state.snapshots),
      idbSet("categories", state.categories)
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
        local.categoryId = rv.categoryId || "";
        local.vin = rv.vin || "";
        local.photo = rv.photo || "";
        local.hidden = !!rv.hidden;
        local.zustand = !!rv.zustand;
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
    var c = mergeCategories(payload && payload.categories);
    var changed = a || b || c;
    /* Von einem Gerät mit älterem Build können Datensätze im alten Format
       hereinkommen — die werden hier gleich überführt. */
    if (changed) {
      normalisiereAlles();
      /* Das andere Gerät kann eine Löschung schicken, die hiesigen Fotos dazu
         liegen aber noch lokal. */
      entruempele();
    }
    return (changed ? persistOnly() : Promise.resolve()).then(function () { return changed; });
  }

  /* Alles, was seit einem Zeitpunkt geändert wurde — Grundlage für den Push. */
  function changedSince(ts) {
    return {
      vehicles: state.vehicles.filter(function (v) {
        if ((v.updatedAt || 0) > ts) return true;
        return (v.damages || []).some(function (d) { return (d.updatedAt || 0) > ts; });
      }),
      snapshots: state.snapshots.filter(function (s) { return (s.updatedAt || 0) > ts; }),
      categories: state.categories.filter(function (c) { return (c.updatedAt || 0) > ts; })
    };
  }

  function allData() {
    return {
      vehicles: state.vehicles,
      snapshots: state.snapshots,
      categories: state.categories
    };
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
      return Promise.all([idbGet("vehicles"), idbGet("snapshots"), idbGet("categories")]);
    }).then(function (res) {
      if (Array.isArray(res[0])) state.vehicles = res[0];
      if (Array.isArray(res[1])) state.snapshots = res[1];
      if (Array.isArray(res[2])) state.categories = res[2];
      normalisiereAlles();
      /* Einmal beim Start: gibt den Platz früher gelöschter Einträge frei. */
      if (entruempele()) return persistOnly();
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
    versteckteAnzahl: versteckteAnzahl,
    getVehicle: getVehicle,
    categories: categories,
    getCategory: getCategory,
    categoryName: categoryName,
    categoryCount: categoryCount,
    addCategory: addCategory,
    updateCategory: updateCategory,
    moveCategory: moveCategory,
    deleteCategory: deleteCategory,
    damagesOf: damagesOf,
    damageCount: damageCount,
    normalisiereSchaden: normalisiereSchaden,
    entruempele: entruempele,
    speicherbedarf: speicherbedarf,
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
