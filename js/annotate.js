/* annotate.js — Foto aufnehmen und markieren
 *
 * App.Annotate.open({ title, onSave }) öffnet den Dialog.
 * onSave erhält { image (dataURL), note, date, dateMode, area }.
 *
 * Aufbau: Markierungen werden NICHT direkt ins Bild gebrannt, sondern als
 * Liste von Operationen geführt und bei jeder Darstellung neu gezeichnet.
 * Das kostet etwas Rechenzeit, bringt aber drei Dinge:
 *   · Zoomen bleibt scharf, weil immer aus dem Original gezeichnet wird
 *   · Rückgängig braucht keinen Speicher für ganze Bildkopien
 *   · Markierungen sitzen bei jedem Zoomgrad an derselben Bildstelle
 *
 * Zwei Zeichenflächen:
 *   work    — volle Bildauflösung, hier entsteht das Ergebnis
 *   canvas  — was man sieht, zeigt einen Ausschnitt von work (Zoom)
 */
(function (App) {
  "use strict";

  var MAX_DIM = 1400;
  var JPEG_QUALITY = 0.82;
  var MAX_ZOOM = 6;

  var overlay, canvas, ctx, placeholder, camInput, fileInput, noteInput, dateInput,
      areaInput, saveBtn, titleEl, colorInput, widthInput, statusEl, dateModeSel,
      dateRow, zoomLabel, widthValue, countInput, streifen;

  var bilder = [];          // [{ img, ops }] — mehrere Fotos je Schaden
  var aktiv = -1;           // welches Foto gerade bearbeitet wird
  var bearbeitet = null;    // vorhandener Schaden, falls Bearbeiten-Modus

  var work, workCtx;        // volle Auflösung
  var img = null;           // Originalbild
  var ops = [];             // bestätigte Markierungen
  /* Bewusst KEIN Werkzeug beim Öffnen: sonst wird jeder Wisch über das Bild
     zum Kreis, während man eigentlich nur die Seite scrollen wollte. Auf dem
     Handy nimmt das Bild fast den ganzen Schirm ein — man kommt kaum daran
     vorbei. Erst wenn ein Werkzeug gewählt ist, fängt die Fläche Gesten ab. */
  var tool = null;
  var color = "#ff3b30";
  var width = 12;
  var imageLoaded = false;
  var onSaveCb = null;
  var kmInput, anlassSel;
  /* Schaden oder Zustandsaufnahme — entscheidet, welche Felder gelten. */
  var aktuelleArt = "schaden";

  // Ansicht: welcher Bildausschnitt ist zu sehen
  var view = { scale: 1, x: 0, y: 0 };

  // Zeigerverwaltung
  var pointers = new Map();
  var drawing = false;
  var current = null;       // Operation in Arbeit
  var pinch = null;
  var panning = null;       // Verschieben ohne aktives Werkzeug

  function q(id) { return App.el(id, "annotate.js"); }

  function uebernehmeStaerke() {
    var wert = parseInt(widthInput.value, 10);
    if (isNaN(wert)) return;
    width = wert;
    widthValue.textContent = String(wert);
  }

  function todayStr() {
    var d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString().slice(0, 10);
  }

  // ---------------------------------------------------------------- Aufbau

  function bind() {
    overlay = q("modal-annotate");
    canvas = q("annotate-canvas");
    ctx = canvas.getContext("2d");
    placeholder = q("canvas-placeholder");
    camInput = q("input-photo-camera");
    fileInput = q("input-photo-file");
    statusEl = q("photo-status");
    noteInput = q("input-note");
    dateInput = q("input-date");
    dateModeSel = q("input-date-mode");
    dateRow = q("date-row");
    areaInput = q("input-area");
    saveBtn = q("btn-save-damage");
    titleEl = q("annotate-title");
    colorInput = q("input-color");
    widthInput = q("input-width");
    widthValue = q("width-value");
    zoomLabel = q("zoom-label");
    countInput = q("input-count");
    kmInput = q("input-km");
    anlassSel = q("input-anlass");
    streifen = q("photo-strip");

    work = document.createElement("canvas");
    workCtx = work.getContext("2d");

    /* Nochmal auf dasselbe Werkzeug tippen schaltet es ab. Ohne aktives
       Werkzeug verschiebt ein Finger den Bildausschnitt, statt zu zeichnen —
       praktisch, wenn man hineingezoomt hat. */
    document.querySelectorAll(".tool-btn[data-tool]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var gewaehlt = btn.getAttribute("data-tool");
        var schonAktiv = (tool === gewaehlt);
        document.querySelectorAll(".tool-btn[data-tool]").forEach(function (b) {
          b.classList.remove("active");
        });
        if (schonAktiv) {
          tool = null;
        } else {
          tool = gewaehlt;
          btn.classList.add("active");
        }
        aktualisiereBeruehrung();
        zeigeWerkzeugHinweis();
      });
    });

    colorInput.addEventListener("input", function () { color = colorInput.value; });
    /* Beide Ereignisse: "input" während des Ziehens, "change" beim Loslassen.
       Manche Browser sind beim einen oder anderen sparsam. */
    ["input", "change"].forEach(function (ereignis) {
      widthInput.addEventListener(ereignis, uebernehmeStaerke);
    });

    dateModeSel.addEventListener("change", function () {
      dateRow.classList.toggle("hidden", dateModeSel.value !== "exact");
    });

    camInput.addEventListener("change", function () { handleFile(camInput); });
    fileInput.addEventListener("change", function () { handleFile(fileInput); });
    q("btn-photo-camera").addEventListener("click", function () { camInput.click(); });
    q("btn-photo-file").addEventListener("click", function () { fileInput.click(); });

    q("btn-undo").addEventListener("click", undo);
    q("btn-reset-canvas").addEventListener("click", resetOps);
    q("btn-zoom-in").addEventListener("click", function () { zoomBy(1.5); });
    q("btn-zoom-out").addEventListener("click", function () { zoomBy(1 / 1.5); });
    q("btn-zoom-reset").addEventListener("click", function () {
      view = { scale: 1, x: 0, y: 0 };
      renderView();
    });
    saveBtn.addEventListener("click", save);

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("pointerleave", onUp);
    window.addEventListener("resize", function () { if (imageLoaded) renderView(); });
  }

  /* opts: { title, onSave, damage }
     Ist damage gesetzt, wird bearbeitet statt neu angelegt. Vorhandene Fotos
     kommen dabei als fertige Bilder zurück — deren alte Markierungen sind
     eingebrannt und lassen sich nicht mehr einzeln entfernen. Neue lassen
     sich darüberlegen. */
  function open(opts) {
    onSaveCb = opts.onSave;
    titleEl.textContent = opts.title || "Schaden erfassen";
    reset();
    tool = null;
    document.querySelectorAll(".tool-btn[data-tool]").forEach(function (b) {
      b.classList.remove("active");
    });
    aktualisiereBeruehrung();
    zeigeWerkzeugHinweis();
    uebernehmeStaerke();

    var d = opts.damage || null;
    bearbeitet = d;

    dateModeSel.value = (d && d.dateMode) || "exact";
    dateRow.classList.toggle("hidden", dateModeSel.value !== "exact");
    dateInput.value = (d && d.date) || todayStr();
    noteInput.value = (d && d.description) || "";
    areaInput.value = (d && d.area) || "";
    countInput.value = String((d && d.count) || 1);

    /* Zwei Masken in einer. Eine Zustandsaufnahme hält fest, wie das Fahrzeug
       insgesamt dasteht — Anzahl Schäden und "Datum unbekannt" ergeben dort
       keinen Sinn, dafür Kilometerstand und Anlass. */
    var art = opts.art || (d && d.kind) || "schaden";
    var istZustand = art === "zustand";
    aktuelleArt = art;

    document.getElementById("count-row").classList.toggle("hidden", istZustand);
    document.getElementById("datemode-row").classList.toggle("hidden", istZustand);
    document.getElementById("anlass-row").classList.toggle("hidden", !istZustand);
    document.getElementById("km-row").classList.toggle("hidden", !istZustand);
    document.getElementById("label-area").textContent = istZustand
      ? "Motiv (optional)"
      : "Bereich (optional)";
    areaInput.placeholder = istZustand
      ? "z. B. Front, Innenraum, Zubehör"
      : "z. B. Stossstange hinten links";
    noteInput.placeholder = istZustand
      ? "z. B. rundum unbeschädigt, Warnweste, Verbandkasten und 2. Schlüssel dabei"
      : "z. B. Kratzer ca. 5 cm, nicht durchgerostet";

    if (istZustand) {
      countInput.value = "1";
      dateModeSel.value = "exact";
      dateRow.classList.remove("hidden");
      kmInput.value = (d && d.km) || "";
      anlassSel.value = (d && d.anlass) || "uebergabe";
    }

    saveBtn.textContent = d
      ? "Änderungen speichern"
      : (istZustand ? "Aufnahme speichern" : "Schaden speichern");

    var hinweis = document.getElementById("edit-hinweis");
    if (hinweis) hinweis.classList.toggle("hidden", !d);

    if (d && d.images && d.images.length) {
      var offen = d.images.length;
      d.images.forEach(function (quelle, i) {
        var bild = new Image();
        bild.onload = function () {
          bilder[i] = { img: bild, ops: [], w: bild.width, h: bild.height };
          if (--offen === 0) fertigGeladen();
        };
        bild.onerror = function () { if (--offen === 0) fertigGeladen(); };
        bild.src = quelle;
      });
    }

    function fertigGeladen() {
      bilder = bilder.filter(Boolean);
      if (bilder.length) {
        waehleBild(0);
        saveBtn.disabled = false;
        statusEl.textContent = bilder.length + (bilder.length === 1 ? " Foto" : " Fotos") +
          " geladen — weitere hinzufügen oder markieren.";
        statusEl.className = "pick-status ok";
      }
      zeichneStreifen();
    }

    zeichneStreifen();
    overlay.classList.remove("hidden");
  }

  function close() {
    overlay.classList.add("hidden");
    reset();
  }

  function reset() {
    imageLoaded = false;
    img = null;
    ops = [];
    bilder = [];
    aktiv = -1;
    bearbeitet = null;
    view = { scale: 1, x: 0, y: 0 };
    pointers.clear();
    drawing = false;
    current = null;
    canvas.classList.add("hidden");
    q("zoom-row").classList.add("hidden");
    placeholder.classList.remove("hidden");
    camInput.value = "";
    fileInput.value = "";
    statusEl.textContent = "";
    statusEl.className = "pick-status";
    saveBtn.disabled = true;
    zeichneStreifen();
  }

  // ------------------------------------------------------------ Fotostreifen

  /* Jedes Foto hat seine eigene Markierungsliste. Beim Umschalten wird die
     aktuelle gesichert und die des gewählten Fotos geladen. */
  function sichereAktuelles() {
    if (aktiv >= 0 && bilder[aktiv]) bilder[aktiv].ops = ops;
  }

  function waehleBild(i) {
    if (!bilder[i]) return;
    sichereAktuelles();
    aktiv = i;
    var b = bilder[i];
    img = b.img;
    ops = b.ops || [];
    var w = b.img.width, h = b.img.height;
    if (w > MAX_DIM || h > MAX_DIM) {
      var f = MAX_DIM / Math.max(w, h);
      w = Math.round(w * f);
      h = Math.round(h * f);
    }
    work.width = w;
    work.height = h;
    view = { scale: 1, x: 0, y: 0 };
    imageLoaded = true;
    placeholder.classList.add("hidden");
    canvas.classList.remove("hidden");
    q("zoom-row").classList.remove("hidden");
    renderWork();
    renderView();
    zeichneStreifen();
  }

  function entferneBild(i) {
    if (!bilder[i]) return;
    if (!confirm("Dieses Foto aus dem Schaden entfernen?")) return;
    sichereAktuelles();
    bilder.splice(i, 1);
    if (!bilder.length) {
      aktiv = -1;
      imageLoaded = false;
      img = null;
      ops = [];
      canvas.classList.add("hidden");
      q("zoom-row").classList.add("hidden");
      placeholder.classList.remove("hidden");
      saveBtn.disabled = true;
      zeichneStreifen();
      return;
    }
    aktiv = -1;
    waehleBild(Math.min(i, bilder.length - 1));
  }

  function nachVorn(i) {
    if (i <= 0 || i >= bilder.length) return;
    var b = bilder.splice(i, 1)[0];
    bilder.unshift(b);
    waehleBild(0);
  }

  function zeichneStreifen() {
    if (!streifen) return;
    streifen.innerHTML = "";
    streifen.classList.toggle("hidden", bilder.length === 0);
    bilder.forEach(function (b, i) {
      var kachel = document.createElement("div");
      kachel.className = "strip-item" + (i === aktiv ? " active" : "");
      var mini = document.createElement("canvas");
      var seite = 64;
      mini.width = seite; mini.height = seite;
      var mctx = mini.getContext("2d");
      var q1 = Math.min(b.img.width, b.img.height);
      mctx.drawImage(b.img, (b.img.width - q1) / 2, (b.img.height - q1) / 2, q1, q1,
        0, 0, seite, seite);
      kachel.appendChild(mini);

      var nr = document.createElement("span");
      nr.className = "strip-nr";
      nr.textContent = String(i + 1);
      kachel.appendChild(nr);

      var weg = document.createElement("button");
      weg.type = "button";
      weg.className = "strip-del";
      weg.textContent = "✕";
      weg.setAttribute("aria-label", "Foto entfernen");
      weg.addEventListener("click", function (ev) {
        ev.stopPropagation();
        entferneBild(i);
      });
      kachel.appendChild(weg);

      /* Das erste Foto ist das, was auf der Kachel und im PDF zuerst
         auftaucht. Kommt später ein besseres dazu — sauberes Auto, besseres
         Licht — soll es nach vorn, ohne dass das alte weg muss. */
      if (i > 0) {
        var vor = document.createElement("button");
        vor.type = "button";
        vor.className = "strip-first";
        vor.textContent = "★";
        vor.title = "Als erstes Foto zeigen";
        vor.setAttribute("aria-label", "Als erstes Foto zeigen");
        vor.addEventListener("click", function (ev) {
          ev.stopPropagation();
          nachVorn(i);
        });
        kachel.appendChild(vor);
      }

      kachel.addEventListener("click", function () { waehleBild(i); });
      streifen.appendChild(kachel);
    });
  }

  // ---------------------------------------------------------------- Foto laden

  function handleFile(input) {
    var file = input.files && input.files[0];
    if (!file) return;

    if (file.type && file.type.indexOf("image/") !== 0) {
      statusEl.textContent = "Das ist kein Bild — bitte ein Foto auswählen.";
      statusEl.className = "pick-status err";
      input.value = "";
      return;
    }

    statusEl.textContent = "Foto wird geladen …";
    statusEl.className = "pick-status";

    var reader = new FileReader();
    reader.onload = function (e) {
      var bild = new Image();
      bild.onload = function () {
        // Foto anhängen statt ersetzen — ein Schaden kann mehrere haben
        sichereAktuelles();
        bilder.push({ img: bild, ops: [] });
        aktiv = -1;
        waehleBild(bilder.length - 1);

        saveBtn.disabled = false;
        statusEl.textContent = bilder.length === 1
          ? "Foto geladen — jetzt markieren."
          : bilder.length + " Fotos in diesem Schaden.";
        statusEl.className = "pick-status ok";
        input.value = "";
      };
      bild.onerror = function () {
        statusEl.textContent = "Bild konnte nicht gelesen werden. Anderes Foto versuchen.";
        statusEl.className = "pick-status err";
      };
      bild.src = e.target.result;
    };
    reader.onerror = function () {
      statusEl.textContent = "Datei konnte nicht gelesen werden.";
      statusEl.className = "pick-status err";
    };
    reader.readAsDataURL(file);
  }

  // ---------------------------------------------------------------- Zeichnen

  function drawEllipse(c, o) {
    var rx = Math.max(2, Math.abs(o.x2 - o.x1) / 2);
    var ry = Math.max(2, Math.abs(o.y2 - o.y1) / 2);
    c.save();
    c.strokeStyle = o.color;
    c.lineWidth = o.width;
    c.beginPath();
    c.ellipse((o.x1 + o.x2) / 2, (o.y1 + o.y2) / 2, rx, ry, 0, 0, 2 * Math.PI);
    c.stroke();
    c.restore();
  }

  /* Der Schaft endet MITTEN im Dreieck und wird von der gefüllten Spitze
     verdeckt — deshalb wird er zuerst gezeichnet und der Kopf darüber.
     Vorher endete er hinter dem Dreieck, wodurch die Linienkappe vorne
     herausragte und die Spitze abgeschnitten aussah. */
  function drawArrow(c, o) {
    var dx = o.x2 - o.x1, dy = o.y2 - o.y1;
    var laenge = Math.sqrt(dx * dx + dy * dy);
    if (laenge < 1) return;
    var winkel = Math.atan2(dy, dx);
    var kopf = Math.max(26, o.width * 4.2);
    if (kopf > laenge * 0.65) kopf = laenge * 0.65;

    // Die Einbuchtung hinten in der Mitte des Dreiecks liegt bei kopf * 0.7
    // von der Spitze. Der Schaft endet auf halbem Weg dorthin, also klar
    // innerhalb der gefüllten Fläche.
    var einbuchtung = kopf * 0.7;
    var schaftEnde = laenge - einbuchtung * 0.55;
    var ex = o.x1 + Math.cos(winkel) * schaftEnde;
    var ey = o.y1 + Math.sin(winkel) * schaftEnde;

    c.save();
    c.strokeStyle = o.color;
    c.fillStyle = o.color;
    c.lineWidth = o.width;
    c.lineCap = "butt";
    c.lineJoin = "miter";

    c.beginPath();
    c.moveTo(o.x1, o.y1);
    c.lineTo(ex, ey);
    c.stroke();

    c.beginPath();
    c.moveTo(o.x2, o.y2);
    c.lineTo(o.x2 - kopf * Math.cos(winkel - 0.42), o.y2 - kopf * Math.sin(winkel - 0.42));
    c.lineTo(o.x2 - einbuchtung * Math.cos(winkel), o.y2 - einbuchtung * Math.sin(winkel));
    c.lineTo(o.x2 - kopf * Math.cos(winkel + 0.42), o.y2 - kopf * Math.sin(winkel + 0.42));
    c.closePath();
    c.fill();
    c.restore();
  }

  function drawFree(c, o) {
    if (!o.punkte || o.punkte.length < 2) return;
    c.save();
    c.strokeStyle = o.color;
    c.lineWidth = o.width;
    c.lineCap = "round";
    c.lineJoin = "round";
    c.beginPath();
    c.moveTo(o.punkte[0].x, o.punkte[0].y);
    for (var i = 1; i < o.punkte.length; i++) c.lineTo(o.punkte[i].x, o.punkte[i].y);
    c.stroke();
    c.restore();
  }

  /* Hell oder dunkel? Danach richtet sich der Hintergrund des Textkastens,
     damit die Schrift auf jedem Foto lesbar bleibt. */
  function istHell(hex) {
    var h = String(hex).replace("#", "");
    if (h.length !== 6) return false;
    var r = parseInt(h.slice(0, 2), 16) / 255;
    var g = parseInt(h.slice(2, 4), 16) / 255;
    var b = parseInt(h.slice(4, 6), 16) / 255;
    var f = function (c) { return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) > 0.45;
  }

  function drawText(c, o) {
    var groesse = Math.max(22, o.width * 5);
    c.save();
    c.font = "600 " + groesse + "px -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif";
    c.textBaseline = "top";
    var breite = c.measureText(o.text).width;
    var pad = Math.round(groesse * 0.28);

    c.fillStyle = istHell(o.color) ? "#111111" : "#ffffff";
    var r = Math.round(groesse * 0.22);
    var x = o.x - pad, y = o.y - pad;
    var w = breite + pad * 2, h = groesse + pad * 2;
    c.beginPath();
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y);
    c.closePath();
    c.fill();

    c.fillStyle = o.color;
    c.fillText(o.text, o.x, o.y);
    c.restore();
  }

  function drawOp(c, o) {
    if (o.type === "circle") return drawEllipse(c, o);
    if (o.type === "arrow") return drawArrow(c, o);
    if (o.type === "freehand") return drawFree(c, o);
    if (o.type === "text") return drawText(c, o);
  }

  function renderWork(zusatz) {
    if (!img) return;
    workCtx.clearRect(0, 0, work.width, work.height);
    workCtx.drawImage(img, 0, 0, work.width, work.height);
    ops.forEach(function (o) { drawOp(workCtx, o); });
    if (zusatz) drawOp(workCtx, zusatz);
  }

  // ---------------------------------------------------------------- Ansicht

  function viewport() {
    var sw = work.width / view.scale;
    var sh = work.height / view.scale;
    var sx = Math.min(Math.max(0, view.x), Math.max(0, work.width - sw));
    var sy = Math.min(Math.max(0, view.y), Math.max(0, work.height - sh));
    return { sx: sx, sy: sy, sw: sw, sh: sh };
  }

  function renderView() {
    if (!img) return;
    var breite = canvas.clientWidth || (canvas.parentNode && canvas.parentNode.clientWidth) || work.width;
    var hoehe = Math.max(1, Math.round(breite * work.height / work.width));
    if (canvas.width !== breite || canvas.height !== hoehe) {
      canvas.width = breite;
      canvas.height = hoehe;
    }
    var v = viewport();
    view.x = v.sx; view.y = v.sy;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(work, v.sx, v.sy, v.sw, v.sh, 0, 0, canvas.width, canvas.height);
    zoomLabel.textContent = Math.round(view.scale * 100) + " %";
    aktualisiereBeruehrung();
    zeigeWerkzeugHinweis();
  }

  function zoomBy(faktor, mx, my) {
    if (!img) return;
    var alt = view.scale;
    var neu = Math.min(MAX_ZOOM, Math.max(1, alt * faktor));
    if (neu === alt) return;

    var v = viewport();
    var zx = mx === undefined ? v.sx + v.sw / 2 : mx;
    var zy = my === undefined ? v.sy + v.sh / 2 : my;

    view.scale = neu;
    var nw = work.width / neu, nh = work.height / neu;
    view.x = zx - (zx - v.sx) * (nw / v.sw);
    view.y = zy - (zy - v.sy) * (nh / v.sh);
    renderView();
  }

  /* Bildschirmpunkt in Bildkoordinaten umrechnen — ohne das säßen alle
     Markierungen bei gezoomter Ansicht an der falschen Stelle. */
  function toImage(evt) {
    var rect = canvas.getBoundingClientRect();
    var v = viewport();
    var breite = rect.width || canvas.width;
    var hoehe = rect.height || canvas.height;
    return {
      x: v.sx + ((evt.clientX - rect.left) / breite) * v.sw,
      y: v.sy + ((evt.clientY - rect.top) / hoehe) * v.sh
    };
  }

  /* Entscheidet, ob die Zeichenfläche Berührungen abfängt.
       Werkzeug aktiv        → abfangen, sonst kann man nicht zeichnen
       hineingezoomt         → abfangen, damit ein Finger den Ausschnitt schiebt
       weder noch            → durchlassen, damit die Seite normal scrollt
     Ohne diese Unterscheidung bleibt der Finger am Bild kleben, sobald man
     nur weiterblättern will. */
  function aktualisiereBeruehrung() {
    if (!canvas) return;
    var faengt = !!tool || view.scale > 1;
    canvas.style.touchAction = faengt ? "none" : "auto";
    canvas.style.cursor = tool ? "crosshair" : (view.scale > 1 ? "grab" : "default");
  }

  /* Hinweistext in der Zoomleiste — sagt, was ein Finger gerade tut. */
  function zeigeWerkzeugHinweis() {
    var el = document.getElementById("zoom-hint");
    if (!el) return;
    if (tool) {
      el.textContent = "Zeichnet · nochmal antippen zum Abwählen · zwei Finger zum Zoomen";
    } else if (view.scale > 1) {
      el.textContent = "Kein Werkzeug — ein Finger verschiebt den Ausschnitt";
    } else {
      el.textContent = "Kein Werkzeug — die Seite lässt sich normal scrollen. " +
        "Zum Markieren oben ein Werkzeug wählen.";
    }
  }

  // ---------------------------------------------------------------- Eingabe

  function onDown(e) {
    if (!imageLoaded) return;

    /* Kein Werkzeug und nicht gezoomt: gar nichts tun, damit der Browser
       ganz normal scrollen kann. */
    if (!tool && view.scale === 1) return;

    if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, e);

    if (pointers.size === 2) {
      // zweiter Finger: laufende Markierung verwerfen, jetzt wird gezoomt
      drawing = false;
      current = null;
      panning = null;
      var pts = Array.from(pointers.values());
      pinch = {
        dist: abstand(pts[0], pts[1]),
        scale: view.scale,
        mitte: toImage(mittelpunkt(pts[0], pts[1]))
      };
      renderWork();
      renderView();
      return;
    }
    if (pointers.size > 2) return;

    var p = toImage(e);

    // Kein Werkzeug gewählt: ein Finger verschiebt den Ausschnitt
    if (!tool) {
      panning = { start: p, viewX: view.x, viewY: view.y };
      canvas.style.cursor = "grabbing";
      if (e.preventDefault) e.preventDefault();
      return;
    }

    if (tool === "text") {
      var text = prompt("Text für die Markierung:");
      if (text) {
        ops.push({ type: "text", x: p.x, y: p.y, text: text, color: color, width: width });
        renderWork();
        renderView();
      }
      return;
    }

    drawing = true;
    if (tool === "freehand") {
      current = { type: "freehand", punkte: [p], color: color, width: width };
    } else {
      current = { type: tool, x1: p.x, y1: p.y, x2: p.x, y2: p.y, color: color, width: width };
    }
    if (e.preventDefault) e.preventDefault();
  }

  function onMove(e) {
    if (!imageLoaded) return;
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, e);

    if (pointers.size === 2 && pinch) {
      var pts = Array.from(pointers.values());
      var d = abstand(pts[0], pts[1]);
      if (pinch.dist > 0) {
        var ziel = Math.min(MAX_ZOOM, Math.max(1, pinch.scale * (d / pinch.dist)));
        view.scale = ziel;
        var nw = work.width / ziel, nh = work.height / ziel;
        view.x = pinch.mitte.x - nw / 2;
        view.y = pinch.mitte.y - nh / 2;
        renderView();
      }
      return;
    }

    // Verschieben ohne Werkzeug
    if (panning) {
      var rect = canvas.getBoundingClientRect();
      var v = viewport();
      var dx = ((e.clientX - rect.left) / (rect.width || canvas.width)) * v.sw;
      var dy = ((e.clientY - rect.top) / (rect.height || canvas.height)) * v.sh;
      view.x = panning.viewX + (panning.start.x - panning.viewX - dx);
      view.y = panning.viewY + (panning.start.y - panning.viewY - dy);
      renderView();
      if (e.preventDefault) e.preventDefault();
      return;
    }

    if (!drawing || !current) return;
    var p = toImage(e);

    if (current.type === "freehand") current.punkte.push(p);
    else setzeZugpunkt(current, p);
    renderWork(current);
    renderView();
    if (e.preventDefault) e.preventDefault();
  }

  /* Wohin der mitgezogene Finger die Form schiebt.

     Beim Pfeil zeigt die Spitze dorthin, wo der Finger aufgesetzt hat: man
     tippt den Schaden an und zieht den Finger weg, der Schaft waechst hinter
     dem Finger her. Das ist beim Halten des Telefons deutlich intuitiver, weil
     die Hand die Stelle nicht verdeckt, die man gerade markiert.
     Intern bleibt x1 der Schaftanfang und x2 die Spitze — deshalb wandert beim
     Pfeil x1 mit, nicht x2. So sehen bereits gespeicherte Pfeile unveraendert
     aus, wenn ein alter Schaden nochmal geoeffnet wird. */
  function setzeZugpunkt(op, p) {
    if (op.type === "arrow") { op.x1 = p.x; op.y1 = p.y; }
    else { op.x2 = p.x; op.y2 = p.y; }
  }

  function onUp(e) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (panning) {
      panning = null;
      canvas.style.cursor = tool ? "crosshair" : "grab";
      return;
    }
    if (!drawing || !current) return;
    drawing = false;

    var gueltig = true;
    if (current.type === "freehand") gueltig = current.punkte.length > 1;
    if (current.type === "circle" || current.type === "arrow") {
      gueltig = Math.abs(current.x2 - current.x1) > 4 || Math.abs(current.y2 - current.y1) > 4;
    }
    if (gueltig) ops.push(current);
    current = null;
    renderWork();
    renderView();
  }

  function abstand(a, b) {
    return Math.sqrt(Math.pow(a.clientX - b.clientX, 2) + Math.pow(a.clientY - b.clientY, 2));
  }
  function mittelpunkt(a, b) {
    return { clientX: (a.clientX + b.clientX) / 2, clientY: (a.clientY + b.clientY) / 2 };
  }

  function undo() {
    if (!ops.length) return;
    ops.pop();
    renderWork();
    renderView();
  }

  function resetOps() {
    if (!ops.length) return;
    if (!confirm("Alle Markierungen entfernen? Das Foto bleibt erhalten.")) return;
    ops = [];
    renderWork();
    renderView();
  }

  // ---------------------------------------------------------------- Speichern

  /* Jedes Foto wird mit seinen Markierungen einzeln ausgegeben. Dafür wird
     die Arbeitsfläche nacheinander auf jedes Bild gesetzt und gezeichnet. */
  function save() {
    if (!bilder.length || !onSaveCb) return;
    sichereAktuelles();

    var ausgabe = bilder.map(function (b) {
      var w = b.img.width, h = b.img.height;
      if (w > MAX_DIM || h > MAX_DIM) {
        var f = MAX_DIM / Math.max(w, h);
        w = Math.round(w * f);
        h = Math.round(h * f);
      }
      work.width = w;
      work.height = h;
      workCtx.clearRect(0, 0, w, h);
      workCtx.drawImage(b.img, 0, 0, w, h);
      (b.ops || []).forEach(function (o) { drawOp(workCtx, o); });
      return work.toDataURL("image/jpeg", JPEG_QUALITY);
    });

    var modus = dateModeSel.value;
    var anzahl = parseInt(countInput.value, 10);
    var istZustand = aktuelleArt === "zustand";
    var payload = {
      images: ausgabe,
      count: istZustand ? 1 : ((isNaN(anzahl) || anzahl < 1) ? 1 : anzahl),
      description: noteInput.value.trim(),
      dateMode: istZustand ? "exact" : modus,
      date: (istZustand || modus === "exact") ? (dateInput.value || todayStr()) : "",
      area: areaInput.value.trim(),
      kind: aktuelleArt,
      km: istZustand ? kmInput.value.replace(/[^0-9]/g, "") : "",
      anlass: istZustand ? anlassSel.value : ""
    };
    var cb = onSaveCb;
    var alt = bearbeitet;
    close();
    cb(payload, alt);
  }

  App.Annotate = {
    bind: bind,
    open: open,
    close: close,
    todayStr: todayStr,
    _toImage: toImage,
    _ops: function () { return ops; },
    _view: function () { return view; },
    _tool: function () { return tool; },
    _bilder: function () { return bilder; },
    _zoomBy: zoomBy,
    _istHell: istHell,
    _setzeZugpunkt: setzeZugpunkt
  };

})(window.App = window.App || {});
