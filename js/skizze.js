/* skizze.js — Schadenskizze: Fahrzeugumrisse in fünf Ansichten
 *
 * Warum eigene Zeichnungen und keine Fotos oder fertigen Grafiken:
 *
 *   - Modellgenaue Umrisse gibt es für einen wechselnden Bestand nirgends in
 *     brauchbarer Form. Was frei verfügbar ist, ist unterschiedlich gezeichnet,
 *     unterschiedlich lizenziert und sieht auf einem Protokoll nach Sammelsurium
 *     aus. Gedruckte Übergabeprotokolle machen es genauso: eine schematische
 *     Form je Fahrzeugklasse.
 *   - Diese Umrisse gehören uns. Sie sind als Pfade abgelegt, nicht als Bild,
 *     also im PDF gestochen scharf, im Speicher ein paar Kilobyte und in der
 *     App und im PDF garantiert identisch.
 *
 * Aufbau: jede Form hat fünf Ansichten. Jede Ansicht hat eine eigene Größe in
 * frei gewählten Einheiten und eine Liste von Zügen. Die Züge stehen in einer
 * abgespeckten Fassung der SVG-Pfadschreibweise (M, L, C, Z), damit man sie
 * lesen und ändern kann, ohne Zahlenkolonnen zu entziffern.
 *
 * Die Schadenstelle wird als Anteil der Ansichtsgröße gespeichert (0 bis 1),
 * nicht in Pixeln. Damit sitzt die Nummer auf jedem Bildschirm und im PDF an
 * derselben Stelle am Fahrzeug.
 */

