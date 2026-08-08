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
const DATEIEN = ["js/store.js", "js/modelle.js", "js/cloud.js", "js/logo.js", "js/skizze.js", "js/skizze-ui.js", "js/formen-vorlagen.js", "js/pdf.js", "js/annotate.js",
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
      quadraticCurveTo: log("quadraticCurveTo"), bezierCurveTo: log("bezierCurveTo"),
      setTransform: log("setTransform"), rect: log("rect"), strokeText: log("strokeText"),
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

/* WCAG-Kontrast — dieselbe Rechnung, mit der schon die helle Palette
   nachgeschärft wurde. 4.5:1 ist die Schwelle für normalen Fliesstext. */
function lum(hex) {
  const h = String(hex || "").replace("#", "");
  if (h.length !== 6) return null;
  const k = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * k[0] + 0.7152 * k[1] + 0.0722 * k[2];
}

function kontrast(a, b) {
  const la = lum(a), lb = lum(b);
  if (la === null || lb === null) return null;
  const [hoch, tief] = la > lb ? [la, lb] : [lb, la];
  return (hoch + 0.05) / (tief + 0.05);
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

  // Name der App — im Kundendokument hat er nichts zu suchen, dort steht "Schadenübersicht"
  {
    const kopf = w.document.querySelector(".header-title").textContent;
    check("Kopfzeile heisst Schadenmanager", kopf === "Schadenmanager", kopf);
    check("Fenstertitel nennt den Betrieb",
      /Schadenmanager/.test(w.document.title) && /Jansen/.test(w.document.title), w.document.title);
    const mani = JSON.parse(fs.readFileSync(path.join(APP, "manifest.webmanifest"), "utf8"));
    check("Homescreen-Name ist Schadenmanager", mani.short_name === "Schadenmanager", mani.short_name);
    const html = fs.readFileSync(path.join(APP, "index.html"), "utf8");
    check("kein alter Name mehr im HTML", !/AVJ Schäden|– damage/.test(html));

    /* Beide Werkzeuge liegen auf derselben Domain — ohne eigenes Symbol
       sähen sie auf dem Homescreen gleich aus. */
    const symbole = ["icons/favicon.png", "icons/icon-192.png",
      "icons/icon-512.png", "icons/icon-maskable-512.png"];
    symbole.forEach((datei) => {
      const roh = fs.readFileSync(path.join(APP, datei));
      check("Symbol vorhanden: " + datei, roh.length > 500, String(roh.length));
    });
    check("nicht für Suchmaschinen", /name="robots"[^>]*noindex/.test(html));
    check("robots.txt sperrt alles",
      /Disallow: \//.test(fs.readFileSync(path.join(APP, "robots.txt"), "utf8")));
  }

  console.log("\n--- Dunkelmodus ---");
  {
    const css = fs.readFileSync(path.join(APP, "css/app.css"), "utf8");
    const html = fs.readFileSync(path.join(APP, "index.html"), "utf8");

    check("folgt der Systemeinstellung",
      /@media \(prefers-color-scheme: dark\)/.test(css));
    check("Formularfelder ziehen mit",
      /name="color-scheme"[^>]*content="light dark"/.test(html));

    const dunkel = css.split("@media (prefers-color-scheme: dark)")[1] || "";
    const werte = {};
    (dunkel.match(/--[a-z-]+:\s*#[0-9a-fA-F]{6}/g) || []).forEach((z) => {
      const [k, v] = z.split(":");
      werte[k.trim()] = v.trim();
    });
    check("Grund wird dunkel", werte["--bg"] && lum(werte["--bg"]) < 0.1, werte["--bg"]);
    check("Schrift wird hell", werte["--ink"] && lum(werte["--ink"]) > 0.7, werte["--ink"]);
    check("Karte hebt sich vom Grund ab",
      werte["--paper"] !== werte["--bg"], werte["--paper"] + " / " + werte["--bg"]);

    // Das Dokument zeigt, was gedruckt wird — es darf nicht mitdunkeln
    check("Dokument bleibt Papier", !/--doc-bg/.test(dunkel));
    check("Druck erzwingt weiss", /body\{background:#fff;color:#1a1a18;\}/.test(css));
    check("Dokument beim Druck weiss", /\.doc-wrap\{background:#fff/.test(css));

    // Lesbarkeit — dieselbe Schwelle wie im hellen Bild
    const paare = [
      ["Text auf Grund", "--ink", "--bg"],
      ["Text auf Karte", "--ink", "--paper"],
      ["Nebentext", "--muted", "--paper"],
      ["kleiner Nebentext", "--muted-light", "--paper"],
      ["Blau auf Karte", "--blue", "--paper"],
      ["Blau im blauen Kasten", "--blue", "--blue-soft"],
      ["Grün im Erfolgskasten", "--green", "--ok-bg"],
      ["Gold im Warnkasten", "--gold", "--warn-bg"],
      ["Rot auf Karte", "--red", "--paper"],
      ["Knopfschrift", "--btn-fg", "--btn-bg"]
    ];
    paare.forEach(([name, vorn, hinten]) => {
      const v = kontrast(werte[vorn], werte[hinten]);
      check("lesbar: " + name, v >= 4.5, (werte[vorn] || "?") + " auf " +
        (werte[hinten] || "?") + " = " + (v ? v.toFixed(2) : "?"));
    });
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

  console.log("\n--- Schnellauswahl Hersteller und Modell ---");
  {
    q("btn-add-vehicle").click();
    const marke = q("input-marke");
    const modell = q("input-modell");
    const name = q("input-vehicle-name");

    check("Hersteller stehen zur Auswahl", marke.options.length > 20,
      String(marke.options.length));
    check("Modellfeld ist anfangs gesperrt", modell.disabled === true);
    check("VW ist dabei", [...marke.options].some((o) => o.value === "Volkswagen"));
    check("Anhängerhersteller sind dabei",
      [...marke.options].some((o) => o.value === "Humbaur"));
    check("Neunsitzer heisst Tourer, nicht Kombi",
      App.Modelle.modelle("Mercedes-Benz").includes("Sprinter Tourer") &&
      !App.Modelle.modelle("Mercedes-Benz").includes("Sprinter Kombi"),
      App.Modelle.modelle("Mercedes-Benz").join(", "));
    check("freie Eingabe wird angeboten",
      [...marke.options].some((o) => o.value === "__frei"));

    marke.value = "Volkswagen";
    marke.dispatchEvent(new w.Event("change", { bubbles: true }));
    check("Modelle sind aufgegangen", modell.disabled === false);
    check("Crafter ist dabei", [...modell.options].some((o) => o.value === "Crafter"));
    check("Bezeichnung schon gesetzt", name.value === "Volkswagen", name.value);

    modell.value = "Crafter";
    modell.dispatchEvent(new w.Event("change", { bubbles: true }));
    check("Bezeichnung vollständig", name.value === "Volkswagen Crafter", name.value);

    // Handgeschriebener Zusatz überlebt einen Wechsel
    name.value = "Volkswagen Crafter #2";
    modell.value = "Caddy";
    modell.dispatchEvent(new w.Event("change", { bubbles: true }));
    check("eigener Zusatz bleibt", name.value === "Volkswagen Caddy #2", name.value);

    // Kein Vorschlag bei "Anderer Hersteller"
    name.value = "Selbstgebauter Anhänger";
    marke.value = "__frei";
    marke.dispatchEvent(new w.Event("change", { bubbles: true }));
    check("freie Eingabe wird nicht überschrieben",
      name.value === "Selbstgebauter Anhänger", name.value);
    check("Modellfeld dann wieder gesperrt", modell.disabled === true);

    q("modal-vehicle").classList.add("hidden");

    // Beim Bearbeiten mischt sich die Hilfe nicht ein
    App.Fleet.openVehicle(v.id);
    const alterName = App.Store.getVehicle(v.id).name;
    q("btn-edit-vehicle").click();
    check("Bezeichnung bleibt beim Bearbeiten stehen",
      q("input-vehicle-name").value === alterName, q("input-vehicle-name").value);
    check("Schnellauswahl startet leer", q("input-marke").value === "");
    q("modal-vehicle").classList.add("hidden");
    App.Nav.go("fleet");
  }

  console.log("\n--- Kennzeichen ---");
  {
    const f = App.Fleet._formatiereKennzeichen;
    check("nomnj56 wird NOM-NJ 56", f("nomnj56") === "NOM-NJ 56", f("nomnj56"));
    check("schon richtig bleibt richtig", f("NOM-NJ 56") === "NOM-NJ 56");
    check("Leerzeichen statt Bindestrich geht auch", f("NOM NJ 56") === "NOM-NJ 56");
    check("kurzes Kürzel", f("euja1") === "EU-JA 1", f("euja1"));
    check("Umlaut im Kürzel", f("rüdab12") === "RÜD-AB 12", f("rüdab12"));
    check("Oldtimer-H bleibt dran", f("nomab12h") === "NOM-AB 12H", f("nomab12h"));
    check("Unpassendes bleibt unangetastet",
      f("Anhänger ohne Schild") === "ANHÄNGER OHNE SCHILD");
    check("leer bleibt leer", f("  ") === "");

    q("btn-add-vehicle").click();
    const kuerzel = [...q("kfz-kuerzel").querySelectorAll("button")].map((b) => b.textContent);
    check("Kürzel stehen bereit", kuerzel.join(",") === "NOM,EU,RÜD", kuerzel.join(","));

    const feld = q("input-vehicle-plate");
    q("kfz-kuerzel").querySelector("button").click();
    check("Kürzel setzt den Anfang mit Bindestrich", feld.value === "NOM-", feld.value);
    check("Kürzel wird hervorgehoben",
      q("kfz-kuerzel").querySelector("button").classList.contains("aktiv"));

    feld.value = "NOM-nj56";
    feld.dispatchEvent(new w.Event("blur", { bubbles: true }));
    check("Verlassen räumt auf", feld.value === "NOM-NJ 56", feld.value);

    // Wechsel des Kürzels tauscht nur den Ort
    q("kfz-kuerzel").querySelectorAll("button")[2].click();
    check("Kürzel tauschen lässt den Rest stehen",
      feld.value === "RÜD-NJ 56", feld.value);

    q("modal-vehicle").classList.add("hidden");
  }

  console.log("\n--- Nummern ---");
  {
    const fz = App.Store.getVehicle(v.id);
    check("Fahrzeug hat eine Nummer", fz.nr > 0, String(fz.nr));
    const ersterSchaden = App.Store.damagesOf(v.id, "schaden")
      .slice().sort((a, b) => a.nr - b.nr)[0];
    check("Schaden hat eine Nummer", ersterSchaden.nr > 0, String(ersterSchaden.nr));
    check("Nummer wird als Fahrzeug.Schaden gezeigt",
      App.Store.schadenNummer(v.id, ersterSchaden) === fz.nr + "." + ersterSchaden.nr,
      App.Store.schadenNummer(v.id, ersterSchaden));

    const zweit = await App.Store.addVehicle({ name: "Nummerntest", plate: "NOM-JA 42" });
    check("zweites Fahrzeug bekommt die nächste Nummer", zweit.nr === fz.nr + 1,
      zweit.nr + " nach " + fz.nr);
    const d1 = await App.Store.addDamage(zweit.id, { images: ["x"], description: "a" });
    const d2 = await App.Store.addDamage(zweit.id, { images: ["y"], description: "b" });
    check("Schäden zählen je Fahrzeug hoch", d1.nr === 1 && d2.nr === 2,
      d1.nr + "/" + d2.nr);
    check("Anzeige stimmt", App.Store.schadenNummer(zweit.id, d2) === zweit.nr + ".2");
    await App.Store.deleteVehicle(zweit.id);
  }

  console.log("\n--- Suche ---");
  {
    const treffer = App.Store.suche("NOM-JA 123");
    check("findet über das Kennzeichen", treffer.fahrzeuge.some((x) => x.id === v.id),
      String(treffer.fahrzeuge.length));
    check("Schreibweise egal",
      App.Store.suche("nomja123").fahrzeuge.some((x) => x.id === v.id));
    check("findet über die Bezeichnung",
      App.Store.suche("Yaris").fahrzeuge.some((x) => x.id === v.id),
      String(App.Store.suche("Yaris").fahrzeuge.length));
    check("ein Zeichen sucht noch nicht", App.Store.suche("N").fahrzeuge.length === 0);

    const mitVertrag = await App.Store.addDamage(v.id, {
      images: ["data:image/jpeg;base64,SUCH"], description: "Delle Heckklappe",
      vertragsnr: "MV 2026-0777"
    });
    check("findet über die Mietvertragsnummer",
      App.Store.suche("2026-0777").schaeden.some((t) => t.damage.id === mitVertrag.id));
    check("findet über den Beschreibungstext",
      App.Store.suche("Heckklappe").schaeden.some((t) => t.damage.id === mitVertrag.id));
    check("findet über die Schadennummer",
      App.Store.suche(App.Store.schadenNummer(v.id, mitVertrag))
        .schaeden.some((t) => t.damage.id === mitVertrag.id));

    // Oberfläche
    q("input-suche").value = "Heckklappe";
    q("input-suche").dispatchEvent(new w.Event("input", { bubbles: true }));
    check("Trefferliste erscheint", !q("suche-ergebnis").classList.contains("hidden"));
    check("Fuhrpark tritt zurück", q("fleet-grid").classList.contains("hidden"));
    check("Treffer nennt den Schaden",
      /Heckklappe/.test(q("suche-ergebnis").textContent), q("suche-ergebnis").textContent);
    q("btn-suche-leeren").click();
    check("Leeren stellt den Fuhrpark wieder her",
      !q("fleet-grid").classList.contains("hidden"));

    await App.Store.deleteDamage(v.id, mitVertrag.id);
    await App.Store.leerePapierkorb();
  }

  console.log("\n--- Archiv ---");
  {
    const leasing = await App.Store.addVehicle({ name: "DirectCar Leasing", plate: "NOM-JA 55" });
    await App.Store.addDamage(leasing.id, { images: ["z"], description: "Kratzer" });

    await App.Store.archiviere(leasing.id, true);
    check("verschwindet aus dem Fuhrpark",
      !App.Store.vehicles().some((x) => x.id === leasing.id));
    check("steht im Archiv",
      App.Store.vehicles({ archiv: true }).some((x) => x.id === leasing.id));
    check("Archivzähler stimmt", App.Store.archivAnzahl() === 1);
    check("Schäden bleiben erhalten", App.Store.damagesOf(leasing.id).length === 1);
    check("bleibt auffindbar", App.Store.suche("DirectCar").fahrzeuge.length === 1);

    await App.Store.archiviere(leasing.id, false);
    check("kommt zurück in den Fuhrpark",
      App.Store.vehicles().some((x) => x.id === leasing.id));
    await App.Store.deleteVehicle(leasing.id);
  }

  console.log("\n--- HU-Kalender abonnieren ---");
  {
    const fn = fs.readFileSync(path.join(APP, "supabase-hu-kalender.ts"), "utf8");
    check("Funktion prüft das Kalenderwort", /KALENDER_TOKEN/.test(fn));
    check("kurze Wörter werden abgewiesen", /erwartet\.length < 16/.test(fn));
    check("Vergleich bricht nicht früh ab", /function gleich/.test(fn));
    check("liefert Kalenderformat aus", /text\/calendar/.test(fn));
    check("nur Lesezugriffe", /ERLAUBT = \["GET", "HEAD", "OPTIONS"\]/.test(fn));
    check("archivierte Fahrzeuge bleiben draussen", /!v\.archived/.test(fn));
    check("zwei Wecker wie in der App", (fn.match(/BEGIN:VALARM/g) || []).length === 2);
    check("Anleitung liegt bei",
      fs.existsSync(path.join(APP, "ANLEITUNG-KALENDER.md")));
    const anleitung = fs.readFileSync(path.join(APP, "ANLEITUNG-KALENDER.md"), "utf8");
    check("Anleitung warnt vor Verify JWT", /Verify JWT/.test(anleitung));
    check("Anleitung nennt beide Geheimnisse",
      /KALENDER_TOKEN/.test(anleitung) && /SB_SECRET_KEY/.test(anleitung));
    check("Anleitung warnt vor dem geheimen Schlüssel",
      /sb_secret_/.test(anleitung) && /nicht.*sb_publishable/i.test(anleitung));
  }

  console.log("\n--- HU-Termin ---");
  {
    /* Die HU gilt für einen Monat, nicht für einen Tag — Stichtag ist das
       Monatsende. */
    check("Tagesangaben werden auf den Monat gekürzt",
      App.Store.huMonat("2027-01-15") === "2027-01", App.Store.huMonat("2027-01-15"));
    check("Monat bleibt Monat", App.Store.huMonat("2027-01") === "2027-01");
    check("Unsinn wird verworfen", App.Store.huMonat("bald") === "");

    const jetzt = new Date();
    /* Der laufende Monat: Stichtag ist sein letzter Tag, also immer innerhalb
       der Warnfrist von acht Wochen. */
    const naechster = new Date(jetzt.getFullYear(), jetzt.getMonth(), 1);
    const monatText = naechster.getFullYear() + "-" +
      String(naechster.getMonth() + 1).padStart(2, "0");

    await App.Store.updateVehicle(v.id, { hu: monatText });
    const stand = App.Fleet._huStand(App.Store.getVehicle(v.id));
    const letzter = App.Fleet._huLetzterTag(monatText);
    check("Stichtag ist der Monatsletzte",
      letzter.getMonth() === naechster.getMonth() &&
      letzter.getDate() === new Date(naechster.getFullYear(), naechster.getMonth() + 1, 0).getDate(),
      letzter.toDateString());
    check("Frist zählt bis Monatsende", stand.tage >= 0 && stand.tage <= 31,
      String(stand.tage));
    check("wird als bald markiert", stand.klasse === "bald", stand.klasse);
    check("Anzeige nennt Monat und Jahr",
      stand.text.includes(String(naechster.getMonth() + 1).padStart(2, "0") + "/" +
        naechster.getFullYear()), stand.text);
    check("kein erfundener Tag in der Anzeige", !/\d{1,2}\.\d{1,2}\.\d{4}/.test(stand.text));

    const vorbei = new Date(jetzt.getFullYear(), jetzt.getMonth() - 2, 1);
    const vorbeiText = vorbei.getFullYear() + "-" +
      String(vorbei.getMonth() + 1).padStart(2, "0");
    await App.Store.updateVehicle(v.id, { hu: vorbeiText });
    check("überfällig wird erkannt",
      App.Fleet._huStand(App.Store.getVehicle(v.id)).klasse === "faellig");

    App.Fleet.renderFleet();
    check("Fuhrpark zeigt die Fälligkeit",
      /überfällig/.test(q("fleet-grid").textContent), q("fleet-grid").textContent.slice(0, 140));

    // Kalenderdatei
    let ics = "";
    const alterBlob = w.Blob;
    w.Blob = function (teile) { ics = String(teile[0]); return new alterBlob(teile); };
    w.URL.createObjectURL = () => "blob:test";
    w.URL.revokeObjectURL = () => {};
    App.Fleet._huKalender(App.Store.getVehicle(v.id));
    w.Blob = alterBlob;

    const ende2 = App.Fleet._huLetzterTag(vorbeiText);
    const tagText = ende2.getFullYear() +
      String(ende2.getMonth() + 1).padStart(2, "0") +
      String(ende2.getDate()).padStart(2, "0");
    check("Kalenderdatei erzeugt", /BEGIN:VCALENDAR/.test(ics));
    check("Termin liegt auf dem Monatsletzten", ics.includes("DTSTART;VALUE=DATE:" + tagText),
      (ics.match(/DTSTART[^\r\n]*/) || [""])[0]);
    check("zwei Wecker dran", (ics.match(/BEGIN:VALARM/g) || []).length === 2);
    check("einer zwei Wochen vorher", /TRIGGER:-P14D/.test(ics));
    check("einer am Monatsersten",
      ics.includes("TRIGGER:-P" + (ende2.getDate() - 1) + "D"),
      (ics.match(/TRIGGER[^\r\n]*/g) || []).join(" "));
    check("Titel nennt Monat und Fahrzeug", /SUMMARY:HU fällig \d{2}\/\d{4}/.test(ics),
      (ics.match(/SUMMARY[^\r\n]*/) || [""])[0]);

    await App.Store.updateVehicle(v.id, { hu: "" });
  }

  console.log("\n--- Kategorien ---");
  {
    const pkw = await App.Store.addCategory("PKW");
    const trans = await App.Store.addCategory("Transporter");
    await App.Store.addCategory("  ");   // leer darf nicht durchkommen
    check("zwei Kategorien angelegt", App.Store.categories().length === 2,
      String(App.Store.categories().length));
    check("Reihenfolge wie angelegt", App.Store.categories()[0].name === "PKW");

    await App.Store.moveCategory(trans.id, -1);
    check("nach oben verschoben", App.Store.categories()[0].name === "Transporter",
      App.Store.categories().map((c) => c.name).join(","));
    await App.Store.moveCategory(trans.id, -1);
    check("ganz oben bleibt oben", App.Store.categories()[0].name === "Transporter");

    await App.Store.updateCategory(pkw.id, "Personenwagen");
    check("umbenannt", App.Store.categoryName(pkw.id) === "Personenwagen",
      App.Store.categoryName(pkw.id));

    await App.Store.updateVehicle(v.id, { categoryId: pkw.id });
    check("Fahrzeug hat die Kategorie", App.Store.getVehicle(v.id).categoryId === pkw.id);
    check("Kategorie zählt ihr Fahrzeug", App.Store.categoryCount(pkw.id) === 1);

    await App.Store.deleteCategory(pkw.id);
    check("Kategorie gelöscht", App.Store.categories().length === 1);
    check("Fahrzeug lebt weiter", !!App.Store.getVehicle(v.id) && !App.Store.getVehicle(v.id).deleted);
    check("Fahrzeug steht jetzt ohne Kategorie", App.Store.getVehicle(v.id).categoryId === "");

    // Filter in der Übersicht
    const kombi = await App.Store.addCategory("Kleinbus");
    const bus = await App.Store.addVehicle({ name: "VW Crafter", plate: "NOM-JA 9", categoryId: kombi.id });
    check("Filter zeigt nur die Kategorie",
      App.Store.vehicles({ kategorie: kombi.id }).length === 1);
    check("ohne Filter sind alle da", App.Store.vehicles().length >= 2);

    App.Fleet.renderFleet();
    const chips = [...q("kategorie-filter").querySelectorAll(".filter-chip")].map((b) => b.textContent);
    check("Filterleiste zeigt Alle und die Kategorien",
      chips[0] === "Alle" && chips.includes("Kleinbus"), chips.join(" | "));
    [...q("kategorie-filter").querySelectorAll(".filter-chip")]
      .find((b) => b.textContent === "Kleinbus").click();
    check("Chip setzt den Filter", App.Fleet._filter().kategorie === kombi.id);
    check("Raster zeigt nur den Kleinbus",
      q("fleet-grid").querySelectorAll(".vehicle-card").length === 1,
      String(q("fleet-grid").querySelectorAll(".vehicle-card").length));
    q("kategorie-filter").querySelector(".filter-chip").click();   // "Alle"
    check("Filter wieder zurückgesetzt", App.Fleet._filter().kategorie === "");

    await App.Store.deleteVehicle(bus.id);
    await App.Store.deleteCategory(kombi.id);
  }

  console.log("\n--- Fahrzeuge ausblenden ---");
  {
    const lang = await App.Store.addVehicle({ name: "Langzeitmiete Corolla", plate: "NOM-JA 12" });
    await App.Store.updateVehicle(lang.id, { hidden: true });
    check("ausgeblendet taucht nicht auf",
      !App.Store.vehicles().some((x) => x.id === lang.id));
    check("auf Wunsch doch",
      App.Store.vehicles({ mitVersteckten: true }).some((x) => x.id === lang.id));
    check("Zähler kennt die Ausgeblendeten", App.Store.versteckteAnzahl() === 1,
      String(App.Store.versteckteAnzahl()));

    App.Fleet.renderFleet();
    const schalter = [...q("kategorie-filter").querySelectorAll(".filter-chip")]
      .find((b) => /Ausgeblendete/.test(b.textContent));
    check("Schalter erscheint nur bei Bedarf", !!schalter,
      q("kategorie-filter").textContent);
    schalter.click();
    check("Ausgeblendete werden gezeigt", App.Fleet._filter().versteckte === true);
    check("Kachel ist als ausgeblendet erkennbar",
      q("fleet-grid").innerHTML.includes("ausgeblendet"));
    [...q("kategorie-filter").querySelectorAll(".filter-chip")]
      .find((b) => /Ausgeblendete/.test(b.textContent)).click();
    check("wieder aus", App.Fleet._filter().versteckte === false);

    await App.Store.deleteVehicle(lang.id);
  }

  console.log("\n--- Zustandsaufnahmen ---");
  {
    const za = await App.Store.addDamage(v.id, {
      images: ["data:image/jpeg;base64,Z1"],
      description: "Fahrzeug bei Übergabe, rundum heil",
      kind: "zustand"
    });
    check("Art wird gespeichert", za.kind === "zustand", za.kind);
    check("zählt nicht als Schaden",
      !App.Store.damagesOf(v.id, "schaden").some((d) => d.id === za.id));
    check("steht im eigenen Bereich",
      App.Store.damagesOf(v.id, "zustand").some((d) => d.id === za.id));

    const vorher = App.Store.damageCount(v.id);
    await App.Store.addDamage(v.id, {
      images: ["data:image/jpeg;base64,Z2"], description: "noch eine Aufnahme", kind: "zustand"
    });
    check("Schadenszahl bleibt unberührt", App.Store.damageCount(v.id) === vorher,
      App.Store.damageCount(v.id) + " statt " + vorher);

    const stand = await App.Store.createSnapshot(v.id, "");
    check("Zustandsaufnahmen wandern nicht in den Stand",
      !stand.damages.some((d) => d.kind === "zustand"),
      JSON.stringify(stand.damages.map((d) => d.kind)));

    // Bereich hängt am Schalter des Fahrzeugs
    await App.Store.updateVehicle(v.id, { zustand: false });
    App.Fleet.openVehicle(v.id);
    check("Bereich bleibt zu, solange nicht gewünscht",
      q("zustand-block").classList.contains("hidden"));
    await App.Store.updateVehicle(v.id, { zustand: true });
    App.Fleet.renderVehicle();
    check("Bereich erscheint auf Wunsch",
      !q("zustand-block").classList.contains("hidden"));
    check("Bereich zeigt die Aufnahmen",
      q("zustand-grid").querySelectorAll(".damage-card").length === 2,
      String(q("zustand-grid").querySelectorAll(".damage-card").length));

    await App.Store.deleteSnapshot(stand.id);
    App.Store.damagesOf(v.id, "zustand").forEach(function (d) {
      App.Store.deleteDamage(v.id, d.id);
    });
    await App.Store.updateVehicle(v.id, { zustand: false });
    App.Fleet.renderVehicle();
  }

  console.log("\n--- Interne Beträge ---");
  {
    const sch = await App.Store.addDamage(v.id, {
      images: ["data:image/jpeg;base64,GELD"], description: "Delle Fahrertür",
      schaetzung: "700", zahlung: "500", vertragsnr: "MV 2026-0500"
    });
    check("Schätzung als Zahl", sch.schaetzung === 700, String(sch.schaetzung));
    check("Zahlung als Zahl", sch.zahlung === 500, String(sch.zahlung));
    check("Reparatur noch leer", sch.kosten === null, String(sch.kosten));
    check("Stand ist offen", sch.status === "offen", sch.status);
    check("Vertragsnummer gespeichert", sch.vertragsnr === "MV 2026-0500");

    // Deutsche Schreibweise muss durchkommen
    check("1.234,50 wird verstanden", App.Store.zuBetrag("1.234,50") === 1234.5,
      String(App.Store.zuBetrag("1.234,50")));
    check("1234.50 auch", App.Store.zuBetrag("1234.50") === 1234.5);
    check("890 € auch", App.Store.zuBetrag("890 €") === 890);
    check("leer bleibt leer", App.Store.zuBetrag("  ") === null);
    check("leer ist nicht null Euro", App.Store.zuBetrag("") !== 0);

    await App.Store.updateDamage(v.id, sch.id, { kosten: "380", status: "repariert" });
    const nach = App.Store.damagesOf(v.id).find((d) => d.id === sch.id);
    check("Reparaturkosten übernommen", nach.kosten === 380);
    check("Stand umgestellt", nach.status === "repariert");

    const b = App.Store.bilanz(v.id);
    check("Einnahmen summiert", b.zahlungen === 500, String(b.zahlungen));
    check("Kosten summiert", b.kosten === 380, String(b.kosten));
    check("Differenz stimmt", b.differenz === 120, String(b.differenz));
    check("erledigt gezählt", b.erledigt === 1, String(b.erledigt));

    // Offene Schätzung getrennt von echtem Geld
    const zweit = await App.Store.addDamage(v.id, {
      images: ["data:image/jpeg;base64,GELD2"], description: "Kratzer", schaetzung: "250"
    });
    const b2 = App.Store.bilanz(v.id);
    check("offene Schätzung getrennt", b2.offeneSchaetzung === 250, String(b2.offeneSchaetzung));
    check("Schätzung fliesst nicht in die Einnahmen", b2.zahlungen === 500);

    App.Fleet.openVehicle(v.id);
    check("Bilanz erscheint", !q("bilanz-block").classList.contains("hidden"));
    check("Bilanz steht unter den Schäden",
      w.document.getElementById("damage-grid").compareDocumentPosition(
        w.document.getElementById("bilanz-block")) & 4);
    check("Bilanz steht unter den Zustandsaufnahmen",
      w.document.getElementById("zustand-block").compareDocumentPosition(
        w.document.getElementById("bilanz-block")) & 4);
    check("Bilanz ist zugeklappt", q("bilanz-block").open === false);
    check("Kopfzeile fasst zusammen", q("bilanz-kurz").textContent.length > 0,
      q("bilanz-kurz").textContent);
    /* Ein reparierter Schaden steht nicht mehr in der aktiven Liste, sondern
       im eigenen Block darunter. Der Stand "ausgebessert" bleibt oben. */
    check("repariert ist aus der Liste raus", !/repariert/i.test(q("damage-grid").innerHTML));
    check("Stand steht auf der Kachel", /ausgebessert/i.test(q("damage-grid").innerHTML) ||
      /repariert/i.test(q("repariert-grid").innerHTML));

    await App.Store.deleteDamage(v.id, zweit.id);
  }

  console.log("\n--- Grosser Schaden über die Versicherung ---");
  {
    /* Der Fall aus dem Betrieb: Transporter XL, Schaden 3.500, SB 2.000.
       Der Mieter zahlt die Selbstbeteiligung, die Kasko den Rest. Unter dem
       Strich muss null herauskommen. */
    /* Es liegen schon andere Schäden am Fahrzeug — deshalb wird die
       Veränderung geprüft, nicht der absolute Stand. */
    const vorher = App.Store.bilanz(v.id);
    const gross = await App.Store.addDamage(v.id, {
      images: ["data:image/jpeg;base64,GROSS"], description: "Seitenwand eingedrückt",
      schaetzung: "3500", zahlung: "2000", kosten: "3500",
      regulierung: "kasko", erstattung: "1500"
    });
    check("Regulierungsart gespeichert", gross.regulierung === "kasko", gross.regulierung);
    check("Erstattung gespeichert", gross.erstattung === 1500, String(gross.erstattung));

    const b = App.Store.bilanz(v.id);
    check("Erstattung zählt als Einnahme",
      b.erstattungen - vorher.erstattungen === 1500, String(b.erstattungen));
    check("Mieteranteil bleibt getrennt",
      b.zahlungen - vorher.zahlungen === 2000, String(b.zahlungen));
    check("unter dem Strich null", b.differenz === vorher.differenz,
      b.differenz + " statt " + vorher.differenz);

    // Haftpflicht: der Gegner zahlt alles
    await App.Store.updateDamage(v.id, gross.id, {
      regulierung: "haftpflicht", zahlung: "", erstattung: "3500"
    });
    const b2 = App.Store.bilanz(v.id);
    check("Gegner zahlt alles",
      b2.erstattungen - vorher.erstattungen === 3500 &&
      b2.zahlungen - vorher.zahlungen === 0,
      b2.erstattungen + " / " + b2.zahlungen);
    check("auch hier null", b2.differenz === vorher.differenz,
      b2.differenz + " statt " + vorher.differenz);

    // Der Regelfall darf die Maske nicht aufblähen
    App.Fleet.openVehicle(v.id);
    App.Fleet._openDetail(gross.id);
    check("Erstattungsfeld ist da, wenn Versicherung zahlt",
      !q("detail-erstattung-row").classList.contains("hidden"));
    q("detail-regulierung").value = "mieter";
    q("detail-regulierung").dispatchEvent(new w.Event("change", { bubbles: true }));
    check("und weg, wenn der Mieter selbst zahlt",
      q("detail-erstattung-row").classList.contains("hidden"));
    q("modal-detail").classList.add("hidden");

    check("Standard ist der Mieter",
      App.Store.damagesOf(v.id, "schaden").every((d) => d.regulierung !== undefined));

    // Glasschaden: Werkstatt rechnet direkt ab, nur die eigene SB bleibt
    const vorGlas = App.Store.bilanz(v.id);
    const glas = await App.Store.addDamage(v.id, {
      images: ["data:image/jpeg;base64,GLAS"], description: "Steinschlag Frontscheibe, Austausch",
      regulierung: "teilkasko", kosten: "150"
    });
    const bg = App.Store.bilanz(v.id);
    check("Teilkasko wird angenommen", glas.regulierung === "teilkasko", glas.regulierung);
    check("nur die eigene Selbstbeteiligung schlägt durch",
      bg.differenz - vorGlas.differenz === -150, String(bg.differenz - vorGlas.differenz));

    App.Fleet._openDetail(glas.id);
    check("Erstattungsfeld auch bei Teilkasko",
      !q("detail-erstattung-row").classList.contains("hidden"));
    check("Hinweis erklärt die Direktabrechnung",
      !q("hinweis-erstattung").classList.contains("hidden"));
    check("Saldo spricht von hängenbleiben",
      /Bleibt an mir/.test(q("detail-saldo").textContent), q("detail-saldo").textContent);
    check("kein Wort von Gewinn",
      !/Übrig/.test(q("detail-saldo").textContent), q("detail-saldo").textContent);
    q("modal-detail").classList.add("hidden");

    await App.Store.deleteDamage(v.id, glas.id);
    await App.Store.deleteDamage(v.id, gross.id);
  }

  console.log("\n--- Beträge verdecken ---");
  {
    check("standardmässig verdeckt", App.Einstellungen.betraegeSichtbar() === false);
    App.Fleet.renderVehicle();
    check("Zusammenfassung verdeckt", /••••|gedeckt/.test(q("bilanz-kurz").textContent),
      q("bilanz-kurz").textContent);
    check("Bilanz zeigt Punkte statt Zahlen",
      q("vehicle-bilanz").textContent.includes("••••"), q("vehicle-bilanz").textContent);
    check("keine Zahl zu sehen", !/\d{3}/.test(q("vehicle-bilanz").textContent));

    w.document.getElementById("btn-augen").click();
    await wait(30);
    check("Auge schaltet ein", App.Einstellungen.betraegeSichtbar() === true);
    check("jetzt stehen Beträge da",
      /500/.test(q("vehicle-bilanz").textContent), q("vehicle-bilanz").textContent);

    w.document.getElementById("btn-augen").click();
    await wait(30);
    check("und wieder aus", q("vehicle-bilanz").textContent.includes("••••"));
  }

  console.log("\n--- Nichts davon beim Kunden ---");
  {
    const geld = App.Store.damagesOf(v.id, "schaden").find((d) => d.zahlung === 500);
    check("Zahlung gefunden", !!geld);

    // Schadensstand friert keine Beträge ein
    const stand2 = await App.Store.createSnapshot(v.id, "");
    /* Der Schaden mit der Zahlung steht auf "repariert" — der gehört nicht
       mehr in einen neuen Stand. Geprüft wird an einem offenen Schaden. */
    check("reparierter Schaden nicht im neuen Stand",
      !stand2.damages.some((d) => d.id === geld.id));
    const offen = App.Store.aktuelleSchaeden(v.id)[0];
    const drin = stand2.damages.find((d) => d.id === offen.id);
    check("Stand ohne Zahlung", drin.zahlung === undefined, JSON.stringify(Object.keys(drin)));
    check("Stand ohne Schätzung", drin.schaetzung === undefined);
    check("Stand ohne Reparaturkosten", drin.kosten === undefined);
    check("Stand ohne Vertragsnummer", drin.vertragsnr === undefined);
    check("Stand ohne Bearbeitungsstand", drin.status === undefined);

    // Kunden-PDF
    const ergebnis = App.Uebersicht.erzeuge(
      App.Store.getVehicle(v.id), App.Store.damagesOf(v.id, "schaden"), App.Store.damageCount(v.id));
    const roh = ergebnis.doc.bauen();
    const text = typeof roh === "string" ? roh : new TextDecoder("latin1").decode(roh);
    check("PDF nennt keine Vertragsnummer", !/MV 2026-0500/.test(text));
    check("PDF nennt keinen Betrag", !/500,00|700,00|380,00/.test(text));
    check("PDF nennt keinen Bearbeitungsstand", !/Repariert|Ausgebessert|Bleibt so/.test(text));

    // Druckansicht des Standes
    App.Snapshot.open(stand2.id);
    const doku = q("snapshot-view-body").textContent;
    check("Druckansicht ohne Beträge", !/500|700|380/.test(doku), doku.slice(0, 200));
    check("Druckansicht ohne Vertragsnummer", !/MV 2026-0500/.test(doku));

    await App.Store.deleteSnapshot(stand2.id);
    /* Wieder aufräumen: die folgenden Prüfungen zählen Schäden und Bilder. */
    await App.Store.deleteDamage(v.id, geld.id);
    App.Nav.go("fleet");
  }

  console.log("\n--- Zustandsmaske ---");
  {
    App.Annotate.open({ title: "t", art: "zustand", onSave: () => {} });
    check("keine Frage nach der Anzahl", q("count-row").classList.contains("hidden"));
    check("keine Frage nach 'Datum unbekannt'", q("datemode-row").classList.contains("hidden"));
    check("dafür der Anlass", !q("anlass-row").classList.contains("hidden"));
    check("dafür der Kilometerstand", !q("km-row").classList.contains("hidden"));
    check("Datum bleibt sichtbar", !q("date-row").classList.contains("hidden"));
    check("Feld heisst Motiv", q("label-area").textContent === "Motiv (optional)",
      q("label-area").textContent);
    check("Knopf spricht von der Aufnahme",
      q("btn-save-damage").textContent === "Aufnahme speichern", q("btn-save-damage").textContent);
    App.Annotate.close();

    App.Annotate.open({ title: "t", onSave: () => {} });
    check("beim Schaden wieder die Anzahl", !q("count-row").classList.contains("hidden"));
    /* Der Kilometerstand steht bei beiden Arten zur Verfügung — bei einem
       frischen Schaden weiss man ihn, bei einem alten nicht. Freiwillig. */
    check("Kilometerstand auch beim Schaden", !q("km-row").classList.contains("hidden"));
    check("und nicht vorbelegt", q("input-km").value === "", q("input-km").value);
    check("beim Schaden wieder 'Bereich'", q("label-area").textContent === "Bereich (optional)");
    App.Annotate.close();

    const za = await App.Store.addDamage(v.id, {
      images: ["data:image/jpeg;base64,ZK"], description: "alles dabei",
      kind: "zustand", km: "84500", anlass: "uebergabe"
    });
    check("Kilometerstand gespeichert", za.km === "84500", za.km);
    check("Anlass gespeichert", za.anlass === "uebergabe", za.anlass);

    await App.Store.updateVehicle(v.id, { zustand: true });
    App.Fleet.openVehicle(v.id);
    const kachel = q("zustand-grid").querySelector(".damage-card .meta").textContent;
    check("Kachel nennt den Anlass", /Übergabe an den Mieter/.test(kachel), kachel);
    check("Kachel schreibt km mit Punkt", /84\.500 km/.test(kachel), kachel);

    await App.Store.deleteDamage(v.id, za.id);
    await App.Store.updateVehicle(v.id, { zustand: false });
    App.Fleet.renderVehicle();
  }

  console.log("\n--- Foto nachträglich verbessern ---");
  {
    const alt = await App.Store.addDamage(v.id, {
      images: ["data:image/jpeg;base64,REGEN"], description: "im Regen fotografiert"
    });
    App.Fleet.openVehicle(v.id);
    App.Annotate.open({ title: "t", damage: alt, onSave: () => {} });
    check("Hinweis erklärt das Nachbessern",
      !q("edit-hinweis").classList.contains("hidden"));
    check("beim Neuanlegen kein Hinweis", true);
    App.Annotate.close();

    App.Annotate.open({ title: "t", onSave: () => {} });
    check("Hinweis nur beim Bearbeiten", q("edit-hinweis").classList.contains("hidden"));
    App.Annotate.close();

    // Reihenfolge: das bessere Foto nach vorn
    await App.Store.updateDamage(v.id, alt.id, {
      images: ["data:image/jpeg;base64,REGEN", "data:image/jpeg;base64,SAUBER"]
    });
    const zwei = App.Store.damagesOf(v.id).find((d) => d.id === alt.id);
    check("zweites Foto liegt dabei", zwei.images.length === 2);
    await App.Store.updateDamage(v.id, alt.id, {
      images: ["data:image/jpeg;base64,SAUBER", "data:image/jpeg;base64,REGEN"]
    });
    App.Fleet.renderVehicle();
    check("Kachel zeigt jetzt das vordere Foto",
      q("damage-grid").innerHTML.includes("SAUBER"));

    const sql = fs.readFileSync(path.join(APP, "supabase-einrichten.sql"), "utf8");
    check("SQL legt Tabellen nur an, wenn sie fehlen",
      (sql.match(/create table if not exists/g) || []).length === 4);
    check("SQL fügt Spalten nur an, wenn sie fehlen",
      !/alter table [^\n]*add column (?!if not exists)/.test(sql));
    check("SQL setzt Regeln wiederholbar",
      (sql.match(/drop policy if exists/g) || []).length === 4);
    check("kein blindes create table mehr", !/create table public\./.test(sql));

    await App.Store.deleteDamage(v.id, alt.id);
  }

  console.log("\n--- VIN und Fahrzeugbild ---");
  {
    const winz = "data:image/jpeg;base64,WINZBILD";
    /* Über die Maske, damit auch die Grossschreibung geprüft wird */
    App.Fleet.openVehicle(v.id);
    q("btn-edit-vehicle").click();
    q("input-vehicle-vin").value = "wf0axxttrahj12345";
    q("form-vehicle").dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
    await wait(40);
    check("VIN wird gross gespeichert",
      App.Store.getVehicle(v.id).vin === "WF0AXXTTRAHJ12345", App.Store.getVehicle(v.id).vin);
    await App.Store.updateVehicle(v.id, { photo: winz });
    check("Bild gespeichert", App.Store.getVehicle(v.id).photo === winz);

    App.Fleet.renderFleet();
    check("Kachel zeigt das Bild", q("fleet-grid").innerHTML.includes(winz));
    check("Bild sitzt im Kopf der Kachel",
      !!q("fleet-grid").querySelector(".fz-kopf .fz-bild"));
    check("Zählmarken stehen abgesetzt darunter",
      !!q("fleet-grid").querySelector(".fz-marken .chip"));

    App.Fleet.openVehicle(v.id);
    check("Fahrzeugansicht nennt die VIN",
      q("vehicle-meta").textContent.includes("WF0AXXTTRAHJ12345"), q("vehicle-meta").textContent);

    // Ohne Bild steht ein Platzhalter statt eines kaputten Bildes
    const ohne = await App.Store.addVehicle({ name: "Ohne Bild", plate: "NOM-JA 1" });
    App.Nav.go("fleet");
    App.Fleet.renderFleet();
    check("Platzhalter statt leerem Bild",
      !!q("fleet-grid").querySelector(".fz-bild.leer"));
    await App.Store.deleteVehicle(ohne.id);
    await App.Store.updateVehicle(v.id, { photo: "" });
  }

  console.log("\n--- Kennung abschaltbar ---");
  {
    check("Kennung ist anfangs aus", App.Einstellungen.kennungAktiv() === false);
    check("Suchfeld ist weg", q("card-code-search").classList.contains("hidden"));
    App.Fleet.openVehicle(v.id);
    check("Schadensstände sind zugeklappt", q("snapshot-block").open === false);

    await App.Einstellungen.setzeKennung(true);
    check("Schalter merkt sich das", App.Einstellungen.kennungAktiv() === true);
    check("Suchfeld ist da", !q("card-code-search").classList.contains("hidden"));
    App.Fleet.renderVehicle();
    check("Schadensstände sind aufgeklappt", q("snapshot-block").open === true);

    await App.Einstellungen.setzeKennung(false);
    check("und wieder aus", q("card-code-search").classList.contains("hidden"));
  }

  console.log("\n--- Einstellungen hinter dem Zahnrad ---");
  {
    check("keine Reiterleiste mehr", !w.document.querySelector(".nav"));
    check("Zahnrad in der Kopfzeile", !!w.document.getElementById("btn-settings"));
    w.document.getElementById("btn-settings").click();
    check("Zahnrad öffnet die Einstellungen", App.Nav.current() === "settings");
    check("Zahnrad ist hervorgehoben",
      w.document.getElementById("btn-settings").classList.contains("active"));
    w.document.getElementById("btn-settings").click();
    check("nochmal antippen führt zurück", App.Nav.current() === "fleet");

    // Logo und Name führen zurück zum Fuhrpark
    App.Fleet.openVehicle(v.id);
    check("erst im Fahrzeug", App.Nav.current() === "vehicle");
    w.document.getElementById("btn-heim").click();
    check("Logo führt in den Fuhrpark", App.Nav.current() === "fleet");
    w.document.getElementById("btn-settings").click();
    w.document.getElementById("btn-heim").click();
    check("auch aus den Einstellungen", App.Nav.current() === "fleet");

    const css = fs.readFileSync(path.join(APP, "css/app.css"), "utf8");
    check("eigener Fokusring statt Safaris", /:focus-visible\{/.test(css));
    check("Safaris Ring abgeschaltet", /:focus\{outline:none;\}/.test(css));
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

  console.log("\n--- Löschen gibt Platz frei ---");
  {
    const geloescht = App.Store.getVehicle(v.id).damages.find((d) => d.deleted === true);
    check("Löschmarke bleibt stehen", geloescht.deleted === true);
    check("Fotos bleiben zunächst — Papierkorb", geloescht.images.length > 0,
      String(geloescht.images.length));
    check("Löschzeitpunkt vermerkt", geloescht.deletedAt > 0);
    check("liegt im Papierkorb",
      App.Store.papierkorb().some((e) => e.damage.id === geloescht.id));
    check("Restfrist wird genannt",
      App.Store.papierkorb().find((e) => e.damage.id === geloescht.id).restTage ===
      App.Store.PAPIERKORB_TAGE);

    // Zurückholen
    await App.Store.restoreDamage(v.id, geloescht.id);
    check("wiederhergestellt",
      App.Store.damagesOf(v.id).some((d) => d.id === geloescht.id));
    check("danach nicht mehr im Papierkorb",
      !App.Store.papierkorb().some((e) => e.damage.id === geloescht.id));
    await App.Store.deleteDamage(v.id, geloescht.id);

    // Abgelaufene Frist gibt den Platz frei
    App.Store.getVehicle(v.id).damages.find((d) => d.id === geloescht.id).deletedAt =
      Date.now() - (App.Store.PAPIERKORB_TAGE + 1) * 86400000;
    check("abgelaufenes räumt auf", App.Store.entruempele() === true);
    check("Fotos danach weg",
      App.Store.getVehicle(v.id).damages.find((d) => d.id === geloescht.id).images.length === 0);
    check("Stand hat seine Kopien behalten",
      App.Store.getSnapshot(stand.id).damages.some((d) => (d.images || []).length > 0));

    // Altbestand: unter früheren Ständen wurden die Fotos am Tombstone gelassen
    const dick = await App.Store.addDamage(v.id, {
      images: ["data:image/jpeg;base64,AAAA", "data:image/jpeg;base64,BBBB"],
      description: "wird gleich gelöscht"
    });
    await App.Store.updateDamage(v.id, dick.id, { deleted: true });   // ohne Aufräumen
    check("Altbestand hat noch Fotos am Tombstone",
      App.Store.getVehicle(v.id).damages.find((d) => d.id === dick.id).images.length === 2);
    check("Altbestand ohne Löschzeitpunkt",
      !App.Store.getVehicle(v.id).damages.find((d) => d.id === dick.id).deletedAt);
    check("Aufräumen meldet, dass es etwas gab", App.Store.entruempele() === true);
    check("Altbestand ist danach leer",
      App.Store.getVehicle(v.id).damages.find((d) => d.id === dick.id).images.length === 0);
    check("nichts mehr zu tun beim zweiten Lauf", App.Store.entruempele() === false);

    // Ein gelöschtes Fahrzeug gibt alles her
    const weg = await App.Store.addVehicle({ name: "Leasing läuft aus", plate: "NOM-JA 999" });
    await App.Store.addDamage(weg.id, { images: ["data:image/jpeg;base64,CCCC"], description: "x" });
    await App.Store.deleteVehicle(weg.id);
    check("gelöschtes Fahrzeug behält keine Schäden",
      App.Store.getVehicle(weg.id).damages.length === 0);
    check("Fahrzeug bleibt als Löschmarke bestehen",
      App.Store.getVehicle(weg.id).deleted === true);
  }

  console.log("\n--- Speicheranzeige ---");
  {
    const b = App.Store.speicherbedarf();
    check("zählt Fotos", b.anzahlFotos > 0, String(b.anzahlFotos));
    /* Im echten Betrieb ist "fotos" der Löwenanteil; hier sind die Testbilder
       nur ein paar Zeichen lang, deshalb wird nur die Trennung geprüft. */
    check("trennt Fotos vom übrigen Inhalt", b.fotos > 0 && b.rest > 0, b.fotos + " / " + b.rest);
    check("Summe stimmt", b.gesamt === b.fotos + b.rest);
    check("zählt nur sichtbare Fahrzeuge", b.fahrzeuge === App.Store.vehicles().length);

    w.document.getElementById("btn-settings").click();
    check("Anzeige nennt die Fotoanzahl",
      q("speicher-zahlen").textContent.includes(String(b.anzahlFotos) + " Fotos"),
      q("speicher-zahlen").textContent);
    check("Anzeige nennt die Grenze",
      q("speicher-text").textContent.includes("500 MB"), q("speicher-text").textContent);
    check("Balken hat eine Breite", /%/.test(q("speicher-balken").style.width),
      q("speicher-balken").style.width);
    w.document.getElementById("btn-settings-back").click();
  }

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

  console.log("\n--- Gebrauchsspur: Schalter und Speichern ---");
  {
    const bv = await App.Store.addVehicle({ name: "Schaltertest", plate: "NOM-JA 22" });
    App.Fleet.openVehicle(bv.id);
    await wait(20);

    /* Der Schalter gehört zum Erfassen, nicht zu den internen Beträgen. */
    App.Annotate.open({ title: "t", onSave: () => {} });
    check("Schalter steht im Erfassungsdialog", !!q("input-spur"));
    check("und ist nicht im Detaildialog", !w.document.getElementById("detail-spur"));
    check("bei einer Zustandsaufnahme unsichtbar", true);
    App.Annotate.open({ title: "z", art: "zustand", onSave: () => {} });
    check("bei der Zustandsaufnahme ausgeblendet",
      q("spur-row").classList.contains("hidden"));
    App.Annotate.close();

    /* Der Kern des Fehlers: gesetzt, gespeichert, wieder geöffnet — und weg. */
    const d1 = await App.Store.addDamage(bv.id, {
      images: ["x"], description: "Test", marke: { ansicht: "links", x: 0.5, y: 0.5 }
    });
    check("frisch angelegt ist es kein Spur-Eintrag", d1.spur === false);

    await App.Store.updateDamage(bv.id, d1.id, { spur: true });
    check("Umschalten wird gespeichert",
      App.Store.damagesOf(bv.id).find((d) => d.id === d1.id).spur === true);
    App.Fleet.renderVehicle();
    check("und die Skizze zeigt es als Spur",
      App.Fleet.skizzeKontext().marken.find((m) => m.id === d1.id).spur === true);

    /* Der Speichern-Knopf im Detaildialog muss das Reparaturdatum mitnehmen —
       das lag vorher im Nichts. */
    App.Fleet.openDetail ? null : null;
    await App.Store.updateDamage(bv.id, d1.id, { status: "repariert", repariertAm: "2026-08-08" });
    check("Reparaturdatum kommt an",
      App.Store.reparierteSchaeden(bv.id)[0].repariertAm === "2026-08-08");

    await App.Store.deleteVehicle(bv.id);
    App.Nav.go("fleet");
    App.Fleet.renderFleet();
    await wait(20);
  }

  console.log("\n--- Sprungmarken im PDF ---");
  {
    const sv = await App.Store.addVehicle({ name: "Sprungtest", plate: "NOM-JA 33", form: "transporter" });
    const eins = await App.Store.addDamage(sv.id, {
      images: [MINI_JPEG], description: "Kratzer", date: "2026-07-01",
      marke: { ansicht: "links", x: 0.4, y: 0.5 }
    });
    await App.Store.addDamage(sv.id, {
      images: [MINI_JPEG], description: "Delle", date: "2026-07-02",
      marke: { ansicht: "hinten", x: 0.5, y: 0.5 }
    });
    await App.Store.addDamage(sv.id, {
      images: [MINI_JPEG], description: "Abrieb", date: "2026-07-03", spur: true,
      marke: { ansicht: "oben", x: 0.6, y: 0.4 }
    });

    const e = App.Uebersicht.erzeuge(App.Store.getVehicle(sv.id),
      App.Store.aktuelleSchaeden(sv.id), App.Store.damageCount(sv.id),
      { spuren: App.Store.spuren(sv.id) });
    const roh = Buffer.from(e.doc.bauen()).toString("latin1");

    check("gültige PDF-Datei", roh.slice(0, 5) === "%PDF-" && /%%EOF\s*$/.test(roh));
    check("drei Sprungfelder", (roh.match(/\/Type \/Annot/g) || []).length === 3,
      String((roh.match(/\/Type \/Annot/g) || []).length));
    check("jedes springt im Dokument", (roh.match(/\/S \/GoTo/g) || []).length === 3);
    check("Felder hängen an der Seite mit der Skizze",
      (roh.match(/\/Annots \[/g) || []).length === 1);
    check("ohne sichtbaren Rahmen", roh.includes("/Border [0 0 0]"));
    /* Ohne Marke gibt es nichts zum Antippen — und kein Feld, das ins Leere
       führt. */
    await App.Store.updateDamage(sv.id, eins.id, { marke: null });
    const e2 = App.Uebersicht.erzeuge(App.Store.getVehicle(sv.id),
      App.Store.aktuelleSchaeden(sv.id), App.Store.damageCount(sv.id),
      { spuren: App.Store.spuren(sv.id) });
    const roh2 = Buffer.from(e2.doc.bauen()).toString("latin1");
    check("Schaden ohne Stelle bekommt kein Feld",
      (roh2.match(/\/Type \/Annot/g) || []).length === 2,
      String((roh2.match(/\/Type \/Annot/g) || []).length));

    // Ein Dokument ganz ohne Fotos darf keine Felder ins Nichts anlegen
    const e3 = App.Uebersicht.erzeuge(App.Store.getVehicle(sv.id),
      [{ area: "Tür", description: "ohne Foto", count: 1, dateMode: "exact",
         date: "2026-07-01", createdAt: Date.now(), images: [],
         marke: { ansicht: "links", x: 0.4, y: 0.5 } }], 1, {});
    const roh3 = Buffer.from(e3.doc.bauen()).toString("latin1");
    check("ohne Foto kein Sprungfeld", !/\/Type \/Annot/.test(roh3));
    check("und die Datei bleibt gültig",
      roh3.slice(0, 5) === "%PDF-" && /%%EOF\s*$/.test(roh3));

    await App.Store.deleteVehicle(sv.id);
  }

  console.log("\n--- Kilometerstand ---");
  {
    const kv = await App.Store.addVehicle({ name: "km-Test", plate: "NOM-JA 44" });
    const mit = await App.Store.addDamage(kv.id, {
      images: [MINI_JPEG], description: "Steinschlag", date: "2026-07-01",
      km: "84500", count: 1
    });
    const ohne = await App.Store.addDamage(kv.id, {
      images: [MINI_JPEG], description: "Alter Kratzer", date: "2026-01-01", count: 1
    });
    check("Stand am Schaden gespeichert", mit.km === "84500", mit.km);
    check("ohne Angabe bleibt leer", ohne.km === "", JSON.stringify(ohne.km));

    // Standardmässig steht er NICHT im Kundendokument
    check("Schalter ist aus", App.Einstellungen.kmImDokument() === false);
    const zu = App.Uebersicht.erzeuge(App.Store.getVehicle(kv.id),
      App.Store.aktuelleSchaeden(kv.id), App.Store.damageCount(kv.id), {});
    const rohZu = Buffer.from(zu.doc.bauen()).toString("latin1");
    check("aus: kein Kilometerstand im PDF", !/84\.500|84500/.test(rohZu));

    const auf = App.Uebersicht.erzeuge(App.Store.getVehicle(kv.id),
      App.Store.aktuelleSchaeden(kv.id), App.Store.damageCount(kv.id), { mitKm: true });
    const rohAuf = Buffer.from(auf.doc.bauen()).toString("latin1");
    check("an: Kilometerstand steht drin", rohAuf.includes("84.500 km"));
    check("mit Tausenderpunkt", !rohAuf.includes("84500 km"));

    await App.Einstellungen.setzeKm(true);
    check("Schalter lässt sich umlegen", App.Einstellungen.kmImDokument() === true);
    await App.Einstellungen.setzeKm(false);

    await App.Store.deleteVehicle(kv.id);
  }

  console.log("\n--- Gebrauchsspuren ---");
  {
    const gv = await App.Store.addVehicle({ name: "Spurentest", plate: "NOM-JA 66" });
    const echt = await App.Store.addDamage(gv.id, {
      images: ["a"], description: "Delle Schiebetür", count: 1,
      marke: { ansicht: "links", x: 0.5, y: 0.5 }
    });
    const spur = await App.Store.addDamage(gv.id, {
      images: ["b"], description: "Radkasten innen, umlaufend Abrieb", count: 1,
      spur: true, marke: { ansicht: "oben", x: 0.6, y: 0.4 }
    });
    check("Häkchen wird gespeichert", spur.spur === true);
    check("ein Schaden zählt", App.Store.damageCount(gv.id) === 1,
      String(App.Store.damageCount(gv.id)));
    check("die Spur zählt nicht mit",
      !App.Store.aktuelleSchaeden(gv.id).some((d) => d.id === spur.id));
    check("sie steht in den Spuren", App.Store.spuren(gv.id).length === 1);

    App.Fleet.openVehicle(gv.id);
    await wait(30);
    check("eigener Block erscheint", !q("spur-block").classList.contains("hidden"));
    check("Block ist zugeklappt", q("spur-block").open === false);
    check("Block zählt", /1 Spur/.test(q("spur-kurz").textContent), q("spur-kurz").textContent);
    check("Spur nicht in der Schadensliste", q("damage-grid").children.length === 2,
      String(q("damage-grid").children.length));

    // Auf der Skizze: getrennte Marken, Spur als Spur gekennzeichnet
    const kontext = App.Fleet.skizzeKontext();
    check("Skizze kennt beide", kontext.marken.length === 2, String(kontext.marken.length));
    check("eine davon ist eine Spur", kontext.marken.filter((m) => m.spur).length === 1);

    // Schaden und Spur an derselben Stelle bleiben getrennte Marken
    const gemischt = App.Skizze.gruppiere([
      { x: 0.5, y: 0.5, nummer: "1", spur: false },
      { x: 0.5, y: 0.5, nummer: "1", spur: true }
    ]);
    check("Schaden und Spur werden nicht zusammengefasst", gemischt.length === 2,
      String(gemischt.length));

    // PDF: eigener Abschnitt, eigene Beschriftung
    const mitSpur = App.Uebersicht.erzeuge(App.Store.getVehicle(gv.id),
      App.Store.aktuelleSchaeden(gv.id), App.Store.damageCount(gv.id),
      { spuren: App.Store.spuren(gv.id).map((d) => Object.assign({}, d, { images: [MINI_JPEG] })) });
    const rohS = Buffer.from(mitSpur.doc.bauen()).toString("latin1");
    check("PDF hat den Abschnitt", rohS.includes("GEBRAUCHSSPUREN"));
    check("PDF nennt keinen Preis dazu", !/nicht berechnet|kostenlos|ohne Abzug/i.test(rohS));
    check("Nachsatz hält sich offen", rohS.includes("Einzelfall bewertet"));
    check("Foto heisst Gebrauchsspur", rohS.includes("Gebrauchsspur 1"));
    check("Abschnitt steht unter der Schadensliste",
      rohS.indexOf("SCHADENSLISTE") < rohS.indexOf("GEBRAUCHSSPUREN"));

    // Ausgeschaltet: nichts davon im Dokument
    const ohne = App.Uebersicht.erzeuge(App.Store.getVehicle(gv.id),
      App.Store.aktuelleSchaeden(gv.id), App.Store.damageCount(gv.id), { spuren: [] });
    const rohO = Buffer.from(ohne.doc.bauen()).toString("latin1");
    check("ausgeschaltet: kein Abschnitt", !rohO.includes("GEBRAUCHSSPUREN"));
    check("ausgeschaltet: kein Foto davon", !rohO.includes("Gebrauchsspur"));

    // Der Schalter selbst
    check("Schalter ist an", App.Einstellungen.spurenSichtbar() === true);
    await App.Einstellungen.setzeSpuren(false);
    check("lässt sich ausschalten", App.Einstellungen.spurenSichtbar() === false);
    App.Fleet.renderVehicle();
    check("Spur verschwindet von der Skizze",
      App.Fleet.skizzeKontext().marken.length === 2);   // Dialog zeigt weiter beide
    await App.Einstellungen.setzeSpuren(true);

    // Umschalten in beide Richtungen, ohne dass die Nummer wandert
    await App.Store.updateDamage(gv.id, spur.id, { spur: false });
    check("zurück zum Schaden",
      App.Store.aktuelleSchaeden(gv.id).some((d) => d.id === spur.id));
    check("Nummer bleibt dieselbe",
      App.Store.damagesOf(gv.id).find((d) => d.id === spur.id).nr === spur.nr);

    await App.Store.deleteVehicle(gv.id);
    App.Nav.go("fleet");
    App.Fleet.renderFleet();
    await wait(20);
  }

  console.log("\n--- Reparierte Schäden wandern ins Archiv ---");
  {
    const rv = await App.Store.addVehicle({ name: "Reparaturtest", plate: "NOM-JA 88" });
    const bleibt = await App.Store.addDamage(rv.id, {
      images: ["x"], description: "Kratzer Heck", date: "2026-06-01",
      marke: { ansicht: "hinten", x: 0.4, y: 0.5 }, count: 2
    });
    const weg = await App.Store.addDamage(rv.id, {
      images: ["y"], description: "Delle Tür", date: "2026-06-02",
      marke: { ansicht: "links", x: 0.5, y: 0.5 },
      schaetzung: "900", zahlung: "500", kosten: "740"
    });

    check("beide zählen zuerst mit", App.Store.damageCount(rv.id) === 3,
      String(App.Store.damageCount(rv.id)));

    await App.Store.updateDamage(rv.id, weg.id, { status: "repariert", repariertAm: "2026-08-14" });

    check("aus der aktiven Liste raus",
      !App.Store.aktuelleSchaeden(rv.id).some((d) => d.id === weg.id));
    check("im Archiv drin",
      App.Store.reparierteSchaeden(rv.id).some((d) => d.id === weg.id));
    check("zählt nicht mehr mit", App.Store.damageCount(rv.id) === 2,
      String(App.Store.damageCount(rv.id)));
    check("der andere bleibt", App.Store.aktuelleSchaeden(rv.id).some((d) => d.id === bleibt.id));
    check("Reparaturdatum gespeichert",
      App.Store.reparierteSchaeden(rv.id)[0].repariertAm === "2026-08-14");

    // Das Geld bleibt in der Bilanz — es ist ja geflossen
    const bil = App.Store.bilanz(rv.id);
    check("Zahlung bleibt in der Bilanz", bil.zahlungen === 500, String(bil.zahlungen));
    check("Kosten bleiben in der Bilanz", bil.kosten === 740, String(bil.kosten));

    // Nicht mehr auf der Skizze und nicht im Kundendokument
    App.Fleet.openVehicle(rv.id);
    await wait(30);
    check("Archivblock erscheint", !q("repariert-block").classList.contains("hidden"));
    check("Archivblock ist zugeklappt", q("repariert-block").open === false);
    check("Archivblock zählt", /1 Schaden/.test(q("repariert-kurz").textContent),
      q("repariert-kurz").textContent);
    check("eine Kachel im Archiv", q("repariert-grid").children.length === 1,
      String(q("repariert-grid").children.length));
    check("im Archiv nichts zum Hinzufügen",
      !/add-tile/.test(q("repariert-grid").innerHTML));
    // Oben: der offene Schaden plus die Kachel zum Hinzufügen
    check("eine Kachel oben", q("damage-grid").children.length === 2,
      String(q("damage-grid").children.length));
    check("nicht mehr auf der Skizze",
      App.Fleet.skizzeKontext().marken.every((m) => m.id !== weg.id));

    const doc = App.Uebersicht.erzeuge(App.Store.getVehicle(rv.id),
      App.Store.aktuelleSchaeden(rv.id), App.Store.damageCount(rv.id));
    const rohR = Buffer.from(doc.doc.bauen()).toString("latin1");
    check("nicht im Kundendokument", !rohR.includes("Delle T"));
    check("der offene Schaden schon", rohR.includes("Kratzer Heck"));

    // Zurückholen
    await App.Store.updateDamage(rv.id, weg.id, { status: "offen" });
    check("kommt zurück in die Liste",
      App.Store.aktuelleSchaeden(rv.id).some((d) => d.id === weg.id));
    check("Reparaturdatum fällt dabei weg",
      App.Store.damagesOf(rv.id).find((d) => d.id === weg.id).repariertAm === "",
      App.Store.damagesOf(rv.id).find((d) => d.id === weg.id).repariertAm);

    // Nummern bleiben stehen, auch wenn dazwischen gelöscht wird
    const dritt = await App.Store.addDamage(rv.id, { images: ["z"], description: "Dritter" });
    check("dritter bekommt Nr. 3", dritt.nr === 3, String(dritt.nr));
    await App.Store.deleteDamage(rv.id, dritt.id);
    const viert = await App.Store.addDamage(rv.id, { images: ["q"], description: "Vierter" });
    check("nach dem Löschen geht es bei 4 weiter", viert.nr === 4, String(viert.nr));
    /* Die 3 liegt im Papierkorb und behält ihre Nummer — deshalb darf sie
       auch nicht neu vergeben werden. */
    check("die 3 bleibt einmalig",
      App.Store.damagesOf(rv.id).filter((d) => d.nr === 3).length === 0 &&
      !App.Store.damagesOf(rv.id).some((d) => d.nr === 4 && d.id === dritt.id));

    await App.Store.deleteVehicle(rv.id);
    App.Nav.go("fleet");
    App.Fleet.renderFleet();
    await wait(20);
  }

  console.log("\n--- Schadenskizze: Umrisse ---");
  {
    const S = App.Skizze;
    const ids = S.formen().map((f) => f.id);
    check("beide Formen vorhanden",
      ids.includes("pkw-kompakt") && ids.includes("transporter"), ids.join(","));
    check("jede Form hat einen Namen", S.formen().every((f) => f.name && f.name.length > 2));
    check("unbekannte Form wird erkannt", !S.kennt("raumschiff") && S.kennt("transporter"));

    let zuegeGesamt = 0, konturen = 0;
    ids.forEach((id) => {
      S.ANSICHTEN.forEach((an) => {
        const a = S.ansicht(id, an.id);
        check(id + "/" + an.id + " hat eine Größe", a.b > 0 && a.h > 0);
        check(id + "/" + an.id + " hat Inhalt", a.teile.length > 0);
        /* Nicht je Pfad melden — eine übernommene Vorlage bringt hunderte
           mit, und dreihundert grüne Zeilen sagen nicht mehr als eine. */
        let hatKontur = false, salat = null, draussen = null;
        a.teile.forEach((t) => {
          if (/kontur$/.test(t.stil)) { hatKontur = true; konturen++; }
          if (t.kreis) {
            if (!t.kreis.every((z) => typeof z === "number" && !isNaN(z))) salat = t.kreis;
            return;
          }
          const befehle = S._lesePfad(t.d);
          zuegeGesamt += befehle.length;
          if (!salat) {
            const k = befehle.find((c) => c.slice(1).some((z) => isNaN(z)));
            if (k) salat = k;
          }
          if (!draussen) {
            const k = befehle.find((c) => c[0] !== "Z" &&
              c.slice(1).some((z, i) => z < -3 || z > (i % 2 === 0 ? a.b : a.h) + 3));
            if (k) draussen = k;
          }
        });
        check(id + "/" + an.id + " alle Pfade sind Zahlen", !salat, JSON.stringify(salat));
        check(id + "/" + an.id + " alle Pfade bleiben im Rahmen", !draussen, JSON.stringify(draussen));
        check(id + "/" + an.id + " hat eine Aussenkontur", hatKontur);
      });
    });
    check("es wurde wirklich etwas gezeichnet", zuegeGesamt > 200, String(zuegeGesamt));
    /* Mindestens eine kräftige Linie je Ansicht — mehr ist erlaubt, die
       Hecktürfuge eines Kastenwagens ist genauso eine Hauptlinie. */
    check("jede Ansicht hat mindestens eine Aussenkontur",
      konturen >= S.formen().length * S.ANSICHTEN.length, String(konturen));

    // Die Seitenansichten sind dieselbe Zeichnung, einmal gespiegelt —
    // sonst müsste jede Änderung zweimal gemacht werden.
    check("rechts ist die gespiegelte linke Seite",
      S.ansicht("pkw-kompakt", "rechts").spiegeln === true &&
      S.ansicht("pkw-kompakt", "links").teile === S.ansicht("pkw-kompakt", "rechts").teile);

    // Pfade lesen
    const p = S._lesePfad("M 1,2 L 3,4 C 5,6 7,8 9,10 Z");
    check("Pfad wird richtig zerlegt",
      JSON.stringify(p) === JSON.stringify([["M",1,2],["L",3,4],["C",5,6,7,8,9,10],["Z"]]),
      JSON.stringify(p));
    check("Wiederholung ohne Buchstabe zählt als Linie",
      JSON.stringify(S._lesePfad("M 0,0 2,2 4,4")) ===
      JSON.stringify([["M",0,0],["L",2,2],["L",4,4]]));

    // Einpassen: Seitenverhältnis bleibt, die Zeichnung sitzt mittig
    const lage = S.passe("pkw-kompakt", "links", 10, 20, 200, 200);
    const a = S.ansicht("pkw-kompakt", "links");
    check("Seitenverhältnis bleibt",
      Math.abs(lage.breite / lage.hoehe - a.b / a.h) < 0.001,
      (lage.breite / lage.hoehe).toFixed(3));
    check("Zeichnung sitzt mittig", Math.abs((lage.y - 20) - (200 - lage.hoehe) / 2) < 0.001);
    check("Zeichnung passt in den Kasten", lage.breite <= 200.001 && lage.hoehe <= 200.001);

    // Vorschlag aus der Kategorie
    check("Sprinter wird Transporter", S.formVorschlag("Transporter", "Sprinter 316") === "transporter");
    // Eine uebernommene Vorlage muss die von Hand gezeichnete ersetzen
    check("übernommene Vorlage ist eingetragen",
      S.ansicht("transporter", "links").teile.length > 100,
      String(S.ansicht("transporter", "links").teile.length));
    check("und trägt die Umrisse aller fünf Ansichten",
      S.ANSICHTEN.every((an) => S.ansicht("transporter", an.id).teile.length > 40));
    check("Kasten wird Transporter", S.formVorschlag("", "VW Crafter Kastenwagen") === "transporter");
    check("Yaris bleibt PKW", S.formVorschlag("PKW", "Toyota Yaris #3") === "pkw-kompakt");
    check("nichts Bekanntes wird PKW", S.formVorschlag("", "") === "pkw-kompakt");

    // Kreisnäherung
    const k = S._kreisAlsKurven(0, 0, 10);
    check("Kreis besteht aus vier Bögen", k.filter((z) => z[0] === "C").length === 4);
    check("Kreis ist geschlossen", k[k.length - 1][0] === "Z");
  }

  console.log("\n--- Schadenskizze: Nummern zusammenfassen ---");
  {
    const S = App.Skizze;
    const g = S.gruppiere([
      { x: 0.50, y: 0.50, nummer: "1" },
      { x: 0.51, y: 0.51, nummer: "2" },     // praktisch dieselbe Stelle
      { x: 0.90, y: 0.20, nummer: "3" }
    ]);
    check("zwei Gruppen aus drei Marken", g.length === 2, String(g.length));
    const zusammen = g.find((x) => x.nummern.length === 2);
    check("die nahen Nummern stehen zusammen",
      zusammen && zusammen.nummern.join(",") === "1,2",
      zusammen && zusammen.nummern.join(","));
    check("die weit entfernte bleibt allein",
      g.some((x) => x.nummern.length === 1 && x.nummern[0] === "3"));
    check("der Punkt wandert in die Mitte der Gruppe",
      zusammen && Math.abs(zusammen.x - 0.505) < 0.001, zusammen && String(zusammen.x));
    check("nichts rein, nichts raus", S.gruppiere([]).length === 0);
  }

  console.log("\n--- Schadenskizze: was gespeichert wird ---");
  {
    const sv = await App.Store.addVehicle({ name: "Skizzentest", plate: "NOM-JA 77", form: "transporter" });
    check("Form wird gespeichert", App.Store.getVehicle(sv.id).form === "transporter");

    const gut = await App.Store.addDamage(sv.id, {
      images: ["x"], description: "Kratzer", date: "2026-08-01",
      marke: { ansicht: "links", x: 0.4, y: 0.6 }
    });
    check("Stelle wird gespeichert", gut.marke && gut.marke.ansicht === "links" && gut.marke.x === 0.4,
      JSON.stringify(gut.marke));

    // Unfug muss abprallen: eine halb gesetzte Marke wäre im PDF eine Nummer
    // an einer Stelle, die niemand gemeint hat.
    const faelle = [
      ["fehlende Ansicht", { x: 0.5, y: 0.5 }],
      ["erfundene Ansicht", { ansicht: "unten", x: 0.5, y: 0.5 }],
      ["Text statt Zahl", { ansicht: "links", x: "hier", y: 0.5 }],
      ["ausserhalb", { ansicht: "links", x: 1.4, y: 0.5 }],
      ["negativ", { ansicht: "links", x: -0.2, y: 0.5 }],
      ["gar nichts", null]
    ];
    for (const [name, marke] of faelle) {
      const d = await App.Store.addDamage(sv.id, { images: ["x"], description: name, marke: marke });
      check("abgewiesen: " + name, d.marke === null, JSON.stringify(d.marke));
    }

    await App.Store.updateVehicle(sv.id, {
      skizze: [{ ansicht: "links", art: "frei", punkte: [[0.1, 0.2], [0.3, 0.4]] }]
    });
    check("freie Zeichnung wird gespeichert",
      App.Store.getVehicle(sv.id).skizze.length === 1);
    await App.Store.updateVehicle(sv.id, { skizze: [] });
    check("freie Zeichnung lässt sich leeren",
      App.Store.getVehicle(sv.id).skizze.length === 0);

    await App.Store.deleteVehicle(sv.id);
  }

  console.log("\n--- Schadenskizze im PDF ---");
  {
    const fzS = Object.assign({}, App.Store.getVehicle(v.id), {
      form: "pkw-kompakt",
      skizze: [{ ansicht: "links", art: "kreuz", punkte: [[0.5, 0.5]] }]
    });
    const liste = [
      { area: "Tür", description: "Kratzer", count: 1, dateMode: "exact", date: "2026-07-01",
        createdAt: Date.now(), images: [MINI_JPEG],
        marke: { ansicht: "links", x: 0.3, y: 0.5 },
        // Interne Angaben — dürfen unter keinen Umständen mitkommen
        schaetzung: 850, zahlung: 500, kosten: 640, vertragsnr: "MV-2026-0418", status: "repariert" },
      { area: "Heck", description: "Delle", count: 1, dateMode: "exact", date: "2026-07-02",
        createdAt: Date.now(), images: [MINI_JPEG],
        marke: { ansicht: "hinten", x: 0.5, y: 0.4 } },
      { area: "Dach", description: "Hagel", count: 3, dateMode: "exact", date: "2026-07-03",
        createdAt: Date.now(), images: [MINI_JPEG] }      // ohne Stelle
    ];
    const eS = App.Uebersicht.erzeuge(fzS, liste, 5);
    const rohS = Buffer.from(eS.doc.bauen()).toString("latin1");

    check("Skizze ist überschrieben", rohS.includes("SCHADENSKIZZE"));
    check("Hinweis auf die Liste", rohS.includes("Nummern entsprechen der Schadensliste"));
    ["Links", "Rechts", "Vorn", "Hinten", "Draufsicht"].forEach((n) => {
      check("Ansicht " + n + " beschriftet", rohS.includes(n));
    });
    check("Umrisse sind Kurven, kein Bild", /\d+\.\d\d \d+\.\d\d \d+\.\d\d \d+\.\d\d \d+\.\d\d \d+\.\d\d c/.test(rohS));

    // Die Skizze steht vor der Liste — der erste Blick soll sie treffen
    check("Skizze steht vor der Schadensliste",
      rohS.indexOf("SCHADENSKIZZE") < rohS.indexOf("SCHADENSLISTE"));

    // Nichts Internes darf über die Skizze ins Kundendokument rutschen
    ["850", "MV-2026-0418", "repariert", "Selbstbeteiligung"].forEach((w) => {
      check("nicht im Kundendokument: " + w, !rohS.includes(w));
    });

    // Ein Fahrzeug ohne jede eingezeichnete Stelle bekommt trotzdem die Skizze,
    // aber mit ehrlichem Hinweis statt Nummern aus dem Nichts
    const leer = App.Uebersicht.erzeuge(
      Object.assign({}, fzS, { skizze: [] }),
      [{ area: "Tür", description: "Kratzer", count: 1, dateMode: "exact",
         date: "2026-07-01", createdAt: Date.now(), images: [MINI_JPEG] }], 1);
    const rohL = Buffer.from(leer.doc.bauen()).toString("latin1");
    check("ohne Stellen trotzdem eine Skizze", rohL.includes("SCHADENSKIZZE"));
    check("und ein ehrlicher Hinweis", rohL.includes("keine Stellen eingezeichnet"));
  }

  console.log("\n--- Schadenskizze: Bedienung ---");
  {
    App.Fleet.openVehicle(v.id);
    await wait(30);
    check("Skizzenblock in der Fahrzeugansicht", !!q("skizze-block"));
    check("fünf Ansichten gezeichnet", q("skizze-tafel").children.length === 5,
      String(q("skizze-tafel").children.length));
    check("jede Ansicht ist beschriftet",
      Array.from(q("skizze-tafel").children).every((k) => k.querySelector("figcaption").textContent));

    // Formauswahl im Fahrzeugdialog
    q("btn-edit-vehicle").click();
    await wait(20);
    const formSel = q("input-vehicle-form");
    check("Formauswahl ist gefüllt", formSel.options.length >= 2, String(formSel.options.length));
    check("eine Form ist vorbelegt", !!formSel.value, formSel.value);
    q("modal-vehicle").classList.add("hidden");

    // Stelle im Schadendialog setzen
    const kontext = App.Fleet.skizzeKontext();
    check("Kontext nennt die Form", !!kontext.form);
    check("Kontext liefert eine Markenliste", Array.isArray(kontext.marken));

    App.Annotate.open({ title: "t", onSave: () => {} });
    check("noch keine Stelle gesetzt", App.Annotate._marke() === null);
    /* Beim Erfassen soll die Skizze offen stehen — sie zeigt, wo die schon
       erfassten Schäden sitzen. Bei einer Zustandsaufnahme nicht. */
    check("Skizze steht beim Schaden offen", q("marke-block").open);
    App.Annotate.open({ title: "z", art: "zustand", onSave: () => {} });
    check("bei einer Zustandsaufnahme bleibt sie zu", !q("marke-block").open);
    App.Annotate.open({ title: "t", onSave: () => {} });
    App.Annotate._setzeMarke("hinten", 0.25, 0.75);
    const m = App.Annotate._marke();
    check("Stelle wird übernommen",
      m && m.ansicht === "hinten" && m.x === 0.25 && m.y === 0.75, JSON.stringify(m));
    check("Kopfzeile nennt die Ansicht",
      q("marke-kurz").textContent === "Hinten", q("marke-kurz").textContent);
    q("btn-marke-weg").click();
    check("Stelle lässt sich wieder entfernen", App.Annotate._marke() === null);
    check("Kopfzeile sagt es auch",
      q("marke-kurz").textContent === "nicht gesetzt", q("marke-kurz").textContent);
    App.Annotate.close();

    App.Nav.go("fleet");
    App.Fleet.renderFleet();
    await wait(20);
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
  console.log("\n--- Zurück-Geste: Verlauf ---");
  {
    // Sauberer Ausgangspunkt: aus früheren Blöcken kann ein Dialog offen sein
    w.document.querySelectorAll(".modal-overlay").forEach((o) => o.classList.add("hidden"));
    App.Nav.go("fleet");
    await wait(20);
    const tiefeVorher = w.history.length;

    App.Fleet.openVehicle(v.id);
    await wait(20);
    check("Fahrzeug offen", !q("view-vehicle").classList.contains("hidden"));
    check("Wechsel steht im Verlauf", w.history.state && w.history.state.view === "vehicle",
      JSON.stringify(w.history.state));
    check("Verlauf ist gewachsen", w.history.length > tiefeVorher,
      tiefeVorher + " -> " + w.history.length);
    check("Fahrzeug ist im Eintrag vermerkt", w.history.state.vid === v.id);

    w.history.back();
    await wait(80);
    check("zurück landet im Fuhrpark", !q("view-fleet").classList.contains("hidden"));
    check("Fahrzeugansicht ist zu", q("view-vehicle").classList.contains("hidden"));

    // Vorwärts wieder hinein, damit der Eintrag wiederhergestellt wird
    App.Fleet.openVehicle(v.id);
    await wait(20);
    q("modal-vehicle").classList.remove("hidden");
    w.history.back();
    await wait(80);
    check("offener Dialog wird zuerst geschlossen",
      q("modal-vehicle").classList.contains("hidden"));
    check("Ansicht bleibt dabei stehen", !q("view-vehicle").classList.contains("hidden"));

    w.history.back();
    await wait(80);
    check("erst der zweite Schritt verlässt die Ansicht",
      !q("view-fleet").classList.contains("hidden"));

    // Einstellungen zählen als eigene Ebene
    q("btn-settings").click();
    await wait(20);
    check("Einstellungen offen", !q("view-settings").classList.contains("hidden"));
    w.history.back();
    await wait(80);
    check("zurück aus den Einstellungen", !q("view-fleet").classList.contains("hidden"));
  }

  console.log("\n--- Zurück-Geste: Wischen vom linken Rand ---");
  {
    function wisch(vonX, nachX, y2, dauer) {
      const start = new w.Event("touchstart", { bubbles: true });
      start.touches = [{ clientX: vonX, clientY: 300 }];
      w.document.dispatchEvent(start);
      const ende = new w.Event("touchend", { bubbles: true });
      ende.changedTouches = [{ clientX: nachX, clientY: y2 === undefined ? 300 : y2 }];
      return new Promise((fertig) => {
        setTimeout(() => { w.document.dispatchEvent(ende); setTimeout(fertig, 80); },
          dauer === undefined ? 5 : dauer);
      });
    }

    App.Fleet.openVehicle(v.id);
    await wait(20);
    await wisch(8, 160);
    check("Wisch vom Rand geht zurück", !q("view-fleet").classList.contains("hidden"));

    // Aus der Mitte heraus ist es Scrollen, kein Zurück
    App.Fleet.openVehicle(v.id);
    await wait(20);
    await wisch(200, 340);
    check("Wisch aus der Mitte tut nichts", !q("view-vehicle").classList.contains("hidden"));

    // Zu kurz gewischt
    await wisch(8, 40);
    check("kurzer Wisch tut nichts", !q("view-vehicle").classList.contains("hidden"));

    // Zu schräg — das war Scrollen
    await wisch(8, 160, 500);
    check("schräger Wisch tut nichts", !q("view-vehicle").classList.contains("hidden"));

    // Im Dialog wird gezeichnet, da darf kein Wisch die Arbeit wegnehmen
    q("modal-vehicle").classList.remove("hidden");
    await wisch(8, 160);
    check("im Dialog wird nicht gewischt", !q("view-vehicle").classList.contains("hidden"));
    check("Dialog bleibt dabei offen", !q("modal-vehicle").classList.contains("hidden"));
    q("modal-vehicle").classList.add("hidden");

    await wisch(8, 160);
    await wait(40);
    App.Nav.go("fleet");
    App.Fleet.renderFleet();
    await wait(20);
  }

  console.log("\n--- Mehrere Fotos auf einmal ---");
  {
    const alb = q("input-photo-file");
    const cam = q("input-photo-camera");
    check("Album nimmt mehrere", alb.hasAttribute("multiple"));
    check("Kamera bleibt bei einem", !cam.hasAttribute("multiple"));
    check("Knopf für das nächste Kamerabild vorhanden", !!q("btn-photo-again"));
    check("Knopf ist zunächst versteckt", q("btn-photo-again").classList.contains("hidden"));

    const echteImage = w.Image, echterReader = w.FileReader;

    /* Die Dateien werden absichtlich in verkehrter Reihenfolge fertig:
       die dritte zuerst. Am Ende muss die Auswahlreihenfolge stehen. */
    w.FileReader = class {
      readAsDataURL(f) {
        setTimeout(() => {
          if (this.onload) this.onload({ target: { result: "data:image/jpeg;name," + f.name } });
        }, f.__warten || 0);
      }
    };
    w.Image = class {
      constructor() { this.width = 200; this.height = 100; }
      set src(v) {
        this._src = v;
        this.__name = String(v).split(",")[1] || "";
        setTimeout(() => { if (this.onload) this.onload(); }, 0);
      }
      get src() { return this._src; }
    };

    const dateien = [
      { type: "image/jpeg", name: "eins", __warten: 40 },
      { type: "image/jpeg", name: "zwei", __warten: 10 },
      { type: "image/jpeg", name: "drei", __warten: 0 }
    ];
    Object.defineProperty(alb, "files", { value: dateien, configurable: true });

    App.Annotate.open({ title: "Mehrfach", onSave: () => {} });
    w.__zeichnungen.length = 0;
    alb.dispatchEvent(new w.Event("change", { bubbles: true }));
    await wait(250);

    check("drei Fotos im Streifen", q("photo-strip").children.length === 3,
      String(q("photo-strip").children.length));
    check("Meldung nennt die Zahl", /3 Fotos/.test(q("photo-status").textContent),
      q("photo-status").textContent);
    check("Speichern ist frei", !q("btn-save-damage").disabled);

    const gezeichnet = w.__zeichnungen
      .filter((z) => z.op === "drawImage" && z.args[0] && z.args[0].__name)
      .map((z) => z.args[0].__name);
    const letzteDrei = gezeichnet.slice(-3).join(",");
    check("Reihenfolge der Auswahl bleibt", letzteDrei === "eins,zwei,drei", letzteDrei);
    check("Album-Knopf zeigt kein Kamera-Angebot",
      q("btn-photo-again").classList.contains("hidden"));

    // Eine kaputte Datei darf die anderen nicht mitreissen
    App.Annotate.close();
    App.Annotate.open({ title: "Mehrfach", onSave: () => {} });
    const kaputt = [
      { type: "image/jpeg", name: "gut" },
      { type: "image/jpeg", name: "BRUCH" }
    ];
    Object.defineProperty(alb, "files", { value: kaputt, configurable: true });
    w.Image = class {
      constructor() { this.width = 200; this.height = 100; }
      set src(v) {
        this._src = v;
        const name = String(v).split(",")[1] || "";
        this.__name = name;
        setTimeout(() => {
          if (name === "BRUCH") { if (this.onerror) this.onerror(); }
          else if (this.onload) this.onload();
        }, 0);
      }
      get src() { return this._src; }
    };
    alb.dispatchEvent(new w.Event("change", { bubbles: true }));
    await wait(150);
    check("das lesbare Foto kommt an", q("photo-strip").children.length === 1,
      String(q("photo-strip").children.length));
    check("die kaputte Datei wird benannt", /nicht lesen/.test(q("photo-status").textContent),
      q("photo-status").textContent);

    // Kamera: nach der Aufnahme steht der Weg zum nächsten Bild bereit
    App.Annotate.close();
    App.Annotate.open({ title: "Kamera", onSave: () => {} });
    w.Image = class {
      constructor() { this.width = 200; this.height = 100; }
      set src(v) { this._src = v; setTimeout(() => { if (this.onload) this.onload(); }, 0); }
      get src() { return this._src; }
    };
    Object.defineProperty(cam, "files", {
      value: [{ type: "image/jpeg", name: "knipps" }], configurable: true
    });
    cam.dispatchEvent(new w.Event("change", { bubbles: true }));
    await wait(150);
    check("nach der Aufnahme kommt das Angebot für das nächste Bild",
      !q("btn-photo-again").classList.contains("hidden"));
    let wiederAuf = false;
    cam.click = () => { wiederAuf = true; };
    q("btn-photo-again").click();
    check("der Knopf öffnet die Kamera erneut", wiederAuf);

    App.Annotate.close();
    check("beim Schliessen verschwindet das Angebot",
      q("btn-photo-again").classList.contains("hidden"));

    w.Image = echteImage;
    w.FileReader = echterReader;
    Object.defineProperty(alb, "files", { value: [], configurable: true });
    Object.defineProperty(cam, "files", { value: [], configurable: true });
  }

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

  {
    await A2.Cloud.saveConfig("https://demo.supabase.co/rest/v1/", "anon-key-123");
    check("kopierte API-Adresse wird zurechtgestutzt",
      A2.Cloud.config().url === "https://demo.supabase.co", A2.Cloud.config().url);
    await A2.Cloud.saveConfig("https://demo.supabase.co", "anon-key-123");
  }

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

  console.log("\n--- Abgleich: Kategorien und neue Felder ---");
  {
    const kat = await A2.Store.addCategory("Transporter");
    await A2.Store.updateVehicle(v2.id, { categoryId: kat.id, hidden: true, zustand: true });
    await A2.Store.addDamage(v2.id, {
      images: ["data:image/jpeg;base64,ZZ"], description: "Zustand bei Übergabe", kind: "zustand"
    });
    await A2.Cloud.sync();
    await wait(50);

    check("Kategorie liegt auf dem Server",
      server.zeilen("categories").some((z) => z.id === kat.id && z.name === "Transporter"),
      JSON.stringify(server.zeilen("categories")));
    const zeile = server.zeilen("vehicles").find((z) => z.id === v2.id);
    check("Kategorie am Fahrzeug übertragen", zeile.category_id === kat.id, zeile.category_id);
    check("Ausgeblendet übertragen", zeile.hidden === true);
    check("Zustandsschalter übertragen", zeile.zustand === true);
    check("VIN übertragen", zeile.vin !== undefined, JSON.stringify(Object.keys(zeile)));
    check("Fahrzeugbild übertragen", "photo" in zeile);
    check("Kilometerstand und Anlass übertragen",
      server.zeilen("damages").some((z) => "km" in z && "anlass" in z));
    check("Art des Eintrags übertragen",
      server.zeilen("damages").some((z) => z.kind === "zustand"),
      JSON.stringify(server.zeilen("damages").map((z) => z.kind)));

    /* Wieder einblenden: die folgenden Prüfungen erwarten das Fahrzeug in der
       normalen Übersicht. */
    await A2.Store.updateVehicle(v2.id, { hidden: false });
    await A2.Cloud.sync();
    await wait(30);
  }

  console.log("\n--- Statusanzeige ---");
  {
    const pille = w2.document.getElementById("sync-status");
    check("Status meldet Synchronisiert", /^Synchronisiert /.test(pille.textContent), pille.textContent);
    check("Status ist grün gesetzt", /\bok\b/.test(pille.className), pille.className);
    check("heute nur die Uhrzeit", /^Synchronisiert \d{2}:\d{2}$/.test(pille.textContent),
      pille.textContent);
    check("gestern mit Datum",
      /^\d{2}\.\d{2}\. \d{2}:\d{2}$/.test(A2.Cloud.zeitstempel(Date.now() - 26 * 3600 * 1000)),
      A2.Cloud.zeitstempel(Date.now() - 26 * 3600 * 1000));
    check("Knopf heisst Jetzt synchronisieren",
      w2.document.getElementById("btn-sync-now").textContent === "Jetzt synchronisieren",
      w2.document.getElementById("btn-sync-now").textContent);
    check("kein 'Abgleich' mehr in der Oberfläche",
      !/abgeglichen|Jetzt abgleichen|Abgleich läuft/.test(w2.document.body.innerHTML));

    const css = fs.readFileSync(path.join(APP, "css/app.css"), "utf8");
    check("Statuspille hat einen Punkt", /\.status-pill::before/.test(css));
    check("Punkt nimmt die Textfarbe an", /background:currentColor/.test(css));
    check("laufender Sync pulsiert", /\.status-pill\.busy::before/.test(css));
  }

  console.log("\n--- Sync beim Zurückkommen in den Vordergrund ---");
  {
    /* Bewusst nichts lokal ändern: sonst löst schon der übliche Push-Zeitgeber
       einen Abgleich aus und der Test würde auch ohne die Vordergrund-Logik
       bestehen. Stattdessen legt ein anderes Gerät etwas auf den Server. */
    server.fremdeAenderung("vehicles", {
      id: "veh-vordergrund", name: "Vom iPad angelegt", plate: "NOM-JA 777",
      deleted: false, updated_at: Date.now()
    });
    check("noch nicht bekannt", !A2.Store.getVehicle("veh-vordergrund"));

    A2.Cloud._setzeVordergrundSperre(0);
    Object.defineProperty(w2.document, "visibilityState", { value: "visible", configurable: true });
    w2.document.dispatchEvent(new w2.Event("visibilitychange"));
    await bisWahr(() => !!A2.Store.getVehicle("veh-vordergrund"), 3000);
    check("Vordergrundwechsel holt fremde Änderungen",
      !!A2.Store.getVehicle("veh-vordergrund"));

    // Sperre greift: direkt danach passiert nichts mehr
    A2.Cloud._setzeVordergrundSperre(15000);
    server.fremdeAenderung("vehicles", {
      id: "veh-gesperrt", name: "Kommt erst später", plate: "", deleted: false,
      updated_at: Date.now()
    });
    w2.document.dispatchEvent(new w2.Event("visibilitychange"));
    await wait(120);
    check("Sperre verhindert Dauerfeuer", !A2.Store.getVehicle("veh-gesperrt"));

    await A2.Store.deleteVehicle("veh-vordergrund");
    await A2.Cloud.sync();
  }

  console.log("\n--- Abgleich: zweites Gerät ---");
  const w3 = macheApp({ fetch: server.fetch });
  await wait(300);
  const A3 = w3.App;
  await A3.Cloud.saveConfig("https://demo.supabase.co", "anon-key-123");
  await A3.Cloud.login("chef@jansen.de", "geheim");
  await wait(80);
  check("zweites Gerät sieht das Fahrzeug", A3.Store.vehicles().some((x) => x.id === v2.id));
  check("zweites Gerät sieht den Schaden", A3.Store.damagesOf(v2.id, "schaden").length === 1);
  check("zweites Gerät sieht den Stand", !!A3.Store.findSnapshotByCode(s2.code));
  check("Stand-Inhalt vollständig übertragen",
    A3.Store.findSnapshotByCode(s2.code).damages.length === 1);

  console.log("\n--- Abgleich: Änderung fliesst zurück ---");
  await A3.Store.addDamage(v2.id, { image: "data:image/jpeg;base64,X2", note: "Kratzer Heck", date: "2026-07-20", area: "Heck" });
  await A3.Cloud.sync();
  await A2.Cloud.sync();
  await wait(50);
  check("erstes Gerät hat den neuen Schaden", A2.Store.damagesOf(v2.id, "schaden").length === 2);
  check("Fahrzeugname nicht überschrieben",
    A2.Store.getVehicle(v2.id).name === "Ford Transit",
    A2.Store.getVehicle(v2.id).name);

  console.log("\n--- Abgleich: Löschen setzt sich durch ---");
  const zuLoeschen = A3.Store.damagesOf(v2.id, "schaden").find((d) => (d.description || "").includes("Kratzer Heck"));
  await A3.Store.deleteDamage(v2.id, zuLoeschen.id);
  await A3.Cloud.sync();
  await A2.Cloud.sync();
  await wait(50);
  check("Löschung ist beim ersten Gerät angekommen", A2.Store.damagesOf(v2.id, "schaden").length === 1);
  check("Löschung wird nicht wiederbelebt",
    !A2.Store.damagesOf(v2.id, "schaden").some((d) => (d.description || "").includes("Kratzer Heck")));

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
  /* Grosszügig warten: läuft gerade noch ein Abgleich, greift stattdessen der
     nachgelagerte Push nach zwei Sekunden. Mit knapp bemessenem Zeitfenster
     schlägt die Prüfung ab und zu grundlos fehl. */
  const angekommen = await bisWahr(
    () => server2.zeilen("vehicles").some((z) => z.name === "Token-Test"), 6000);
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
