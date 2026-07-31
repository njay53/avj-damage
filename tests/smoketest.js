/* tests/smoketest.js — Funktionstest ohne Browser
 *
 * Einmalig:   npm install
 * Ausfuehren: npm test
 *
 * Prueft: Fuhrpark, Schadensregister, eingefrorene Schadensstaende,
 * Abgleich mit dem Server (gegen einen Nachbau), Offline-Verhalten und
 * die Fehlerbehandlung beim Start.
 */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const { createFakeServer } = require("./fake-server");
require("fake-indexeddb/auto");

const APP = path.join(__dirname, "..");
const DATEIEN = ["js/store.js", "js/cloud.js", "js/logo.js", "js/pdf.js", "js/annotate.js",
                 "js/fleet.js", "js/uebersicht.js", "js/snapshot.js", "js/app.js"];

/* Ein winziges echtes JPEG (48x36) — gebraucht, um den PDF-Erzeuger
   mit richtigen Bilddaten zu pruefen statt mit Platzhaltern. */
const MINI_JPEG = "data:image/jpeg;base64," +
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAAkADADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDuaKKzdU1GS3ZLS0QvdzD5RjhR6/of61nKSirs1o0Z1pqEf682aVFYq6BJcjfqV7LK+SQEPC564yPp2FDeHVhUtY3k8MuMZLcEenGO+Kz5578v4nV9Xw1+V1tf8Lt9/wDwDaorK0/ULhbs6fqA/wBI5KSAcSD/AD/nNatXGSkro5q1GVGXLL1TWzXdBWJJIun+JXnuDtiuYwqP2B4HJ/D9RW3UN3aQ3tu0E65U9D3B9R70qkXJabo0wtaNOTU/hkrPvYmorFXSdSshssNQHlkn5JR90dscH1PpQ2m6xdKYrrUUWMj/AJZryfY8Dip9pL+V3NfqlG91Wjy/O/3W/US/kW+1yzt7c7mtnLynsvIOM+vH5kVt1VsdPg0+IxwA/McszclvrVqqhFq7e7M8TVhPlhT+GKsr9dbthRRRWhyBRRRQAUUUUAf/2Q==";

