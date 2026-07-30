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
    q("btn-add-vehicle").addEventListener("click", function () { openVehicleModal(null); });
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
      var count = Store.damagesOf(v.id).length;
      var staende = Store.snapshots(v.id).length;
      var card = document.createElement("div");
      card.className = "vehicle-card";
      card.innerHTML =
        '<h3>' + esc(v.name) + '</h3>' +
        '<div class="plate">' + esc(v.plate || "kein Kennzeichen hinterlegt") + '</div>' +
        '<span class="chip' + (count === 0 ? " zero" : "") + '">' + count +
        (count === 1 ? " Schaden" : " Schäden") + '</span>' +
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
    q("vehicle-plate").textContent = v.plate ? "Kennzeichen: " + v.plate : "";

    var grid = q("damage-grid");
    grid.innerHTML = "";

    Store.damagesOf(v.id).forEach(function (d) {
      var card = document.createElement("div");
      card.className = "damage-card";
      card.innerHTML =
        '<img src="' + d.image + '" alt="Schaden" loading="lazy">' +
        '<div class="meta">' + esc(fmtDamageDate(d)) + (d.area ? " · " + esc(d.area) : "") + '</div>' +
        '<div class="note">' + esc(d.note || "(keine Notiz)") + '</div>';
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
    q("detail-img").src = d.image;
    q("detail-date").textContent = fmtDamageDateLong(d) +
      (d.area ? " · Bereich: " + d.area : "");
    q("detail-note-input").value = d.note || "";
    q("modal-detail").classList.remove("hidden");
  }

  function saveDetailNote() {
    Store.updateDamage(currentVehicleId, currentDamageId,
      { note: q("detail-note-input").value.trim() }
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

  App.Fleet = {
    bind: bind,
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
