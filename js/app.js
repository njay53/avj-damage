/* app.js — Navigation, Einstellungen, Start */
(function (App) {
  "use strict";

  /* Muss bei jeder Änderung mit CACHE_VERSION in sw.js übereinstimmen.
     Steht unten in der Fusszeile — daran erkennt man auf einen Blick, welche
     Fassung ein Gerät tatsächlich geladen hat. Genau daran haben wir zweimal
     Zeit verloren: neue Oberfläche, altes Verhalten, und niemand sah es. */
  var APP_VERSION = "v25";

  var VIEWS = ["fleet", "vehicle", "snapshot-view", "settings"];
  var currentView = "fleet";

  function q(id) { return App.el(id, "app.js"); }

  /* Startfehler sichtbar machen, statt die Seite tot dastehen zu lassen.
     Die Ursache wird benannt — nicht pauschal der Datenbank angelastet. */
  function showFatal(titel, details) {
    console.error(titel, details);
    var box = document.createElement("div");
    box.setAttribute("id", "fatal-error");
    box.style.cssText =
      "position:fixed;inset:0;z-index:999;background:#fff;color:#1f2937;padding:28px;" +
      "font:15px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;overflow:auto;";
    box.innerHTML =
      '<h2 style="color:#b91c1c;margin-top:0">' + titel + '</h2>' +
      '<p style="max-width:640px">' + details.hinweis + '</p>' +
      '<pre style="background:#f4f6f6;padding:12px;border-radius:8px;white-space:pre-wrap;' +
      'font-size:13px;max-width:640px;overflow-x:auto">' +
      String(details.technisch || "").replace(/[<>&]/g, function (c) {
        return { "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c];
      }) + '</pre>' +
      '<p style="color:#6b7280;font-size:13px;max-width:640px">' +
      'Die gespeicherten Daten sind davon nicht betroffen — sie liegen in der Datenbank ' +
      'des Browsers und werden durch einen Startfehler nicht verändert.</p>';
    document.body.appendChild(box);
  }

  /* Fehler, die erst im Betrieb auftreten — etwa beim Öffnen eines Fahrzeugs —
     würden sonst nur in der Entwicklerkonsole landen und die Oberfläche
     wortlos stehen lassen. Hier gibt es dafür ein wegklickbares Band. */
  function showRuntimeError(nachricht) {
    var vorhanden = document.getElementById("runtime-error");
    if (vorhanden) vorhanden.remove();

    var band = document.createElement("div");
    band.setAttribute("id", "runtime-error");
    band.className = "runtime-error";
    band.innerHTML =
      '<div><strong>Da ist etwas schiefgelaufen.</strong> ' +
      'Die Daten sind unverändert — im Zweifel die Seite neu laden.<br>' +
      '<code></code></div>' +
      '<button type="button" aria-label="Schliessen">✕</button>';
    band.querySelector("code").textContent = String(nachricht || "").slice(0, 300);
    band.querySelector("button").addEventListener("click", function () { band.remove(); });
    document.body.appendChild(band);
  }

  function bindGlobalErrors() {
    window.addEventListener("error", function (e) {
      if (document.getElementById("fatal-error")) return;   // Startfehler hat Vorrang
      showRuntimeError(e.message || (e.error && e.error.message) || "Unbekannter Fehler");
    });
    window.addEventListener("unhandledrejection", function (e) {
      if (document.getElementById("fatal-error")) return;
      var grund = e.reason;
      showRuntimeError(grund && grund.message ? grund.message : String(grund));
    });
  }

  // ---------------------------------------------------------------- Navigation

  var Nav = {
    go: function (view) {
      if (VIEWS.indexOf(view) === -1) return;
      currentView = view;
      VIEWS.forEach(function (v) {
        q("view-" + v).classList.toggle("hidden", v !== view);
      });
      var knopf = document.getElementById("btn-settings");
      if (knopf) knopf.classList.toggle("active", view === "settings");
      window.scrollTo(0, 0);
    },
    current: function () { return currentView; }
  };
  App.Nav = Nav;

  // ---------------------------------------------------------------- Statusanzeige

  function setStatus(text, kind) {
    var el = q("sync-status");
    el.textContent = text;
    el.className = "status-pill " + (kind || "info");
  }

  function refreshCloudUi() {
    var s = App.Cloud.status();
    var cfg = App.Cloud.config();

    q("cloud-state").textContent = !s.konfiguriert
      ? "Nicht eingerichtet — die Daten bleiben auf diesem Gerät."
      : (s.angemeldet
        ? "Angemeldet als " + s.email + (s.lastSync
          ? " · zuletzt synchronisiert " + new Date(s.lastSync).toLocaleString("de-DE")
          : "")
        : "Eingerichtet, aber nicht angemeldet.");
    q("cloud-state").className = "note-box " + (s.angemeldet ? "ok" : "");

    q("login-block").classList.toggle("hidden", !s.konfiguriert || s.angemeldet);
    q("logged-in-block").classList.toggle("hidden", !s.angemeldet);
    q("btn-sync-now").classList.toggle("hidden", !s.angemeldet);

    if (cfg) {
      q("input-cloud-url").value = cfg.url;
      q("input-cloud-key").value = cfg.anonKey;
    }

    if (!s.konfiguriert) setStatus("Nur dieses Gerät", "info");
    else if (!s.angemeldet) setStatus("Nicht angemeldet", "warn");
    else if (!s.online) setStatus("Offline", "warn");
  }

  function bindSettings() {
    q("btn-cloud-save").addEventListener("click", function () {
      App.Cloud.saveConfig(q("input-cloud-url").value, q("input-cloud-key").value)
        .then(function () {
          setStatus("Zugangsdaten gespeichert", "ok");
          refreshCloudUi();
        })
        .catch(function (err) { alert(err.message); });
    });

    q("btn-cloud-test").addEventListener("click", function () {
      q("cloud-test-result").classList.remove("hidden");
      q("cloud-test-result").innerHTML = "Prüfe …";
      App.Cloud.testConnection().then(function (msg) {
        q("cloud-test-result").innerHTML = '<span class="ok-text">' + msg + '</span>';
      }).catch(function (err) {
        q("cloud-test-result").innerHTML = '<span class="warn-text">' +
          String(err.message || err) + '</span>';
      });
    });

    q("btn-cloud-login").addEventListener("click", function () {
      var btn = q("btn-cloud-login");
      btn.disabled = true;
      btn.textContent = "Melde an …";
      App.Cloud.login(q("input-cloud-email").value.trim(), q("input-cloud-password").value)
        .then(function () {
          q("input-cloud-password").value = "";
          refreshCloudUi();
          App.Fleet.renderFleet();
        })
        .catch(function (err) { alert("Anmeldung fehlgeschlagen:\n\n" + (err.message || err)); })
        .then(function () {
          btn.disabled = false;
          btn.textContent = "Anmelden";
        });
    });

    q("btn-cloud-logout").addEventListener("click", function () {
      if (!confirm("Abmelden? Die Daten bleiben auf diesem Gerät erhalten.")) return;
      App.Cloud.logout().then(refreshCloudUi);
    });

    q("btn-cloud-forget").addEventListener("click", function () {
      if (!confirm("Zugangsdaten von diesem Gerät entfernen?\n\n" +
        "Die Fahrzeugdaten bleiben lokal erhalten und auf dem Server unverändert.")) return;
      App.Cloud.clearConfig().then(refreshCloudUi);
    });

    q("btn-sync-now").addEventListener("click", function () {
      App.Cloud.sync().then(function () {
        refreshCloudUi();
        App.Fleet.renderFleet();
        if (Nav.current() === "vehicle") App.Fleet.renderVehicle();
      });
    });

    q("input-kennung-aktiv").addEventListener("change", function () {
      Einstellungen.setzeKennung(q("input-kennung-aktiv").checked);
    });

    q("btn-kategorie-add").addEventListener("click", function () {
      var feld = q("input-kategorie-neu");
      if (!feld.value.trim()) return;
      App.Store.addCategory(feld.value).then(function () {
        feld.value = "";
        renderKategorien();
        App.Fleet.renderFleet();
      });
    });
    q("input-kategorie-neu").addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); q("btn-kategorie-add").click(); }
    });

    q("btn-export").addEventListener("click", function () { App.Store.exportDownload(); });
    q("btn-import").addEventListener("click", function () { q("file-import-input").click(); });

    q("file-import-input").addEventListener("change", function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      App.Store.importFile(file).then(function (changed) {
        setStatus(changed ? "Import übernommen" : "Keine neuen Daten", "ok");
        App.Fleet.renderFleet();
      }).catch(function (err) {
        alert("Import fehlgeschlagen:\n\n" + (err.message || err));
      });
      e.target.value = "";
    });
  }

  // ---------------------------------------------------------------- Einstellungen

  /* Der Kennungsschalter ist eine Ansichtssache und bleibt deshalb auf dem
     Gerät: er beschreibt, wie DU gerade arbeitest, nicht wie die Daten
     aussehen. Er wandert bewusst nicht in den Abgleich. */
  var kennungAktiv = false;

  var Einstellungen = {
    kennungAktiv: function () { return kennungAktiv; },
    laden: function () {
      return App.Store.idbGet("kennungAktiv").then(function (wert) {
        kennungAktiv = wert === true;
        return kennungAktiv;
      });
    },
    setzeKennung: function (an) {
      kennungAktiv = !!an;
      return App.Store.idbSet("kennungAktiv", kennungAktiv).then(wendeKennungAn);
    }
  };
  App.Einstellungen = Einstellungen;

  /* Sichtbarkeit überall nachziehen, wo die Kennung eine Rolle spielt. */
  function wendeKennungAn() {
    var feld = document.getElementById("card-code-search");
    if (feld) feld.classList.toggle("hidden", !kennungAktiv);
    var schalter = document.getElementById("input-kennung-aktiv");
    if (schalter) schalter.checked = kennungAktiv;
    if (Nav.current() === "vehicle") App.Fleet.renderVehicle();
    if (Nav.current() === "fleet") App.Fleet.renderFleet();
  }

  // ---------------------------------------------------------------- Kategorien

  function renderKategorien() {
    var box = document.getElementById("kategorie-liste");
    if (!box) return;
    box.innerHTML = "";
    var liste = App.Store.categories();

    if (!liste.length) {
      var leer = document.createElement("div");
      leer.className = "empty-hint";
      leer.textContent = "Noch keine Kategorie angelegt.";
      box.appendChild(leer);
      return;
    }

    liste.forEach(function (k, i) {
      var zeile = document.createElement("div");
      zeile.className = "kat-zeile";

      var feld = document.createElement("input");
      feld.type = "text";
      feld.value = k.name;
      /* Umbenennen beim Verlassen des Feldes — kein Speichern-Knopf für
         eine Zeile mit einem Wort. */
      feld.addEventListener("change", function () {
        App.Store.updateCategory(k.id, feld.value).then(function () {
          renderKategorien();
          App.Fleet.renderFleet();
        });
      });

      var anzahl = document.createElement("span");
      anzahl.className = "kat-anzahl";
      var n = App.Store.categoryCount(k.id);
      anzahl.textContent = n + (n === 1 ? " Fahrzeug" : " Fahrzeuge");

      var knoepfe = document.createElement("div");
      knoepfe.className = "kat-knoepfe";
      knoepfe.appendChild(katKnopf("↑", i === 0, function () {
        App.Store.moveCategory(k.id, -1).then(renderKategorien);
      }));
      knoepfe.appendChild(katKnopf("↓", i === liste.length - 1, function () {
        App.Store.moveCategory(k.id, 1).then(renderKategorien);
      }));
      knoepfe.appendChild(katKnopf("✕", false, function () {
        var frage = n
          ? 'Kategorie "' + k.name + '" löschen?\n\n' + n +
            (n === 1 ? " Fahrzeug steht" : " Fahrzeuge stehen") +
            " danach ohne Kategorie da. Gelöscht wird kein Fahrzeug."
          : 'Kategorie "' + k.name + '" löschen?';
        if (!confirm(frage)) return;
        App.Store.deleteCategory(k.id).then(function () {
          renderKategorien();
          App.Fleet.renderFleet();
        });
      }, "ghost-danger"));

      zeile.appendChild(feld);
      zeile.appendChild(anzahl);
      zeile.appendChild(knoepfe);
      box.appendChild(zeile);
    });
  }

  function katKnopf(text, aus, beiKlick, art) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "mini " + (art || "ghost");
    b.textContent = text;
    b.disabled = !!aus;
    b.addEventListener("click", beiKlick);
    return b;
  }

  // ---------------------------------------------------------------- Speicherplatz

  /* Grenze des kostenlosen Supabase-Tarifs. Die Fotos liegen dort als Text in
     der Datenbank und zählen gegen diese 500 MB. Wird die Zahl eng, wandern
     sie in den Dateispeicher daneben — der hat sein eigenes Kontingent. */
  var GRENZE = 500 * 1024 * 1024;

  function mb(bytes) {
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + " KB";
    return (bytes / 1024 / 1024).toFixed(1) + " MB";
  }

  function zeigeSpeicher() {
    var kasten = document.getElementById("speicher-zahlen");
    if (!kasten || !App.Store.speicherbedarf) return;
    var b = App.Store.speicherbedarf();
    var anteil = Math.min(100, (b.gesamt / GRENZE) * 100);

    kasten.innerHTML =
      zeile(b.anzahlFotos + " Fotos", mb(b.fotos)) +
      zeile(b.fahrzeuge + " Fahrzeuge, " + b.staende + " Stände", mb(b.rest)) +
      zeile("Belegt", mb(b.gesamt), true);

    var balken = document.getElementById("speicher-balken");
    if (balken) {
      /* Untergrenze, damit ein belegter Speicher auch dann sichtbar ist,
         wenn er noch weit unter einem Prozent liegt. */
      balken.style.width = Math.max(anteil, anteil > 0 ? 1.5 : 0) + "%";
      balken.className = "speicher-balken-fuellung" +
        (anteil >= 90 ? " voll" : (anteil >= 70 ? " warn" : ""));
    }

    var text = document.getElementById("speicher-text");
    if (!text) return;
    if (anteil < 70) {
      text.textContent = anteil.toFixed(1) + " % von 500 MB — dem Platz im kostenlosen Tarif. " +
        "Ein Foto kostet je nach Motiv 200 bis 500 KB.";
    } else if (anteil < 90) {
      text.textContent = anteil.toFixed(1) + " % von 500 MB. Zeit, die Fotos in den " +
        "Dateispeicher umzuziehen — dort liegen sie unverändert, zählen aber gegen " +
        "ein eigenes Kontingent von 1 GB.";
    } else {
      text.textContent = anteil.toFixed(1) + " % von 500 MB. Der Platz reicht nicht mehr lange; " +
        "die Fotos sollten jetzt in den Dateispeicher umziehen.";
    }
  }

  function zeile(links, rechts, summe) {
    return '<div class="speicher-zeile' + (summe ? " summe" : "") + '">' +
      "<span>" + links + "</span><span>" + rechts + "</span></div>";
  }

  // ---------------------------------------------------------------- Dialoge, Reiter

  function bindModals() {
    document.querySelectorAll("[data-close]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        q(btn.getAttribute("data-close")).classList.add("hidden");
      });
    });
    document.querySelectorAll(".modal-overlay").forEach(function (overlay) {
      overlay.addEventListener("click", function (e) {
        if (e.target === overlay) overlay.classList.add("hidden");
      });
    });
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      document.querySelectorAll(".modal-overlay:not(.hidden)").forEach(function (o) {
        o.classList.add("hidden");
      });
    });
  }

  /* Ein Zahnrad in der Kopfzeile statt einer Reiterleiste: die Einstellungen
     sind einmal eingerichtet und danach selten dran — sie müssen nicht die
     halbe Breite über dem Fuhrpark belegen. */
  function bindTabs() {
    q("btn-settings").addEventListener("click", function () {
      if (Nav.current() === "settings") {
        Nav.go("fleet");
        App.Fleet.renderFleet();
        return;
      }
      Nav.go("settings");
      refreshCloudUi();
      renderKategorien();
      zeigeSpeicher();
    });
    q("btn-settings-back").addEventListener("click", function () {
      Nav.go("fleet");
      App.Fleet.renderFleet();
    });
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    if (location.protocol === "file:") return;
    navigator.serviceWorker.register("sw.js").catch(function (err) {
      console.warn("Service Worker nicht registriert:", err);
    });
  }

  // ---------------------------------------------------------------- Start

  var booted = false;

  function boot() {
    if (booted) return;
    booted = true;
    bindGlobalErrors();

    var vEl = document.getElementById("app-version");
    if (vEl) vEl.textContent = "Build " + APP_VERSION.replace(/^v/, "");
    App.Store.onStatus(setStatus);
    App.Cloud.onStatus(function () {
      if (Nav.current() === "settings") refreshCloudUi();
    });
    App.Store.onChange(function () {
      if (Nav.current() === "settings") zeigeSpeicher();
    });

    /* Schritt 1: Datenbank. Nur hier ist "Daten nicht ladbar" die richtige Diagnose. */
    App.Store.init().catch(function (err) {
      showFatal("Die Daten konnten nicht geladen werden", {
        hinweis: "Der Browser hat den Zugriff auf seine Datenbank (IndexedDB) verweigert. " +
          "Häufigste Ursache: Safari im privaten Modus — dort ist IndexedDB gesperrt. " +
          "Bitte ein normales Fenster benutzen.",
        technisch: err && err.stack ? err.stack : String(err)
      });
      throw err;
    }).then(function () {
      /* Schritt 2: Oberfläche verdrahten. Fehler hier sind Programmierfehler,
         typischerweise ein HTML-Element, das nicht (mehr) existiert. */
      var module = [
        ["annotate.js", App.Annotate.bind],
        ["fleet.js", App.Fleet.bind],
        ["snapshot.js", App.Snapshot.bind],
        ["app.js — Einstellungen", bindSettings],
        ["app.js — Dialoge", bindModals],
        ["app.js — Reiter", bindTabs]
      ];
      for (var i = 0; i < module.length; i++) {
        try {
          module[i][1]();
        } catch (err) {
          showFatal("Die Oberfläche konnte nicht aufgebaut werden", {
            hinweis: "Beim Verdrahten von <strong>" + module[i][0] + "</strong> ist ein Fehler " +
              "aufgetreten. Das ist kein Datenproblem, sondern ein Fehler im Programmcode — " +
              "meist ein HTML-Element, das umbenannt wurde oder fehlt.",
            technisch: (err && err.message ? err.message : String(err)) +
              "\n\n" + (err && err.stack ? err.stack : "")
          });
          return;
        }
      }

      /* Ansichtseinstellungen liegen in derselben Datenbank — erst holen,
         dann zeichnen, sonst blitzt das Kennungsfeld kurz auf. */
      return Einstellungen.laden().then(function () {
        wendeKennungAn();
        App.Fleet.renderFleet();
        Nav.go("fleet");
        registerServiceWorker();
        return weiter();
      });
    }).then(function () {
      return null;
    }).catch(function (err) {
      if (!document.getElementById("fatal-error")) {
        showFatal("Die App konnte nicht starten", {
          hinweis: "Unerwarteter Fehler beim Start.",
          technisch: err && err.stack ? err.stack : String(err)
        });
      }
    });

    function weiter() {

      /* Der Abgleich läuft nachgelagert — die App ist vorher schon bedienbar. */
      return App.Cloud.init().then(function () {
        refreshCloudUi();
        App.Fleet.renderFleet();
      });
    }

    /* Nach jeder Änderung die Ansicht auffrischen — auch wenn sie vom
       Abgleich kam und nicht von diesem Gerät. */
    App.Store.onChange(function () {
      if (Nav.current() === "fleet") App.Fleet.renderFleet();
      else if (Nav.current() === "vehicle") App.Fleet.renderVehicle();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

})(window.App = window.App || {});
