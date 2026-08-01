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
    q("btn-delete-damage").addEventListener("click", deleteCurrentDamage);
    q("btn-edit-damage").addEventListener("click", editCurrentDamage);
    q("btn-add-vehicle").addEventListener("click", function () { openVehicleModal(null); });
    q("btn-vehicle-doc").addEventListener("click", function () { druckeAkte(); });

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

    if (!kats.length && !versteckt) {
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
  }

  function renderFleet() {
    renderFilter();
    var grid = q("fleet-grid");
    grid.innerHTML = "";
    var list = Store.vehicles({ kategorie: filterKategorie, mitVersteckten: zeigeVersteckte });

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
            '<h3>' + esc(v.name) +
              (v.hidden ? ' <span class="klappe-zahl">ausgeblendet</span>' : '') + '</h3>' +
            '<div class="plate">' + esc(v.plate || "kein Kennzeichen") + '</div>' +
            (kat ? '<div class="fz-kat">' + esc(kat) + '</div>' : '') +
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

    var zeile = [];
    var katName = Store.categoryName(v.categoryId);
    if (katName) zeile.push(esc(katName));
    if (v.vin) zeile.push('VIN <span class="mono">' + esc(v.vin) + "</span>");
    q("vehicle-meta").innerHTML = zeile.join(" · ");
    q("vehicle-meta").classList.toggle("hidden", !zeile.length);

    zeigeBilanz(v);
    fuelleRaster(q("damage-grid"), v, "schaden");

    /* Zustandsaufnahmen nur, wenn sie für dieses Fahrzeug eingeschaltet sind —
       bei einem Bestandsfahrzeug mit lauter Altschäden wären sie nur im Weg. */
    q("zustand-block").classList.toggle("hidden", !v.zustand);
    if (v.zustand) fuelleRaster(q("zustand-grid"), v, "zustand");

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
    var b = Store.bilanz(v.id);
    var etwasDa = b.zahlungen || b.kosten || b.offeneSchaetzung;
    kasten.classList.toggle("hidden", !etwasDa);
    if (!etwasDa) return;

    kasten.innerHTML =
      '<div class="bilanz-zeile"><span>Von Mietern erhalten</span>' +
        '<span class="bilanz-wert ein">' + euro(b.zahlungen) + '</span></div>' +
      '<div class="bilanz-zeile"><span>Reparaturen bezahlt</span>' +
        '<span class="bilanz-wert aus">' + euro(b.kosten) + '</span></div>' +
      '<div class="bilanz-zeile summe"><span>Differenz</span>' +
        '<span class="bilanz-wert ' + (b.differenz < 0 ? "aus" : "ein") + '">' +
        euro(b.differenz) + '</span></div>' +
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
        '<div class="meta">' + esc(fmtDamageDate(d)) +
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
      bildEntwurf = "";
      q("input-vehicle-hidden").checked = false;
      q("input-vehicle-zustand").checked = false;
    }
    zeigeFahrzeugbild();
    q("modal-vehicle").classList.remove("hidden");
    nameInput.focus();
  }

  function submitVehicle(e) {
    e.preventDefault();
    var name = q("input-vehicle-name").value.trim();
    var plate = q("input-vehicle-plate").value.trim();
    if (!name) return;

    var daten = {
      name: name,
      plate: plate,
      vin: q("input-vehicle-vin").value.trim().toUpperCase(),
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

  function deleteCurrentVehicle() {
    var v = Store.getVehicle(currentVehicleId);
    if (!v) return;
    var count = Store.damagesOf(v.id).length;
    if (!confirm('Fahrzeug "' + v.name + '" inkl. ' + count +
      ' Schadensbildern löschen?\n\nFestgehaltene Schadensstände bleiben erhalten.')) return;
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
      zeigeSaldo(d);
    }
    q("btn-save-note").classList.remove("hidden");
    q("btn-edit-damage").classList.remove("hidden");
    q("btn-delete-damage").classList.remove("hidden");
    q("modal-detail").classList.remove("hidden");
  }

  /* Bei mehreren Fotos: Streifen unter dem grossen Bild zum Umschalten. */
  /* Was unter dem Strich bei diesem einen Schaden herauskommt. */
  function zeigeSaldo(d) {
    var kasten = q("detail-saldo");
    var hatZahlen = typeof d.zahlung === "number" || typeof d.kosten === "number";
    if (!hatZahlen) {
      kasten.className = "note-box";
      kasten.textContent = "Noch nichts eingetragen.";
      return;
    }
    var ein = typeof d.zahlung === "number" ? d.zahlung : 0;
    var aus = typeof d.kosten === "number" ? d.kosten : 0;
    var saldo = ein - aus;
    kasten.className = "note-box " + (saldo < 0 ? "warn" : "ok");
    kasten.textContent = "Erhalten " + euro(d.zahlung) + " · Reparatur " + euro(d.kosten) +
      " · " + (saldo < 0 ? "Draufgezahlt " : "Übrig ") + euro(Math.abs(saldo));
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
    _filter: function () { return { kategorie: filterKategorie, versteckte: zeigeVersteckte }; },
    renderVehicle: renderVehicle,
    openVehicle: openVehicle,
    currentVehicleId: function () { return currentVehicleId; },
    esc: esc,
    fmtDate: fmtDate,
    fmtStamp: fmtStamp,
    fmtDamageDate: fmtDamageDate,
    fmtDamageDateLong: fmtDamageDateLong
  };

})(window.App = window.App || {});
