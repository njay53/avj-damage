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
 *   · die Lupe kann den darunterliegenden Bildinhalt sauber abgreifen
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
      dateRow, zoomLabel, loupeFactorSel, loupeWrap, lupe, lupeCtx;

  var work, workCtx;        // volle Auflösung
  var img = null;           // Originalbild
  var ops = [];             // bestätigte Markierungen
  var tool = "circle";
  var color = "#ff3b30";
  var width = 6;
  var loupeFactor = 2.5;
  var imageLoaded = false;
  var onSaveCb = null;

  // Ansicht: welcher Bildausschnitt ist zu sehen
  var view = { scale: 1, x: 0, y: 0 };

  // Zeigerverwaltung
  var pointers = new Map();
  var drawing = false;
  var current = null;       // Operation in Arbeit
  var pinch = null;

  function q(id) { return App.el(id, "annotate.js"); }

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
    zoomLabel = q("zoom-label");
    loupeFactorSel = q("input-loupe-factor");
    loupeWrap = q("loupe-factor-wrap");
    lupe = q("draw-loupe");
    lupeCtx = lupe.getContext("2d");

    work = document.createElement("canvas");
    workCtx = work.getContext("2d");

    document.querySelectorAll(".tool-btn[data-tool]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        tool = btn.getAttribute("data-tool");
        document.querySelectorAll(".tool-btn[data-tool]").forEach(function (b) {
          b.classList.remove("active");
        });
        btn.classList.add("active");
        loupeWrap.classList.toggle("hidden", tool !== "loupe");
      });
    });

    colorInput.addEventListener("input", function () { color = colorInput.value; });
    widthInput.addEventListener("input", function () {
      width = parseInt(widthInput.value, 10);
    });
    loupeFactorSel.addEventListener("change", function () {
      loupeFactor = parseFloat(loupeFactorSel.value);
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

  function open(opts) {
    onSaveCb = opts.onSave;
    titleEl.textContent = opts.title || "Schaden erfassen";
    reset();
    dateModeSel.value = "exact";
    dateRow.classList.remove("hidden");
    dateInput.value = todayStr();
    noteInput.value = "";
    areaInput.value = "";
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
    view = { scale: 1, x: 0, y: 0 };
    pointers.clear();
    drawing = false;
    current = null;
    canvas.classList.add("hidden");
    q("zoom-row").classList.add("hidden");
    placeholder.classList.remove("hidden");
    lupe.classList.add("hidden");
    camInput.value = "";
    fileInput.value = "";
    statusEl.textContent = "";
    statusEl.className = "pick-status";
    saveBtn.disabled = true;
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
        var w = bild.width, h = bild.height;
        if (w > MAX_DIM || h > MAX_DIM) {
          var f = MAX_DIM / Math.max(w, h);
          w = Math.round(w * f);
          h = Math.round(h * f);
        }
        work.width = w;
        work.height = h;
        img = bild;
        ops = [];
        view = { scale: 1, x: 0, y: 0 };
        imageLoaded = true;

        placeholder.classList.add("hidden");
        canvas.classList.remove("hidden");
        q("zoom-row").classList.remove("hidden");
        saveBtn.disabled = false;
        statusEl.textContent = "Foto geladen — jetzt markieren.";
        statusEl.className = "pick-status ok";

        renderWork();
        renderView();
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

  /* Der Schaft endet kurz VOR der Spitze und hat stumpfe Enden — sonst ragt
     die runde Linienkappe vorne aus dem Dreieck heraus. Genau das sah beim
     alten Pfeil aus wie ein Fehler. */
  function drawArrow(c, o) {
    var dx = o.x2 - o.x1, dy = o.y2 - o.y1;
    var laenge = Math.sqrt(dx * dx + dy * dy);
    if (laenge < 1) return;
    var winkel = Math.atan2(dy, dx);
    var kopf = Math.max(20, o.width * 3.6);
    if (kopf > laenge * 0.65) kopf = laenge * 0.65;

    var schaftEnde = laenge - kopf * 0.9;
    var ex = o.x1 + Math.cos(winkel) * schaftEnde;
    var ey = o.y1 + Math.sin(winkel) * schaftEnde;

    c.save();
    c.strokeStyle = o.color;
    c.fillStyle = o.color;
    c.lineWidth = o.width;
    c.lineCap = "butt";
    c.beginPath();
    c.moveTo(o.x1, o.y1);
    c.lineTo(ex, ey);
    c.stroke();

    c.beginPath();
    c.moveTo(o.x2, o.y2);
    c.lineTo(o.x2 - kopf * Math.cos(winkel - 0.42), o.y2 - kopf * Math.sin(winkel - 0.42));
    c.lineTo(o.x2 - kopf * Math.cos(winkel) * 0.7, o.y2 - kopf * Math.sin(winkel) * 0.7);
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

  /* Lupe als Werkzeug: der Kreisinhalt zeigt denselben Ausschnitt vergrössert.
     Gelesen wird aus einer Kopie des bisherigen Standes, damit sich die Lupe
     nicht selbst abbildet. */
  function drawLoupe(c, o, quelle) {
    var r = Math.max(20, o.r);
    c.save();
    c.beginPath();
    c.arc(o.x, o.y, r, 0, 2 * Math.PI);
    c.closePath();
    c.clip();

    var f = o.factor || 2.5;
    c.translate(o.x, o.y);
    c.scale(f, f);
    c.translate(-o.x, -o.y);
    c.drawImage(quelle, 0, 0);
    c.restore();

    c.save();
    c.strokeStyle = o.color;
    c.lineWidth = Math.max(3, o.width);
    c.beginPath();
    c.arc(o.x, o.y, r, 0, 2 * Math.PI);
    c.stroke();
    c.restore();
  }

  function drawOp(c, o) {
    if (o.type === "circle") return drawEllipse(c, o);
    if (o.type === "arrow") return drawArrow(c, o);
    if (o.type === "freehand") return drawFree(c, o);
    if (o.type === "text") return drawText(c, o);
    if (o.type === "loupe") {
      var kopie = document.createElement("canvas");
      kopie.width = work.width;
      kopie.height = work.height;
      kopie.getContext("2d").drawImage(c.canvas, 0, 0);
      return drawLoupe(c, o, kopie);
    }
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

  // ---------------------------------------------------------------- Zeichenhilfe

  function zeigeLupe(p, evt) {
    var rect = canvas.getBoundingClientRect();
    var groesse = 116;
    if (lupe.width !== groesse * 2) {
      lupe.width = groesse * 2;
      lupe.height = groesse * 2;
    }

    var f = 3;
    var aus = groesse / f;
    lupeCtx.save();
    lupeCtx.clearRect(0, 0, lupe.width, lupe.height);
    lupeCtx.beginPath();
    lupeCtx.arc(groesse, groesse, groesse - 2, 0, 2 * Math.PI);
    lupeCtx.closePath();
    lupeCtx.fillStyle = "#111";
    lupeCtx.fill();
    lupeCtx.clip();
    lupeCtx.drawImage(work, p.x - aus, p.y - aus, aus * 2, aus * 2, 0, 0, lupe.width, lupe.height);
    lupeCtx.strokeStyle = "rgba(255,255,255,.85)";
    lupeCtx.lineWidth = 2;
    lupeCtx.beginPath();
    lupeCtx.moveTo(groesse - 14, groesse); lupeCtx.lineTo(groesse + 14, groesse);
    lupeCtx.moveTo(groesse, groesse - 14); lupeCtx.lineTo(groesse, groesse + 14);
    lupeCtx.stroke();
    lupeCtx.restore();

    // über dem Finger platzieren, damit die Hand nichts verdeckt
    var x = evt.clientX - rect.left - groesse / 2;
    var y = evt.clientY - rect.top - groesse - 46;
    if (y < 4) y = evt.clientY - rect.top + 40;
    x = Math.min(Math.max(4, x), Math.max(4, rect.width - groesse - 4));
    lupe.style.left = Math.round(x) + "px";
    lupe.style.top = Math.round(y) + "px";
    lupe.classList.remove("hidden");
  }

  function versteckeLupe() { lupe.classList.add("hidden"); }

  // ---------------------------------------------------------------- Eingabe

  function onDown(e) {
    if (!imageLoaded) return;
    if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, e);

    if (pointers.size === 2) {
      // zweiter Finger: laufende Markierung verwerfen, jetzt wird gezoomt
      drawing = false;
      current = null;
      versteckeLupe();
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
    } else if (tool === "loupe") {
      current = { type: "loupe", x: p.x, y: p.y, r: 0, color: color, width: width, factor: loupeFactor };
    } else {
      current = { type: tool, x1: p.x, y1: p.y, x2: p.x, y2: p.y, color: color, width: width };
    }
    zeigeLupe(p, e);
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

    if (!drawing || !current) return;
    var p = toImage(e);

    if (current.type === "freehand") {
      current.punkte.push(p);
    } else if (current.type === "loupe") {
      current.r = Math.sqrt(Math.pow(p.x - current.x, 2) + Math.pow(p.y - current.y, 2));
    } else {
      current.x2 = p.x;
      current.y2 = p.y;
    }
    renderWork(current);
    renderView();
    zeigeLupe(p, e);
    if (e.preventDefault) e.preventDefault();
  }

  function onUp(e) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    versteckeLupe();
    if (!drawing || !current) return;
    drawing = false;

    var gueltig = true;
    if (current.type === "freehand") gueltig = current.punkte.length > 1;
    if (current.type === "loupe") gueltig = current.r > 12;
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

  function save() {
    if (!imageLoaded || !onSaveCb) return;
    renderWork();
    var modus = dateModeSel.value;
    var payload = {
      image: work.toDataURL("image/jpeg", JPEG_QUALITY),
      note: noteInput.value.trim(),
      dateMode: modus,
      date: modus === "exact" ? (dateInput.value || todayStr()) : "",
      area: areaInput.value.trim()
    };
    var cb = onSaveCb;
    close();
    cb(payload);
  }

  App.Annotate = {
    bind: bind,
    open: open,
    close: close,
    todayStr: todayStr,
    _toImage: toImage,
    _ops: function () { return ops; },
    _view: function () { return view; },
    _zoomBy: zoomBy,
    _istHell: istHell
  };

})(window.App = window.App || {});
