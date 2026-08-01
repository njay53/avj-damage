/* fleet.js — Fuhrpark und Schadensregister */
(function (App) {
  "use strict";

  var Store;
  var currentVehicleId = null;
  var currentDamageId = null;
  var editingVehicleId = null;

  function q(id) { return App.el(id, "fleet.js"); }

  /* Filterzustand der Übersicht. Bewusst nur im Speicher: nach dem Neuladen
     steht wieder alles da, sonst sucht man ein Fahrzeug, das ein alter Filter
     versteckt. */
  var filterKategorie = "";
  var zeigeVersteckte = false;
  var zeigeArchiv = false;

  function esc(str) {
    var d = document.createElement("div");
    d.textContent = str == null ? "" : str;
    return d.innerHTML;
  }

  function fmtDate(s) {
    if (!s) return "";
    var p = s.split("-");
    return p.length === 3 ? p[2] + "." + p[1] + "." + p[0] : s;
  }

  function fmtStamp(ms) {
    if (!ms) return "";
    var d = new Date(ms);
    return d.toLocaleDateString("de-DE") + ", " +
      d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  }

  /* Wann ist der Schaden entstanden? Kurzform für Kacheln. */
  function fmtDamageDate(d) {
    var modus = d.dateMode || (d.date ? "exact" : "unknown");
    if (modus === "stock") return "Bestandsschaden";
    if (modus === "unknown") return "Datum unbekannt";
    return fmtDate(d.date);
  }

  /* Ausführlich, für Detailansicht und Dokument. Der Erfassungszeitpunkt
     steht immer dabei — er ist der belastbare Teil. */
  function fmtDamageDateLong(d) {
    var modus = d.dateMode || (d.date ? "exact" : "unknown");
    var text;
    if (modus === "stock") text = "Bestandsschaden, bei Übernahme vorhanden";
    else if (modus === "unknown") text = "Schadensdatum unbekannt";
    else text = "Schaden vom " + fmtDate(d.date);
    if (d.createdAt) text += " · erfasst am " + fmtStamp(d.createdAt);
    return text;
  }

  function bind() {
    Store = App.Store;

    q("btn-back-fleet").addEventListener("click", function () {
      App.Nav.go("fleet");
      renderFleet();
    });
    q("btn-edit-vehicle").addEventListener("click", function () {
      openVehicleModal(currentVehicleId);
    });
    q("btn-delete-vehicle").addEventListener("click", deleteCurrentVehicle);
    q("form-vehicle").addEventListener("submit", submitVehicle);
    q("btn-save-note").addEventListener("click", saveDetailNote);
    q("detail-regulierung").addEventListener("change", zeigeErstattungsfeld);
    q("btn-delete-damage").addEventListener("click", deleteCurrentDamage);
    q("btn-edit-damage").addEventListener("click", editCurrentDamage);
    q("btn-add-vehicle").addEventListener("click", function () { openVehicleModal(null); });
    q("btn-vehicle-doc").addEventListener("click", function () { druckeAkte(); });
    q("btn-vehicle-hu-cal").addEventListener("click", function () {
      var v = Store.getVehicle(currentVehicleId);
      if (v) huKalender(v);
    });

    q("input-vehicle-plate").addEventListener("blur", function () {
      var feld = q("input-vehicle-plate");
      feld.value = formatiereKennzeichen(feld.value);
      markiereKuerzel();
    });
    q("input-vehicle-plate").addEventListener("input", markiereKuerzel);

    q("input-marke").addEventListener("change", function () {
      fuelleModelle(q("input-marke").value);
      uebernehmeAuswahl();
    });
    q("input-modell").addEventListener("change", uebernehmeAuswahl);

    q("btn-vehicle-photo").addEventListener("click", function () {
      q("file-vehicle-photo").click();
    });
    q("file-vehicle-photo").addEventListener("change", function (e) {
      var datei = e.target.files && e.target.files[0];
      e.target.value = "";
      if (!datei) return;
      verkleinere(datei).then(function (klein) {
        bildEntwurf = klein;
        zeigeFahrzeugbild();
      }).catch(function (err) {
        alert("Bild konnte nicht gelesen werden:\n\n" + (err.message || err));
      });
    });
    q("btn-vehicle-photo-clear").addEventListener("click", function () {
      bildEntwurf = "";
      zeigeFahrzeugbild();
    });
  }

  // -------------------------------------------------------------- Fuhrpark

  /* Eine Reihe Chips: alle Kategorien, dann der Schalter für Ausgeblendete.
     Nur was es gibt — leere Kategorien und ein Schalter ohne versteckte
     Fahrzeuge wären nur Beiwerk. */
  function renderFilter() {
    var leiste = q("kategorie-filter");
    leiste.innerHTML = "";
    var kats = Store.categories();
    var versteckt = Store.versteckteAnzahl(filterKategorie);

    if (!kats.length && !versteckt && !Store.archivAnzahl()) {
      leiste.classList.add("hidden");
      return;
    }
    leiste.classList.remove("hidden");

    function chip(text, aktiv, leise, beiKlick) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "filter-chip" + (aktiv ? " aktiv" : "") + (leise ? " leise" : "");
      b.textContent = text;
      b.addEventListener("click", beiKlick);
      leiste.appendChild(b);
    }

    if (kats.length) {
      chip("Alle", filterKategorie === "", false, function () {
        filterKategorie = "";
        renderFleet();
      });
      kats.forEach(function (k) {
        chip(k.name, filterKategorie === k.id, false, function () {
          filterKategorie = (filterKategorie === k.id) ? "" : k.id;
          renderFleet();
        });
      });
    }
    if (versteckt) {
      chip((zeigeVersteckte ? "Ausgeblendete an · " : "Ausgeblendete · ") + versteckt,
        zeigeVersteckte, true, function () {
          zeigeVersteckte = !zeigeVersteckte;
          renderFleet();
        });
    }
    var imArchiv = Store.archivAnzahl();
    if (imArchiv) {
      chip("Archiv · " + imArchiv, zeigeArchiv, true, function () {
        zeigeArchiv = !zeigeArchiv;
        renderFleet();
      });
    }
  }

  function renderFleet() {
    renderFilter();
    var grid = q("fleet-grid");
    grid.innerHTML = "";
    var list = Store.vehicles({
      kategorie: filterKategorie,
      mitVersteckten: zeigeVersteckte,
      archiv: zeigeArchiv
    });

    if (!list.length) {
      var hint = document.createElement("div");
      hint.className = "empty-hint";
      hint.style.gridColumn = "1/-1";
      hint.textContent = (filterKategorie || zeigeVersteckte)
        ? "In dieser Auswahl steht kein Fahrzeug."
        : "Noch keine Fahrzeuge angelegt.";
      grid.appendChild(hint);
    }

    list.forEach(function (v) {
      var anzahl = Store.damageCount(v.id);       // Summe, nicht Einträge
      var eintraege = Store.damagesOf(v.id, "schaden").length;
      var staende = Store.snapshots(v.id).length;
      var kat = Store.categoryName(v.categoryId);
      var card = document.createElement("div");
      card.className = "vehicle-card" + (v.hidden ? " versteckt" : "");
      /* Kopf der Kachel: Bild, Name, Kennzeichen und Kategorie gehören
         zusammen — das ist die Identität des Fahrzeugs. Die Zählmarken
         darunter sind Betriebszustand und stehen deshalb abgesetzt. */
      card.innerHTML =
        '<div class="fz-kopf">' +
          (v.photo
            ? '<img class="fz-bild" src="' + v.photo + '" alt="" loading="lazy">'
            : '<div class="fz-bild leer" aria-hidden="true">▭</div>') +
          '<div class="fz-text">' +
            '<h3>' + (v.nr ? '<span class="fz-nr">' + v.nr + '</span>' : '') + esc(v.name) +
              (v.hidden ? ' <span class="klappe-zahl">ausgeblendet</span>' : '') + '</h3>' +
            '<div class="plate">' + esc(v.plate || "kein Kennzeichen") + '</div>' +
            (kat ? '<div class="fz-kat">' + esc(kat) + '</div>' : '') +
            (function () {
              var h = huStand(v);
              return h && h.klasse
                ? '<span class="hu-marke ' + h.klasse + '">' + esc(h.text) + '</span>'
                : "";
            })() +
          '</div>' +
        '</div>' +
        '<div class="fz-marken">' +
          '<span class="chip' + (anzahl === 0 ? " zero" : "") + '">' + anzahl +
          (anzahl === 1 ? " Schaden" : " Schäden") + '</span>' +
          (eintraege && eintraege !== anzahl
            ? '<span class="chip ghost">' + eintraege + " Einträge</span>" : "") +
          (App.Einstellungen.kennungAktiv() && staende
            ? '<span class="chip ghost">' + staende + " Stände</span>" : "") +
        '</div>';
      card.addEventListener("click", function () { openVehicle(v.id); });
      grid.appendChild(card);
    });

    var add = document.createElement("div");
    add.className = "add-tile";
    add.textContent = "+ Fahrzeug hinzufügen";
    add.addEventListener("click", function () { openVehicleModal(null); });
    grid.appendChild(add);
  }

  function openVehicle(id) {
    currentVehicleId = id;
    App.Snapshot.setVehicle(id);
    App.Nav.go("vehicle");
    renderVehicle();
  }

  function renderVehicle() {
    var v = Store.getVehicle(currentVehicleId);
    if (!v) { App.Nav.go("fleet"); renderFleet(); return; }

    q("vehicle-title").textContent = v.name;
    q("vehicle-plate").textContent = v.plate || "kein Kennzeichen hinterlegt";
    q("vehicle-plate").classList.toggle("leer", !v.plate);

    q("btn-delete-vehicle").textContent = v.archived ? "Aus dem Archiv holen" : "Archivieren …";
    q("btn-vehicle-hu-cal").classList.toggle("hidden", !v.hu);

    var zeile = [];
    var katName = Store.categoryName(v.categoryId);
    if (katName) zeile.push(esc(katName));
    if (v.vin) zeile.push('VIN <span class="mono">' + esc(v.vin) + "</span>");
    var h = huStand(v);
    if (h) zeile.push(esc(h.text));
    if (v.archived) zeile.push("<strong>archiviert</strong>");
    q("vehicle-meta").innerHTML = zeile.join(" · ");
    q("vehicle-meta").classList.toggle("hidden", !zeile.length);

    fuelleRaster(q("damage-grid"), v, "schaden");

    /* Zustandsaufnahmen nur, wenn sie für dieses Fahrzeug eingeschaltet sind —
       bei einem Bestandsfahrzeug mit lauter Altschäden wären sie nur im Weg. */
    q("zustand-block").classList.toggle("hidden", !v.zustand);
    if (v.zustand) fuelleRaster(q("zustand-grid"), v, "zustand");

    zeigeBilanz(v);

    /* Schadensstände hängen am Kennungsschalter: aus heisst zugeklappt und
       ohne Aufforderung, nicht verschwunden. */
    var kennung = App.Einstellungen.kennungAktiv();
    var staende = Store.snapshots(v.id).length;
    var block = q("snapshot-block");
    block.open = kennung;
    q("snapshot-count").textContent = staende
      ? staende + (staende === 1 ? " Stand" : " Stände")
      : "noch keiner";
    App.Snapshot.renderList();
  }

  /* Was das Fahrzeug an Schäden eingebracht und gekostet hat. Erscheint nur,
     wenn überhaupt etwas eingetragen ist — ein leerer Kasten mit drei Nullen
     hilft niemandem. */
  function zeigeBilanz(v) {
    var kasten = q("vehicle-bilanz");
    var block = q("bilanz-block");
    var b = Store.bilanz(v.id);
    var etwasDa = b.zahlungen || b.erstattungen || b.kosten || b.offeneSchaetzung;
    block.classList.toggle("hidden", !etwasDa);
    if (!etwasDa) return;

    /* In der Kopfzeile der Klappe die eine Zahl, um die es geht — verdeckt,
       solange das Auge zu ist. */
    q("bilanz-kurz").textContent = b.differenz < 0
      ? "bleibt an mir " + euro(Math.abs(b.differenz))
      : "gedeckt";

    kasten.innerHTML =
      '<div class="bilanz-zeile"><span>Von Mietern erhalten</span>' +
        '<span class="bilanz-wert ein">' + euro(b.zahlungen) + '</span></div>' +
      (b.erstattungen
        ? '<div class="bilanz-zeile"><span>Von Versicherungen erstattet</span>' +
          '<span class="bilanz-wert ein">' + euro(b.erstattungen) + '</span></div>'
        : "") +
      '<div class="bilanz-zeile"><span>Reparaturen bezahlt</span>' +
        '<span class="bilanz-wert aus">' + euro(b.kosten) + '</span></div>' +
      '<div class="bilanz-zeile summe"><span>' +
        (b.differenz < 0 ? "Bleibt an mir hängen" : "Gedeckt") + '</span>' +
        '<span class="bilanz-wert ' + (b.differenz < 0 ? "aus" : "ein") + '">' +
        euro(Math.abs(b.differenz)) + '</span></div>' +
      (b.offeneSchaetzung
        ? '<div class="bilanz-zeile klein"><span>' + b.offen +
          (b.offen === 1 ? " offener Schaden, geschätzt" : " offene Schäden, geschätzt") +
          '</span><span class="bilanz-wert">' + euro(b.offeneSchaetzung) + '</span></div>'
        : "");
  }

  /* Ein Raster für beide Arten — sie unterscheiden sich nur im Wortlaut. */
  function fuelleRaster(grid, v, art) {
    var istSchaden = art !== "zustand";
    grid.innerHTML = "";

    Store.damagesOf(v.id, art).forEach(function (d) {
      var bilder = d.images || [];
      var card = document.createElement("div");
      card.className = "damage-card";
      card.innerHTML =
        '<div class="dc-img">' +
          '<img src="' + (bilder[0] || "") + '" alt="' + (istSchaden ? "Schaden" : "Zustand") + '" loading="lazy">' +
          (bilder.length > 1 ? '<span class="dc-badge">' + bilder.length + ' Fotos</span>' : '') +
          (istSchaden && d.count > 1 ? '<span class="dc-badge count">' + d.count + ' Schäden</span>' : '') +
          (istSchaden && d.status && d.status !== "offen"
            ? '<span class="dc-badge stand">' + esc(STANDTEXT[d.status] || "") + '</span>' : '') +
        '</div>' +
        '<div class="meta">' +
          (istSchaden ? '<span class="fz-nr">' + esc(Store.schadenNummer(v.id, d)) + '</span>' : '') +
          esc(fmtDamageDate(d)) +
          (!istSchaden && d.anlass ? " · " + esc(anlassText(d.anlass)) : "") +
          (d.km ? " · " + esc(kmText(d.km)) : "") +
          (d.area ? " · " + esc(d.area) : "") + '</div>' +
        '<div class="note">' + esc(d.description || "(keine Beschreibung)") + '</div>';
      card.addEventListener("click", function () { openDetail(d.id); });
      grid.appendChild(card);
    });

    var add = document.createElement("div");
    add.className = "add-tile";
    add.textContent = istSchaden ? "+ Schaden hinzufügen" : "+ Zustandsaufnahme";
    add.addEventListener("click", function () {
      App.Annotate.open({
        title: (istSchaden ? "Schaden erfassen — " : "Zustand festhalten — ") + v.name,
        art: art,
        onSave: function (payload) {
          payload.kind = art;
          Store.addDamage(v.id, payload).then(renderVehicle);
        }
      });
    });
    grid.appendChild(add);
  }

  // -------------------------------------------------------------- Fahrzeug-Dialog

  /* Die Kürzel, die im Betrieb vorkommen. Northeim ist der Regelfall, EU sind
     die eigenen, RÜD kommt über DirectCar herein. Alles andere tippt man. */
  var KUERZEL = ["NOM", "EU", "RÜD"];

  /* Schreibweise vereinheitlichen: Ort, Bindestrich, Buchstaben, Leerzeichen,
     Zahl — "nomnj56" wird zu "NOM-NJ 56". Passt der Text nicht in dieses
     Muster, bleibt er unangetastet: lieber eine ungewöhnliche Schreibweise
     als ein zerpflücktes Kennzeichen. */
  function formatiereKennzeichen(roh) {
    var text = String(roh || "").trim().toUpperCase();
    if (!text) return "";

    /* Steht schon ein Trenner drin, sagt er, wo der Ort aufhört. "EU-JA 1"
       und "EUJ-A 1" sind sonst nicht auseinanderzuhalten. */
    var getrennt = text.match(/^([A-ZÄÖÜ]{1,3})[\s\-]+([A-Z]{1,2})[\s\-]*(\d{1,4})([EH]?)$/);
    if (getrennt) {
      return getrennt[1] + "-" + getrennt[2] + " " + getrennt[3] + getrennt[4];
    }

    var kern = text.replace(/[\s\-]/g, "");

    /* Ohne Trenner: erst nachsehen, ob eins der gewohnten Kürzel vorn steht.
       Sonst bleibt nur raten, und dabei gewinnt der längere Ort. */
    var bekannt = KUERZEL.slice().sort(function (a, b) { return b.length - a.length; });
    for (var i = 0; i < bekannt.length; i++) {
      var k = bekannt[i];
      if (kern.indexOf(k) !== 0) continue;
      var rest = kern.slice(k.length).match(/^([A-Z]{1,2})(\d{1,4})([EH]?)$/);
      if (rest) return k + "-" + rest[1] + " " + rest[2] + rest[3];
    }

    var m = kern.match(/^([A-ZÄÖÜ]{1,3})([A-Z]{1,2})(\d{1,4})([EH]?)$/);
    if (!m) return text;
    return m[1] + "-" + m[2] + " " + m[3] + m[4];
  }

  function baueKuerzel() {
    var leiste = q("kfz-kuerzel");
    leiste.innerHTML = "";
    KUERZEL.forEach(function (k) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = k;
      b.addEventListener("click", function () {
        var feld = q("input-vehicle-plate");
        var rest = feld.value.replace(/^[A-ZÄÖÜ]{1,3}\s*-?\s*/i, "");
        feld.value = k + "-" + rest;
        markiereKuerzel();
        feld.focus();
        /* Hinter den Bindestrich setzen, damit man direkt weitertippt. */
        var pos = feld.value.length;
        try { feld.setSelectionRange(pos, pos); } catch (e) { /* egal */ }
      });
      leiste.appendChild(b);
    });
  }

  function markiereKuerzel() {
    var wert = q("input-vehicle-plate").value.toUpperCase();
    q("kfz-kuerzel").querySelectorAll("button").forEach(function (b) {
      b.classList.toggle("aktiv", wert.indexOf(b.textContent + "-") === 0);
    });
  }

  /* Fahrzeugbild: klein halten. Es steht als Miniatur in der Übersicht, mehr
     als 640 px sieht dort niemand — und jedes Kilobyte zählt gegen den
     Speicherplatz. */
  var BILD_MAX = 640;
  var bildEntwurf = "";

  function verkleinere(datei) {
    return new Promise(function (fertig, fehler) {
      var leser = new FileReader();
      leser.onerror = function () { fehler(new Error("Datei nicht lesbar")); };
      leser.onload = function () {
        var bild = new Image();
        bild.onerror = function () { fehler(new Error("Kein gültiges Bild")); };
        bild.onload = function () {
          var b = bild.width, h = bild.height;
          if (b > BILD_MAX || h > BILD_MAX) {
            var f = BILD_MAX / Math.max(b, h);
            b = Math.round(b * f);
            h = Math.round(h * f);
          }
          var flaeche = document.createElement("canvas");
          flaeche.width = b;
          flaeche.height = h;
          flaeche.getContext("2d").drawImage(bild, 0, 0, b, h);
          fertig(flaeche.toDataURL("image/jpeg", 0.75));
        };
        bild.src = leser.result;
      };
      leser.readAsDataURL(datei);
    });
  }

  function zeigeFahrzeugbild() {
    var box = q("vehicle-photo-preview");
    box.innerHTML = bildEntwurf
      ? '<img src="' + bildEntwurf + '" alt="Fahrzeugbild">'
      : '<span>kein Bild</span>';
    q("btn-vehicle-photo-clear").classList.toggle("hidden", !bildEntwurf);
  }

  /* Schnellauswahl Hersteller → Modell. Sie schreibt nur in die Bezeichnung;
     gespeichert wird weiterhin ausschliesslich dieser eine Text. */
  /* Kalendereintrag statt Push: eine .ics-Datei mit zwei Weckern wandert in
     den Kalender des Geräts. Der erinnert danach von allein — auch wenn die
     App wochenlang nicht geöffnet wird. Für echte Push-Nachrichten bräuchte
     es einen Server, der läuft; für zwei Termine im Jahr wäre das absurd. */
  function huKalender(v) {
    if (!v.hu) {
      alert("Für dieses Fahrzeug ist kein HU-Termin hinterlegt.\n\n" +
        "Trag ihn über den Stift neben dem Namen ein.");
      return;
    }
    var ende = huLetzterTag(v.hu);
    if (!ende) {
      alert("Der HU-Eintrag ist unvollständig. Bitte Monat und Jahr eintragen.");
      return;
    }
    /* Termin auf den letzten Tag des Monats — das ist der Stichtag. */
    var tag = ende.getFullYear() +
      String(ende.getMonth() + 1).padStart(2, "0") +
      String(ende.getDate()).padStart(2, "0");
    var tageBisErster = ende.getDate() - 1;

    function stempel(d) {
      return d.getUTCFullYear() +
        String(d.getUTCMonth() + 1).padStart(2, "0") +
        String(d.getUTCDate()).padStart(2, "0") + "T" +
        String(d.getUTCHours()).padStart(2, "0") +
        String(d.getUTCMinutes()).padStart(2, "0") + "00Z";
    }

    /* Zwei Wecker, relativ zum Termin — die rechnet der Kalender selbst aus:
       einer am Ersten des Fälligkeitsmonats, einer zwei Wochen vorher. */
    var titel = "HU fällig " + huMonatText(v.hu) + " — " + v.name +
      (v.plate ? " (" + v.plate + ")" : "");
    var zeilen = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Autovermietung Jansen//Schadenmanager//DE",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      "UID:hu-" + v.id + "-" + tag + "@schadenmanager",
      "DTSTAMP:" + stempel(new Date()),
      "DTSTART;VALUE=DATE:" + tag,
      "DTEND;VALUE=DATE:" + tag,
      "SUMMARY:" + titel,
      "DESCRIPTION:Hauptuntersuchung faellig im " + huMonatText(v.hu) +
        ", spaetestens am " + ende.toLocaleDateString("de-DE") + ".\\n" +
        (v.plate || v.name) + (v.vin ? "\\nVIN " + v.vin : "") +
        "\\nEingetragen aus dem Schadenmanager.",
      "BEGIN:VALARM",
      "TRIGGER:-P" + tageBisErster + "D",
      "ACTION:DISPLAY",
      "DESCRIPTION:" + titel + " — diesen Monat",
      "END:VALARM",
      "BEGIN:VALARM",
      "TRIGGER:-P14D",
      "ACTION:DISPLAY",
      "DESCRIPTION:" + titel + " — in zwei Wochen",
      "END:VALARM",
      "END:VEVENT",
      "END:VCALENDAR"
    ];

    var blob = new Blob([zeilen.join("\r\n")], { type: "text/calendar;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "HU-" + (v.plate || v.name).replace(/[^A-Za-z0-9]+/g, "-") + ".ics";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  function fuelleMarken() {
    var sel = q("input-marke");
    sel.innerHTML = '<option value="">— wählen —</option>';
    App.Modelle.hersteller().forEach(function (m) {
      var o = document.createElement("option");
      o.value = m;
      o.textContent = m;
      sel.appendChild(o);
    });
    var andere = document.createElement("option");
    andere.value = "__frei";
    andere.textContent = "Anderer Hersteller …";
    sel.appendChild(andere);
  }

  function fuelleModelle(marke) {
    var sel = q("input-modell");
    sel.innerHTML = "";
    var liste = App.Modelle.modelle(marke);

    if (!marke || marke === "__frei" || !liste.length) {
      sel.innerHTML = '<option value="">—</option>';
      sel.disabled = true;
      return;
    }
    sel.disabled = false;
    sel.innerHTML = '<option value="">— wählen —</option>';
    liste.forEach(function (m) {
      var o = document.createElement("option");
      o.value = m;
      o.textContent = m;
      sel.appendChild(o);
    });
    var anderes = document.createElement("option");
    anderes.value = "__frei";
    anderes.textContent = "Anderes Modell …";
    sel.appendChild(anderes);
  }

  /* Bezeichnung aus der Auswahl zusammensetzen. Ein bereits eingetippter Zusatz
     wie "#3" bleibt erhalten — sonst wäre die Hilfe eine Belästigung. */
  function uebernehmeAuswahl() {
    var marke = q("input-marke").value;
    var modell = q("input-modell").value;
    if (!marke || marke === "__frei") return;

    var feld = q("input-vehicle-name");
    var zusatz = "";
    /* Was hinter dem bisher erzeugten Namen steht, ist von Hand ergänzt. */
    if (letzterVorschlag && feld.value.indexOf(letzterVorschlag) === 0) {
      zusatz = feld.value.slice(letzterVorschlag.length);
    }
    var neu = marke + (modell && modell !== "__frei" ? " " + modell : "");
    letzterVorschlag = neu;
    feld.value = neu + zusatz;
  }

  var letzterVorschlag = "";

  function fuelleKategorieAuswahl(gewaehlt) {
    var sel = q("input-vehicle-category");
    sel.innerHTML = '<option value="">— ohne Kategorie —</option>';
    Store.categories().forEach(function (k) {
      var o = document.createElement("option");
      o.value = k.id;
      o.textContent = k.name;
      sel.appendChild(o);
    });
    sel.value = gewaehlt || "";
  }

  function openVehicleModal(editId) {
    editingVehicleId = editId;
    var nameInput = q("input-vehicle-name");
    var plateInput = q("input-vehicle-plate");
    if (editId) {
      var v = Store.getVehicle(editId);
      q("vehicle-modal-title").textContent = "Fahrzeug bearbeiten";
      nameInput.value = v.name;
      plateInput.value = v.plate || "";
      fuelleKategorieAuswahl(v.categoryId);
      q("input-vehicle-vin").value = v.vin || "";
      q("input-vehicle-hu").value = v.hu || "";
      bildEntwurf = v.photo || "";
      q("input-vehicle-hidden").checked = !!v.hidden;
      q("input-vehicle-zustand").checked = !!v.zustand;
    } else {
      q("vehicle-modal-title").textContent = "Fahrzeug hinzufügen";
      nameInput.value = "";
      plateInput.value = "";
      /* Steht ein Filter auf einer Kategorie, ist das neue Fahrzeug mit hoher
         Wahrscheinlichkeit auch eins davon. */
      fuelleKategorieAuswahl(filterKategorie);
      q("input-vehicle-vin").value = "";
      q("input-vehicle-hu").value = "";
      bildEntwurf = "";
      q("input-vehicle-hidden").checked = false;
      q("input-vehicle-zustand").checked = false;
    }
    zeigeFahrzeugbild();
    /* Beim Bearbeiten steht die Bezeichnung schon — die Schnellauswahl fängt
       dann leer an und mischt sich nicht ein. */
    letzterVorschlag = "";
    baueKuerzel();
    markiereKuerzel();
    fuelleMarken();
    q("input-marke").value = "";
    fuelleModelle("");

    q("modal-vehicle").classList.remove("hidden");
    nameInput.focus();
  }

  function submitVehicle(e) {
    e.preventDefault();
    var name = q("input-vehicle-name").value.trim();
    var plate = formatiereKennzeichen(q("input-vehicle-plate").value);
    if (!name) return;

    var daten = {
      name: name,
      plate: plate,
      vin: q("input-vehicle-vin").value.trim().toUpperCase(),
      hu: q("input-vehicle-hu").value,
      photo: bildEntwurf,
      categoryId: q("input-vehicle-category").value,
      hidden: q("input-vehicle-hidden").checked,
      zustand: q("input-vehicle-zustand").checked
    };
    var op = editingVehicleId
      ? Store.updateVehicle(editingVehicleId, daten)
      : Store.addVehicle(daten);

    op.then(function () {
      q("modal-vehicle").classList.add("hidden");
      if (App.Nav.current() === "vehicle") renderVehicle();
      else renderFleet();
    });
  }

  /* Zwei Wege aus dem Bestand — und der harmlose ist der voreingestellte.
     Ein Leasingfahrzeug ist weg, aber die Schadensfrage klärt sich manchmal
     erst Wochen später. Deshalb Archiv statt Papierkorb. */
  function deleteCurrentVehicle() {
    var v = Store.getVehicle(currentVehicleId);
    if (!v) return;

    if (v.archived) {
      if (!confirm('"' + v.name + '" ist archiviert.\n\nWieder in den Fuhrpark holen?')) return;
      Store.archiviere(v.id, false).then(function () {
        App.Nav.go("fleet");
        renderFleet();
      });
      return;
    }

    var anzahl = Store.damagesOf(v.id).length;
    var archivieren = confirm(
      '"' + v.name + '" aus dem Fuhrpark nehmen?\n\n' +
      "OK  —  ins Archiv verschieben. Fahrzeug und alle " + anzahl +
      " Einträge bleiben erhalten und bleiben auffindbar.\n\n" +
      "Abbrechen  —  nichts tun.");
    if (!archivieren) return;

    Store.archiviere(v.id, true).then(function () {
      App.Nav.go("fleet");
      renderFleet();
    });
  }

  /* Endgültig löschen liegt bewusst nicht auf dem Hauptweg. */
  function loescheFahrzeugEndgueltig() {
    var v = Store.getVehicle(currentVehicleId);
    if (!v) return;
    var anzahl = Store.damagesOf(v.id).length;
    if (!confirm('"' + v.name + '" mit ' + anzahl + " Einträgen endgültig löschen?\n\n" +
      "Die Fotos sind danach auch auf den anderen Geräten weg. " +
      "Festgehaltene Schadensstände bleiben erhalten.")) return;
    if (!confirm("Wirklich? Das lässt sich nur über eine Sicherungsdatei rückgängig machen.")) return;
    Store.deleteVehicle(v.id).then(function () {
      App.Nav.go("fleet");
      renderFleet();
    });
  }

  var ANLAESSE = {
    uebergabe: "Übergabe an den Mieter",
    rueckgabe: "Rückgabe",
    zwischen: "Zwischenstand",
    uebernahme: "Übernahme ins Vermietgeschäft",
    sonstiges: "Sonstiges"
  };

  function anlassText(schluessel) {
    return ANLAESSE[schluessel] || "Zustandsaufnahme";
  }

  /* Tausenderpunkte — 84500 liest sich schlechter als 84.500. */
  function kmText(km) {
    var zahl = parseInt(String(km).replace(/[^0-9]/g, ""), 10);
    if (isNaN(zahl)) return "";
    return zahl.toLocaleString("de-DE") + " km";
  }

  /* Wie weit ist die HU noch weg? Ab acht Wochen wird es gelb, ab dem
     Fälligkeitstag rot. */
  /* Die HU gilt bis zum Monatsende — das ist der Stichtag, nicht irgendein
     Tag mittendrin. */
  function huLetzterTag(hu) {
    var m = String(hu || "").match(/^(\d{4})-(\d{2})$/);
    if (!m) return null;
    /* Tag 0 des Folgemonats ist der letzte Tag des gesuchten. */
    return new Date(Number(m[1]), Number(m[2]), 0, 23, 59, 59);
  }

  function huMonatText(hu) {
    var m = String(hu || "").match(/^(\d{4})-(\d{2})$/);
    return m ? m[2] + "/" + m[1] : "";
  }

  function huStand(v) {
    var ende = huLetzterTag(v.hu);
    if (!ende) return null;
    var tage = Math.ceil((ende - new Date()) / 86400000);
    return {
      tage: tage,
      monat: huMonatText(v.hu),
      ende: ende,
      klasse: tage < 0 ? "faellig" : (tage <= 56 ? "bald" : ""),
      text: tage < 0
        ? "HU " + huMonatText(v.hu) + " überfällig"
        : (tage <= 56
          ? "HU " + huMonatText(v.hu) + " · noch " + tage + (tage === 1 ? " Tag" : " Tage")
          : "HU " + huMonatText(v.hu))
    };
  }

  var STANDTEXT = {
    offen: "Offen",
    ausgebessert: "Ausgebessert",
    repariert: "Repariert",
    bleibt: "Bleibt so"
  };

  /* Beträge werden ausgeblendet, wenn ein Kunde mitguckt — deshalb geht jede
     Anzeige durch diese eine Stelle. */
  function euro(wert) {
    if (typeof wert !== "number") return "—";
    if (!App.Einstellungen.betraegeSichtbar()) return "••••";
    return wert.toLocaleString("de-DE", {
      style: "currency", currency: "EUR",
      minimumFractionDigits: 0, maximumFractionDigits: 2
    });
  }

  // -------------------------------------------------------------- Detailansicht

  /* Ohne Art liefert damagesOf beide Sorten — die Detailansicht ist für
     Schaden und Zustandsaufnahme dieselbe. */
  function findeEintrag(id) {
    return Store.damagesOf(currentVehicleId).find(function (x) {
      return x.id === id;
    }) || null;
  }

  function openDetail(damageId) {
    var d = findeEintrag(damageId);
    if (!d) return;
    currentDamageId = damageId;
    var bilder = d.images || [];

    q("detail-img").src = bilder[0] || "";
    zeigeMiniaturen(bilder);

    var istZustand = d.kind === "zustand";
    var zusatz = [];
    if (!istZustand) zusatz.push("Nr. " + Store.schadenNummer(currentVehicleId, d));
    if (istZustand) zusatz.push(anlassText(d.anlass));
    if (!istZustand && d.count > 1) zusatz.push(d.count + " Schäden auf diesem Eintrag");
    if (bilder.length > 1) zusatz.push(bilder.length + " Fotos");
    if (d.km) zusatz.push(kmText(d.km));
    if (d.area) zusatz.push((istZustand ? "Motiv: " : "Bereich: ") + d.area);
    q("detail-date").textContent = fmtDamageDateLong(d) +
      (zusatz.length ? " · " + zusatz.join(" · ") : "");

    q("detail-note-input").value = d.description || "";
    q("detail-note-input").disabled = false;

    /* Zustandsaufnahmen haben keine Kosten und keinen Stand. */
    q("detail-intern").classList.toggle("hidden", istZustand);
    if (!istZustand) {
      q("detail-status").value = d.status || "offen";
      q("detail-schaetzung").value = d.schaetzung === null ? "" : String(d.schaetzung);
      q("detail-zahlung").value = d.zahlung === null ? "" : String(d.zahlung);
      q("detail-kosten").value = d.kosten === null ? "" : String(d.kosten);
      q("detail-vertrag").value = d.vertragsnr || "";
      q("detail-regulierung").value = d.regulierung || "mieter";
      q("detail-erstattung").value = d.erstattung === null ? "" : String(d.erstattung);
      zeigeErstattungsfeld();
      zeigeSaldo(d);
    }
    q("btn-save-note").classList.remove("hidden");
    q("btn-edit-damage").classList.remove("hidden");
    q("btn-delete-damage").classList.remove("hidden");
    q("modal-detail").classList.remove("hidden");
  }

  /* Bei mehreren Fotos: Streifen unter dem grossen Bild zum Umschalten. */
  /* Das Erstattungsfeld erscheint nur, wenn überhaupt eine Versicherung im
     Spiel ist. Im Regelfall — Mieter zahlt — ist es nur im Weg. */
  function zeigeErstattungsfeld() {
    var art = q("detail-regulierung").value;
    var mitVersicherung = art === "kasko" || art === "teilkasko" || art === "haftpflicht";
    q("detail-erstattung-row").classList.toggle("hidden", !mitVersicherung);
    q("hinweis-erstattung").classList.toggle("hidden", !mitVersicherung);
  }

  /* Was unter dem Strich bei diesem einen Schaden herauskommt. */
  function zeigeSaldo(d) {
    var kasten = q("detail-saldo");
    var hatZahlen = typeof d.zahlung === "number" ||
      typeof d.kosten === "number" || typeof d.erstattung === "number";
    if (!hatZahlen) {
      kasten.className = "note-box";
      kasten.textContent = "Noch nichts eingetragen.";
      return;
    }
    var ein = (typeof d.zahlung === "number" ? d.zahlung : 0) +
      (typeof d.erstattung === "number" ? d.erstattung : 0);
    var aus = typeof d.kosten === "number" ? d.kosten : 0;
    var saldo = ein - aus;

    var teile = ["Mieter " + euro(d.zahlung)];
    if (typeof d.erstattung === "number") teile.push("Versicherung " + euro(d.erstattung));
    teile.push("Reparatur " + euro(d.kosten));
    teile.push(saldo < 0
      ? "Bleibt an mir " + euro(Math.abs(saldo))
      : (saldo === 0 ? "Gedeckt" : "Gedeckt, " + euro(saldo) + " darüber"));

    kasten.className = "note-box " + (saldo < 0 ? "warn" : "ok");
    kasten.textContent = teile.join(" · ");
  }

  function speichereIntern() {
    var d = findeEintrag(currentDamageId);
    if (!d) return;
    Store.updateDamage(currentVehicleId, d.id, {
      description: q("detail-note-input").value.trim(),
      status: q("detail-status").value,
      schaetzung: q("detail-schaetzung").value,
      zahlung: q("detail-zahlung").value,
      kosten: q("detail-kosten").value,
      vertragsnr: q("detail-vertrag").value.trim()
    }).then(function () {
      zeigeSaldo(findeEintrag(currentDamageId));
      renderVehicle();
      q("modal-detail").classList.add("hidden");
    });
  }

  function zeigeMiniaturen(bilder) {
    var wrap = q("detail-thumbs");
    wrap.innerHTML = "";
    wrap.classList.toggle("hidden", bilder.length < 2);
    if (bilder.length < 2) return;
    bilder.forEach(function (src, i) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "detail-thumb" + (i === 0 ? " active" : "");
      b.innerHTML = '<img src="' + src + '" alt="Foto ' + (i + 1) + '">';
      b.addEventListener("click", function () {
        q("detail-img").src = src;
        wrap.querySelectorAll(".detail-thumb").forEach(function (x) {
          x.classList.remove("active");
        });
        b.classList.add("active");
      });
      wrap.appendChild(b);
    });
  }

  function editCurrentDamage() {
    var d = findeEintrag(currentDamageId);
    var v = Store.getVehicle(currentVehicleId);
    if (!d || !v) return;
    q("modal-detail").classList.add("hidden");
    App.Annotate.open({
      title: (d.kind === "zustand" ? "Zustandsaufnahme bearbeiten — " : "Schaden bearbeiten — ") + v.name,
      damage: d,
      art: d.kind,
      onSave: function (payload) {
        Store.updateDamage(currentVehicleId, d.id, {
          images: payload.images,
          count: payload.count,
          description: payload.description,
          date: payload.date,
          dateMode: payload.dateMode,
          area: payload.area
        }).then(renderVehicle);
      }
    });
  }

  /* Ein Speichern-Knopf für den ganzen Dialog. Zwei getrennte wären eine
     Falle: man tippt oben etwas ein, drückt unten und wundert sich. */
  function saveDetailNote() {
    var d = findeEintrag(currentDamageId);
    var patch = { description: q("detail-note-input").value.trim() };
    if (d && d.kind !== "zustand") {
      patch.status = q("detail-status").value;
      patch.schaetzung = q("detail-schaetzung").value;
      patch.zahlung = q("detail-zahlung").value;
      patch.kosten = q("detail-kosten").value;
      patch.vertragsnr = q("detail-vertrag").value.trim();
      patch.regulierung = q("detail-regulierung").value;
      patch.erstattung = q("detail-erstattung").value;
    }
    Store.updateDamage(currentVehicleId, currentDamageId, patch).then(function () {
      q("modal-detail").classList.add("hidden");
      renderVehicle();
    });
  }

  function deleteCurrentDamage() {
    if (!confirm("Dieses Schadensbild aus dem Register löschen?\n\n" +
      "Bereits festgehaltene Schadensstände behalten ihre Kopie.")) return;
    Store.deleteDamage(currentVehicleId, currentDamageId).then(function () {
      q("modal-detail").classList.add("hidden");
      renderVehicle();
    });
  }

  // ------------------------------------------------------------ Schadenübersicht

  /* Heisst nach aussen "Schadenübersicht"; im Code tragen Funktionen und
     CSS-Klassen noch das kürzere "akte" — gemeint ist dasselbe Dokument.
     Bewusst OHNE Kennung: das ist kein Nachweis, sondern eine Auskunft für
     den Kunden. Der Nachweis bleibt der eingefrorene Schadensstand. */
  /* Erzeugt die PDF-Datei selbst statt über den Druckdialog zu gehen. Der
     setzt Adresse und Datum in die Seitenränder, und am iPad lässt sich das
     nicht abstellen — ein Dokument für Kunden soll die interne Adresse nicht
     preisgeben. */
  function druckeAkte() {
    var v = Store.getVehicle(currentVehicleId);
    if (!v) return;
    var knopf = q("btn-vehicle-doc");
    var beschriftung = knopf.textContent;
    knopf.disabled = true;
    knopf.textContent = "Erzeuge PDF …";

    setTimeout(function () {
      try {
        var ergebnis = App.Uebersicht.erzeuge(v, Store.damagesOf(v.id, "schaden"), Store.damageCount(v.id));
        ergebnis.doc.speichern(ergebnis.name);
      } catch (err) {
        alert("Die PDF-Datei konnte nicht erzeugt werden.\n\n" + (err.message || err));
        console.error(err);
      }
      knopf.disabled = false;
      knopf.textContent = beschriftung;
    }, 30);
  }

  App.Fleet = {
    bind: bind,
    druckeAkte: druckeAkte,
    renderFleet: renderFleet,
    _filter: function () {
      return { kategorie: filterKategorie, versteckte: zeigeVersteckte, archiv: zeigeArchiv };
    },
    _huKalender: huKalender,
    _formatiereKennzeichen: formatiereKennzeichen,
    _huStand: huStand,
    _huLetzterTag: huLetzterTag,
    loescheFahrzeugEndgueltig: loescheFahrzeugEndgueltig,
    renderVehicle: renderVehicle,
    openVehicle: openVehicle,
    _openDetail: openDetail,
    currentVehicleId: function () { return currentVehicleId; },
    esc: esc,
    fmtDate: fmtDate,
    fmtStamp: fmtStamp,
    fmtDamageDate: fmtDamageDate,
    fmtDamageDateLong: fmtDamageDateLong
  };

})(window.App = window.App || {});
