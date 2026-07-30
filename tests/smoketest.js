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
const DATEIEN = ["js/store.js", "js/cloud.js", "js/annotate.js", "js/fleet.js",
                 "js/snapshot.js", "js/app.js"];

let failures = 0;
function check(name, cond, extra) {
  console.log((cond ? "  OK   " : "  FEHL ") + name + (cond ? "" : "  " + (extra || "")));
  if (!cond) failures++;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

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
  w.HTMLCanvasElement.prototype.getContext = function () {
    const n = () => {};
    return {
      drawImage: n, fillRect: n, fillText: n, stroke: n, fill: n, beginPath: n,
      moveTo: n, lineTo: n, ellipse: n, closePath: n, putImageData: n,
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

  console.log("\n--- Fahrzeug und Schäden ---");
  const v = await App.Store.addVehicle({ name: "Toyota Yaris #3", plate: "NOM-JA 123" });
  await App.Store.addDamage(v.id, { image: "data:image/jpeg;base64,ALT1", note: "Kratzer Stossstange h.l.", date: "2026-05-04", area: "Stossstange h.l." });
  await App.Store.addDamage(v.id, { image: "data:image/jpeg;base64,ALT2", note: "Steinschlag Frontscheibe", date: "2026-06-12", area: "Frontscheibe" });
  App.Fleet.renderFleet();
  check("Fahrzeug in der Übersicht", q("fleet-grid").textContent.includes("Toyota Yaris #3"));
  check("Badge zeigt 2 Schäden", q("fleet-grid").textContent.includes("2 Schäden"));
  check("Register hat 2 Schäden", App.Store.damagesOf(v.id).length === 2);

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
  const alt1 = App.Store.damagesOf(v.id).find((d) => d.note.includes("Kratzer"));
  await App.Store.updateDamage(v.id, alt1.id, { note: "NACHTRÄGLICH GEÄNDERT" });
  const steinschlag = App.Store.damagesOf(v.id).find((d) => d.note.includes("Steinschlag"));
  await App.Store.deleteDamage(v.id, steinschlag.id);
  const nachher = App.Store.getSnapshot(stand.id);
  check("Notiz im Stand unverändert", nachher.damages.some((d) => d.note.includes("Kratzer Stossstange")));
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
  check("Bild wurde mit übertragen", server.zeilen("damages")[0].image === "data:image/jpeg;base64,X1");
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
  const zuLoeschen = A3.Store.damagesOf(v2.id).find((d) => d.note.includes("Kratzer Heck"));
  await A3.Store.deleteDamage(v2.id, zuLoeschen.id);
  await A3.Cloud.sync();
  await A2.Cloud.sync();
  await wait(50);
  check("Löschung ist beim ersten Gerät angekommen", A2.Store.damagesOf(v2.id).length === 1);
  check("Löschung wird nicht wiederbelebt", !A2.Store.damagesOf(v2.id).some((d) => d.note.includes("Kratzer Heck")));

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
  await wait(50);
  check("trotz abgelaufenem Token erfolgreich",
    server2.zeilen("vehicles").some((z) => z.name === "Token-Test"));
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
