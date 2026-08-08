/* skizze-ui.js — die Schadenskizze auf dem Bildschirm
 *
 * skizze.js kennt die Umrisse und weiss, wie man sie auf eine Zeichenfläche
 * bringt. Hier kommt dazu, was der Finger damit macht: Ansicht wählen, Stelle
 * antippen, freie Zeichnung darüberlegen.
 *
 * Getrennt gehalten, weil der erste Teil rein rechnerisch ist und sich damit
 * ohne Bildschirm prüfen lässt — der zweite braucht ein Fenster.
 */

(function (App) {
  "use strict";

  var ROT = "#C61418";
  /* Gebrauchsspuren in Grau: auf einen Blick unterscheidbar, ohne dass sie
     wie ein zweiter Schadenstyp aussehen. */
  var GRAU = "#6b6b66";
  var MARKE_R = 3.4;          // Radius der Nummernscheibe in Ansichtseinheiten

  function q(id) { return document.getElementById(id); }

  function istHell() {
    return !(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  }

  /* Auf einem Retina-Bildschirm hat ein CSS-Pixel mehrere echte Bildpunkte.
     Ohne diese Rechnung sähen die Umrisse verwaschen aus. */
  function bereite(canvas, breite, hoehe) {
    var dpr = window.devicePixelRatio || 1;
    canvas.style.width = breite + "px";
    canvas.style.height = hoehe + "px";
    canvas.width = Math.round(breite * dpr);
    canvas.height = Math.round(hoehe * dpr);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, breite, hoehe);
    return ctx;
  }

  /* Eine Ansicht mit allem, was darauf gehört. Gibt die Lage der Zeichnung
     zurück, damit ein Tipp in Ansichtskoordinaten umgerechnet werden kann. */
  function zeichneAnsicht(canvas, opt) {
    var o = opt || {};
    var breite = o.breite || canvas.clientWidth || 300;
    var a = App.Skizze.ansicht(o.form, o.ansicht);
    var hoehe = o.hoehe || Math.round(breite * a.h / a.b);
    var ctx = bereite(canvas, breite, hoehe);

    var lage = App.Skizze.zeichneCanvas(ctx, o.form, o.ansicht,
      { x: 0, y: 0, breite: breite, hoehe: hoehe },
      {
        farbe: istHell() ? "#1a1a18" : "#e8e6e0",
        glas: istHell() ? "#eceae4" : "#2a2a27"
      });

    if (o.ops && o.ops.length) zeichneOps(ctx, o.ops, lage);
    canvas.__treffer = [];
    if (o.marken && o.marken.length) zeichneMarken(ctx, o.marken, lage, canvas.__treffer);
    if (o.aktiv) zeichneAktiv(ctx, o.aktiv, lage);

    canvas.__lage = lage;
    return lage;
  }

  function anteilNachPixel(lage, x, y) {
    return { x: lage.x + x * lage.breite, y: lage.y + y * lage.hoehe };
  }

  /* Umgekehrter Weg: wo hat der Finger hingetippt, als Anteil der Ansicht.
     Ausserhalb der Zeichnung wird abgeschnitten statt abgelehnt — wer knapp
     neben den Stossfänger tippt, meint den Stossfänger. */
  function pixelNachAnteil(lage, px, py) {
    var x = (px - lage.x) / lage.breite;
    var y = (py - lage.y) / lage.hoehe;
    return {
      x: Math.max(0, Math.min(1, x)),
      y: Math.max(0, Math.min(1, y))
    };
  }

  function zeichneMarken(ctx, marken, lage, treffer) {
    var gruppen = App.Skizze.gruppiere(marken);
    var r = MARKE_R * lage.faktor;
    gruppen.forEach(function (g) {
      var p = anteilNachPixel(lage, g.x, g.y);
      var text = g.nummern.join(", ");
      ctx.font = "600 " + Math.max(9, r * 1.15).toFixed(1) + "px system-ui, sans-serif";
      var tb = ctx.measureText(text).width;
      var w = Math.max(r * 2, tb + r * 1.1);
      var h = r * 2;

      /* Kreis bei einer Nummer, längliche Marke bei mehreren — so bleibt
         "1, 3" an einem Punkt lesbar, ohne dass Nummern übereinanderliegen. */
      ctx.beginPath();
      rundesRechteck(ctx, p.x - w / 2, p.y - h / 2, w, h, h / 2);
      ctx.fillStyle = g.spur ? GRAU : ROT;
      ctx.fill();
      ctx.lineWidth = Math.max(1, lage.faktor * 0.35);
      ctx.strokeStyle = "#fff";
      ctx.stroke();

      /* Mittig heisst hier: optisch mittig. "middle" richtet an der halben
         Schrifthoehe aus, nicht an der Mitte der Ziffern — Ziffern haben keine
         Unterlaengen, dadurch sitzt die Zahl zu tief. Deshalb wird die
         tatsaechliche Hoehe der Zeichen gemessen und danach ausgerichtet. */
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      var mass = ctx.measureText(text);
      var oben = mass.actualBoundingBoxAscent;
      var unten = mass.actualBoundingBoxDescent;
      var versatz = (typeof oben === "number" && typeof unten === "number" && oben > 0)
        ? (oben - unten) / 2
        : r * 0.55;                       // Notnagel, falls der Browser nicht misst
      ctx.fillText(text, p.x, p.y + versatz);

      /* Wo die Marke sitzt, wird mitgeschrieben — damit ein Tipp darauf zum
         Schaden führen kann. Etwas grosszügiger als gezeichnet: eine
         Fingerkuppe ist breiter als eine Zahl. */
      if (treffer) {
        var luft = Math.max(6, r * 0.8);
        treffer.push({
          x1: p.x - w / 2 - luft, y1: p.y - h / 2 - luft,
          x2: p.x + w / 2 + luft, y2: p.y + h / 2 + luft,
          ids: g.ids || [], nummern: g.nummern.slice(), spur: !!g.spur
        });
      }
    });
  }

  /* Welche Marke liegt unter diesem Punkt? Bei Überschneidung gewinnt die
     zuletzt gezeichnete — die liegt auch optisch oben. */
  function markeBei(canvas, px, py) {
    var treffer = canvas.__treffer || [];
    for (var i = treffer.length - 1; i >= 0; i--) {
      var t = treffer[i];
      if (px >= t.x1 && px <= t.x2 && py >= t.y1 && py <= t.y2) return t;
    }
    return null;
  }

  /* Die Stelle, die gerade gesetzt wird: ein Ring, damit sie sich von den
     schon vergebenen Nummern unterscheidet. */
  function zeichneAktiv(ctx, marke, lage) {
    var p = anteilNachPixel(lage, marke.x, marke.y);
    var r = MARKE_R * lage.faktor;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * 1.5, 0, Math.PI * 2);
    ctx.strokeStyle = ROT;
    ctx.lineWidth = Math.max(1.5, lage.faktor * 0.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = ROT;
    ctx.fill();
  }

  function rundesRechteck(ctx, x, y, b, h, r) {
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + b - r, y);
    ctx.quadraticCurveTo(x + b, y, x + b, y + r);
    ctx.lineTo(x + b, y + h - r);
    ctx.quadraticCurveTo(x + b, y + h, x + b - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // ------------------------------------------------------- Freie Zeichnung

  /* Ein Zug der freien Ebene:
       { ansicht: "links", art: "frei"|"kreuz"|"kreis", punkte: [[x,y], ...] }
     Punkte immer als Anteil der Ansicht, damit die Zeichnung auf jedem Gerät
     und im PDF an derselben Stelle sitzt. */
  function zeichneOps(ctx, ops, lage, nurAnsicht) {
    ops.forEach(function (op) {
      if (nurAnsicht && op.ansicht !== nurAnsicht) return;
      var p = (op.punkte || []).map(function (pt) {
        return anteilNachPixel(lage, pt[0], pt[1]);
      });
      if (!p.length) return;
      ctx.strokeStyle = ROT;
      ctx.lineWidth = Math.max(1.4, lage.faktor * 0.6);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (op.art === "kreuz") {
        var d = Math.max(6, lage.faktor * 2.6);
        ctx.beginPath();
        ctx.moveTo(p[0].x - d, p[0].y - d); ctx.lineTo(p[0].x + d, p[0].y + d);
        ctx.moveTo(p[0].x + d, p[0].y - d); ctx.lineTo(p[0].x - d, p[0].y + d);
        ctx.stroke();
      } else if (op.art === "kreis" && p.length > 1) {
        var rx = Math.abs(p[1].x - p[0].x), ry = Math.abs(p[1].y - p[0].y);
        ctx.beginPath();
        ctx.ellipse(p[0].x, p[0].y, Math.max(rx, 3), Math.max(ry, 3), 0, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(p[0].x, p[0].y);
        for (var i = 1; i < p.length; i++) ctx.lineTo(p[i].x, p[i].y);
        ctx.stroke();
      }
    });
  }

  // ------------------------------------------------------------- Tafel

  /* Alle fünf Ansichten nebeneinander, wie auf einem Papierprotokoll. */
  function tafel(el, opt) {
    var o = opt || {};
    el.innerHTML = "";
    App.Skizze.ANSICHTEN.forEach(function (an) {
      var kasten = document.createElement("figure");
      kasten.className = "skizze-ansicht ansicht-" + an.id;

      var c = document.createElement("canvas");
      kasten.appendChild(c);

      var bez = document.createElement("figcaption");
      bez.textContent = an.name;
      kasten.appendChild(bez);

      el.appendChild(kasten);

      /* Erst anhängen, dann messen: vorher hat das Element keine Breite. */
      if (o.beiTipp) {
        c.style.cursor = "pointer";
        c.addEventListener("click", function (e) {
          var kasten = c.getBoundingClientRect();
          var t = markeBei(c, e.clientX - kasten.left, e.clientY - kasten.top);
          if (t) o.beiTipp(t);
        });
      }

      var breite = c.parentNode.clientWidth || 150;
      zeichneAnsicht(c, {
        form: o.form,
        ansicht: an.id,
        breite: breite,
        marken: (o.marken || []).filter(function (m) { return m.ansicht === an.id; }),
        ops: (o.ops || []).filter(function (x) { return x.ansicht === an.id; })
      });
    });
  }

  // ------------------------------------------------------------- Reiter

  function reiter(el, aktiv, beiWechsel) {
    el.innerHTML = "";
    App.Skizze.ANSICHTEN.forEach(function (an) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "ansicht-btn" + (an.id === aktiv ? " active" : "");
      b.textContent = an.name;
      b.addEventListener("click", function () { beiWechsel(an.id); });
      el.appendChild(b);
    });
  }

  App.SkizzeUi = {
    zeichneAnsicht: zeichneAnsicht,
    zeichneOps: zeichneOps,
    tafel: tafel,
    reiter: reiter,
    pixelNachAnteil: pixelNachAnteil,
    markeBei: markeBei,
    anteilNachPixel: anteilNachPixel,
    q: q
  };

})(window.App = window.App || {});
