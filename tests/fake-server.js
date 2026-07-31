/* tests/fake-server.js — nachgebauter Supabase-Server
 *
 * Bildet genau die Teile nach, die cloud.js benutzt: Anmeldung, Token-
 * Erneuerung sowie Lesen und Upsert der drei Tabellen. Damit lässt sich der
 * Abgleich testen, ohne ein echtes Projekt anzulegen — und ohne dass ein
 * Testlauf jemals echte Daten anfasst.
 */
function createFakeServer(opts) {
  const o = opts || {};
  const tabellen = { vehicles: [], damages: [], snapshots: [], categories: [] };
  const zugang = { email: o.email || "test@example.org", password: o.password || "geheim" };
  const log = [];
  let offline = false;
  let tokenZaehler = 0;

  function jsonAntwort(status, body) {
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status: status,
      statusText: status === 200 ? "OK" : "Fehler",
      text: () => Promise.resolve(JSON.stringify(body))
    });
  }

  function upsert(name, zeilen) {
    zeilen.forEach((neu) => {
      const i = tabellen[name].findIndex((z) => z.id === neu.id);
      if (i === -1) tabellen[name].push(JSON.parse(JSON.stringify(neu)));
      else tabellen[name][i] = JSON.parse(JSON.stringify(neu));
    });
  }

  function fetchNachbau(url, options) {
    const opt = options || {};
    log.push({ url: String(url), method: opt.method || "GET" });

    if (offline) return Promise.reject(new TypeError("Failed to fetch"));

    const u = String(url);

    // --- Anmeldung
    if (u.includes("/auth/v1/token")) {
      const body = JSON.parse(opt.body || "{}");
      if (u.includes("grant_type=refresh_token")) {
        if (body.refresh_token !== "refresh-token") return jsonAntwort(401, { message: "ungültig" });
        tokenZaehler++;
        return jsonAntwort(200, {
          access_token: "token-" + tokenZaehler, refresh_token: "refresh-token", expires_in: 3600
        });
      }
      if (body.email !== zugang.email || body.password !== zugang.password) {
        return jsonAntwort(400, { error_description: "Invalid login credentials" });
      }
      tokenZaehler++;
      return jsonAntwort(200, {
        access_token: "token-" + tokenZaehler,
        refresh_token: "refresh-token",
        expires_in: o.expiresIn || 3600
      });
    }

    // --- Tabellen
    const m = u.match(/\/rest\/v1\/(\w+)/);
    if (!m) return jsonAntwort(404, { message: "unbekannter Pfad" });
    const name = m[1];
    if (!tabellen[name]) return jsonAntwort(404, { message: 'relation "' + name + '" does not exist' });

    const auth = (opt.headers && (opt.headers.Authorization || opt.headers.authorization)) || "";
    if (!/^Bearer token-/.test(auth)) return jsonAntwort(401, { message: "JWT fehlt" });

    if ((opt.method || "GET") === "GET") {
      let zeilen = tabellen[name];
      const gt = u.match(/updated_at=gt\.(\d+)/);
      if (gt) {
        const grenze = Number(gt[1]);
        zeilen = zeilen.filter((z) => Number(z.updated_at) > grenze);
      }
      const limit = u.match(/limit=(\d+)/);
      if (limit) zeilen = zeilen.slice(0, Number(limit[1]));
      return jsonAntwort(200, zeilen);
    }

    if (opt.method === "POST") {
      upsert(name, JSON.parse(opt.body || "[]"));
      return jsonAntwort(201, []);
    }
    return jsonAntwort(405, { message: "Methode nicht erlaubt" });
  }

  return {
    fetch: fetchNachbau,
    tabellen: tabellen,
    log: log,
    zeilen: (n) => tabellen[n],
    setOffline: (b) => { offline = b; },
    /* Simuliert ein anderes Gerät, das etwas hochgeladen hat */
    fremdeAenderung: (name, zeile) => upsert(name, [zeile])
  };
}

module.exports = { createFakeServer };
