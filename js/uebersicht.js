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

  // ------------------------------------------------------------ Skizze

  var ROT = [0.776, 0.078, 0.094];
  var GRAU_MARKE = [0.42, 0.42, 0.40];   // Gebrauchsspuren
  var WEISS = [1, 1, 1];

  /* Eine Ansicht mit Nummern und freier Zeichnung. Die Umrisse gehen als
     Kurven ins PDF, nicht als Bild — beim Hineinzoomen und im Ausdruck bleibt
     alles scharf, und die ganze Skizze kostet weniger Platz als ein einziges
     Vorschaubild. */
  function skizzeAnsicht(doc, form, ansichtId, kasten, marken, ops) {
    var lage = App.Skizze.zeichnePdf(doc, form, ansichtId, kasten);

    (ops || []).filter(function (o) { return o.ansicht === ansichtId; }).forEach(function (op) {
      var p = (op.punkte || []).map(function (pt) {
        return { x: lage.x + pt[0] * lage.breite, y: lage.y + pt[1] * lage.hoehe };
      });
      if (!p.length) return;
      var zuege = [];
      if (op.art === "kreuz") {
        var d = 1.8;
        zuege = [
          ["M", p[0].x - d, p[0].y - d], ["L", p[0].x + d, p[0].y + d],
          ["M", p[0].x + d, p[0].y - d], ["L", p[0].x - d, p[0].y + d]
        ];
      } else if (op.art === "kreis" && p.length > 1) {
        var rx = Math.max(Math.abs(p[1].x - p[0].x), 1);
        var ry = Math.max(Math.abs(p[1].y - p[0].y), 1);
        zuege = ellipseAlsKurven(p[0].x, p[0].y, rx, ry);
      } else {
        zuege = [["M", p[0].x, p[0].y]];
        for (var i = 1; i < p.length; i++) zuege.push(["L", p[i].x, p[i].y]);
      }
      doc.pfad(zuege, { width: 0.5, color: ROT });
    });

    var eigene = (marken || []).filter(function (m) { return m.ansicht === ansichtId; });
    App.Skizze.gruppiere(eigene).forEach(function (g) {
      var mx = lage.x + g.x * lage.breite;
      var my = lage.y + g.y * lage.hoehe;
      var text = g.nummern.join(", ");
      var groesse = 6;
      var tb = doc.textBreite(text, groesse, true);
      var h = 4.2;
      var b = Math.max(h, tb + 2.4);

      doc.pfad(pilleAlsKurven(mx - b / 2, my - h / 2, b, h), {
        width: 0.25, color: WEISS, fill: g.spur ? GRAU_MARKE : ROT
      });
      doc.text(text, mx - tb / 2, my + groesse * 0.35 / 2.834645669 + 0.35,
        { size: groesse, bold: true, color: WEISS });
    });

    return lage;
  }

  var KAPPA = 0.5522847498;

  function ellipseAlsKurven(cx, cy, rx, ry) {
    var kx = rx * KAPPA, ky = ry * KAPPA;
    return [
      ["M", cx + rx, cy],
      ["C", cx + rx, cy + ky, cx + kx, cy + ry, cx, cy + ry],
      ["C", cx - kx, cy + ry, cx - rx, cy + ky, cx - rx, cy],
      ["C", cx - rx, cy - ky, cx - kx, cy - ry, cx, cy - ry],
      ["C", cx + kx, cy - ry, cx + rx, cy - ky, cx + rx, cy],
      ["Z"]
    ];
  }

  function pilleAlsKurven(x, y, b, h) {
    var r = h / 2, k = r * KAPPA;
    return [
      ["M", x + r, y],
      ["L", x + b - r, y],
      ["C", x + b - r + k, y, x + b, y + r - k, x + b, y + r],
      ["C", x + b, y + r + k, x + b - r + k, y + h, x + b - r, y + h],
      ["L", x + r, y + h],
      ["C", x + r - k, y + h, x, y + r + k, x, y + r],
      ["C", x, y + r - k, x + r - k, y, x + r, y],
      ["Z"]
    ];
  }

  /* Fünf Ansichten wie auf einem Papierprotokoll: die beiden Seiten oben
     nebeneinander, darunter Front, Heck und die Draufsicht. */
  function skizzenblock(doc, form, marken, ops, y) {
    doc.text("SCHADENSKIZZE", RAND, y, { size: 8, bold: true, color: GRAU });
    var hinweis = marken.length
      ? "Nummern entsprechen der Schadensliste"
      : "keine Stellen eingezeichnet";
    var hb = doc.textBreite(hinweis, 7, false);
    doc.text(hinweis, BREITE - RAND - hb, y, { size: 7, color: GRAU });
    y += 3;

    var luft = 4;
    var halb = (INHALT - luft) / 2;
    var reiheEins = 34;

    beschrifte(doc, "Links", RAND, y);
    skizzeAnsicht(doc, form, "links",
      { x: RAND, y: y + 3, breite: halb, hoehe: reiheEins }, marken, ops);

    beschrifte(doc, "Rechts", RAND + halb + luft, y);
    skizzeAnsicht(doc, form, "rechts",
      { x: RAND + halb + luft, y: y + 3, breite: halb, hoehe: reiheEins }, marken, ops);

    y += reiheEins + 6;

    var schmal = 38;
    var reiheZwei = 36;
    var obenBreite = INHALT - 2 * (schmal + luft);

    beschrifte(doc, "Vorn", RAND, y);
    skizzeAnsicht(doc, form, "vorn",
      { x: RAND, y: y + 3, breite: schmal, hoehe: reiheZwei }, marken, ops);

    beschrifte(doc, "Hinten", RAND + schmal + luft, y);
    skizzeAnsicht(doc, form, "hinten",
      { x: RAND + schmal + luft, y: y + 3, breite: schmal, hoehe: reiheZwei }, marken, ops);

    beschrifte(doc, "Draufsicht", RAND + 2 * (schmal + luft), y);
    skizzeAnsicht(doc, form, "oben",
      { x: RAND + 2 * (schmal + luft), y: y + 3, breite: obenBreite, hoehe: reiheZwei },
      marken, ops);

    return y + reiheZwei + 7;
  }

  function beschrifte(doc, text, x, y) {
    doc.text(text, x, y, { size: 6.5, color: GRAU });
  }

  /* Tausendertrennung wie sonst auch: 84.320 statt 84320. */
  function kmText(wert) {
    var zahl = String(wert || "").replace(/[^0-9]/g, "");
    return zahl.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }

  function baue(fahrzeug, schaeden, gesamt, opt) {
    var o = opt || {};
    var spuren = o.spuren || [];
    var mitKm = !!o.mitKm;
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

    y += 5;

    // ---------------------------------------------------------- Skizze
    /* Die Nummern richten sich nach der Reihenfolge in diesem Dokument, nicht
       nach der internen Schadennummer — der Kunde hat nur dieses Blatt vor
       sich, und darauf soll "3" auf der Skizze auch "3" in der Liste sein. */
    var marken = [];
    schaeden.forEach(function (d, i) {
      if (d.marke) {
        marken.push({
          ansicht: d.marke.ansicht, x: d.marke.x, y: d.marke.y,
          nummer: String(i + 1), spur: false
        });
      }
    });
    spuren.forEach(function (d, i) {
      if (d.marke) {
        marken.push({
          ansicht: d.marke.ansicht, x: d.marke.x, y: d.marke.y,
          nummer: String(i + 1), spur: true
        });
      }
    });
    var form = (fahrzeug.form && App.Skizze.kennt(fahrzeug.form))
      ? fahrzeug.form
      : App.Skizze.formVorschlag("", fahrzeug.name);
    y = skizzenblock(doc, form, marken, fahrzeug.skizze || [], y);

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

      /* Dieselbe Tabelle zweimal: einmal fuer die Schaeden, einmal fuer die
         Gebrauchsspuren. Getrennt, damit man beim Ueberfliegen nicht das eine
         fuer das andere haelt. */
      tabelle(schaeden);

      if (spuren.length) {
        y += 7;
        if (y + 22 > UNTERKANTE) y = neueSeite();
        doc.text("GEBRAUCHSSPUREN", RAND, y, { size: 8, bold: true, color: GRAU });
        var nachsatz = "Erfasst und im Einzelfall bewertet";
        var nb = doc.textBreite(nachsatz, 7, false);
        doc.text(nachsatz, BREITE - RAND - nb, y, { size: 7, color: GRAU });
        y += 5;
        tabelle(spuren);
      }
    }

    function tabelle(eintraege) {
      var sp = {
        nr: RAND, bereich: RAND + 9, text: RAND + 50,
        anzahlRechts: RAND + 141, wann: RAND + 146
      };
      var spaltenBreite = { bereich: 39, text: 80, wann: 34 };

      function rechts(inhalt, kante, yy, opt) {
        var b = doc.textBreite(inhalt, (opt && opt.size) || 8.5, opt && opt.bold);
        doc.text(inhalt, kante - b, yy, opt);
      }

      var kopfY = y + 3;
      doc.text("Nr.", sp.nr, kopfY, { size: 7, bold: true, color: GRAU });
      doc.text("Bereich", sp.bereich, kopfY, { size: 7, bold: true, color: GRAU });
      doc.text("Beschreibung", sp.text, kopfY, { size: 7, bold: true, color: GRAU });
      rechts("Anzahl", sp.anzahlRechts, kopfY, { size: 7, bold: true, color: GRAU });
      doc.text("Wann", sp.wann, kopfY, { size: 7, bold: true, color: GRAU });
      y = kopfY + 2.5;
      doc.linie(RAND, y, BREITE - RAND, y, { width: 0.4, color: SCHWARZ });

      eintraege.forEach(function (d, i) {
        var bereichZeilen = doc.umbrechen(d.area || "—", spaltenBreite.bereich, 8.5, false);
        var textZeilen = doc.umbrechen(d.description || "keine Beschreibung",
          spaltenBreite.text, 8.5, false);
        /* Der Kilometerstand hängt an "Wann" — er sagt dasselbe, nur genauer.
           Eine eigene Spalte wäre bei den meisten Einträgen leer. */
        var wann = App.Fleet.fmtDamageDate(d);
        if (mitKm && d.km) wann += " · " + kmText(d.km) + " km";
        var wannZeilen = doc.umbrechen(wann, spaltenBreite.wann, 8, false);
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
        fotos.push({ src: src, schaden: i + 1, bild: j + 1, d: d, spur: false });
      });
    });
    spuren.forEach(function (d, i) {
      (d.images || []).forEach(function (src, j) {
        fotos.push({ src: src, schaden: i + 1, bild: j + 1, d: d, spur: true });
      });
    });

    if (fotos.length) {
      y = neueSeite() - 1;                 // Überschrift dicht unter die Trennlinie
      doc.text(spuren.length ? "FOTOS" : "SCHADENSFOTOS", RAND, y,
        { size: 8, bold: true, color: GRAU });
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

          var wort = f.spur ? "Gebrauchsspur " : "Schaden ";
          var kopf = wort + f.schaden + " · Bild " + f.schaden + "." + f.bild;
          doc.text(kopf, x, unterkante + 4.5, { size: 8, bold: true });

          var unten = (f.d.area ? f.d.area : "ohne Bereichsangabe");
          if (f.d.description) unten += " — " + f.d.description;
          if (!f.spur && (f.d.count || 1) > 1) unten += " (" + f.d.count + " Schäden)";
          if (mitKm && f.d.km) unten += " · " + kmText(f.d.km) + " km";
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

  function erzeuge(fahrzeug, schaeden, gesamt, opt) {
    var doc = baue(fahrzeug, schaeden, gesamt, opt);
    return { doc: doc, name: dateiname(fahrzeug) };
  }

  App.Uebersicht = { baue: baue, erzeuge: erzeuge, dateiname: dateiname };

})(typeof window !== "undefined" ? (window.App = window.App || {}) : (globalThis.App = globalThis.App || {}));
