/* fleet.js — Fuhrpark und Schadensregister */
(function (App) {
  "use strict";

  var Store;
  var currentVehicleId = null;
  var currentDamageId = null;
  var editingVehicleId = null;

  function q(id) { return App.el(id, "fleet.js"); }

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
  }

  // -------------------------------------------------------------- Fuhrpark

  function renderFleet() {
    var grid = q("fleet-grid");
    grid.innerHTML = "";
    var list = Store.vehicles();

    if (!list.length) {
      var hint = document.createElement("div");
      hint.className = "empty-hint";
      hint.style.gridColumn = "1/-1";
      hint.textContent = "Noch keine Fahrzeuge angelegt.";
      grid.appendChild(hint);
    }

    list.forEach(function (v) {
      var anzahl = Store.damageCount(v.id);       // Summe, nicht Einträge
      var eintraege = Store.damagesOf(v.id).length;
      var staende = Store.snapshots(v.id).length;
      var card = document.createElement("div");
      card.className = "vehicle-card";
      card.innerHTML =
        '<h3>' + esc(v.name) + '</h3>' +
        '<div class="plate">' + esc(v.plate || "kein Kennzeichen hinterlegt") + '</div>' +
        '<span class="chip' + (anzahl === 0 ? " zero" : "") + '">' + anzahl +
        (anzahl === 1 ? " Schaden" : " Schäden") + '</span>' +
        (eintraege && eintraege !== anzahl
          ? '<span class="chip ghost">' + eintraege + " Einträge</span>" : "") +
        (staende ? '<span class="chip ghost">' + staende + " Stände</span>" : "");
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

    var grid = q("damage-grid");
    grid.innerHTML = "";

    Store.damagesOf(v.id).forEach(function (d) {
      var bilder = d.images || [];
      var card = document.createElement("div");
      card.className = "damage-card";
      card.innerHTML =
        '<div class="dc-img">' +
          '<img src="' + (bilder[0] || "") + '" alt="Schaden" loading="lazy">' +
          (bilder.length > 1 ? '<span class="dc-badge">' + bilder.length + ' Fotos</span>' : '') +
          (d.count > 1 ? '<span class="dc-badge count">' + d.count + ' Schäden</span>' : '') +
        '</div>' +
        '<div class="meta">' + esc(fmtDamageDate(d)) + (d.area ? " · " + esc(d.area) : "") + '</div>' +
        '<div class="note">' + esc(d.description || "(keine Beschreibung)") + '</div>';
      card.addEventListener("click", function () { openDetail(d.id); });
      grid.appendChild(card);
    });

    var add = document.createElement("div");
    add.className = "add-tile";
    add.textContent = "+ Schaden hinzufügen";
    add.addEventListener("click", function () {
      App.Annotate.open({
        title: "Schaden erfassen — " + v.name,
        onSave: function (payload) {
          Store.addDamage(v.id, payload).then(renderVehicle);
        }
      });
    });
    grid.appendChild(add);

    App.Snapshot.renderList();
  }

  // -------------------------------------------------------------- Fahrzeug-Dialog

  function openVehicleModal(editId) {
    editingVehicleId = editId;
    var nameInput = q("input-vehicle-name");
    var plateInput = q("input-vehicle-plate");
    if (editId) {
      var v = Store.getVehicle(editId);
      q("vehicle-modal-title").textContent = "Fahrzeug bearbeiten";
      nameInput.value = v.name;
      plateInput.value = v.plate || "";
    } else {
      q("vehicle-modal-title").textContent = "Fahrzeug hinzufügen";
      nameInput.value = "";
      plateInput.value = "";
    }
    q("modal-vehicle").classList.remove("hidden");
    nameInput.focus();
  }

  function submitVehicle(e) {
    e.preventDefault();
    var name = q("input-vehicle-name").value.trim();
    var plate = q("input-vehicle-plate").value.trim();
    if (!name) return;

    var op = editingVehicleId
      ? Store.updateVehicle(editingVehicleId, { name: name, plate: plate })
      : Store.addVehicle({ name: name, plate: plate });

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

  // -------------------------------------------------------------- Detailansicht

  function openDetail(damageId) {
    var d = Store.damagesOf(currentVehicleId).find(function (x) { return x.id === damageId; });
    if (!d) return;
    currentDamageId = damageId;
    var bilder = d.images || [];

    q("detail-img").src = bilder[0] || "";
    zeigeMiniaturen(bilder);

    var zusatz = [];
    if (d.count > 1) zusatz.push(d.count + " Schäden auf diesem Eintrag");
    if (bilder.length > 1) zusatz.push(bilder.length + " Fotos");
    if (d.area) zusatz.push("Bereich: " + d.area);
    q("detail-date").textContent = fmtDamageDateLong(d) +
      (zusatz.length ? " · " + zusatz.join(" · ") : "");

    q("detail-note-input").value = d.description || "";
    q("detail-note-input").disabled = false;
    q("btn-save-note").classList.remove("hidden");
    q("btn-edit-damage").classList.remove("hidden");
    q("btn-delete-damage").classList.remove("hidden");
    q("modal-detail").classList.remove("hidden");
  }

  /* Bei mehreren Fotos: Streifen unter dem grossen Bild zum Umschalten. */
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
    var d = Store.damagesOf(currentVehicleId).find(function (x) { return x.id === currentDamageId; });
    var v = Store.getVehicle(currentVehicleId);
    if (!d || !v) return;
    q("modal-detail").classList.add("hidden");
    App.Annotate.open({
      title: "Schaden bearbeiten — " + v.name,
      damage: d,
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

  function saveDetailNote() {
    Store.updateDamage(currentVehicleId, currentDamageId,
      { description: q("detail-note-input").value.trim() }
    ).then(function () {
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

  // -------------------------------------------------------------- Fahrzeugakte

  /* Übersicht für den Kunden — grosse Bilder, Beschreibung, Bereich.
     Bewusst OHNE Kennung: das ist kein Nachweis, sondern eine Auskunft.
     Der Nachweis bleibt der eingefrorene Schadensstand. */
  function akteHtml(v) {
    var schaeden = Store.damagesOf(v.id);
    var gesamt = Store.damageCount(v.id);
    var jetzt = new Date();

    var h = '<div class="doc">';
    h += '<div class="doc-head">' +
      '<div><div class="doc-brand">Autovermietung Jansen</div>' +
      '<div class="doc-brand-sub">Berliner Allee 14 · 37154 Northeim</div></div>' +
      '<div class="doc-type">Fahrzeugakte</div></div>';

    h += '<table class="doc-table">' +
      '<tr><th>Fahrzeug</th><td>' + esc(v.name) + '</td></tr>' +
      (v.plate ? '<tr><th>Kennzeichen</th><td><strong>' + esc(v.plate) + '</strong></td></tr>' : '') +
      '<tr><th>Dokumentierte Schäden</th><td>' + gesamt +
        (schaeden.length !== gesamt ? ' (in ' + schaeden.length + ' Einträgen)' : '') + '</td></tr>' +
      '<tr><th>Stand</th><td>' + jetzt.toLocaleDateString("de-DE") + ', ' +
        jetzt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) + '</td></tr>' +
      '</table>';

    if (!schaeden.length) {
      h += '<p class="doc-text">Für dieses Fahrzeug sind derzeit keine Schäden dokumentiert.</p>';
    } else {
      schaeden.forEach(function (d, i) {
        h += '<div class="akte-eintrag">';
        h += '<h3 class="akte-titel"><span class="dmg-no">' + (i + 1) + '</span> ' +
          (d.area ? esc(d.area) : "ohne Bereichsangabe") +
          (d.count > 1 ? ' <span class="akte-anzahl">' + d.count + ' Schäden</span>' : '') +
          '</h3>';
        h += '<div class="akte-meta">' + esc(fmtDamageDateLong(d)) + '</div>';
        h += '<p class="akte-text">' + esc(d.description || "Keine Beschreibung hinterlegt.") + '</p>';
        h += '<div class="akte-bilder">';
        (d.images || []).forEach(function (src, j) {
          h += '<figure class="akte-bild"><img src="' + src + '" alt="Schaden ' +
            (i + 1) + ", Foto " + (j + 1) + '"></figure>';
        });
        h += '</div></div>';
      });
    }

    h += '<div class="doc-foot">Übersicht der dokumentierten Schäden · erstellt am ' +
      jetzt.toLocaleDateString("de-DE") + '</div>';
    h += '</div>';
    return h;
  }

  function druckeAkte() {
    var v = Store.getVehicle(currentVehicleId);
    if (!v) return;
    q("print-area").innerHTML = akteHtml(v);

    var alt = document.title;
    document.title = "Fahrzeugakte_" + (v.plate || v.name).replace(/[^\w-]+/g, "_") +
      "_" + new Date().toISOString().slice(0, 10);

    var zurueck = function () {
      document.title = alt;
      window.removeEventListener("afterprint", zurueck);
    };
    window.addEventListener("afterprint", zurueck);
    setTimeout(function () { window.print(); setTimeout(zurueck, 1500); }, 400);
  }

  App.Fleet = {
    bind: bind,
    akteHtml: akteHtml,
    druckeAkte: druckeAkte,
    renderFleet: renderFleet,
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
