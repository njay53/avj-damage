/* pdf.js — schlanker PDF-Schreiber ohne fremde Bibliothek
 *
 * Warum selbst gebaut: der Druckdialog des Browsers setzt Adresse, Datum und
 * Seitenzahl in die Ränder. Am iPad lässt sich das nicht abschalten — und ein
 * Dokument, das an Kunden geht, soll die interne Adresse nicht verraten.
 *
 * Möglich ist das ohne grosse Bibliothek, weil die Fotos bereits als JPEG
 * vorliegen. JPEG-Daten dürfen unverändert in eine PDF-Datei gelegt werden
 * (Filter DCTDecode), es muss also nichts umgerechnet werden.
 *
 * Maßeinheit ist Millimeter, der Ursprung liegt oben links — anders als im
 * PDF-Format selbst, wo unten links gezählt wird. Die Umrechnung passiert
 * hier drin, damit das Layout lesbar bleibt.
 *
 * Verwendung:
 *   var doc = App.PDF.neu();            // A4 hoch
 *   doc.text("Hallo", 20, 30, { size: 12, bold: true });
 *   doc.bild(jpegDataUrl, 20, 40, 60, 45);
 *   doc.neueSeite();
 *   doc.speichern("datei.pdf");
 */
(function (App) {
  "use strict";

  var MM = 2.834645669;      // 1 mm in PDF-Punkten
  var A4 = { breite: 210, hoehe: 297 };

  /* Zeichenbreiten der Standardschrift Helvetica, in 1/1000 der Schriftgrösse.
     Nur der Bereich, der hier vorkommt — alles andere bekommt einen Mittelwert.
     Ohne diese Tabelle liesse sich kein Zeilenumbruch berechnen. */
  var BREITEN = {
    32:278,33:278,34:355,35:556,36:556,37:889,38:667,39:191,40:333,41:333,
    42:389,43:584,44:278,45:333,46:278,47:278,48:556,49:556,50:556,51:556,
    52:556,53:556,54:556,55:556,56:556,57:556,58:278,59:278,60:584,61:584,
    62:584,63:556,64:1015,65:667,66:667,67:722,68:722,69:667,70:611,71:778,
    72:722,73:278,74:500,75:667,76:556,77:833,78:722,79:778,80:667,81:778,
    82:722,83:667,84:611,85:722,86:667,87:944,88:667,89:667,90:611,91:278,
    92:278,93:278,94:469,95:556,96:333,97:556,98:556,99:500,100:556,101:556,
    102:278,103:556,104:556,105:222,106:222,107:500,108:222,109:833,110:556,
    111:556,112:556,113:556,114:333,115:500,116:278,117:556,118:500,119:722,
    120:500,121:500,122:500,123:334,124:260,125:334,126:584,
    196:667,214:778,220:722,223:556,228:556,246:556,252:556,225:556,233:556,
    167:556,176:400,183:278,8211:333,8212:1000,8222:333,8220:333,8221:333
  };

  function breiteVon(code) {
    var b = BREITEN[code];
    return (b === undefined) ? 556 : b;
  }

  /* Text muss als Latin-1 in die Datei. Zeichen, die es dort nicht gibt,
     werden ersetzt, statt die Datei unbrauchbar zu machen. */
  var ERSATZ = {
    8211: 45, 8212: 45, 8222: 34, 8220: 34, 8221: 34, 8216: 39, 8217: 39,
    8230: 46, 8226: 183, 8364: 128, 183: 183
  };

  function nachLatin1(text) {
    var raus = [];
    for (var i = 0; i < text.length; i++) {
      var c = text.charCodeAt(i);
      if (ERSATZ[c] !== undefined) c = ERSATZ[c];
      if (c > 255) c = 63;                 // Fragezeichen statt Müll
      raus.push(c);
    }
    return raus;
  }

  function escapePdf(codes) {
    var s = "";
    for (var i = 0; i < codes.length; i++) {
      var c = codes[i];
      if (c === 40 || c === 41 || c === 92) s += "\\";
      s += String.fromCharCode(c);
    }
    return s;
  }

  // ---------------------------------------------------------------- JPEG lesen

  /* Breite, Höhe und Farbkanäle stehen im SOF-Abschnitt des JPEG.
     Ohne diese Angaben weiss die PDF-Datei nicht, wie sie das Bild
     interpretieren soll. */
  function jpegInfo(bytes) {
    if (bytes[0] !== 0xFF || bytes[1] !== 0xD8) return null;
    var i = 2;
    while (i < bytes.length - 1) {
      if (bytes[i] !== 0xFF) { i++; continue; }
      var marker = bytes[i + 1];
      if (marker === 0xD8 || marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) {
        i += 2; continue;
      }
      var laenge = (bytes[i + 2] << 8) | bytes[i + 3];
      // SOF0..SOF15, ohne DHT(C4), DAC(CC), RSTn
      if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
        return {
          hoehe: (bytes[i + 5] << 8) | bytes[i + 6],
          breite: (bytes[i + 7] << 8) | bytes[i + 8],
          kanaele: bytes[i + 9],
          progressiv: (marker === 0xC2 || marker === 0xC6 || marker === 0xCA || marker === 0xCE)
        };
      }
      i += 2 + laenge;
    }
    return null;
  }

  function base64ZuBytes(b64) {
    var roh = (typeof atob === "function")
      ? atob(b64)
      : Buffer.from(b64, "base64").toString("binary");
    var bytes = new Uint8Array(roh.length);
    for (var i = 0; i < roh.length; i++) bytes[i] = roh.charCodeAt(i) & 0xFF;
    return bytes;
  }

  // ---------------------------------------------------------------- Dokument

  function neu(optionen) {
    var o = optionen || {};
    var seiteBreite = o.breite || A4.breite;
    var seiteHoehe = o.hoehe || A4.hoehe;

    var seiten = [];          // je Seite eine Liste von Anweisungen
    var bilder = [];          // { bytes, breite, hoehe, kanaele }
    var bildIndex = {};       // dataURL -> Position in bilder
    var aktuell = null;

    function neueSeite() {
      aktuell = [];
      seiten.push(aktuell);
      return api;
    }

    function y2pdf(y) { return (seiteHoehe - y) * MM; }

    /* Nachträglich auf eine frühere Seite zeichnen. Gebraucht für Angaben,
       die man erst am Ende kennt — etwa "Seite 3 von 7". */
    function aufSeite(index, was) {
      if (!seiten[index]) return api;
      var vorher = aktuell;
      aktuell = seiten[index];
      try { was(); } finally { aktuell = vorher; }
      return api;
    }

    // ------------------------------------------------------------ Zeichnen

    function text(inhalt, x, y, opt) {
      var s = opt || {};
      var groesse = s.size || 10;
      var codes = nachLatin1(String(inhalt));
      aktuell.push({
        art: "text",
        s: escapePdf(codes),
        x: x * MM, y: y2pdf(y),
        groesse: groesse,
        fett: !!s.bold,
        farbe: s.color || [0, 0, 0]
      });
      return api;
    }

    function textBreite(inhalt, groesse, fett) {
      var codes = nachLatin1(String(inhalt));
      var summe = 0;
      for (var i = 0; i < codes.length; i++) {
        var b = breiteVon(codes[i]);
        if (fett) b = b * 1.06;            // Näherung für die fette Schnittvariante
        summe += b;
      }
      return summe / 1000 * groesse / MM;  // Ergebnis in Millimetern
    }

    /* Bricht einen Text auf eine Breite um und gibt die Zeilen zurück. */
    function umbrechen(inhalt, maxBreite, groesse, fett) {
      var woerter = String(inhalt).split(/\s+/).filter(Boolean);
      var zeilen = [];
      var zeile = "";
      woerter.forEach(function (wort) {
        var versuch = zeile ? zeile + " " + wort : wort;
        if (textBreite(versuch, groesse, fett) <= maxBreite || !zeile) {
          zeile = versuch;
        } else {
          zeilen.push(zeile);
          zeile = wort;
        }
      });
      if (zeile) zeilen.push(zeile);
      return zeilen;
    }

    /* Setzt einen umgebrochenen Absatz und gibt zurück, wo er endet —
       damit der Aufrufer weiterrechnen kann. Zeilenabstand in Millimetern:
       eine Schriftgrösse in Punkt entspricht groesse/MM Millimetern. */
    function textBlock(inhalt, x, y, maxBreite, opt) {
      var s = opt || {};
      var groesse = s.size || 10;
      var zeilenhoehe = (s.leading || groesse * 1.3) / MM;
      var zeilen = umbrechen(inhalt, maxBreite, groesse, s.bold);
      if (s.maxZeilen && zeilen.length > s.maxZeilen) {
        zeilen = zeilen.slice(0, s.maxZeilen);
        zeilen[zeilen.length - 1] += " …";
      }
      zeilen.forEach(function (z, i) {
        text(z, x, y + i * zeilenhoehe, s);
      });
      return y + zeilen.length * zeilenhoehe;
    }

    function linie(x1, y1, x2, y2, opt) {
      var s = opt || {};
      aktuell.push({
        art: "linie",
        x1: x1 * MM, y1: y2pdf(y1), x2: x2 * MM, y2: y2pdf(y2),
        staerke: (s.width || 0.2) * MM,
        farbe: s.color || [0, 0, 0]
      });
      return api;
    }

    function rechteck(x, y, b, h, opt) {
      var s = opt || {};
      aktuell.push({
        art: "rechteck",
        x: x * MM, y: y2pdf(y + h), b: b * MM, h: h * MM,
        fuellen: s.fill || null,
        rand: s.stroke || null,
        staerke: (s.width || 0.2) * MM
      });
      return api;
    }

    /* Freier Pfad aus Geraden und Bézier-Kurven. Gebraucht für die
       Schadenskizze: die Umrisse liegen als Kurven vor, nicht als Bild —
       damit bleiben sie beim Zoomen und beim Ausdruck scharf und kosten
       ein paar hundert Byte statt einiger hundert Kilobyte.
       Züge: ["M",x,y] ["L",x,y] ["C",x1,y1,x2,y2,x,y] ["Z"] */
    function pfad(zuege, opt) {
      var s = opt || {};
      var umgerechnet = zuege.map(function (z) {
        if (z[0] === "M" || z[0] === "L") return [z[0], z[1] * MM, y2pdf(z[2])];
        if (z[0] === "C") {
          return ["C", z[1] * MM, y2pdf(z[2]), z[3] * MM, y2pdf(z[4]), z[5] * MM, y2pdf(z[6])];
        }
        return ["Z"];
      });
      aktuell.push({
        art: "pfad",
        zuege: umgerechnet,
        staerke: (s.width || 0.2) * MM,
        farbe: s.color || [0, 0, 0],
        fuellen: s.fill || null
      });
      return api;
    }

    /* Sprungmarke: ein unsichtbares Klickfeld, das im selben Dokument auf
       eine andere Seite springt. Gebraucht für die Schadenskizze — Nummer
       antippen, und man ist beim Foto.

       Die Marke wird beim Zeichnen noch nicht aufgelöst: welche Seite das
       Foto bekommt, steht erst fest, wenn alle Fotos gesetzt sind. Deshalb
       merkt sich die Seite nur den Wunsch, und bauen() macht daraus die
       Verknüpfung. */
    function sprung(x, y, b, h, zielSeite, zielY) {
      aktuell.push({
        art: "sprung",
        x: x * MM, y: y2pdf(y + h), b: b * MM, h: h * MM,
        zielSeite: zielSeite,
        zielY: y2pdf(zielY === undefined ? 0 : zielY)
      });
      return api;
    }

    /* Bild einfügen. Gibt die tatsächlich belegte Höhe zurück, weil das
       Seitenverhältnis erhalten bleibt. */
    function bild(dataUrl, x, y, maxBreite, maxHoehe, opt) {
      var s = opt || {};
      var trenner = String(dataUrl).indexOf(",");
      if (trenner < 0) return 0;
      var kopf = String(dataUrl).slice(0, trenner);
      if (kopf.indexOf("image/jpeg") === -1) return 0;   // nur JPEG

      var idx = bildIndex[dataUrl];
      if (idx === undefined) {
        var bytes = base64ZuBytes(String(dataUrl).slice(trenner + 1));
        var info = jpegInfo(bytes);
        if (!info || !info.breite || !info.hoehe) return 0;
        bilder.push({ bytes: bytes, breite: info.breite, hoehe: info.hoehe, kanaele: info.kanaele });
        idx = bilder.length - 1;
        bildIndex[dataUrl] = idx;
      }
      var b = bilder[idx];

      var faktor = Math.min(maxBreite / b.breite, maxHoehe / b.hoehe);
      if (s.fuellen) faktor = Math.max(maxBreite / b.breite, maxHoehe / b.hoehe);
      var zb = b.breite * faktor;
      var zh = b.hoehe * faktor;
      var zx = x + (s.zentriert === false ? 0 : (maxBreite - zb) / 2);
      var zy = y + (s.zentriert === false ? 0 : (maxHoehe - zh) / 2);

      aktuell.push({
        art: "bild", index: idx,
        x: zx * MM, y: y2pdf(zy + zh), b: zb * MM, h: zh * MM
      });
      /* Gibt zurück, wo das Bild tatsächlich liegt — das Seitenverhältnis
         bleibt erhalten, also füllt es den zugewiesenen Platz selten ganz aus.
         Wer einen Rahmen zeichnen will, braucht diese Werte. */
      return { x: zx, y: zy, breite: zb, hoehe: zh };
    }

    // ------------------------------------------------------------ Ausgabe

    function inhaltFuer(anweisungen) {
      var teile = [];
      anweisungen.forEach(function (a) {
        if (a.art === "text") {
          teile.push("BT");
          teile.push("/" + (a.fett ? "F2" : "F1") + " " + a.groesse.toFixed(2) + " Tf");
          teile.push(a.farbe.map(function (k) { return k.toFixed(3); }).join(" ") + " rg");
          teile.push(a.x.toFixed(2) + " " + a.y.toFixed(2) + " Td");
          teile.push("(" + a.s + ") Tj");
          teile.push("ET");
        } else if (a.art === "linie") {
          teile.push(a.farbe.map(function (k) { return k.toFixed(3); }).join(" ") + " RG");
          teile.push(a.staerke.toFixed(2) + " w");
          teile.push(a.x1.toFixed(2) + " " + a.y1.toFixed(2) + " m");
          teile.push(a.x2.toFixed(2) + " " + a.y2.toFixed(2) + " l S");
        } else if (a.art === "rechteck") {
          if (a.fuellen) {
            teile.push(a.fuellen.map(function (k) { return k.toFixed(3); }).join(" ") + " rg");
          }
          if (a.rand) {
            teile.push(a.rand.map(function (k) { return k.toFixed(3); }).join(" ") + " RG");
            teile.push(a.staerke.toFixed(2) + " w");
          }
          teile.push(a.x.toFixed(2) + " " + a.y.toFixed(2) + " " +
            a.b.toFixed(2) + " " + a.h.toFixed(2) + " re");
          teile.push(a.fuellen && a.rand ? "B" : (a.fuellen ? "f" : "S"));
        } else if (a.art === "pfad") {
          if (a.fuellen) {
            teile.push(a.fuellen.map(function (k) { return k.toFixed(3); }).join(" ") + " rg");
          }
          teile.push(a.farbe.map(function (k) { return k.toFixed(3); }).join(" ") + " RG");
          teile.push(a.staerke.toFixed(2) + " w");
          teile.push("1 J 1 j");                  // runde Enden und Ecken
          a.zuege.forEach(function (z) {
            if (z[0] === "M") teile.push(z[1].toFixed(2) + " " + z[2].toFixed(2) + " m");
            else if (z[0] === "L") teile.push(z[1].toFixed(2) + " " + z[2].toFixed(2) + " l");
            else if (z[0] === "C") {
              teile.push(z[1].toFixed(2) + " " + z[2].toFixed(2) + " " +
                z[3].toFixed(2) + " " + z[4].toFixed(2) + " " +
                z[5].toFixed(2) + " " + z[6].toFixed(2) + " c");
            } else teile.push("h");
          });
          teile.push(a.fuellen ? "B" : "S");
        } else if (a.art === "bild") {
          teile.push("q");
          teile.push(a.b.toFixed(2) + " 0 0 " + a.h.toFixed(2) + " " +
            a.x.toFixed(2) + " " + a.y.toFixed(2) + " cm");
          teile.push("/Im" + a.index + " Do");
          teile.push("Q");
        }
      });
      return teile.join("\n");
    }

    function bauen() {
      var objekte = [];      // je Eintrag: Array aus Strings/Uint8Array
      function obj(teile) { objekte.push(teile); return objekte.length; }

      var katalogNr = obj(null);      // Platzhalter, wird unten gefüllt
      var seitenBaumNr = obj(null);
      var fontNr = obj(["<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"]);
      var fontFettNr = obj(["<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"]);

      var bildNummern = bilder.map(function (b) {
        return obj([
          "<< /Type /XObject /Subtype /Image /Width " + b.breite +
          " /Height " + b.hoehe +
          " /ColorSpace /" + (b.kanaele === 1 ? "DeviceGray" : "DeviceRGB") +
          " /BitsPerComponent 8 /Filter /DCTDecode /Length " + b.bytes.length + " >>\nstream\n",
          b.bytes,
          "\nendstream"
        ]);
      });

      /* Erst die Nummern für alle Sprungmarken reservieren: die Seite muss
         sie nennen, sie selbst muss aber die Zielseite nennen — und die kennt
         man erst, wenn alle Seiten angelegt sind. */
      var markenNummern = seiten.map(function (anweisungen) {
        return anweisungen.filter(function (a) { return a.art === "sprung"; })
          .map(function () { return obj(null); });
      });

      var seitenNummern = [];
      seiten.forEach(function (anweisungen, seitenIndex) {
        var inhalt = inhaltFuer(anweisungen);
        var inhaltNr = obj([
          "<< /Length " + nachLatin1(inhalt).length + " >>\nstream\n" + inhalt + "\nendstream"
        ]);
        var benutzteBilder = {};
        anweisungen.forEach(function (a) { if (a.art === "bild") benutzteBilder[a.index] = true; });
        var xobj = Object.keys(benutzteBilder).map(function (i) {
          return "/Im" + i + " " + bildNummern[i] + " 0 R";
        }).join(" ");

        var meine = markenNummern[seitenIndex];
        var annots = meine.length
          ? " /Annots [" + meine.map(function (n) { return n + " 0 R"; }).join(" ") + "]"
          : "";

        var seitenNr = obj([
          "<< /Type /Page /Parent " + seitenBaumNr + " 0 R" +
          " /MediaBox [0 0 " + (seiteBreite * MM).toFixed(2) + " " + (seiteHoehe * MM).toFixed(2) + "]" +
          " /Resources << /Font << /F1 " + fontNr + " 0 R /F2 " + fontFettNr + " 0 R >>" +
          (xobj ? " /XObject << " + xobj + " >>" : "") + " >>" +
          " /Contents " + inhaltNr + " 0 R >>" + annots
        ]);
        seitenNummern.push(seitenNr);
      });

      /* Jetzt sind alle Seitennummern bekannt — die Sprungmarken lassen sich
         auflösen. Ein Ziel ausserhalb bleibt einfach ohne Verknüpfung: lieber
         ein Feld, das nichts tut, als eine Datei, die kein Leser öffnet. */
      seiten.forEach(function (anweisungen, seitenIndex) {
        var meine = markenNummern[seitenIndex];
        var i = 0;
        anweisungen.forEach(function (a) {
          if (a.art !== "sprung") return;
          var nr = meine[i++];
          var ziel = seitenNummern[a.zielSeite];
          if (ziel === undefined) {
            objekte[nr - 1] = ["<< /Type /Annot /Subtype /Link /Rect [0 0 0 0] /Border [0 0 0] >>"];
            return;
          }
          objekte[nr - 1] = [
            "<< /Type /Annot /Subtype /Link" +
            " /Rect [" + a.x.toFixed(2) + " " + a.y.toFixed(2) + " " +
            (a.x + a.b).toFixed(2) + " " + (a.y + a.h).toFixed(2) + "]" +
            " /Border [0 0 0] /F 4" +
            " /A << /S /GoTo /D [" + ziel + " 0 R /XYZ null " + a.zielY.toFixed(2) + " null] >> >>"
          ];
        });
      });

      objekte[katalogNr - 1] = ["<< /Type /Catalog /Pages " + seitenBaumNr + " 0 R >>"];
      objekte[seitenBaumNr - 1] = [
        "<< /Type /Pages /Count " + seitenNummern.length + " /Kids [" +
        seitenNummern.map(function (n) { return n + " 0 R"; }).join(" ") + "] >>"
      ];

      // Datei zusammensetzen und dabei die Byte-Positionen mitzählen
      var stuecke = [];
      var laenge = 0;
      var offsets = [];

      function schreibe(teil) {
        if (typeof teil === "string") {
          var codes = nachLatin1(teil);
          var arr = new Uint8Array(codes.length);
          for (var i = 0; i < codes.length; i++) arr[i] = codes[i];
          stuecke.push(arr);
          laenge += arr.length;
        } else {
          stuecke.push(teil);
          laenge += teil.length;
        }
      }

      schreibe("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
      objekte.forEach(function (teile, i) {
        offsets[i] = laenge;
        schreibe((i + 1) + " 0 obj\n");
        (teile || ["<< >>"]).forEach(schreibe);
        schreibe("\nendobj\n");
      });

      var xrefPos = laenge;
      var xref = "xref\n0 " + (objekte.length + 1) + "\n0000000000 65535 f \n";
      offsets.forEach(function (off) {
        xref += ("0000000000" + off).slice(-10) + " 00000 n \n";
      });
      schreibe(xref);
      schreibe("trailer\n<< /Size " + (objekte.length + 1) +
        " /Root " + katalogNr + " 0 R >>\nstartxref\n" + xrefPos + "\n%%EOF\n");

      var alles = new Uint8Array(laenge);
      var pos = 0;
      stuecke.forEach(function (s) { alles.set(s, pos); pos += s.length; });
      return alles;
    }

    function speichern(dateiname) {
      var daten = bauen();
      var blob = new Blob([daten], { type: "application/pdf" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = dateiname || "dokument.pdf";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      return blob;
    }

    var api = {
      neueSeite: neueSeite,
      aufSeite: aufSeite,
      text: text,
      textBlock: textBlock,
      umbrechen: umbrechen,
      textBreite: textBreite,
      linie: linie,
      rechteck: rechteck,
      pfad: pfad,
      sprung: sprung,
      bild: bild,
      bauen: bauen,
      speichern: speichern,
      seiten: function () { return seiten.length; },
      masse: function () { return { breite: seiteBreite, hoehe: seiteHoehe }; }
    };

    neueSeite();
    return api;
  }

  /* Abmessungen eines Fotos, ohne es zu zeichnen — nötig, um vorher zu
     wissen, wie breit es wird. Ergebnisse werden gemerkt, sonst würde bei
     zwanzig Fotos jedes mehrfach entschlüsselt. */
  var masseSpeicher = {};

  function masse(dataUrl) {
    if (masseSpeicher[dataUrl]) return masseSpeicher[dataUrl];
    var trenner = String(dataUrl).indexOf(",");
    if (trenner < 0) return null;
    if (String(dataUrl).slice(0, trenner).indexOf("image/jpeg") === -1) return null;
    var info = jpegInfo(base64ZuBytes(String(dataUrl).slice(trenner + 1)));
    if (!info || !info.breite || !info.hoehe) return null;
    var wert = {
      breite: info.breite,
      hoehe: info.hoehe,
      verhaeltnis: info.breite / info.hoehe
    };
    masseSpeicher[dataUrl] = wert;
    return wert;
  }

  App.PDF = { neu: neu, masse: masse, _jpegInfo: jpegInfo, _breiteVon: breiteVon };

  if (typeof module !== "undefined" && module.exports) module.exports = App.PDF;

})(typeof window !== "undefined" ? (window.App = window.App || {}) : (globalThis.App = globalThis.App || {}));
