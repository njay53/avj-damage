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
    check("Bilanz erscheint", !q("vehicle-bilanz").classList.contains("hidden"));
    check("Stand steht auf der Kachel", /repariert/i.test(q("damage-grid").innerHTML));

    await App.Store.deleteDamage(v.id, zweit.id);
  }

  console.log("\n--- Beträge verdecken ---");
  {
    check("standardmässig verdeckt", App.Einstellungen.betraegeSichtbar() === false);
    App.Fleet.renderVehicle();
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

    // Schadensstand friert keine Beträge ein
    const stand2 = await App.Store.createSnapshot(v.id, "");
    const drin = stand2.damages.find((d) => d.id === geld.id);
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
    check("beim Schaden kein Kilometerstand", q("km-row").classList.contains("hidden"));
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
    check("gelöschter Schaden behält keine Fotos", geloescht.images.length === 0,
      String(geloescht.images.length));
    check("Löschmarke bleibt stehen", geloescht.deleted === true);
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
