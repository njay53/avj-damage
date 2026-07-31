# Schadenmanager — Autovermietung Jansen

Interne Web-App als Ersatz für die fehlende Bildfunktion in rentsoft V1.
Heisst in der App und auf dem Homescreen **Schadenmanager**; das Kundendokument
trägt weiterhin die Überschrift „Schadenübersicht" — der Name der Software
gehört nicht auf ein Papier, das der Kunde in die Hand bekommt.

Sie führt pro Fahrzeug ein **Schadensregister** mit markierten Fotos und erlaubt,
den aktuellen Zustand als **Schadensstand** einzufrieren. Jeder Stand bekommt
eine kurze Kennung, die ins rentsoft-Protokoll gehört. Damit ist später
nachweisbar, welche Bilder der Kunde bei der Übergabe gesehen hat.

Unterschrieben wird weiterhin in rentsoft. Diese App enthält **bewusst keine
Kundendaten** — keine Namen, keine Unterschriften, keine Vertragsdaten. Der
Datenbestand ist reine Betriebsmitteldokumentation und darf deshalb ohne
weitere Datenschutzauflagen zwischen Geräten abgeglichen werden.

Kein Build, keine Abhängigkeiten zur Laufzeit. Reines HTML, CSS und JavaScript.

---

## Der Grundgedanke

Das Schadensregister wächst über die Zeit — ein Stand von heute enthält nicht
dieselben Bilder wie einer von nächstem Monat. Wenn im rentsoft-Protokoll nur
steht „Schäden wurden gezeigt", ist unklar, *welche*. Deshalb der Zwischenschritt:

1. Vor der Übergabe in der App auf **Stand festhalten** tippen.
2. Die App friert alle aktuellen Bilder ein und zeigt eine Kennung, etwa `K7QF`.
3. Die angebotene Zeile ins Notizfeld des rentsoft-Protokolls übernehmen:

   ```
   Schadensdokumentation NOM-JA 123 · Stand 29.07.2026, 14:12 · 7 Schäden · Kennung K7QF
   ```

4. Kunde unterschreibt wie gewohnt in rentsoft.

Kommt es später zur Diskussion, gibst du die Kennung oben im Fuhrpark ein und
siehst exakt die Bilder von damals. Ein eingefrorener Stand enthält eigene
Kopien der Fotos: Änderungen oder Löschungen im Register berühren ihn nicht.

Die Kennungen bestehen aus vier Zeichen ohne `0`, `O`, `1`, `I`, `5` und `S` —
damit auf Papier nichts verwechselt wird.

---

## Deployment auf GitHub Pages

1. Repository anlegen, z. B. `fahrzeugschaeden`. Im Repo liegt nur
   Programmcode, **keine** Betriebs- oder Kundendaten. Für GitHub Pages aus
   einem privaten Repo braucht man einen bezahlten Plan, mit *public* geht es
   kostenlos.
2. Alle Dateien hochladen, Struktur beibehalten:

   ```
   index.html
   manifest.webmanifest
   sw.js
   .nojekyll
   css/app.css
   js/store.js          Datenhaltung (IndexedDB)
   js/cloud.js          Abgleich mit dem Server
   js/annotate.js       Foto markieren
   js/fleet.js          Fuhrpark und Schadensregister
   js/snapshot.js       Schadensstände
   js/app.js            Navigation, Einstellungen, Start
   icons/…
   ```

   `package.json`, `.gitignore` und `tests/` dürfen mit hoch, stören auf Pages
   nicht. **`node_modules/` nicht hochladen** — dafür sorgt die `.gitignore`.

3. **Settings → Pages → Deploy from a branch**, Branch `main`, Ordner `/ (root)`.
4. Nach ein bis zwei Minuten erreichbar unter
   `https://<benutzername>.github.io/fahrzeugschaeden/`

### Nach Code-Änderungen

Drei Stellen müssen dieselbe Nummer tragen, sonst laden installierte Geräte
weiter die alte Fassung:

- `sw.js` → `CACHE_VERSION`
- `js/app.js` → `APP_VERSION` (steht in der Fusszeile, daran erkennt man am
  Gerät, was wirklich geladen ist)