let failures = 0;
function check(name, cond, extra) {
  console.log((cond ? "  OK   " : "  FEHL ") + name + (cond ? "" : "  " + (extra || "")));
  if (!cond) failures++;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* Wartet, bis eine Bedingung zutrifft — hoechstens so lange wie angegeben.
   Feste Pausen fuehren zu Tests, die mal durchlaufen und mal nicht; solchen
   Tests glaubt man irgendwann nicht mehr. */
async function bisWahr(bedingung, maxMs = 2000, schritt = 25) {
  const ende = Date.now() + maxMs;
  while (Date.now() < ende) {
    if (bedingung()) return true;
    await wait(schritt);
  }
  return bedingung();
}

const html = fs.readFileSync(path.join(APP, "index.html"), "utf8");

/* Baut eine frische App-Instanz. Jede bekommt ihre eigene IndexedDB, damit
   sich zwei "Geraete" im selben Testlauf nicht ins Gehege kommen. */
function macheApp(optionen) {
  const o = optionen || {};
  const dom = new JSDOM(o.html || html, {
    runScripts: "outside-only", pretendToBeVisual: true, url: "https://example.org/app/"
  });
  const w = dom.window;

  const FDBFactory = require("fake-indexeddb/lib/FDBFactory");
  w.indexedDB = o.indexedDB === undefined ? new FDBFactory() : o.indexedDB;
  w.IDBKeyRange = IDBKeyRange;
  w.ImageData = class { constructor(d, a, b) { this.data = d; this.width = a; this.height = b; } };
  /* Zeichenbefehle werden mitgeschrieben, damit sich pruefen laesst, WAS
     gezeichnet wurde — jsdom kann selbst nicht zeichnen. */
  w.__zeichnungen = [];
  w.HTMLCanvasElement.prototype.getContext = function () {
    const canvas = this;
    const log = (name) => (...args) => { w.__zeichnungen.push({ op: name, args: args }); };
    return {
      canvas: canvas,
      drawImage: log("drawImage"), fillRect: log("fillRect"), fillText: log("fillText"),
      stroke: log("stroke"), fill: log("fill"), beginPath: log("beginPath"),
      moveTo: log("moveTo"), lineTo: log("lineTo"), ellipse: log("ellipse"),
      arc: log("arc"), closePath: log("closePath"), putImageData: log("putImageData"),
      clearRect: log("clearRect"), save: log("save"), restore: log("restore"),
      translate: log("translate"), scale: log("scale"), clip: log("clip"),
      quadraticCurveTo: log("quadraticCurveTo"),
      measureText: () => ({ width: 42 }),
      getImageData: (x, y, a, b) => new w.ImageData(new Uint8ClampedArray(4), a || 1, b || 1)
    };
  };
  w.HTMLCanvasElement.prototype.toDataURL = () => "data:image/jpeg;base64,TESTBILD";
  w.alert = (m) => { w.__alert = m; };
  w.confirm = () => true;
  w.print = () => { w.__printed = true; };
  w.scrollTo = () => {};
  if (o.fetch) w.fetch = o.fetch;
  if (o.online === false) Object.defineProperty(w.navigator, "onLine", { value: false, configurable: true });

  DATEIEN.forEach((f) => w.eval(fs.readFileSync(path.join(APP, f), "utf8")));
  w.document.dispatchEvent(new w.Event("DOMContentLoaded"));
  return w;
}

(async function run() {
  const w = macheApp();
  await wait(300);
  const App = w.App;
  const q = (id) => w.document.getElementById(id);

  console.log("\n--- Start ---");
  check("App startet, Fuhrpark sichtbar", !q("view-fleet").classList.contains("hidden"));
  check("Module geladen", !!(App.Store && App.Cloud && App.Fleet && App.Snapshot && App.Annotate));
  check("kein Protokoll-Modul mehr", !App.Protocol && !App.PasteImport);
  check("Status meldet: nur dieses Gerät", /Nur dieses Gerät/.test(q("sync-status").textContent),
    q("sync-status").textContent);

  /* Zwischenspeicher-Falle: Skripte muessen eine Build-Angabe in der Adresse
     tragen, sonst liefert Safari beim naechsten Besuch die alte Datei aus
     seinem eigenen HTTP-Zwischenspeicher — der Server ist dann neu, das
     Programm auf dem Geraet aber alt. */
  {
    const rohHtml = fs.readFileSync(path.join(APP, "index.html"), "utf8");
    const sw = fs.readFileSync(path.join(APP, "sw.js"), "utf8");
    const build = (sw.match(/CACHE_VERSION = "v(\d+)"/) || [])[1];

    const verweise = rohHtml.match(/(?:src|href)="(?:js|css)\/[^"]+"/g) || [];
    check("eigene Dateien werden ueberhaupt eingebunden", verweise.length >= 8,
      String(verweise.length));
    const ohneBuild = verweise.filter((v) => !v.includes("?b=" + build));
    check("alle Skripte und Stile tragen die Build-Nummer",
      ohneBuild.length === 0, ohneBuild.join(" "));

    check("Service Worker umgeht den Browser-Zwischenspeicher",
      /cache:\s*"no-store"/.test(sw));
    check("Zwischenspeicher ignoriert die Build-Angabe beim Nachschlagen",
      /ignoreSearch:\s*true/.test(sw));
  }

  // Versionsanzeige — sie soll verraten, welche Fassung ein Gerät geladen hat
  {
    const gezeigt = q("app-version").textContent;
    check("Build-Nummer wird angezeigt", /^Build \d+$/.test(gezeigt), gezeigt);
    const sw = fs.readFileSync(path.join(APP, "sw.js"), "utf8");
    const swVersion = (sw.match(/CACHE_VERSION = "v(\d+)"/) || [])[1];
    check("Build stimmt mit dem Service Worker überein",
      gezeigt === "Build " + swVersion, gezeigt + " vs v" + swVersion);
  }

  console.log("\n--- Fotoauswahl: Kamera und Album getrennt ---");
  {
    const cam = q("input-photo-camera");
    const alb = q("input-photo-file");
    check("Kamera-Feld hat capture", cam.getAttribute("capture") === "environment");
    check("Album-Feld hat KEIN capture", !alb.hasAttribute("capture"),
      "capture=" + alb.getAttribute("capture"));
    check("beide akzeptieren Bilder",
      cam.getAttribute("accept") === "image/*" && alb.getAttribute("accept") === "image/*");
    check("beide Felder sind ausgeblendet", cam.hasAttribute("hidden") && alb.hasAttribute("hidden"));
    check("Kamera-Knopf vorhanden", !!q("btn-photo-camera"));
    check("Album-Knopf vorhanden", !!q("btn-photo-file"));
    check("kein altes Sammelfeld mehr", !w.document.getElementById("input-photo"));

    // Knopf muss das jeweils richtige Feld auslösen
    let geoeffnet = null;
    cam.click = () => { geoeffnet = "kamera"; };
    alb.click = () => { geoeffnet = "album"; };
    App.Annotate.open({ title: "t", onSave: () => {} });
    q("btn-photo-camera").click();
    check("Kamera-Knopf öffnet das Kamera-Feld", geoeffnet === "kamera", String(geoeffnet));
    q("btn-photo-file").click();
    check("Album-Knopf öffnet das Album-Feld", geoeffnet === "album", String(geoeffnet));

    // Nicht-Bilder werden abgewiesen
    Object.defineProperty(alb, "files", {
      value: [{ type: "application/pdf", name: "vertrag.pdf" }], configurable: true
    });
    alb.dispatchEvent(new w.Event("change", { bubbles: true }));
    await wait(30);
    check("PDF wird abgewiesen", /kein Bild/.test(q("photo-status").textContent),
      q("photo-status").textContent);
    check("Speichern bleibt gesperrt", q("btn-save-damage").disabled);
    App.Annotate.close();
  }

  console.log("\n--- Datumsangaben ---");
  {
    const modus = q("input-date-mode");
    check("drei Auswahlmöglichkeiten", modus.options.length === 3, String(modus.options.length));
    check("Werte stimmen",
      Array.from(modus.options).map(o => o.value).join(",") === "exact,unknown,stock",
      Array.from(modus.options).map(o => o.value).join(","));

    App.Annotate.open({ title: "t", onSave: () => {} });
    check("Datumsfeld sichtbar bei 'exact'", !q("date-row").classList.contains("hidden"));
    modus.value = "unknown";
    modus.dispatchEvent(new w.Event("change", { bubbles: true }));
    check("Datumsfeld verschwindet bei 'unbekannt'", q("date-row").classList.contains("hidden"));
    modus.value = "stock";
    modus.dispatchEvent(new w.Event("change", { bubbles: true }));
    check("Datumsfeld bleibt weg bei 'Bestand'", q("date-row").classList.contains("hidden"));
    App.Annotate.close();
  }

  console.log("\n--- Fahrzeug und Schäden ---");
  const v = await App.Store.addVehicle({ name: "Toyota Yaris #3", plate: "NOM-JA 123" });
  await App.Store.addDamage(v.id, { image: "data:image/jpeg;base64,ALT1", note: "Kratzer Stossstange h.l.", date: "2026-05-04", area: "Stossstange h.l." });
  await App.Store.addDamage(v.id, { image: "data:image/jpeg;base64,ALT2", note: "Steinschlag Frontscheibe", date: "2026-06-12", area: "Frontscheibe" });
  App.Fleet.renderFleet();
  check("Fahrzeug in der Übersicht", q("fleet-grid").textContent.includes("Toyota Yaris #3"));
  check("Badge zeigt 2 Schäden", q("fleet-grid").textContent.includes("2 Schäden"));
  check("Register hat 2 Schäden", App.Store.damagesOf(v.id).length === 2);

  console.log("\n--- Mehrere Bilder und Anzahl je Schaden ---");
  {
    const anzahlFeld = q("input-count");
    check("Anzahl ist ein Auswahlfeld", anzahlFeld.tagName === "SELECT", anzahlFeld.tagName);
    check("Auswahl von 1 bis 10", anzahlFeld.options.length === 10,
      String(anzahlFeld.options.length));
    check("Beschriftung mit Einzahl bei 1", anzahlFeld.options[0].textContent === "1 Schaden",
      anzahlFeld.options[0].textContent);

    const mehr = await App.Store.addDamage(v.id, {
      images: ["data:image/jpeg;base64,A", "data:image/jpeg;base64,B", "data:image/jpeg;base64,C"],
      count: 3, description: "Drei Kratzer am Heck", area: "Heck",
      dateMode: "exact", date: "2026-07-10"
    });
    check("drei Bilder gespeichert", mehr.images.length === 3);
    check("Anzahl 3 gespeichert", mehr.count === 3);
    check("Beschreibung statt Notiz", mehr.description === "Drei Kratzer am Heck");
    check("kein Feld 'image' mehr", mehr.image === undefined);
    check("kein Feld 'note' mehr", mehr.note === undefined);

    const eintraege = App.Store.damagesOf(v.id).length;
    const summe = App.Store.damageCount(v.id);
    check("Gesamtzahl ist die Summe der Anzahlen", summe === eintraege + 2,
      "Einträge " + eintraege + ", Summe " + summe);

    App.Fleet.renderFleet();
    check("Fuhrpark zeigt die Summe",
      q("fleet-grid").textContent.includes(summe + " Schäden"),
      q("fleet-grid").textContent.slice(0, 140));

    // Alte Datensätze überführen
    const alt = App.Store.normalisiereSchaden({
      id: "x", image: "data:alt", note: "alte Notiz", date: "2026-01-01"
    });
    check("altes Bild wandert in die Liste", alt.images.length === 1 && alt.images[0] === "data:alt");
    check("alte Notiz wird Beschreibung", alt.description === "alte Notiz");
    check("Anzahl bekommt Vorgabe 1", alt.count === 1);
    check("alte Felder werden entfernt", alt.image === undefined && alt.note === undefined);

    const kaputt = App.Store.normalisiereSchaden({ id: "y", count: "keine Zahl" });
    check("unsinnige Anzahl wird zu 1", kaputt.count === 1, String(kaputt.count));
    check("ohne Bild leere Liste", Array.isArray(kaputt.images) && kaputt.images.length === 0);

    // Bearbeiten: Bilder und Anzahl ändern
    await App.Store.updateDamage(v.id, mehr.id, {
      images: mehr.images.concat(["data:image/jpeg;base64,D"]),
      count: 4, description: "Vier Kratzer am Heck"
    });
    const bearbeitet = App.Store.damagesOf(v.id).find(x => x.id === mehr.id);
    check("Bild ergänzt", bearbeitet.images.length === 4);
    check("Anzahl geändert", bearbeitet.count === 4);
    check("Beschreibung geändert", /Vier Kratzer/.test(bearbeitet.description));

    await App.Store.deleteDamage(v.id, mehr.id);
  }

  console.log("\n--- Schäden ohne Datum ---");
  {
    const ohne = await App.Store.addDamage(v.id, {
      image: "data:image/jpeg;base64,X", note: "Rost Radlauf, war beim Kauf da",
      dateMode: "stock", date: "", area: "Radlauf h.r."
    });
    check("Bestandsschaden gespeichert", ohne.dateMode === "stock");
    check("kein Datum gesetzt", ohne.date === "");
    check("Erfassungszeitpunkt trotzdem da", typeof ohne.createdAt === "number" && ohne.createdAt > 0);

    const unbek = await App.Store.addDamage(v.id, {
      image: "data:image/jpeg;base64,Y", note: "Kratzer, wann unklar",
      dateMode: "unknown", date: ""
    });
    check("Kurzform Bestandsschaden", App.Fleet.fmtDamageDate(ohne) === "Bestandsschaden",
      App.Fleet.fmtDamageDate(ohne));
    check("Kurzform unbekannt", App.Fleet.fmtDamageDate(unbek) === "Datum unbekannt");
    check("Langform nennt Erfassung", /erfasst am/.test(App.Fleet.fmtDamageDateLong(ohne)),
      App.Fleet.fmtDamageDateLong(ohne));
    check("Langform bei exaktem Datum",
      /Schaden vom 04\.05\.2026/.test(App.Fleet.fmtDamageDateLong(
        App.Store.damagesOf(v.id).find(d => d.date === "2026-05-04"))));

    // Alte Schäden ohne dateMode dürfen nicht kaputtgehen
    const alt = { date: "2026-01-02" };
    check("Altdaten ohne Modus gelten als exakt",
      App.Fleet.fmtDamageDate(alt) === "02.01.2026", App.Fleet.fmtDamageDate(alt));

    // Fahrzeug erst öffnen — sonst weiss renderVehicle nicht, was es zeichnen soll
    App.Fleet.openVehicle(v.id);
    await wait(20);
    check("Kacheln zeigen den Hinweis",
      q("damage-grid").textContent.includes("Bestandsschaden"),
      q("damage-grid").textContent.slice(0, 120));
    check("Kacheln zeigen auch 'Datum unbekannt'",
      q("damage-grid").textContent.includes("Datum unbekannt"));

    await App.Store.deleteDamage(v.id, ohne.id);
    await App.Store.deleteDamage(v.id, unbek.id);
  }

  console.log("\n--- Markierwerkzeug ---");
  {
    App.Annotate.open({ title: "t", onSave: () => {} });
    const werkzeug = q("modal-annotate");

    check("keine Lupe mehr im Werkzeugkasten", !werkzeug.querySelector('[data-tool="loupe"]'));
    check("keine Vergrösserungsauswahl mehr", !w.document.getElementById("loupe-factor-wrap"));
    check("keine Zeichenhilfe mehr", !w.document.getElementById("draw-loupe"));
    check("vier Werkzeuge übrig", werkzeug.querySelectorAll("[data-tool]").length === 4,
      String(werkzeug.querySelectorAll("[data-tool]").length));

    check("Standardfarbe ist kräftiges Rot", q("input-color").value === "#ff3b30",
      q("input-color").value);
    check("Standardstärke 25", q("input-width").value === "25", q("input-width").value);
    check("Regler reicht bis 60", q("input-width").max === "60", q("input-width").max);
    check("Stärke wird angezeigt", q("width-value").textContent === "25",
      q("width-value").textContent);
    q("input-width").value = "48";
    q("input-width").dispatchEvent(new w.Event("input", { bubbles: true }));
    check("Anzeige folgt beim Ziehen", q("width-value").textContent === "48",
      q("width-value").textContent);
    q("input-width").value = "7";
    q("input-width").dispatchEvent(new w.Event("change", { bubbles: true }));
    check("Anzeige folgt auch beim Loslassen", q("width-value").textContent === "7",
      q("width-value").textContent);
    // Nach erneutem Öffnen darf die Anzeige nicht auf altem Stand hängenbleiben
    App.Annotate.close();
    App.Annotate.open({ title: "t2", onSave: () => {} });
    check("Anzeige stimmt nach Neuöffnen", q("width-value").textContent === "7",
      q("width-value").textContent);
    // Pfeilrichtung: Spitze bleibt am Aufsetzpunkt, der Schaft folgt dem Finger
    const pf = { type: "arrow", x1: 100, y1: 100, x2: 100, y2: 100 };
    App.Annotate._setzeZugpunkt(pf, { x: 300, y: 260 });
    check("Pfeilspitze bleibt am Aufsetzpunkt",
      pf.x2 === 100 && pf.y2 === 100, pf.x2 + "/" + pf.y2);
    check("Pfeilschaft folgt dem Finger",
      pf.x1 === 300 && pf.y1 === 260, pf.x1 + "/" + pf.y1);
    const kr = { type: "circle", x1: 100, y1: 100, x2: 100, y2: 100 };
    App.Annotate._setzeZugpunkt(kr, { x: 300, y: 260 });
    check("Kreis zieht wie bisher auf",
      kr.x1 === 100 && kr.x2 === 300 && kr.y2 === 260, JSON.stringify(kr));

    check("dunkle Farbe → heller Kasten", App.Annotate._istHell("#ff3b30") === false);
    check("helle Farbe → dunkler Kasten", App.Annotate._istHell("#f5ec22") === true);

    // Werkzeug abwählen
    const kreis = werkzeug.querySelector('[data-tool="circle"]');
    const pfeil = werkzeug.querySelector('[data-tool="arrow"]');
    const leinwand = q("annotate-canvas");
    check("kein Werkzeug beim Öffnen", App.Annotate._tool() === null, String(App.Annotate._tool()));
    check("kein Werkzeug hervorgehoben beim Öffnen",
      werkzeug.querySelectorAll("[data-tool].active").length === 0);
    check("Bild lässt die Seite scrollen", leinwand.style.touchAction === "auto",
      leinwand.style.touchAction);
    check("Hinweis nennt das Scrollen",
      /normal scrollen/.test(q("zoom-hint").textContent), q("zoom-hint").textContent);
    pfeil.click();
    check("mit Werkzeug fängt das Bild die Geste ab", leinwand.style.touchAction === "none",
      leinwand.style.touchAction);
    check("Umschalten auf Pfeil", App.Annotate._tool() === "arrow", String(App.Annotate._tool()));
    check("nur ein Werkzeug hervorgehoben",
      werkzeug.querySelectorAll("[data-tool].active").length === 1);
    pfeil.click();
    check("nochmal antippen wählt ab", App.Annotate._tool() === null, String(App.Annotate._tool()));
    check("kein Werkzeug hervorgehoben",
      werkzeug.querySelectorAll("[data-tool].active").length === 0);
    check("Hinweis erklärt den Zustand ohne Werkzeug",
      /normal scrollen/.test(q("zoom-hint").textContent), q("zoom-hint").textContent);
    check("abgewählt gibt das Bild die Geste wieder frei", leinwand.style.touchAction === "auto",
      leinwand.style.touchAction);
    kreis.click();
    check("wieder anwählbar", App.Annotate._tool() === "circle");
    App.Annotate.close();
  }

  console.log("\n--- Schadensstand einfrieren ---");
  App.Fleet.openVehicle(v.id);
  await wait(30);
  check("Fahrzeugansicht offen", !q("view-vehicle").classList.contains("hidden"));
  check("Hinweis auf leere Ständeliste", q("snapshot-list").textContent.includes("Noch kein Schadensstand"));

  q("btn-create-snapshot").click();
  await wait(30);
  check("Dialog offen", !q("modal-snapshot").classList.contains("hidden"));
  check("Dialog nennt Anzahl", q("snapshot-modal-info").textContent.includes("2 dokumentierte Schäden"));
  q("input-snapshot-reference").value = "MV 2026-0418";
  q("btn-confirm-snapshot").click();
  await wait(80);

  const stand = App.Store.snapshots(v.id)[0];
  check("Stand angelegt", !!stand);
  check("Kennung hat 4 Zeichen", stand.code.length === 4, stand.code);
  check("Kennung ohne verwechselbare Zeichen", !/[0O1I5S]/.test(stand.code), stand.code);
  check("2 Bilder eingefroren", stand.damages.length === 2);
  check("Referenz gespeichert", stand.reference === "MV 2026-0418");
  check("Kennung wird gross angezeigt", q("snapshot-code").textContent === stand.code);
  const zeile = q("snapshot-transfer").textContent;
  check("Übertragungszeile enthält Kennzeichen", zeile.includes("NOM-JA 123"), zeile);
  check("Übertragungszeile enthält Kennung", zeile.includes(stand.code));
  check("Übertragungszeile enthält Anzahl", /2 Schäden/.test(zeile));
  check("keine Kundendaten im Stand",
    !JSON.stringify(stand).match(/name.*(Beckmann|Mieter|Kunde)/i));

  console.log("\n--- Unveränderlichkeit ---");
  const alt1 = App.Store.damagesOf(v.id).find((d) => (d.description || "").includes("Kratzer"));
  await App.Store.updateDamage(v.id, alt1.id, { description: "NACHTRÄGLICH GEÄNDERT" });
  const steinschlag = App.Store.damagesOf(v.id).find((d) => (d.description || "").includes("Steinschlag"));
  await App.Store.deleteDamage(v.id, steinschlag.id);
  const nachher = App.Store.getSnapshot(stand.id);
  check("Beschreibung im Stand unverändert",
    nachher.damages.some((d) => (d.description || "").includes("Kratzer Stossstange")));
  check("gelöschter Schaden bleibt im Stand", nachher.damages.length === 2);
  check("Register ist jetzt bei 1", App.Store.damagesOf(v.id).length === 1);
  check("Tombstone gesetzt", App.Store.getVehicle(v.id).damages.some((d) => d.deleted === true));

  console.log("\n--- Kennung nachschlagen ---");
  check("Suche findet Kennung", !!App.Store.findSnapshotByCode(stand.code));
  check("Suche ist unabhängig von Gross/Kleinschreibung",
    !!App.Store.findSnapshotByCode(stand.code.toLowerCase()));
  check("Suche ignoriert Leerzeichen", !!App.Store.findSnapshotByCode(" " + stand.code + " "));
  check("unbekannte Kennung liefert nichts", App.Store.findSnapshotByCode("XXXX") === null);
  q("input-code-search").value = stand.code;
  q("input-code-search").dispatchEvent(new w.Event("input", { bubbles: true }));
  await wait(30);
  check("Trefferanzeige im Fuhrpark", q("code-search-result").textContent.includes("NOM-JA 123"));
  q("input-code-search").value = "ZZZZ";
  q("input-code-search").dispatchEvent(new w.Event("input", { bubbles: true }));
  check("Fehlanzeige bei unbekannter Kennung",
    q("code-search-result").textContent.includes("Keine Kennung"));

  console.log("\n--- Eindeutigkeit der Kennungen ---");
  const codes = new Set([stand.code]);
  for (let i = 0; i < 60; i++) {
    const s = await App.Store.createSnapshot(v.id, "");
    codes.add(s.code);
  }
  check("61 Stände, 61 verschiedene Kennungen", codes.size === 61, "verschieden: " + codes.size);

  console.log("\n--- PDF-Erzeuger ---");
  {
    check("PDF-Modul geladen", !!(App.PDF && App.PDF.neu));
    const info = App.PDF._jpegInfo(
      Uint8Array.from(atob(MINI_JPEG.split(",")[1]), (c) => c.charCodeAt(0)));
    check("JPEG-Masse werden gelesen", info && info.breite === 48 && info.hoehe === 36,
      JSON.stringify(info));
    check("Farbkanaele erkannt", info && info.kanaele === 3, String(info && info.kanaele));

    // Abmessungen ohne Zeichnen — Grundlage fuer die Verteilung auf der Seite
    const m = App.PDF.masse(MINI_JPEG);
    check("Masse werden vorab ermittelt", m && m.breite === 48 && m.hoehe === 36,
      JSON.stringify(m));
    check("Seitenverhaeltnis berechnet", m && Math.abs(m.verhaeltnis - 48 / 36) < 0.001);
    check("kein Bild liefert nichts", App.PDF.masse("data:text/plain,abc") === null);

    const doc = App.PDF.neu();
    doc.text("Prüfung äöüß ÄÖÜ", 20, 20, { size: 12, bold: true });
    doc.linie(20, 25, 190, 25);
    const lage = doc.bild(MINI_JPEG, 20, 30, 80, 60);
    check("Bild liefert seine Lage zurueck", lage && lage.breite > 0, JSON.stringify(lage));
    check("Seitenverhaeltnis bleibt erhalten",
      Math.abs(lage.breite / lage.hoehe - 48 / 36) < 0.01,
      (lage.breite / lage.hoehe).toFixed(3));
    doc.neueSeite();
    doc.text("Zweite Seite", 20, 20);
    check("zwei Seiten", doc.seiten() === 2, String(doc.seiten()));

    const bytes = doc.bauen();
    const roh = Buffer.from(bytes).toString("latin1");
    check("Datei beginnt mit %PDF", roh.slice(0, 5) === "%PDF-", roh.slice(0, 8));
    check("Datei endet mit %%EOF", /%%EOF\s*$/.test(roh));
    check("JPEG unveraendert eingebettet", roh.includes("/DCTDecode"));
    check("Querverweistabelle vorhanden", roh.includes("xref") && roh.includes("startxref"));
    check("beide Seiten im Baum", /\/Count 2/.test(roh));
    check("Umlaute als Latin-1 kodiert", roh.includes("Pr\u00fcfung"), "");

    // Zeilenumbruch rechnet in Millimetern
    const zeilen = doc.umbrechen(
      "Ein recht langer Text der auf jeden Fall umgebrochen werden muss weil er nicht passt",
      40, 9, false);
    check("Text wird umgebrochen", zeilen.length > 2, String(zeilen.length));
    check("keine Zeile ist zu breit",
      zeilen.every((z) => doc.textBreite(z, 9, false) <= 40.5),
      JSON.stringify(zeilen.map((z) => doc.textBreite(z, 9, false).toFixed(1))));
  }

  console.log("\n--- Schadenuebersicht als PDF ---");
  {
    const fz = App.Store.getVehicle(v.id);
    const schaeden = App.Store.damagesOf(v.id).map((d) =>
      Object.assign({}, d, { images: [MINI_JPEG, MINI_JPEG] }));
    const e = App.Uebersicht.erzeuge(fz, schaeden, App.Store.damageCount(v.id));

    check("Dateiname beginnt richtig", /^Schadenuebersicht_/.test(e.name), e.name);
    check("Kennzeichen im Dateinamen", e.name.includes("NOM-JA-123"), e.name);
    check("Datum im Dateinamen", /\d{4}-\d{2}-\d{2}\.pdf$/.test(e.name), e.name);
    check("mindestens zwei Seiten", e.doc.seiten() >= 2, String(e.doc.seiten()));

    const bytes = e.doc.bauen();
    const roh = Buffer.from(bytes).toString("latin1");
    check("gueltige PDF-Datei", roh.slice(0, 5) === "%PDF-" && /%%EOF\s*$/.test(roh));
    check("Fotos eingebettet", roh.includes("/DCTDecode"));
    // Zwei Bilder insgesamt: das Logo und das mehrfach verwendete Foto —
    // ein Foto, das oefter vorkommt, wird nur einmal gespeichert.
    check("jedes Bild nur einmal gespeichert",
      (roh.match(/\/DCTDecode/g) || []).length === 2,
      String((roh.match(/\/DCTDecode/g) || []).length));
    check("Seitenzahlen eingetragen", roh.includes("Seite 1 / "), "");

    // Alle Fotos eines Schadens muessen ins Dokument, jedes einzeln benannt
    const mehrfach = App.Uebersicht.erzeuge(fz, [{
      area: "Tuer", description: "Delle", count: 1, dateMode: "exact",
      date: "2026-07-01", createdAt: Date.now(),
      images: [MINI_JPEG, MINI_JPEG, MINI_JPEG]
    }], 1);
    const rohM = Buffer.from(mehrfach.doc.bauen()).toString("latin1");
    ["Bild 1.1", "Bild 1.2", "Bild 1.3"].forEach((b) => {
      check("Bildnummer " + b + " im Dokument", rohM.includes(b));
    });
    check("dieselbe Schadensnummer bei allen Bildern",
      (rohM.match(/Schaden 1 /g) || []).length === 3,
      String((rohM.match(/Schaden 1 /g) || []).length));
    check("Logo im Kopf eingebettet", !!App.Logo && roh.includes("/DCTDecode"), "");
    check("Logo-Modul geladen", !!(App.Logo && App.Logo.jpeg && App.Logo.verhaeltnis > 4),
      String(App.Logo && App.Logo.verhaeltnis));
    check("keine Internetadresse im Dokument",
      !/rent-in-nom|github\.io|https?:/i.test(roh),
      (roh.match(/https?:[^\s)]{0,40}/) || [""])[0]);

    // Zum Ansehen ablegen — Claude kann die Datei lesen
    try {
      fs.writeFileSync(path.join(APP, "testausgabe.pdf"), Buffer.from(bytes));
      check("Probedatei geschrieben", fs.existsSync(path.join(APP, "testausgabe.pdf")));
    } catch (err) {
      check("Probedatei geschrieben", false, String(err.message));
    }
  }

  console.log("\n--- Druckansicht ---");
  App.Snapshot.open(stand.id);
  await wait(30);
  check("Standansicht offen", !q("view-snapshot-view").classList.contains("hidden"));
  const doc = q("snapshot-view-body").textContent;
  check("Dokument zeigt Kennung", doc.includes(stand.code));
  check("Dokument zeigt Firmenkopf", doc.includes("Berliner Allee 14"));
  check("Dokument zeigt Referenz", doc.includes("MV 2026-0418"));
  q("btn-snapshot-print").click();
  await wait(600);
  check("Druck ausgelöst", w.__printed === true);
  check("Druckbereich gefüllt", q("print-area").innerHTML.length > 400);

  // =====================================================================
  console.log("\n--- Abgleich: Einrichtung und Anmeldung ---");
  const server = createFakeServer({ email: "chef@jansen.de", password: "geheim" });
  const w2 = macheApp({ fetch: server.fetch });
  await wait(300);
  const A2 = w2.App;
  const q2 = (id) => w2.document.getElementById(id);

  await A2.Cloud.saveConfig("https://demo.supabase.co", "anon-key-123");
  check("Konfiguration gespeichert", A2.Cloud.status().konfiguriert);
  await A2.Cloud.saveConfig("http://unsicher.example", "x").then(
    () => check("http:// wird abgelehnt", false),
    (e) => check("http:// wird abgelehnt", /https/.test(e.message)));

  let loginFehler = null;
  await A2.Cloud.login("chef@jansen.de", "falsch").catch((e) => { loginFehler = e.message; });
  check("falsches Passwort wird abgelehnt", /Invalid login/.test(loginFehler || ""), loginFehler);
  check("nach Fehlversuch nicht angemeldet", !A2.Cloud.status().angemeldet);

  await A2.Cloud.login("chef@jansen.de", "geheim");
  check("Anmeldung erfolgreich", A2.Cloud.status().angemeldet);
  check("E-Mail gemerkt", A2.Cloud.status().email === "chef@jansen.de");

  console.log("\n--- Abgleich: Hochladen ---");
  const v2 = await A2.Store.addVehicle({ name: "Ford Transit", plate: "NOM-JA 200" });
  await A2.Store.addDamage(v2.id, { image: "data:image/jpeg;base64,X1", note: "Delle Schiebetür", date: "2026-07-01", area: "Schiebetür" });
  const s2 = await A2.Store.createSnapshot(v2.id, "MV 2026-0500");
  await A2.Cloud.sync();
  await wait(50);
  check("Fahrzeug auf dem Server", server.zeilen("vehicles").some((z) => z.id === v2.id));
  check("Schaden auf dem Server", server.zeilen("damages").length === 1);
  check("Stand auf dem Server", server.zeilen("snapshots").some((z) => z.code === s2.code));
  check("Bild wurde mit übertragen",
    (server.zeilen("damages")[0].images || [])[0] === "data:image/jpeg;base64,X1",
    JSON.stringify(server.zeilen("damages")[0].images));
  check("Anzahl wird mit übertragen", server.zeilen("damages")[0].count === 1,
    String(server.zeilen("damages")[0].count));
  check("Beschreibung wird mit übertragen",
    server.zeilen("damages")[0].description === "Delle Schiebetür",
    server.zeilen("damages")[0].description);
  check("Server-Zeile hat Kennzeichen",
    server.zeilen("vehicles").find((z) => z.id === v2.id).plate === "NOM-JA 200");

  console.log("\n--- Abgleich: zweites Gerät ---");
  const w3 = macheApp({ fetch: server.fetch });
  await wait(300);
  const A3 = w3.App;
  await A3.Cloud.saveConfig("https://demo.supabase.co", "anon-key-123");
  await A3.Cloud.login("chef@jansen.de", "geheim");
  await wait(80);
  check("zweites Gerät sieht das Fahrzeug", A3.Store.vehicles().some((x) => x.id === v2.id));
  check("zweites Gerät sieht den Schaden", A3.Store.damagesOf(v2.id).length === 1);
  check("zweites Gerät sieht den Stand", !!A3.Store.findSnapshotByCode(s2.code));
  check("Stand-Inhalt vollständig übertragen",
    A3.Store.findSnapshotByCode(s2.code).damages.length === 1);

  console.log("\n--- Abgleich: Änderung fliesst zurück ---");
  await A3.Store.addDamage(v2.id, { image: "data:image/jpeg;base64,X2", note: "Kratzer Heck", date: "2026-07-20", area: "Heck" });
  await A3.Cloud.sync();
  await A2.Cloud.sync();
  await wait(50);
  check("erstes Gerät hat den neuen Schaden", A2.Store.damagesOf(v2.id).length === 2);
  check("Fahrzeugname nicht überschrieben",
    A2.Store.getVehicle(v2.id).name === "Ford Transit",
    A2.Store.getVehicle(v2.id).name);

  console.log("\n--- Abgleich: Löschen setzt sich durch ---");
  const zuLoeschen = A3.Store.damagesOf(v2.id).find((d) => (d.description || "").includes("Kratzer Heck"));
  await A3.Store.deleteDamage(v2.id, zuLoeschen.id);
  await A3.Cloud.sync();
  await A2.Cloud.sync();
  await wait(50);
  check("Löschung ist beim ersten Gerät angekommen", A2.Store.damagesOf(v2.id).length === 1);
  check("Löschung wird nicht wiederbelebt",
    !A2.Store.damagesOf(v2.id).some((d) => (d.description || "").includes("Kratzer Heck")));

  console.log("\n--- Abgleich: jüngere Änderung gewinnt ---");
  await A2.Store.updateVehicle(v2.id, { name: "Ford Transit (neu benannt)", plate: "NOM-JA 200" });
  await A2.Cloud.sync();
  await A3.Cloud.sync();
  await wait(50);
  check("neuerer Name setzt sich durch",
    A3.Store.getVehicle(v2.id).name === "Ford Transit (neu benannt)",
    A3.Store.getVehicle(v2.id).name);

  console.log("\n--- Abgleich: offline ---");
  server.setOffline(true);
  const vOffline = await A2.Store.addVehicle({ name: "Offline-Fahrzeug", plate: "NOM-JA 300" });
  const ergebnis = await A2.Cloud.sync();
  check("Abgleich scheitert ohne Netz sauber", ergebnis === false);
  check("Anlegen funktioniert trotzdem", A2.Store.vehicles().some((x) => x.id === vOffline.id));
  check("Status meldet fehlendes Netz", /Netz|Offline/i.test(q2("sync-status").textContent),
    q2("sync-status").textContent);
  server.setOffline(false);
  await A2.Cloud.sync();
  await wait(50);
  check("nach Rückkehr wird nachgeholt", server.zeilen("vehicles").some((z) => z.id === vOffline.id));

  console.log("\n--- Abgleich: fremde Änderung wird übernommen ---");
  server.fremdeAenderung("vehicles", {
    id: "veh-fremd", name: "Vom anderen Gerät", plate: "NOM-JA 400",
    deleted: false, updated_at: Date.now() + 1000
  });
  await A2.Cloud.sync();
  await wait(50);
  check("fremdes Fahrzeug übernommen", A2.Store.vehicles().some((x) => x.id === "veh-fremd"));

  console.log("\n--- Abgleich: abgelaufenes Token wird erneuert ---");
  const server2 = createFakeServer({ email: "a@b.de", password: "pw", expiresIn: 1 });
  const w4 = macheApp({ fetch: server2.fetch });
  await wait(300);
  await w4.App.Cloud.saveConfig("https://demo.supabase.co", "k");
  await w4.App.Cloud.login("a@b.de", "pw");
  await w4.App.Store.addVehicle({ name: "Token-Test", plate: "" });
  await w4.App.Cloud.sync();
  const angekommen = await bisWahr(
    () => server2.zeilen("vehicles").some((z) => z.name === "Token-Test"));
  check("trotz abgelaufenem Token erfolgreich", angekommen,
    JSON.stringify(server2.zeilen("vehicles").map((z) => z.name)));
  check("Erneuerung wurde angefordert",
    server2.log.some((l) => l.url.includes("grant_type=refresh_token")));

  console.log("\n--- Sicherung als Datei ---");
  const daten = A2.Store.allData();
  check("Export enthält Fahrzeuge und Stände",
    Array.isArray(daten.vehicles) && Array.isArray(daten.snapshots));
  const kopie = JSON.parse(JSON.stringify({ vehicles: daten.vehicles, snapshots: daten.snapshots }));
  const w5 = macheApp();
  await wait(300);
  await w5.App.Store.mergeAll(kopie);
  check("Import stellt Fahrzeuge wieder her",
    w5.App.Store.vehicles().length === A2.Store.vehicles().length);
  check("Import stellt Stände wieder her",
    w5.App.Store.snapshots().length === A2.Store.snapshots().length);

  console.log("\n--- Fehlerbehandlung: fehlendes Element beim Start ---");
  {
    // btn-create-snapshot wird schon beim Verdrahten gebraucht
    const kaputt = macheApp({ html: html.replace('id="btn-create-snapshot"', 'id="btn-create-snapshot-VERTIPPT"') });
    await wait(300);
    const fatal = kaputt.document.getElementById("fatal-error");
    check("Startfehler wird angezeigt", !!fatal);
    const t = fatal ? fatal.textContent : "";
    check("Meldung nennt das fehlende Element", /btn-create-snapshot/.test(t), t.slice(0, 140));
    check("Meldung nennt das schuldige Modul", /snapshot\.js/.test(t));
    check("Meldung behauptet NICHT Datenbankproblem", !/IndexedDB gesperrt/.test(t));
    check("kein blockierendes alert()", kaputt.__alert === undefined, String(kaputt.__alert));
  }

  console.log("\n--- Fehlerbehandlung: Fehler erst beim Klicken ---");
  {
    // snapshot-list wird erst beim Öffnen eines Fahrzeugs gebraucht:
    // die App startet normal, der Fehler tritt später auf.
    const spaet = macheApp({ html: html.replace('id="snapshot-list"', 'id="snapshot-list-VERTIPPT"') });
    await wait(300);
    check("App startet trotzdem", !spaet.document.getElementById("fatal-error"));
    const vs = await spaet.App.Store.addVehicle({ name: "Testwagen", plate: "X" });
    spaet.App.Fleet.renderFleet();
    const karte = spaet.document.querySelector(".vehicle-card");
    check("Fahrzeugkarte vorhanden", !!karte);
    karte.click();
    await wait(80);
    const band = spaet.document.getElementById("runtime-error");
    check("Fehlerband erscheint statt stiller Blockade", !!band);
    check("Band nennt das fehlende Element",
      band ? /snapshot-list/.test(band.textContent) : false,
      band ? band.textContent.slice(0, 120) : "");
    check("Band beruhigt wegen der Daten",
      band ? /Daten sind unverändert/.test(band.textContent) : false);
    if (band) {
      band.querySelector("button").click();
      check("Band lässt sich wegklicken", !spaet.document.getElementById("runtime-error"));
    }
  }

  console.log("\n--- Fehlerbehandlung: Datenbank blockiert ---");
  {
    const gesperrt = macheApp({
      indexedDB: {
        open: () => {
          const r = {};
          setTimeout(() => { r.error = new Error("SecurityError: IndexedDB gesperrt"); r.onerror && r.onerror(); }, 5);
          return r;
        }
      }
    });
    await wait(300);
    const fatal = gesperrt.document.getElementById("fatal-error");
    check("Datenbankfehler wird angezeigt", !!fatal);
    const t = fatal ? fatal.textContent : "";
    check("hier ist der Safari-Hinweis richtig", /privaten Modus/.test(t), t.slice(0, 120));
    check("und nennt nicht die Oberfläche", !/Oberfläche konnte nicht aufgebaut/.test(t));
  }

  console.log("\n=================================");
  console.log(failures === 0 ? "ALLE PRÜFUNGEN BESTANDEN" : failures + " PRÜFUNG(EN) FEHLGESCHLAGEN");
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error("Testlauf abgebrochen:", e); process.exit(1); });