(function (App) {
  "use strict";

  var ANSICHTEN = [
    { id: "links", name: "Links", kurz: "L" },
    { id: "rechts", name: "Rechts", kurz: "R" },
    { id: "vorn", name: "Vorn", kurz: "V" },
    { id: "hinten", name: "Hinten", kurz: "H" },
    { id: "oben", name: "Oben", kurz: "O" }
  ];

  /* Strichstärken in Ansichtseinheiten. Sie werden mitskaliert, damit eine
     kleine Skizze nicht in fetten Strichen ersäuft und eine große nicht
     dünn und blass wirkt. */
  var STIL = {
    kontur: { staerke: 0.9 },
    linie: { staerke: 0.45 },
    glas: { staerke: 0.45, fuellung: 0.92 },
    rad: { staerke: 0.6 },
    fein: { staerke: 0.3 }
  };

  // ================================================================ PKW kompakt

  var PKW_SEITE = [
    { stil: "kontur", d:
      "M 4.5,28.5 " +
      "C 4.5,24.6 5.8,22.6 9,21.6 " +
      "L 27,19.2 " +
      "C 29.5,19 30.8,18.6 32.2,17.6 " +
      "L 45,10.9 " +
      "C 46.5,10.3 47.8,10.1 49.6,10.1 " +
      "L 76,10.1 " +
      "C 79.6,10.3 82,11.1 84.2,12.8 " +
      "L 92.4,20.4 " +
      "C 95.2,22.6 96.4,24.8 96.4,27.8 " +
      "L 96.4,33.6 " +
      "C 96.4,35 95.9,35.5 94.4,35.5 " +
      "L 86.2,35.5 " +
      "C 86.2,27.2 82.6,23.4 78,23.4 " +
      "C 73.4,23.4 69.8,27.2 69.8,35.5 " +
      "L 30.2,35.5 " +
      "C 30.2,27.2 26.6,23.4 22,23.4 " +
      "C 17.4,23.4 13.8,27.2 13.8,35.5 " +
      "L 6.1,35.5 " +
      "C 4.9,35.5 4.5,34.9 4.5,33.6 Z" },
    { stil: "glas", d: "M 46.4,16.4 L 50.2,11 L 62.6,10.9 L 62.6,16.4 Z" },
    { stil: "glas", d:
      "M 64.2,16.5 L 64.2,10.9 L 76,11 " +
      "C 78.6,11.5 80.4,12.3 82,13.7 L 85.4,16.6 Z" },
    { stil: "linie", d: "M 45.6,16.4 L 45.6,34.6" },
    { stil: "linie", d: "M 63.4,10.9 L 63.4,34.8" },
    { stil: "fein", d: "M 55,19.6 L 60,19.6" },
    { stil: "fein", d: "M 70,19.8 L 75,19.8" },
    { stil: "linie", d: "M 44.5,16.8 L 41,17.8 L 41.8,19.6 L 45.4,18.6 Z" },
    { stil: "rad", kreis: [22, 33, 8.3] },
    { stil: "fein", kreis: [22, 33, 4.2] },
    { stil: "rad", kreis: [78, 33, 8.3] },
    { stil: "fein", kreis: [78, 33, 4.2] }
  ];

  var PKW = {
    name: "PKW kompakt",
    hinweis: "Fließheck, drei- oder fünftürig",
    ansichten: {
      links: { b: 100, h: 42, teile: PKW_SEITE },
      rechts: { b: 100, h: 42, teile: PKW_SEITE, spiegeln: true },
      vorn: { b: 46, h: 42, teile: [
        { stil: "kontur", d:
          "M 4.2,37.6 " +
          "C 3.2,37.4 2.8,36.4 2.8,34.6 " +
          "L 3,25.8 " +
          "C 3.2,22.6 4.6,21 7,20 " +
          "L 10,19.2 " +
          "C 11.4,15.8 12.8,13.2 14.6,11.6 " +
          "C 16,10.5 17.4,10.2 19.4,10.1 " +
          "L 26.6,10.1 " +
          "C 28.6,10.2 30,10.5 31.4,11.6 " +
          "C 33.2,13.2 34.6,15.8 36,19.2 " +
          "L 39,20 " +
          "C 41.4,21 42.8,22.6 43,25.8 " +
          "L 43.2,34.6 " +
          "C 43.2,36.4 42.8,37.4 41.8,37.6 Z" },
        { stil: "glas", d: "M 12.4,18.6 L 15.6,12.2 L 30.4,12.2 L 33.6,18.6 Z" },
        { stil: "linie", d: "M 10.6,19.4 L 35.4,19.4" },
        { stil: "linie", d: "M 15,23.4 L 31,23.4 L 31,28.4 L 15,28.4 Z" },
        { stil: "linie", d: "M 5.2,22.6 L 13.6,23.2 L 13.4,27.2 L 5,26.6 Z" },
        { stil: "linie", d: "M 40.8,22.6 L 32.4,23.2 L 32.6,27.2 L 41,26.6 Z" },
        { stil: "fein", d: "M 3.4,30.4 L 42.6,30.4" },
        { stil: "linie", d: "M 16,32.2 L 30,32.2 L 30,36.2 L 16,36.2 Z" },
        { stil: "rad", d: "M 3.2,32.6 L 7.8,32.6 L 7.8,41.2 L 3.2,41.2 Z" },
        { stil: "rad", d: "M 38.2,32.6 L 42.8,32.6 L 42.8,41.2 L 38.2,41.2 Z" },
        { stil: "linie", d: "M 1.2,20 L 4.4,19.4 L 4.6,21.6 L 1.4,22.2 Z" },
        { stil: "linie", d: "M 44.8,20 L 41.6,19.4 L 41.4,21.6 L 44.6,22.2 Z" }
      ] },
      hinten: { b: 46, h: 42, teile: [
        { stil: "kontur", d:
          "M 4.2,37.6 " +
          "C 3.2,37.4 2.8,36.4 2.8,34.6 " +
          "L 3,24.8 " +
          "C 3,21.6 4,20 6.2,19 " +
          "L 9.4,17.8 " +
          "C 10.4,14.4 11.6,12 13.2,11 " +
          "C 14.6,10.3 16.2,10.1 18.4,10.1 " +
          "L 27.6,10.1 " +
          "C 29.8,10.1 31.4,10.3 32.8,11 " +
          "C 34.4,12 35.6,14.4 36.6,17.8 " +
          "L 39.8,19 " +
          "C 42,20 43,21.6 43,24.8 " +
          "L 43.2,34.6 " +
          "C 43.2,36.4 42.8,37.4 41.8,37.6 Z" },
        { stil: "glas", d: "M 12,17.2 L 13.8,11.6 L 32.2,11.6 L 34,17.2 Z" },
        { stil: "linie", d: "M 10.2,18.6 L 35.8,18.6" },
        { stil: "linie", d: "M 4.4,20.6 L 12.4,21.6 L 12.2,26.8 L 4.2,25.8 Z" },
        { stil: "linie", d: "M 41.6,20.6 L 33.6,21.6 L 33.8,26.8 L 41.8,25.8 Z" },
        { stil: "linie", d: "M 15,27.4 L 31,27.4 L 31,31.6 L 15,31.6 Z" },
        { stil: "fein", d: "M 3.2,32.8 L 42.8,32.8" },
        { stil: "rad", d: "M 3.2,32.6 L 7.8,32.6 L 7.8,41.2 L 3.2,41.2 Z" },
        { stil: "rad", d: "M 38.2,32.6 L 42.8,32.6 L 42.8,41.2 L 38.2,41.2 Z" }
      ] },
      oben: { b: 100, h: 46, teile: [
        { stil: "kontur", d:
          "M 6,23 " +
          "C 6,19.6 7.2,16 10,13.6 " +
          "C 13,11.2 17,10 22,9.6 " +
          "L 40,8.2 " +
          "C 52,7.6 64,7.4 74,7.6 " +
          "C 82,7.8 88,8.8 91.6,10.8 " +
          "C 95,12.8 96.6,17 96.6,23 " +
          "C 96.6,29 95,33.2 91.6,35.2 " +
          "C 88,37.2 82,38.2 74,38.4 " +
          "C 64,38.6 52,38.4 40,37.8 " +
          "L 22,36.4 " +
          "C 17,36 13,34.8 10,32.4 " +
          "C 7.2,30 6,26.4 6,23 Z" },
        { stil: "linie", d: "M 30,9.6 L 30,36.4" },
        { stil: "glas", d: "M 34,10.4 L 46,13.2 L 46,32.8 L 34,35.6 Z" },
        { stil: "linie", d: "M 47.4,13.3 L 70,13.3 L 70,32.7 L 47.4,32.7 Z" },
        { stil: "glas", d: "M 71.4,13.2 L 81,11 L 81,35 L 71.4,32.8 Z" },
        { stil: "fein", d: "M 60,8 L 60,13.3" },
        { stil: "fein", d: "M 60,32.7 L 60,38.2" },
        { stil: "linie", d: "M 33,7.8 L 38,4.4 L 40,6 L 35,9 Z" },
        { stil: "linie", d: "M 33,38.2 L 38,41.6 L 40,40 L 35,37 Z" }
      ] }
    }
  };

  // =========================================================== Transporter

  var VAN_SEITE = [
    { stil: "kontur", d:
      "M 3.2,25.4 " +
      "C 3.2,21.2 4.2,18.4 6.6,16.8 " +
      "L 12.4,13.6 " +
      "L 16.4,6.2 " +
      "C 17,4.6 18.4,3.6 20.6,3.6 " +
      "L 94.6,3.6 " +
      "C 96.2,3.6 96.8,4.2 96.8,5.8 " +
      "L 96.8,36.2 " +
      "C 96.8,37.6 96.3,38.1 94.8,38.1 " +
      "L 88.8,38.1 " +
      "C 88.8,30.4 85.2,26.8 81,26.8 " +
      "C 76.8,26.8 73.2,30.4 73.2,38.1 " +
      "L 26.8,38.1 " +
      "C 26.8,30.4 23.2,26.8 19,26.8 " +
      "C 14.8,26.8 11.2,30.4 11.2,38.1 " +
      "L 5.2,38.1 " +
      "C 3.7,38.1 3.2,37.5 3.2,36.1 Z" },
    { stil: "glas", d: "M 17.2,6.4 L 27,6 L 27,14.6 L 13.4,14.6 Z" },
    { stil: "glas", d: "M 28.6,6 L 40.6,6 L 40.6,14.8 L 28.6,14.8 Z" },
    { stil: "linie", d: "M 27.6,5.8 L 27.6,38.1" },
    { stil: "linie", d: "M 42,5.6 L 42,38.1" },
    { stil: "linie", d: "M 43.6,6.4 L 66.6,6.4 L 66.6,37.6" },
    { stil: "fein", d: "M 60,17.6 L 65,17.6" },
    { stil: "fein", d: "M 28,30.6 L 92,30.6" },
    { stil: "linie", d: "M 12.6,10.4 L 8.6,9.2 L 8.2,12.4 L 12.4,13.2 Z" },
    { stil: "rad", kreis: [19, 35.6, 7.8] },
    { stil: "fein", kreis: [19, 35.6, 3.9] },
    { stil: "rad", kreis: [81, 35.6, 7.8] },
    { stil: "fein", kreis: [81, 35.6, 3.9] }
  ];

  var VAN = {
    name: "Transporter",
    hinweis: "Kastenwagen bis 3,5 t",
    ansichten: {
      links: { b: 100, h: 44, teile: VAN_SEITE },
      rechts: { b: 100, h: 44, teile: VAN_SEITE, spiegeln: true },
      vorn: { b: 48, h: 44, teile: [
        { stil: "kontur", d:
          "M 5,39.4 " +
          "C 3.6,39.2 3,38.2 3,36.2 " +
          "L 3,10.6 " +
          "C 3,8.4 4,7.4 6.2,7.2 " +
          "L 41.8,7.2 " +
          "C 44,7.4 45,8.4 45,10.6 " +
          "L 45,36.2 " +
          "C 45,38.2 44.4,39.2 43,39.4 Z" },
        { stil: "glas", d: "M 6.6,9.4 L 41.4,9.4 L 41.4,19.6 L 6.6,19.6 Z" },
        { stil: "linie", d: "M 4,21.4 L 44,21.4" },
        { stil: "linie", d: "M 5.4,23 L 15.4,23 L 15.4,27.6 L 5.4,27.6 Z" },
        { stil: "linie", d: "M 32.6,23 L 42.6,23 L 42.6,27.6 L 32.6,27.6 Z" },
        { stil: "linie", d: "M 17,22.6 L 31,22.6 L 31,26.4 L 17,26.4 Z" },
        { stil: "fein", d: "M 3.4,29.6 L 44.6,29.6" },
        { stil: "linie", d: "M 17,30.8 L 31,30.8 L 31,34.8 L 17,34.8 Z" },
        { stil: "fein", d: "M 3.4,35.4 L 44.6,35.4" },
        { stil: "rad", d: "M 3.4,34 L 8.4,34 L 8.4,43.2 L 3.4,43.2 Z" },
        { stil: "rad", d: "M 39.6,34 L 44.6,34 L 44.6,43.2 L 39.6,43.2 Z" },
        { stil: "linie", d: "M 0.8,11 L 4.2,11 L 4.2,17 L 0.8,17 Z" },
        { stil: "linie", d: "M 43.8,11 L 47.2,11 L 47.2,17 L 43.8,17 Z" }
      ] },
      hinten: { b: 48, h: 44, teile: [
        { stil: "kontur", d:
          "M 5,39.4 " +
          "C 3.6,39.2 3,38.2 3,36.2 " +
          "L 3,9.6 " +
          "C 3,7.6 3.8,6.8 5.8,6.8 " +
          "L 42.2,6.8 " +
          "C 44.2,6.8 45,7.6 45,9.6 " +
          "L 45,36.2 " +
          "C 45,38.2 44.4,39.2 43,39.4 Z" },
        { stil: "linie", d: "M 5.4,8.4 L 42.6,8.4 L 42.6,33.6 L 5.4,33.6 Z" },
        { stil: "kontur", d: "M 24,8.4 L 24,33.6" },
        { stil: "glas", d: "M 8,10.4 L 22.4,10.4 L 22.4,17.6 L 8,17.6 Z" },
        { stil: "glas", d: "M 25.6,10.4 L 40,10.4 L 40,17.6 L 25.6,17.6 Z" },
        { stil: "linie", d: "M 4.2,20.6 L 7.6,20.6 L 7.6,29.6 L 4.2,29.6 Z" },
        { stil: "linie", d: "M 40.4,20.6 L 43.8,20.6 L 43.8,29.6 L 40.4,29.6 Z" },
        { stil: "fein", d: "M 3.2,35 L 44.8,35" },
        { stil: "linie", d: "M 17,35.4 L 31,35.4 L 31,38.8 L 17,38.8 Z" },
        { stil: "rad", d: "M 3.4,34 L 8.4,34 L 8.4,43.2 L 3.4,43.2 Z" },
        { stil: "rad", d: "M 39.6,34 L 44.6,34 L 44.6,43.2 L 39.6,43.2 Z" }
      ] },
      oben: { b: 100, h: 46, teile: [
        { stil: "kontur", d:
          "M 5.4,23 " +
          "C 5.4,15.4 6.6,10.4 9.4,8.6 " +
          "C 11.6,7.2 15,6.6 20,6.5 " +
          "L 92,6.5 " +
          "C 95,6.6 96.4,7.4 96.4,9.4 " +
          "L 96.4,36.6 " +
          "C 96.4,38.6 95,39.4 92,39.5 " +
          "L 20,39.5 " +
          "C 15,39.4 11.6,38.8 9.4,37.4 " +
          "C 6.6,35.6 5.4,30.6 5.4,23 Z" },
        { stil: "glas", d: "M 12.6,10.2 L 20,8.6 L 20,37.4 L 12.6,35.8 Z" },
        { stil: "linie", d: "M 21.6,8.4 L 21.6,37.6" },
        { stil: "linie", d: "M 94,8.6 L 94,37.4" },
        { stil: "fein", d: "M 43.6,6.6 L 43.6,39.4" },
        { stil: "fein", d: "M 66.6,6.6 L 66.6,39.4" },
        { stil: "linie", d: "M 10,5.6 L 15,2.4 L 16.6,4.2 L 11.6,7 Z" },
        { stil: "linie", d: "M 10,40.4 L 15,43.6 L 16.6,41.8 L 11.6,39 Z" }
      ] }
    }
  };

  var FORMEN = { "pkw-kompakt": PKW, "transporter": VAN };

  /* Vorbelegung anhand des Kategorienamens. Trifft nicht immer, muss es auch
     nicht — beim Fahrzeug lässt sich die Form mit einem Griff ändern. */
  function formVorschlag(kategorieName, fahrzeugName) {
    var text = String(kategorieName || "") + " " + String(fahrzeugName || "");
    var k = text.toLowerCase();
    if (/transporter|kasten|sprinter|crafter|ducato|boxer|jumper|transit|master|movano|koffer|pritsche|lkw|3,5|3\.5/.test(k)) {
      return "transporter";
    }
    return "pkw-kompakt";
  }

  // ------------------------------------------------------------ Pfade lesen

  /* Die Kurzschreibweise wird einmal in Zahlenlisten übersetzt und dann
     behalten. Das Zerlegen kostet zwar wenig, passiert aber bei jedem
     Neuzeichnen der Skizze — und das ist bei fünf Ansichten oft genug. */
  var pfadSpeicher = {};

  function lesePfad(d) {
    if (pfadSpeicher[d]) return pfadSpeicher[d];
    var teile = String(d).trim().split(/[\s,]+/);
    var befehle = [];
    var i = 0;
    var letzter = "";
    function zahl() { return parseFloat(teile[i++]); }
    while (i < teile.length) {
      var t = teile[i];
      var b;
      if (/^[MLCZ]$/i.test(t)) { b = t.toUpperCase(); i++; letzter = b; }
      else { b = letzter === "M" ? "L" : letzter; }
      if (b === "M" || b === "L") befehle.push([b, zahl(), zahl()]);
      else if (b === "C") befehle.push(["C", zahl(), zahl(), zahl(), zahl(), zahl(), zahl()]);
      else if (b === "Z") befehle.push(["Z"]);
      else i++;   // unbekanntes Zeichen überspringen, statt endlos zu drehen
    }
    pfadSpeicher[d] = befehle;
    return befehle;
  }

  // ------------------------------------------------------------ Ausmessen

  function ansicht(formId, ansichtId) {
    var f = FORMEN[formId] || FORMEN["pkw-kompakt"];
    return f.ansichten[ansichtId] || f.ansichten.links;
  }

  /* Wohin eine Ansicht gezeichnet wird, wenn sie in einen Kasten soll:
     Seitenverhältnis bleibt, der Rest ist Luft. */
  function passe(formId, ansichtId, x, y, breite, hoehe) {
    var a = ansicht(formId, ansichtId);
    var faktor = Math.min(breite / a.b, hoehe / a.h);
    var zb = a.b * faktor, zh = a.h * faktor;
    return {
      x: x + (breite - zb) / 2, y: y + (hoehe - zh) / 2,
      breite: zb, hoehe: zh, faktor: faktor, b: a.b, h: a.h
    };
  }

  // ------------------------------------------------------------ Canvas

  function zeichneCanvas(ctx, formId, ansichtId, kasten, opt) {
    var o = opt || {};
    var a = ansicht(formId, ansichtId);
    var lage = passe(formId, ansichtId, kasten.x, kasten.y, kasten.breite, kasten.hoehe);
    var strichFarbe = o.farbe || "#1a1a18";
    var glasFarbe = o.glas || "#eceae4";

    function px(x) {
      return lage.x + (a.spiegeln ? (a.b - x) : x) * lage.faktor;
    }
    function py(y) { return lage.y + y * lage.faktor; }

    a.teile.forEach(function (teil) {
      var stil = STIL[teil.stil] || STIL.linie;
      ctx.beginPath();
      if (teil.kreis) {
        ctx.arc(px(teil.kreis[0]), py(teil.kreis[1]), teil.kreis[2] * lage.faktor, 0, Math.PI * 2);
      } else {
        lesePfad(teil.d).forEach(function (c) {
          if (c[0] === "M") ctx.moveTo(px(c[1]), py(c[2]));
          else if (c[0] === "L") ctx.lineTo(px(c[1]), py(c[2]));
          else if (c[0] === "C") {
            ctx.bezierCurveTo(px(c[1]), py(c[2]), px(c[3]), py(c[4]), px(c[5]), py(c[6]));
          } else if (c[0] === "Z") ctx.closePath();
        });
      }
      if (stil.fuellung) { ctx.fillStyle = glasFarbe; ctx.fill(); }
      ctx.strokeStyle = strichFarbe;
      ctx.lineWidth = Math.max(0.6, stil.staerke * lage.faktor);
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.stroke();
    });

    return lage;
  }

  // ------------------------------------------------------------ PDF

  function zeichnePdf(doc, formId, ansichtId, kasten) {
    var a = ansicht(formId, ansichtId);
    var lage = passe(formId, ansichtId, kasten.x, kasten.y, kasten.breite, kasten.hoehe);

    function px(x) { return lage.x + (a.spiegeln ? (a.b - x) : x) * lage.faktor; }
    function py(y) { return lage.y + y * lage.faktor; }

    a.teile.forEach(function (teil) {
      var stil = STIL[teil.stil] || STIL.linie;
      var zuege = [];
      if (teil.kreis) {
        zuege = kreisAlsKurven(px(teil.kreis[0]), py(teil.kreis[1]), teil.kreis[2] * lage.faktor);
      } else {
        lesePfad(teil.d).forEach(function (c) {
          if (c[0] === "M") zuege.push(["M", px(c[1]), py(c[2])]);
          else if (c[0] === "L") zuege.push(["L", px(c[1]), py(c[2])]);
          else if (c[0] === "C") {
            zuege.push(["C", px(c[1]), py(c[2]), px(c[3]), py(c[4]), px(c[5]), py(c[6])]);
          } else if (c[0] === "Z") zuege.push(["Z"]);
        });
      }
      doc.pfad(zuege, {
        width: Math.max(0.12, stil.staerke * lage.faktor),
        fill: stil.fuellung ? [0.93, 0.92, 0.90] : null,
        color: [0.1, 0.1, 0.1]
      });
    });

    return lage;
  }

  /* Ein Kreis aus vier Bézier-Stücken. Der Faktor ist die bekannte
     Näherung, mit der die Abweichung unter einem Promille des Radius bleibt. */
  var KAPPA = 0.5522847498;

  function kreisAlsKurven(cx, cy, r) {
    var k = r * KAPPA;
    return [
      ["M", cx + r, cy],
      ["C", cx + r, cy + k, cx + k, cy + r, cx, cy + r],
      ["C", cx - k, cy + r, cx - r, cy + k, cx - r, cy],
      ["C", cx - r, cy - k, cx - k, cy - r, cx, cy - r],
      ["C", cx + k, cy - r, cx + r, cy - k, cx + r, cy],
      ["Z"]
    ];
  }

  // ------------------------------------------------------- Marken sortieren

  /* Sitzen mehrere Schäden fast an derselben Stelle, würden sich die Nummern
     überdecken. Sie werden deshalb zu einer Gruppe zusammengefasst und
     nebeneinander gesetzt — genau der Fall, den ein Papierprotokoll mit
     "1, 2" an einem Punkt löst. */
  var NAH = 0.045;

  function gruppiere(marken) {
    var gruppen = [];
    marken.forEach(function (m) {
      var passend = null;
      for (var i = 0; i < gruppen.length; i++) {
        var g = gruppen[i];
        if (Math.abs(g.x - m.x) < NAH && Math.abs(g.y - m.y) < NAH) { passend = g; break; }
      }
      if (passend) {
        passend.nummern.push(m.nummer);
        /* Der Punkt wandert in die Mitte der Gruppe, damit die Nummern nicht
           am Rand der Ansammlung kleben. */
        passend.x = (passend.x * (passend.nummern.length - 1) + m.x) / passend.nummern.length;
        passend.y = (passend.y * (passend.nummern.length - 1) + m.y) / passend.nummern.length;
      } else {
        gruppen.push({ x: m.x, y: m.y, nummern: [m.nummer] });
      }
    });
    return gruppen;
  }

  App.Skizze = {
    ANSICHTEN: ANSICHTEN,
    formen: function () {
      return Object.keys(FORMEN).map(function (id) {
        return { id: id, name: FORMEN[id].name, hinweis: FORMEN[id].hinweis };
      });
    },
    formName: function (id) { return (FORMEN[id] || FORMEN["pkw-kompakt"]).name; },
    kennt: function (id) { return !!FORMEN[id]; },
    formVorschlag: formVorschlag,
    ansicht: ansicht,
    passe: passe,
    zeichneCanvas: zeichneCanvas,
    zeichnePdf: zeichnePdf,
    gruppiere: gruppiere,
    _lesePfad: lesePfad,
    _kreisAlsKurven: kreisAlsKurven
  };

})(window.App = window.App || {});
