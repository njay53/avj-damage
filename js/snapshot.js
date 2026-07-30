/* snapshot.js — Schadensstände
 *
 * Ein Schadensstand ist der eingefrorene Zustand eines Fahrzeugs zu einem
 * Zeitpunkt, mit einer kurzen Kennung zum Eintragen ins rentsoft-Protokoll.
 * Damit ist später nachweisbar, welche Bilder der Kunde bei der Übergabe
 * gesehen hat — auch wenn das Register danach weiterwächst.
 *
 * Der Inhalt ist unveränderlich. Nur die interne Referenz lässt sich
 * nachtragen, und löschen ist möglich.
 */
(function (App) {
  "use strict";

  var Store;
  var currentVehicleId = null;
  var viewingId = null;

  function q(id) { return App.el(id, "snapshot.js"); }
  function esc(s) { return App.Fleet.esc(s); }
  function fmtDate(s) { return App.Fleet.fmtDate(s); }

  function fmtDateTime(ms) {
    if (!ms) return "";
    var d = new Date(ms);
    return d.toLocaleDateString("de-DE") + ", " +
      d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  }

  function bind() {
    Store = App.Store;

    q("btn-create-snapshot").addEventListener("click", openCreate);
    q("btn-confirm-snapshot").addEventListener("click", create);
    q("btn-copy-code").addEventListener("click", copyCode);
    q("btn-snapshot-print").addEventListener("click", function () { print(viewingId); });
    q("btn-snapshot-back").addEventListener("click", back);
    q("btn-snapshot-delete").addEventListener("click", remove);
    q("input-code-search").addEventListener("input", searchByCode);
  }

  // ---------------------------------------------------------------- Anlegen

  function setVehicle(id) { currentVehicleId = id; }

  function openCreate() {
    var v = Store.getVehicle(currentVehicleId);
    if (!v) return;
    var anzahl = Store.damagesOf(v.id).length;

    q("snapshot-modal-title").textContent = "Schadensstand festhalten";
    q("snapshot-modal-info").innerHTML =
      '<strong>' + esc(v.name) + '</strong>' + (v.plate ? " · " + esc(v.plate) : "") + '<br>' +
      anzahl + (anzahl === 1 ? " dokumentierter Schaden" : " dokumentierte Schäden") +
      ' werden mit Zeitstempel eingefroren und bekommen eine Kennung.';
    q("input-snapshot-reference").value = "";
    q("snapshot-result").classList.add("hidden");
    q("snapshot-form").classList.remove("hidden");
    q("modal-snapshot").classList.remove("hidden");
    q("input-snapshot-reference").focus();
  }

  function create() {
    var ref = q("input-snapshot-reference").value.trim();
    Store.createSnapshot(currentVehicleId, ref).then(function (snap) {
      if (!snap) return;
      q("snapshot-form").classList.add("hidden");
      q("snapshot-result").classList.remove("hidden");
      q("snapshot-code").textContent = snap.code;
      q("snapshot-result-info").innerHTML =
        esc(snap.vehicleName) + (snap.vehiclePlate ? " · " + esc(snap.vehiclePlate) : "") + '<br>' +
        fmtDateTime(snap.createdAt) + ' · ' + snap.damages.length +
        (snap.damages.length === 1 ? " Schaden" : " Schäden");
      q("snapshot-transfer").textContent = transferLine(snap);
      renderList();
    });
  }

  /* Die Zeile, die ins rentsoft-Notizfeld kommt. */
  function transferLine(snap) {
    return "Schadensdokumentation " + (snap.vehiclePlate || snap.vehicleName) +
      " · Stand " + fmtDateTime(snap.createdAt) +
      " · " + snap.damages.length + " Schäden · Kennung " + snap.code;
  }

  function copyCode() {
    var text = q("snapshot-transfer").textContent;
    var fertig = function (ok) {
      q("btn-copy-code").textContent = ok ? "Kopiert ✓" : "Bitte von Hand markieren";
      setTimeout(function () { q("btn-copy-code").textContent = "Zeile kopieren"; }, 2500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { fertig(true); },
        function () { fertig(false); });
    } else {
      fertig(false);
    }
  }

  // ---------------------------------------------------------------- Liste

  function renderList() {
    var wrap = q("snapshot-list");
    wrap.innerHTML = "";
    var list = Store.snapshots(currentVehicleId);

    if (!list.length) {
      var hint = document.createElement("div");
      hint.className = "empty-hint";
      hint.textContent = "Noch kein Schadensstand festgehalten.";
      wrap.appendChild(hint);
      return;
    }

    list.forEach(function (s) {
      var row = document.createElement("div");
      row.className = "snapshot-row";
      row.innerHTML =
        '<div class="sr-code">' + esc(s.code) + '</div>' +
        '<div class="sr-main">' +
          '<div class="sr-title">' + fmtDateTime(s.createdAt) + '</div>' +
          '<div class="sr-sub">' + s.damages.length +
            (s.damages.length === 1 ? " Schaden" : " Schäden") +
            (s.reference ? ' · ' + esc(s.reference) : '') + '</div>' +
        '</div>' +
        '<div class="sr-arrow">›</div>';
      row.addEventListener("click", function () { open(s.id); });
      wrap.appendChild(row);
    });
  }

  // ---------------------------------------------------------------- Ansehen

  function open(id) {
    var s = Store.getSnapshot(id);
    if (!s) return;
    viewingId = id;
    q("snapshot-view-heading").textContent = "Schadensstand " + s.code;
    q("snapshot-view-body").innerHTML = renderHtml(s);
    App.Nav.go("snapshot-view");
  }

  function back() {
    if (currentVehicleId) {
      App.Nav.go("vehicle");
      App.Fleet.renderVehicle();
    } else {
      App.Nav.go("fleet");
      App.Fleet.renderFleet();
    }
  }

  function remove() {
    var s = Store.getSnapshot(viewingId);
    if (!s) return;
    if (!confirm("Schadensstand " + s.code + " löschen?\n\n" +
      "Wenn die Kennung in einem rentsoft-Protokoll steht, verlierst du damit den " +
      "Nachweis, welche Bilder der Kunde gesehen hat.")) return;
    Store.deleteSnapshot(viewingId).then(back);
  }

  function searchByCode() {
    var wert = q("input-code-search").value.trim();
    var box = q("code-search-result");
    if (!wert) { box.classList.add("hidden"); return; }

    box.classList.remove("hidden");
    var s = Store.findSnapshotByCode(wert);
    if (!s) {
      box.innerHTML = '<span class="warn-text">Keine Kennung „' + esc(wert.toUpperCase()) + '“ gefunden.</span>';
      return;
    }
    box.innerHTML = '<strong>' + esc(s.code) + '</strong> — ' + esc(s.vehicleName) +
      (s.vehiclePlate ? " · " + esc(s.vehiclePlate) : "") + '<br>' +
      fmtDateTime(s.createdAt) + ' · ' + s.damages.length + ' Schäden ' +
      '<button type="button" class="mini" id="btn-open-found">Öffnen</button>';
    var btn = document.getElementById("btn-open-found");
    if (btn) {
      btn.addEventListener("click", function () {
        currentVehicleId = s.vehicleId;
        open(s.id);
      });
    }
  }

  // ---------------------------------------------------------------- Dokument

  function renderHtml(s) {
    var h = '<div class="doc">';
    h += '<div class="doc-head">' +
      '<div><div class="doc-brand">Autovermietung Jansen</div>' +
      '<div class="doc-brand-sub">Berliner Allee 14 · 37154 Northeim</div></div>' +
      '<div class="doc-type">Schadensdokumentation<br><span class="doc-code">' +
      esc(s.code) + '</span></div>' +
      '</div>';

    h += '<table class="doc-table">' +
      '<tr><th>Fahrzeug</th><td>' + esc(s.vehicleName) +
        (s.vehiclePlate ? ' · ' + esc(s.vehiclePlate) : '') + '</td></tr>' +
      '<tr><th>Stand vom</th><td>' + fmtDateTime(s.createdAt) + '</td></tr>' +
      '<tr><th>Kennung</th><td><strong>' + esc(s.code) + '</strong></td></tr>' +
      (s.reference ? '<tr><th>Interne Referenz</th><td>' + esc(s.reference) + '</td></tr>' : '') +
      '<tr><th>Dokumentierte Schäden</th><td>' + s.damages.length + '</td></tr>' +
      '</table>';

    if (!s.damages.length) {
      h += '<p class="doc-text">Zu diesem Zeitpunkt waren keine Schäden dokumentiert.</p>';
    } else {
      h += '<h3 class="doc-section">Schäden</h3><div class="doc-damages">';
      s.damages.forEach(function (d, i) {
        h += '<figure class="doc-damage">' +
          '<img src="' + d.image + '" alt="Schaden ' + (i + 1) + '">' +
          '<figcaption><span class="dmg-no">' + (i + 1) + '</span> ' +
          (d.area ? '<strong>' + esc(d.area) + '</strong> · ' : '') +
          esc(d.note || "ohne Notiz") +
          '<span class="dmg-date">erfasst am ' + fmtDate(d.date) + '</span>' +
          '</figcaption></figure>';
      });
      h += '</div>';
    }

    h += '<div class="doc-foot">Unveränderlich gespeicherter Stand · Kennung ' +
      esc(s.code) + ' · erstellt am ' + fmtDateTime(s.createdAt) + '</div>';
    h += '</div>';
    return h;
  }

  function print(id) {
    var s = Store.getSnapshot(id);
    if (!s) return;
    q("print-area").innerHTML = renderHtml(s);

    var alt = document.title;
    document.title = "Schadensstand_" + (s.vehiclePlate || s.vehicleName)
      .replace(/[^\w-]+/g, "_") + "_" + s.code;

    var zurueck = function () {
      document.title = alt;
      window.removeEventListener("afterprint", zurueck);
    };
    window.addEventListener("afterprint", zurueck);
    setTimeout(function () { window.print(); setTimeout(zurueck, 1500); }, 400);
  }

  App.Snapshot = {
    bind: bind,
    setVehicle: setVehicle,
    renderList: renderList,
    open: open,
    transferLine: transferLine
  };

})(window.App = window.App || {});