- `index.html` → das `?b=` an jeder eigenen Datei

Der Testlauf prüft das mit, ein Vergessen fällt also sofort auf.

---

## Auf Handy und Tablet installieren

- **iPhone/iPad (Safari):** Seite öffnen → Teilen → „Zum Home-Bildschirm"
- **Android (Chrome):** Menü → „App installieren"

Danach startet die App als eigenes Icon ohne Browserleiste und funktioniert
auch ohne Empfang — der Service Worker hält die App-Shell vor, die Daten
liegen ohnehin lokal.

---

## Hell und dunkel

Die App folgt der Systemeinstellung des Geräts. Wer am iPhone unter
*Anzeige & Helligkeit* auf „Automatisch" mit Sonnenauf- und -untergang steht,
bekommt das ohne weiteres Zutun: iOS schaltet um, der Browser meldet es über
`prefers-color-scheme`, die Seite zieht nach. Einen eigenen Schalter gibt es
bewusst nicht — er wäre eine zweite Wahrheit neben der des Systems.

Zwei Dinge bleiben in beiden Fällen hell:

- **Das Dokument** in der Schadensstandansicht. Es zeigt, was beim Drucken
  herauskommt, und Papier ist weiss.
- **Die Fotos.** An denen wird nichts gedreht — ein Schaden soll auf beiden
  Geräten gleich aussehen.

Die dunkle Palette ist nicht die helle mit umgedrehten Werten: das Logoblau
`#1B2FC4` ist auf dunklem Grund nicht mehr lesbar und wurde im selben Farbton
aufgehellt. Der Testlauf rechnet die Kontraste nach und schlägt an, wenn ein
Paar unter 4,5:1 fällt.

---

## Wann synchronisiert wird

Von allein, ohne Knopfdruck:

- **zwei Sekunden nach jeder Änderung** — die Verzögerung fasst mehrere
  schnell aufeinanderfolgende Eingaben zu einer Übertragung zusammen
- **beim Start** der App
- **beim Zurückkommen in den Vordergrund**, höchstens alle 15 Sekunden — damit
  das iPad im Büro nicht stundenlang einen alten Stand zeigt
- **wenn das Netz zurückkommt**, mit allem, was offline liegengeblieben ist

Die Statuspille oben zeigt den Zustand: grüner Punkt und „Synchronisiert
14:32", wenn alles steht. Ist der Stand älter als heute, steht das Datum
dabei. Der Knopf „Jetzt synchronisieren" ist nur für den Fall, dass man es
erzwingen will.

---

## Synchronisierung zwischen Geräten einrichten

Der Abgleich läuft über Supabase. Der kostenlose Tarif reicht für diesen
Zweck deutlich aus. Einmalige Einrichtung, danach läuft es von allein.

### 1. Projekt anlegen

