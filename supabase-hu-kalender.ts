/* Schadenmanager — HU-Kalender als Abonnement
 *
 * Diese Funktion liefert alle HU-Termine als Kalenderdatei aus. iPhone und
 * iPad holen sie sich regelmaessig selbst ab, dadurch aktualisiert sich der
 * Kalender von allein, wenn in der App ein Termin geaendert wird.
 *
 * Ablauf: Supabase -> Edge Functions -> Deploy a new function -> Via Editor,
 * Name "hu-kalender", diesen Text komplett einfuegen. Details stehen in
 * ANLEITUNG-KALENDER.md.
 *
 * WICHTIG:
 *   - "Verify JWT" muss AUS sein. Ein Kalender kann sich nicht anmelden.
 *   - Stattdessen schuetzt ein Wort in der Adresse (?token=...). Wer die
 *     Adresse hat, sieht die HU-Termine — Fahrzeugname, Kennzeichen, Monat.
 *     Keine Fotos, keine Betraege, keine Kundendaten.
 */

const ERLAUBT = ["GET", "HEAD", "OPTIONS"];

Deno.serve(async (req: Request): Promise<Response> => {
  if (!ERLAUBT.includes(req.method)) {
    return new Response("Nur Lesen erlaubt.", { status: 405 });
  }

  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";
  const erwartet = Deno.env.get("KALENDER_TOKEN") ?? "";

  /* Ohne hinterlegtes Wort bleibt die Funktion zu — sonst waere sie beim
     ersten Fehlgriff in der Einrichtung offen fuer jeden. */
  if (erwartet.length < 16 || !gleich(token, erwartet)) {
    /* Diagnose ohne Preisgabe: nur Laengen und ob die ersten zwei Zeichen
       passen. Damit laesst sich unterscheiden, ob das Secret ueberhaupt
       ankommt, ob die Adresse ein Wort mitbringt und ob beide gleich lang
       sind. Das Wort selbst steht nirgends. */
    const hinweis = [
      "Nicht berechtigt.",
      "",
      "Secret KALENDER_TOKEN: " +
        (erwartet.length === 0
          ? "FEHLT oder ist bei der Funktion nicht angekommen"
          : erwartet.length + " Zeichen" +
            (erwartet.length < 16 ? " — zu kurz, mindestens 16 noetig" : "")),
      "Wort in der Adresse:   " +
        (token.length === 0 ? "FEHLT (?token=... vergessen?)" : token.length + " Zeichen"),
      "Anfang gleich:         " +
        (erwartet.length && token.length
          ? (erwartet.slice(0, 2) === token.slice(0, 2) ? "ja" : "nein")
          : "-"),
      "Laenge gleich:         " +
        (erwartet.length && token.length
          ? (erwartet.length === token.length ? "ja" : "nein")
          : "-"),
    ].join("\n");

    return new Response(hinweis, {
      status: 401,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const basis = Deno.env.get("SUPABASE_URL") ?? "";
  const schluessel =
    Deno.env.get("SB_SECRET_KEY") ??
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    "";

  if (!basis || !schluessel) {
    return new Response("Funktion ist nicht vollstaendig eingerichtet.", { status: 500 });
  }

  const antwort = await fetch(
    `${basis}/rest/v1/vehicles?select=id,name,plate,vin,hu,deleted,archived`,
    { headers: { apikey: schluessel, Authorization: `Bearer ${schluessel}` } },
  );

  if (!antwort.ok) {
    return new Response("Datenbank nicht erreichbar.", { status: 502 });
  }

  const alle = await antwort.json();
  const fahrzeuge = (Array.isArray(alle) ? alle : []).filter(
    (v: Record<string, unknown>) =>
      !v.deleted && !v.archived && /^\d{4}-\d{2}$/.test(String(v.hu ?? "")),
  );

  const ics = baueKalender(fahrzeuge);

  return new Response(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="hu-termine.ics"',
      /* Eine Stunde Ruhe reicht — HU-Termine aendern sich nicht im Minutentakt. */
      "Cache-Control": "public, max-age=3600",
    },
  });
});

/* Vergleich ohne Abkuerzung: bricht nicht beim ersten falschen Zeichen ab.
   Bei einem Wort dieser Laenge kaum von Bedeutung, kostet aber nichts. */
function gleich(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let rest = 0;
  for (let i = 0; i < a.length; i++) rest |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return rest === 0;
}

function baueKalender(fahrzeuge: Record<string, unknown>[]): string {
  const zeilen: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Autovermietung Jansen//Schadenmanager//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:HU-Termine Fuhrpark",
    "X-WR-CALDESC:Hauptuntersuchungen aus dem Schadenmanager",
    /* Vorschlag ans Geraet, wie oft nachgesehen wird. Das letzte Wort hat iOS. */
    "X-PUBLISHED-TTL:PT6H",
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
  ];

  for (const v of fahrzeuge) {
    const hu = String(v.hu);
    const [jahr, monat] = hu.split("-").map(Number);
    /* Tag 0 des Folgemonats ist der letzte Tag des gesuchten Monats — und
       damit der Stichtag der Hauptuntersuchung. */
    const ende = new Date(Date.UTC(jahr, monat, 0));
    const tag =
      ende.getUTCFullYear().toString() +
      String(ende.getUTCMonth() + 1).padStart(2, "0") +
      String(ende.getUTCDate()).padStart(2, "0");

    const name = String(v.name ?? "");
    const kennzeichen = String(v.plate ?? "");
    const titel = `HU fällig ${String(monat).padStart(2, "0")}/${jahr} — ${name}` +
      (kennzeichen ? ` (${kennzeichen})` : "");

    zeilen.push(
      "BEGIN:VEVENT",
      `UID:hu-${v.id}-${hu}@schadenmanager`,
      `DTSTAMP:${jetztStempel()}`,
      `DTSTART;VALUE=DATE:${tag}`,
      `DTEND;VALUE=DATE:${tag}`,
      `SUMMARY:${escape(titel)}`,
      `DESCRIPTION:${escape(
        `Hauptuntersuchung fällig im ${String(monat).padStart(2, "0")}/${jahr}, ` +
          `spätestens am ${ende.getUTCDate()}.${monat}.${jahr}.\n` +
          (kennzeichen || name) +
          (v.vin ? `\nVIN ${v.vin}` : "") +
          "\nAus dem Schadenmanager. Änderungen dort werden übernommen.",
      )}`,
      "BEGIN:VALARM",
      /* Erster Wecker am Monatsersten: so viele Tage vor dem Monatsletzten,
         wie der Monat Tage hat, minus eins. */
      `TRIGGER:-P${ende.getUTCDate() - 1}D`,
      "ACTION:DISPLAY",
      `DESCRIPTION:${escape(titel + " — diesen Monat")}`,
      "END:VALARM",
      "BEGIN:VALARM",
      "TRIGGER:-P14D",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escape(titel + " — in zwei Wochen")}`,
      "END:VALARM",
      "END:VEVENT",
    );
  }

  zeilen.push("END:VCALENDAR");
  return zeilen.join("\r\n");
}

function jetztStempel(): string {
  const d = new Date();
  return (
    d.getUTCFullYear().toString() +
    String(d.getUTCMonth() + 1).padStart(2, "0") +
    String(d.getUTCDate()).padStart(2, "0") +
    "T" +
    String(d.getUTCHours()).padStart(2, "0") +
    String(d.getUTCMinutes()).padStart(2, "0") +
    String(d.getUTCSeconds()).padStart(2, "0") +
    "Z"
  );
}

/* Kalenderdateien haben eigene Regeln: Komma, Semikolon und Backslash muessen
   maskiert werden, Zeilenumbrueche als \n stehen. */
function escape(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}
