/* uebersicht.js — Schadenübersicht als PDF-Datei
 *
 * Aufbau nach dem Vorbild eines Prüfberichts:
 *   Seite 1   Kopfdaten des Fahrzeugs, danach die Schadensliste als Tabelle
 *   ab Seite 2  Fotoseiten, sechs Bilder je Seite, Beschriftung darunter
 *
 * Bewusst ohne Kennung — das ist eine Auskunft für den Kunden, kein Nachweis.
 * Der Nachweis bleibt der eingefrorene Schadensstand.
 */
(function (App) {
  "use strict";

  var RAND = 15;             // Seitenrand in Millimetern
  var BREITE = 210;
  var HOEHE = 297;
  var INHALT = BREITE - 2 * RAND;        // 180 mm
  var FUSS_Y = HOEHE - 12;
  var UNTERKANTE = HOEHE - 20;

  var GRAU = [0.42, 0.42, 0.39];
  var HELLGRAU = [0.75, 0.75, 0.72];
  var SCHWARZ = [0.1, 0.1, 0.09];
  var BLAU = [0.106, 0.184, 0.769];

  function fmtStamp(ms) {
    var d = new Date(ms);
    return d.toLocaleDateString("de-DE") + ", " +
      d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  }

  /* Kopf- und Fusszeile jeder Seite. Die Seitenzahl wird am Ende nachgetragen,
     weil sie beim Zeichnen noch nicht feststeht. */
  function seitenrahmen(doc, fahrzeug) {
    doc.text("Autovermietung Jansen", RAND, RAND + 3, { size: 11, bold: true });
    doc.text("Berliner Allee 14 · 37154 Northeim", RAND, RAND + 7.5, { size: 7.5, color: GRAU });

    var titel = "Schadenübersicht";
    var breite = doc.textBreite(titel, 11, true);
    doc.text(titel, BREITE - RAND - breite, RAND + 3, { size: 11, bold: true });

    doc.linie(RAND, RAND + 11, BREITE - RAND, RAND + 11, { width: 0.5, color: SCHWARZ });

    var fuss = fahrzeug.name + (fahrzeug.plate ? " · " + fahrzeug.plate : "");
    doc.text(fuss, RAND, FUSS_Y, { size: 7.5, color: GRAU });
    doc.linie(RAND, FUSS_Y - 4, BREITE - RAND, FUSS_Y - 4, { width: 0.2, color: HELLGRAU });
  }

  function baue(fahrzeug, schaeden, gesamt) {
    var doc = App.PDF.neu();
    var seitenAnfang = [];      // für die spätere Seitenzählung

    function neueSeite() {
      doc.neueSeite();
      seitenrahmen(doc, fahrzeug);
      return RAND + 20;
    }

    seitenrahmen(doc, fahrzeug);
    var y = RAND + 22;

    // ---------------------------------------------------------- Kopfdaten
    var zeilen = [
      ["Fahrzeug", fahrzeug.name],
      ["Kennzeichen", fahrzeug.plate || "nicht hinterlegt"],
      ["Dokumentierte Schäden", String(gesamt) +
        (schaeden.length !== gesamt ? " (in " + schaeden.length + " Einträgen)" : "")],
      ["Stand", fmtStamp(Date.now())]
    ];
    zeilen.forEach(function (z) {
      doc.text(z[0], RAND, y, { size: 9, color: GRAU });
      doc.text(z[1], RAND + 50, y, { size: 9.5, bold: z[0] === "Kennzeichen" });
      y += 6;
    });

    y += 6;

    // ---------------------------------------------------------- Schadensliste
    if (!schaeden.length) {
      doc.text("Für dieses Fahrzeug sind derzeit keine Schäden dokumentiert.",
        RAND, y, { size: 9.5, color: GRAU });
    } else {
      doc.text("SCHADENSLISTE", RAND, y, { size: 8, bold: true, color: GRAU });
      y += 4;
      doc.linie(RAND, y, BREITE - RAND, y, { width: 0.4, color: SCHWARZ });
      y += 4.5;

      var sp = { nr: RAND, bereich: RAND + 12, text: RAND + 58, anzahl: RAND + 140, wann: RAND + 158 };
      doc.text("Nr.", sp.nr, y, { size: 7.5, bold: true, color: GRAU });
      doc.text("Bereich", sp.bereich, y, { size: 7.5, bold: true, color: GRAU });
      doc.text("Beschreibung", sp.text, y, { size: 7.5, bold: true, color: GRAU });
      doc.text("Anzahl", sp.anzahl, y, { size: 7.5, bold: true, color: GRAU });
      doc.text("Wann", sp.wann, y, { size: 7.5, bold: true, color: GRAU });
      y += 3;
      doc.linie(RAND, y, BREITE - RAND, y, { width: 0.2, color: HELLGRAU });
      y += 4;

      schaeden.forEach(function (d, i) {
        var beschreibung = d.description || "keine Beschreibung";
        var bereichZeilen = doc.umbrechen(d.area || "—", 44, 8.5, false);
        var textZeilen = doc.umbrechen(beschreibung, 80, 8.5, false);
        var zeilenZahl = Math.max(bereichZeilen.length, textZeilen.length);
        var hoehe = zeilenZahl * 4 + 2.5;

        if (y + hoehe > UNTERKANTE) y = neueSeite();

        doc.text(String(i + 1), sp.nr, y, { size: 8.5, bold: true });
        bereichZeilen.forEach(function (z, k) {
          doc.text(z, sp.bereich, y + k * 4, { size: 8.5 });
        });
        textZeilen.forEach(function (z, k) {
          doc.text(z, sp.text, y + k * 4, { size: 8.5 });
        });
        doc.text(String(d.count || 1), sp.anzahl + 5, y, { size: 8.5 });
        doc.text(App.Fleet.fmtDamageDate(d), sp.wann, y, { size: 8, color: GRAU });

        y += hoehe;
        doc.linie(RAND, y - 2, BREITE - RAND, y - 2, { width: 0.15, color: HELLGRAU });
      });
    }

    // ---------------------------------------------------------- Fotoseiten
    var fotos = [];
    schaeden.forEach(function (d, i) {
      (d.images || []).forEach(function (src, j) {
        fotos.push({ src: src, schaden: i + 1, bild: j + 1, d: d });
      });
    });

    if (fotos.length) {
      y = neueSeite();
      doc.text("SCHADENSFOTOS", RAND, y, { size: 8, bold: true, color: GRAU });
      y += 4;
      doc.linie(RAND, y, BREITE - RAND, y, { width: 0.4, color: SCHWARZ });
      y += 6;

      var spaltenBreite = (INHALT - 8) / 2;      // 86 mm
      var bildHoehe = 55;
      var textHoehe = 13;
      var zeilenHoehe = bildHoehe + textHoehe + 6;
      var startY = y;
      var spalte = 0;

      fotos.forEach(function (f) {
        if (y + zeilenHoehe > UNTERKANTE) {
          y = neueSeite();
          startY = y;
          spalte = 0;
        }
        var x = RAND + spalte * (spaltenBreite + 8);

        // Erst das Bild, dann der Rahmen exakt darum — sonst stünde der
        // Rahmen um leeren Platz, wenn das Foto ein anderes Seitenverhältnis hat.
        var lage = doc.bild(f.src, x, y, spaltenBreite, bildHoehe);
        if (lage && lage.breite) {
          doc.rechteck(lage.x, lage.y, lage.breite, lage.hoehe,
            { stroke: HELLGRAU, width: 0.2 });
        }

        var kopf = "Schaden " + f.schaden + " · Bild " + f.schaden + "." + f.bild;
        doc.text(kopf, x, y + bildHoehe + 4, { size: 8, bold: true });

        var unten = (f.d.area ? f.d.area : "ohne Bereichsangabe");
        if (f.d.description) unten += " — " + f.d.description;
        if ((f.d.count || 1) > 1) unten += " (" + f.d.count + " Schäden)";
        doc.textBlock(unten, x, y + bildHoehe + 8, spaltenBreite,
          { size: 7.5, color: GRAU, maxZeilen: 2 });

        spalte++;
        if (spalte === 2) { spalte = 0; y += zeilenHoehe; }
      });
    }

    // ---------------------------------------------------------- Seitenzahlen
    /* Erst jetzt bekannt: wie viele Seiten es geworden sind. */
    var gesamtSeiten = doc.seiten();
    for (var s = 0; s < gesamtSeiten; s++) {
      (function (nr) {
        doc.aufSeite(nr, function () {
          var txt = "Seite " + (nr + 1) + " / " + gesamtSeiten;
          var b = doc.textBreite(txt, 7.5, false);
          doc.text(txt, BREITE - RAND - b, FUSS_Y, { size: 7.5, color: GRAU });
        });
      })(s);
    }

    return doc;
  }

  function dateiname(fahrzeug) {
    var teil = (fahrzeug.plate || fahrzeug.name || "Fahrzeug")
      .replace(/[^\wÄÖÜäöüß-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
    return "Schadenuebersicht_" + teil + "_" + new Date().toISOString().slice(0, 10) + ".pdf";
  }

  function erzeuge(fahrzeug, schaeden, gesamt) {
    var doc = baue(fahrzeug, schaeden, gesamt);
    return { doc: doc, name: dateiname(fahrzeug) };
  }

  App.Uebersicht = { baue: baue, erzeuge: erzeuge, dateiname: dateiname };

})(typeof window !== "undefined" ? (window.App = window.App || {}) : (globalThis.App = globalThis.App || {}));
