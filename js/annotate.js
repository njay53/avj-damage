/* annotate.js — Foto aufnehmen und markieren
 *
 * App.Annotate.open({ title, onSave }) öffnet den Dialog.
 * onSave erhält { image (dataURL), note, date, area }.
 */
(function (App) {
  "use strict";

  var MAX_DIM = 1400;
  var JPEG_QUALITY = 0.82;

  var overlay, canvas, ctx, placeholder, camInput, fileInput, noteInput, dateInput,
      areaInput, saveBtn, titleEl, colorInput, widthInput, statusEl;

  var tool = "circle";
  var color = "#ff2d2d";
  var width = 5;
  var imageLoaded = false;
  var originalImg = null;
  var base = null;          // ImageData des bestätigten Zustands
  var undoStack = [];
  var preview = null;
  var drawing = false;
  var start = null;
  var onSaveCb = null;

  function q(id) { return App.el(id, "annotate.js"); }

  function todayStr() {
    var d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString().slice(0, 10);
  }

  function cloneImageData(id) {
    return new ImageData(new Uint8ClampedArray(id.data), id.width, id.height);
  }

  function bind() {
    overlay = q("modal-annotate");
    canvas = q("annotate-canvas");
    ctx = canvas.getContext("2d");
    placeholder = q("canvas-placeholder");
    /* Zwei getrennte Eingabefelder: nur mit capture öffnet iOS direkt die
       Kamera, ohne capture bekommt man Mediathek und Dateien. Ein einzelnes
       Feld mit capture blendet die Mediathek komplett aus. */
    camInput = q("input-photo-camera");
    fileInput = q("input-photo-file");
    statusEl = q("photo-status");
    noteInput = q("input-note");
    dateInput = q("input-date");
    areaInput = q("input-area");
    saveBtn = q("btn-save-damage");
    titleEl = q("annotate-title");
    colorInput = q("input-color");
    widthInput = q("input-width");

    document.querySelectorAll(".tool-btn[data-tool]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        tool = btn.getAttribute("data-tool");
        document.querySelectorAll(".tool-btn[data-tool]").forEach(function (b) {
          b.classList.remove("active");
        });
        btn.classList.add("active");
      });
    });

    colorInput.addEventListener("input", function () { color = colorInput.value; });
    widthInput.addEventListener("input", function () {
      width = parseInt(widthInput.value, 10);
    });

    camInput.addEventListener("change", function () { handleFile(camInput); });
    fileInput.addEventListener("change", function () { handleFile(fileInput); });
    q("btn-photo-camera").addEventListener("click", function () { camInput.click(); });
    q("btn-photo-file").addEventListener("click", function () { fileInput.click(); });

    q("btn-undo").addEventListener("click", undo);
    q("btn-reset-canvas").addEventListener("click", resetCanvas);
    saveBtn.addEventListener("click", save);

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", endDraw);
    canvas.addEventListener("pointercancel", endDraw);
    canvas.addEventListener("pointerleave", function () { if (drawing) endDraw(); });
  }

  function open(opts) {
    onSaveCb = opts.onSave;
    titleEl.textContent = opts.title || "Schaden erfassen";
    reset();
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
    originalImg = null;
    base = null;
    undoStack = [];
    canvas.classList.add("hidden");
    placeholder.classList.remove("hidden");
    camInput.value = "";
    fileInput.value = "";
    statusEl.textContent = "";
    statusEl.className = "pick-status";
    saveBtn.disabled = true;
  }

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
      var img = new Image();
      img.onload = function () {
        var w = img.width, h = img.height;
        if (w > MAX_DIM || h > MAX_DIM) {
          var scale = MAX_DIM / Math.max(w, h);
          w = Math.round(w * scale);
          h = Math.round(h * scale);
        }
        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(img, 0, 0, w, h);
        originalImg = img;
        base = ctx.getImageData(0, 0, w, h);
        undoStack = [];
        imageLoaded = true;
        placeholder.classList.add("hidden");
        canvas.classList.remove("hidden");
        saveBtn.disabled = false;
        statusEl.textContent = "Foto geladen — jetzt markieren.";
        statusEl.className = "pick-status ok";
      };
      img.onerror = function () {
        statusEl.textContent = "Bild konnte nicht gelesen werden. Anderes Foto versuchen.";
        statusEl.className = "pick-status err";
      };
      img.src = e.target.result;
    };
    reader.onerror = function () {
      statusEl.textContent = "Datei konnte nicht gelesen werden.";
      statusEl.className = "pick-status err";
    };
    reader.readAsDataURL(file);
  }

  function pos(evt) {
    var rect = canvas.getBoundingClientRect();
    return {
      x: (evt.clientX - rect.left) * (canvas.width / rect.width),
      y: (evt.clientY - rect.top) * (canvas.height / rect.height)
    };
  }

  function drawArrow(c, x1, y1, x2, y2) {
    c.strokeStyle = color;
    c.fillStyle = color;
    c.lineWidth = width;
    c.lineCap = "round";
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x2, y2);
    c.stroke();
    var angle = Math.atan2(y2 - y1, x2 - x1);
    var head = Math.max(14, width * 4.5);
    c.beginPath();
    c.moveTo(x2, y2);
    c.lineTo(x2 - head * Math.cos(angle - Math.PI / 6), y2 - head * Math.sin(angle - Math.PI / 6));
    c.lineTo(x2 - head * Math.cos(angle + Math.PI / 6), y2 - head * Math.sin(angle + Math.PI / 6));
    c.closePath();
    c.fill();
  }

  function drawEllipse(c, x1, y1, x2, y2) {
    var cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
    var rx = Math.max(2, Math.abs(x2 - x1) / 2);
    var ry = Math.max(2, Math.abs(y2 - y1) / 2);
    c.strokeStyle = color;
    c.lineWidth = width;
    c.beginPath();
    c.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
    c.stroke();
  }

  function onDown(e) {
    if (!imageLoaded) return;
    canvas.setPointerCapture(e.pointerId);
    start = pos(e);

    if (tool === "text") {
      var text = prompt("Text für die Markierung:");
      if (text) {
        undoStack.push(cloneImageData(base));
        ctx.putImageData(base, 0, 0);
        ctx.font = "bold " + Math.max(24, width * 6) + "px sans-serif";
        ctx.fillStyle = color;
        ctx.textBaseline = "top";
        ctx.fillText(text, start.x, start.y);
        base = ctx.getImageData(0, 0, canvas.width, canvas.height);
      }
      drawing = false;
      return;
    }

    drawing = true;
    undoStack.push(cloneImageData(base));

    if (tool === "freehand") {
      ctx.putImageData(base, 0, 0);
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
    } else {
      preview = cloneImageData(base);
    }
  }

  function onMove(e) {
    if (!drawing) return;
    var p = pos(e);
    if (tool === "freehand") {
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    } else {
      ctx.putImageData(preview, 0, 0);
      if (tool === "circle") drawEllipse(ctx, start.x, start.y, p.x, p.y);
      else drawArrow(ctx, start.x, start.y, p.x, p.y);
    }
  }

  function endDraw() {
    if (!drawing) return;
    drawing = false;
    base = ctx.getImageData(0, 0, canvas.width, canvas.height);
  }

  function undo() {
    if (!undoStack.length) return;
    base = undoStack.pop();
    ctx.putImageData(base, 0, 0);
  }

  function resetCanvas() {
    if (!originalImg) return;
    ctx.drawImage(originalImg, 0, 0, canvas.width, canvas.height);
    base = ctx.getImageData(0, 0, canvas.width, canvas.height);
    undoStack = [];
  }

  function save() {
    if (!imageLoaded || !onSaveCb) return;
    var payload = {
      image: canvas.toDataURL("image/jpeg", JPEG_QUALITY),
      note: noteInput.value.trim(),
      date: dateInput.value || todayStr(),
      area: areaInput.value.trim()
    };
    var cb = onSaveCb;
    close();
    cb(payload);
  }

  App.Annotate = { bind: bind, open: open, close: close, todayStr: todayStr };

})(window.App = window.App || {});