Auf [supabase.com](https://supabase.com) ein Konto und ein neues Projekt
anlegen. **Region Frankfurt (eu-central-1)** wählen, dann liegen die Daten in
Deutschland. Passwort der Datenbank notieren.

### 2. Tabellen anlegen

Im Projekt → **SQL Editor** → **New query** → folgendes einfügen und ausführen:

```sql
-- Fahrzeuge
create table public.vehicles (
  id          text primary key,
  name        text not null default '',
  plate       text not null default '',
  deleted     boolean not null default false,
  updated_at  bigint  not null default 0
);

-- Schäden (ein Datensatz je Schadenseintrag, mit einer Bilderliste)
-- images     = Liste der Fotos, ein Eintrag kann mehrere haben
-- count      = wie viele Schäden dieser Eintrag umfasst (ein Foto, drei Kratzer)
-- date       = wann der Schaden entstanden ist (kann leer sein)
-- date_mode  = exact | unknown | stock
-- created_at = wann erfasst wurde (immer gesetzt, zählt als Nachweis)
create table public.damages (
  id          text primary key,
  vehicle_id  text not null,
  images      jsonb   not null default '[]'::jsonb,
  count       integer not null default 1,
  description text not null default '',
  date        text not null default '',
  date_mode   text not null default 'exact',
  created_at  bigint  not null default 0,
  area        text not null default '',
  deleted     boolean not null default false,
  updated_at  bigint  not null default 0
);

-- Eingefrorene Schadensstände
create table public.snapshots (
  id            text primary key,
  code          text not null,
  vehicle_id    text not null,
  vehicle_name  text not null default '',
  vehicle_plate text not null default '',
  reference     text not null default '',
  created_at    bigint not null default 0,
  damages       jsonb  not null default '[]'::jsonb,
  deleted       boolean not null default false,
  updated_at    bigint  not null default 0
);

-- Schneller Abgleich: es wird immer nach "neuer als" gefiltert
create index on public.vehicles  (updated_at);
create index on public.damages   (updated_at);
create index on public.snapshots (updated_at);
create index on public.damages   (vehicle_id);

-- Zugriffsschutz: ohne Anmeldung geht gar nichts
alter table public.vehicles  enable row level security;
alter table public.damages   enable row level security;
alter table public.snapshots enable row level security;

create policy "angemeldete duerfen alles" on public.vehicles
  for all to authenticated using (true) with check (true);
create policy "angemeldete duerfen alles" on public.damages
  for all to authenticated using (true) with check (true);
create policy "angemeldete duerfen alles" on public.snapshots
  for all to authenticated using (true) with check (true);
```

Falls du die Tabellen schon vor dieser Version angelegt hattest, fehlen zwei
Spalten. Dann zusätzlich einmal ausführen:

```sql
alter table public.damages add column if not exists date_mode   text    not null default 'exact';
alter table public.damages add column if not exists created_at  bigint  not null default 0;
alter table public.damages add column if not exists images      jsonb   not null default '[]'::jsonb;
alter table public.damages add column if not exists count       integer not null default 1;
alter table public.damages add column if not exists description text    not null default '';
```

Die alten Spalten `image` und `note` dürfen bleiben — die App liest sie noch,
wenn ein Datensatz sie hat, und schreibt künftig in `images` und `description`.

Der letzte Block ist der wichtige: **Row Level Security**. Ohne sie könnte
jeder, der die Adresse der App kennt, die Daten lesen — der öffentliche
Schlüssel steht ja im Browser. Mit ihr kommt nur durch, wer angemeldet ist.

### 3. Benutzer anlegen

Projekt → **Authentication** → **Users** → **Add user**. E-Mail und Passwort
vergeben, „Auto Confirm User" anhaken. Ein Konto für den Betrieb reicht; man
kann sich damit auf allen Geräten anmelden.

Unter **Authentication → Providers → Email** sollte „Confirm email" für dieses
Konto nicht im Weg stehen, und Registrierung von aussen (`Enable signups`)
gehört ausgeschaltet — sonst könnte sich jeder selbst ein Konto anlegen und
käme an die Daten.

### 4. In der App eintragen

Projekt → **Settings → API**. Dort stehen:

- **Project URL** → in der App unter Einstellungen als *Projekt-URL*
- **anon public** Schlüssel → als *Projekt-Schlüssel*

Speichern, `Verbindung prüfen`, dann mit E-Mail und Passwort anmelden. Auf
jedem weiteren Gerät dasselbe — danach sehen alle denselben Stand.

Der `anon`-Schlüssel ist zur Veröffentlichung gedacht und für sich genommen
harmlos. Der `service_role`-Schlüssel dagegen umgeht jeden Zugriffsschutz und
darf **niemals** in die App oder ins Repo.

### Wie der Abgleich arbeitet

Führend ist immer die lokale Datenbank. Ohne Netz arbeitet die App normal
weiter, Änderungen gehen beim nächsten erfolgreichen Abgleich raus. Abgeglichen
wird beim Start, bei jeder Änderung mit kurzer Verzögerung, bei Rückkehr ins
Netz und über `Jetzt abgleichen`.

Zusammengeführt wird pro Datensatz: bei Konflikten gewinnt der jüngere
Zeitstempel. Löschungen werden als Markierung gespeichert und übertragen sich,
statt von einem Gerät mit altem Stand wieder auferweckt zu werden. Der Inhalt
eines eingefrorenen Standes wird nie überschrieben.

Die Zeitstempel kommen von den Geräten. Wenn auf einem Gerät die Uhr grob
falsch geht, kann das die Konfliktauflösung verdrehen — in der Praxis unkritisch,
weil selten zwei Geräte denselben Datensatz gleichzeitig ändern.

### Grenzen des kostenlosen Tarifs

Die Fotos liegen als Text in der Datenbank, ein Bild belegt rund 150 KB. Der
freie Tarif bietet 500 MB, das reicht für etwa 3000 Fotos. Wenn es eng wird,
lässt sich auf Supabase Storage umstellen — dann liegen die Bilder als Dateien
und die Datenbank enthält nur noch Verweise.

Ohne Zugriff pausiert Supabase ein Projekt im freien Tarif nach einer Woche
Inaktivität. Bei täglicher Nutzung passiert das nicht; sonst weckt ein Klick im
Supabase-Dashboard es wieder auf.

---

## Ohne Server

Die App läuft vollständig ohne eingerichteten Abgleich — dann bleiben die Daten
auf dem jeweiligen Gerät. Unter Einstellungen gibt es `Exportieren` und
`Importieren`, um alles als eine Datei zu sichern oder auf ein anderes Gerät zu
bringen. Der Import führt zusammen und überschreibt nichts blind.

Das ist auch der empfohlene Weg für regelmässige Sicherungen, unabhängig vom
Server.

---

## Arbeitsablauf

**Schäden pflegen:** Fuhrpark → Fahrzeug → `+ Schaden hinzufügen` → Foto
aufnehmen → mit Kreis, Pfeil, Freihand oder Text markieren → Bereich, Notiz und
Datum → speichern. Fotos werden auf 1400 px verkleinert und als JPEG abgelegt.

**Vor der Übergabe:** Fahrzeug öffnen → `Stand festhalten` → optional eine
interne Referenz eintragen (Mietvertragsnummer, **keine Kundennamen**) →
`Einfrieren` → Zeile kopieren und in rentsoft eintragen.

**Im Streitfall:** Kennung oben im Fuhrpark eingeben → Stand öffnen →
`PDF / Drucken` liefert ein Dokument mit allen Bildern, Zeitstempel und Kennung.

---

## Funktionstest

```bash
npm install    # einmalig, holt jsdom und fake-indexeddb
npm test
```

Der Test spielt die App ohne Browser durch: Fahrzeuge und Schäden anlegen,
Stand einfrieren, Register nachträglich manipulieren und prüfen, dass der Stand
unverändert bleibt, Kennungen auf Eindeutigkeit prüfen, Abgleich zwischen zwei
simulierten Geräten inklusive Löschungen, Offline-Verhalten und Token-Erneuerung
— gegen einen nachgebauten Server in `tests/fake-server.js`, es wird also nie
ein echtes Projekt angefasst. Dazu die Fehlerbehandlung beim Start und im
Betrieb.

Nach Änderungen am Code einmal laufen lassen. `npm run serve` startet einen
lokalen Server auf Port 8080 — nötig, weil Service Worker und Kamerazugriff
über `file://` nicht funktionieren.

---

## Textbausteine für rentsoft

Der Kunde unterschreibt weiter das Protokoll in rentsoft. Diese Zeilen stellen
die Verbindung zur Bilddokumentation her. Sie behaupten bewusst nur, was auch
eingehalten wird — was nicht dasteht, kann später auch nicht dagegen verwendet
werden.

**Für das Protokoll, ohne Schadensstände** (der Normalfall):

> Vorhandene Schäden wurden anhand der Fotodokumentation gemeinsam am Fahrzeug
> durchgegangen. Die Dokumentation wird bei der Autovermietung Jansen geführt
> und ist auf Wunsch jederzeit einsehbar.

**Für das Protokoll, mit Schadensstand:**

> Der Fahrzeugzustand bei Übergabe ist unter der Kennung ________ mit Fotos
> festgehalten und wurde gemeinsam durchgegangen. Ausdruck oder Einsicht auf
> Wunsch.

**Fürs Notizfeld in rentsoft** (intern, gehört keinem Kunden in die Hand):

> Schadenmanager · Stand ________ · ____ Schäden · eingefroren am __.__.____
> Rückgabe: Stand ________

Was bewusst nicht dasteht:

- Keine Bestätigung, dass das Fahrzeug *ausser* den dokumentierten Schäden
  mängelfrei sei. Das lässt sich bei einer Übergabe auf dem Hof nicht seriös
  feststellen und würde einem Streit nicht standhalten.
- Kein Wort von „unveränderlich" oder „revisionssicher", solange ohne
  Schadensstände gearbeitet wird. Ohne eingefrorenen Stand läuft die Datenbank
  weiter, und damit lässt sich nicht belegen, welchen Stand der Kunde gesehen
  hat.
- Kein Verweis auf die Adresse der App. Der Kunde braucht sie nicht, und
  intern erreichbare Werkzeuge gehören nicht auf ein Kundendokument.

Rechtlich verbindlich ist das nicht geprüft — für eine Formulierung, die in den
Mietvertrag selbst wandert, wäre ein Blick vom Anwalt sinnvoll.

---

## Als Nächstes dran (Stand Build 20)

1. **Supabase einrichten.** Entschieden: es wird Supabase, kostenloser Tarif.
   SQL und Schritte stehen weiter unten im Abschnitt zur Einrichtung.
   Rechnung dahinter: ohne Schadensstände wächst nur der Fahrzeugbestand,
   grob 250–300 MB über Jahre. Zwei Dinge im Blick behalten:
   - Die Fotos liegen als Base64 in der Datenbank, das bläht um rund ein
     Drittel auf. Bei etwa 400 MB von 500 MB ist der Punkt gekommen, sie in
     den Supabase-Dateispeicher zu verschieben (dort binär, 1 GB frei).
     Die Einstellungen zeigen den belegten Platz an, es muss also nicht
     geschätzt werden.
   - Auf dem kostenlosen Tarif gibt es keine Backups. Die Exportdatei in
     einen iCloud-Ordner bleibt das Sicherungsnetz.
2. **Fotos entdoppeln** (angeboten, noch nicht beauftragt). Jedes Foto einmal
   speichern, Schäden und Stände verweisen über eine Prüfsumme darauf. Ein
   eingefrorener Stand kostet dann Kilobyte statt Megabyte — damit muss gar
   nicht entschieden werden, ob Stände genutzt werden oder nicht. Beweiskraft
   bleibt, weil ein Foto nie verändert wird: Nachbearbeiten erzeugt ein neues,
   das alte bleibt liegen, solange ein Stand darauf zeigt.
3. **Schadensstand-Ausdruck** geht noch über den Druckdialog des Browsers,
   also mit Kopf- und Fusszeile samt interner Adresse. Umstellen auf die
   selbst erzeugte PDF wie beim Fahrzeug-PDF — zurückgestellt.
4. Optional: QR-Code für die Kennung, falls das Abtippen nervt.

Offen gelassen, bewusst: ob Schadensstände im Alltag überhaupt genutzt werden.
Einschätzung aus dem Betrieb — der Effekt kommt daher, dass der Kunde die
Dokumentation *sieht*, nicht daher, dass sie beweisbar eingefroren ist.

---

## Bekannte Grenzen

- Keine Anbindung an rentsoft. Die Kennung wird von Hand übertragen.
- Kein Rechtekonzept: wer angemeldet ist, darf alles. Für einen Betrieb
  dieser Grösse angemessen.
- Kein QR-Code für die Kennung. Liesse sich nachrüsten, falls das Abtippen
  im Alltag stört.
- Browserdaten löschen entfernt auch die lokalen Daten. Mit eingerichtetem
  Abgleich sind sie nach der nächsten Anmeldung wieder da, sonst hilft nur das
  Export-Backup. Safari im privaten Modus sperrt IndexedDB — die App meldet das.
