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
  var LOGO_BREITE = 42;      // Millimeter — schmal genug, um nicht zu dominieren

  function seitenrahmen(doc, fahrzeug) {
    var logoHoehe = LOGO_BREITE / (App.Logo ? App.Logo.verhaeltnis : 4.844);

    if (App.Logo && App.Logo.jpeg) {
      doc.bild(App.Logo.jpeg, RAND, RAND - 2, LOGO_BREITE, logoHoehe, { zentriert: false });
    } else {
      doc.text("Autovermietung Jansen", RAND, RAND + 3, { size: 11, bold: true });
    }
    doc.text("Berliner Allee 14 · 37154 Northeim", RAND, RAND + logoHoehe + 1.5,
      { size: 7, color: GRAU });

    /* Der Titel sitzt auf der Grundlinie des Logos, damit die Kopfzeile
       optisch eine Linie bildet. */
    var titel = "Schadenübersicht";
    var breite = doc.textBreite(titel, 11, true);
    doc.text(titel, BREITE - RAND - breite, RAND + logoHoehe - 1.5, { size: 11, bold: true });

    doc.linie(RAND, RAND + logoHoehe + 4, BREITE - RAND, RAND + logoHoehe + 4,
      { width: 0.5, color: SCHWARZ });

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
      // 8,7 mm Logohöhe + Adresszeile + Trennlinie → Inhalt beginnt darunter
      return RAND + 20;
    }

    seitenrahmen(doc, fahrzeug);
    var y = RAND + 23;

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
      y += 5;

      /* Spalten so gelegt, dass rechts nichts über den Rand läuft und in der
         Mitte keine Lücke klafft. Anzahl steht rechtsbündig, damit die Zahlen
         untereinander stehen. */
      var sp = {
        nr: RAND,                       // 8 mm
        bereich: RAND + 9,              // 40 mm
        text: RAND + 50,                // 82 mm
        anzahlRechts: RAND + 141,       // rechte Kante der Anzahl-Spalte
        wann: RAND + 146                // 34 mm bis zum Rand
      };
      var spaltenBreite = { bereich: 39, text: 80, wann: 34 };

      function rechts(inhalt, kante, yy, opt) {
        var b = doc.textBreite(inhalt, (opt && opt.size) || 8.5, opt && opt.bold);
        doc.text(inhalt, kante - b, yy, opt);
      }

      // Kopfzeile der Tabelle
      var kopfY = y + 3;
      doc.text("Nr.", sp.nr, kopfY, { size: 7, bold: true, color: GRAU });
      doc.text("Bereich", sp.bereich, kopfY, { size: 7, bold: true, color: GRAU });
      doc.text("Beschreibung", sp.text, kopfY, { size: 7, bold: true, color: GRAU });
      rechts("Anzahl", sp.anzahlRechts, kopfY, { size: 7, bold: true, color: GRAU });
      doc.text("Wann", sp.wann, kopfY, { size: 7, bold: true, color: GRAU });
      y = kopfY + 2.5;
      doc.linie(RAND, y, BREITE - RAND, y, { width: 0.4, color: SCHWARZ });

      schaeden.forEach(function (d, i) {
        var bereichZeilen = doc.umbrechen(d.area || "—", spaltenBreite.bereich, 8.5, false);
        var textZeilen = doc.umbrechen(d.description || "keine Beschreibung",
          spaltenBreite.text, 8.5, false);
        var wannZeilen = doc.umbrechen(App.Fleet.fmtDamageDate(d), spaltenBreite.wann, 8, false);
        var zeilenZahl = Math.max(bereichZeilen.length, textZeilen.length, wannZeilen.length);
        var hoehe = zeilenZahl * 4.2 + 3.4;

        if (y + hoehe > UNTERKANTE) {
          y = neueSeite();
          doc.linie(RAND, y - 2, BREITE - RAND, y - 2, { width: 0.4, color: SCHWARZ });
        }

        var textY = y + 4.4;            // Grundlinie der ersten Zeile
        doc.text(String(i + 1), sp.nr, textY, { size: 8.5, bold: true });
        bereichZeilen.forEach(function (z, k) {
          doc.text(z, sp.bereich, textY + k * 4.2, { size: 8.5 });
        });
        textZeilen.forEach(function (z, k) {
          doc.text(z, sp.text, textY + k * 4.2, { size: 8.5 });
        });
        rechts(String(d.count || 1), sp.anzahlRechts, textY, { size: 8.5 });
        wannZeilen.forEach(function (z, k) {
          doc.text(z, sp.wann, textY + k * 4.2, { size: 8, color: GRAU });
        });

        y += hoehe;
        doc.linie(RAND, y, BREITE - RAND, y, { width: 0.15, color: HELLGRAU });
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
      y = neueSeite() - 1;                 // Überschrift dicht unter die Trennlinie
      doc.text("SCHADENSFOTOS", RAND, y, { size: 8, bold: true, color: GRAU });
      y += 5;

      /* Nicht in ein starres Zweierraster zwängen: Handyfotos vom Schaden sind
         meist hochkant und würden dann nur die halbe Spalte füllen — halbe
         Seite weiss, Bilder unnötig klein. Stattdessen bekommen alle Fotos
         dieselbe Höhe, und es passt in eine Zeile, was nebeneinander passt.
         Drei hochkant nebeneinander, zwei quer, oder gemischt. */
      var ZIELHOEHE = 72;
      var MAXBREITE = 87;      // damit ein Querformat nicht die ganze Zeile frisst
      var ABSTAND = 6;
      var TEXTHOEHE = 13;

      var reihen = [];
      var reihe = { fotos: [], breite: 0, hoehe: 0 };

      fotos.forEach(function (f) {
        var m = App.PDF.masse(f.src);
        var breite, hoehe;
        if (!m) {
          breite = 60; hoehe = ZIELHOEHE;
        } else {
          hoehe = ZIELHOEHE;
          breite = hoehe * m.verhaeltnis;
          if (breite > MAXBREITE) { breite = MAXBREITE; hoehe = breite / m.verhaeltnis; }
        }
        var braucht = reihe.fotos.length ? ABSTAND + breite : breite;
        if (reihe.fotos.length && reihe.breite + braucht > INHALT) {
          reihen.push(reihe);
          reihe = { fotos: [], breite: 0, hoehe: 0 };
          braucht = breite;
        }
        reihe.fotos.push({ f: f, breite: breite, hoehe: hoehe });
        reihe.breite += braucht;
        reihe.hoehe = Math.max(reihe.hoehe, hoehe);
      });
      if (reihe.fotos.length) reihen.push(reihe);

      reihen.forEach(function (r) {
        var zeilenHoehe = r.hoehe + TEXTHOEHE + 5;
        if (y + zeilenHoehe > UNTERKANTE) y = neueSeite();

        var x = RAND;
        r.fotos.forEach(function (eintrag) {
          var f = eintrag.f;
          // Linksbündig, damit Bild und Beschriftung an derselben Kante stehen
          var lage = doc.bild(f.src, x, y, eintrag.breite, eintrag.hoehe, { zentriert: false });
          var unterkante = y + eintrag.hoehe;
          if (lage && lage.breite) {
            doc.rechteck(lage.x, lage.y, lage.breite, lage.hoehe,
              { stroke: HELLGRAU, width: 0.2 });
            unterkante = lage.y + lage.hoehe;
          }

          var kopf = "Schaden " + f.schaden + " · Bild " + f.schaden + "." + f.bild;
          doc.text(kopf, x, unterkante + 4.5, { size: 8, bold: true });

          var unten = (f.d.area ? f.d.area : "ohne Bereichsangabe");
          if (f.d.description) unten += " — " + f.d.description;
          if ((f.d.count || 1) > 1) unten += " (" + f.d.count + " Schäden)";
          doc.textBlock(unten, x, unterkante + 8.6, eintrag.breite,
            { size: 7.5, color: GRAU, maxZeilen: 2 });

          x += eintrag.breite + ABSTAND;
        });

        y += zeilenHoehe;
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
