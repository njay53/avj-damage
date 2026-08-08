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

### Muss Supabase mit?

Bei jedem Build gehört die Antwort dazu — ja oder nein, nicht „vielleicht".
Die Regel dahinter ist einfach:

- **Ja**, wenn sich `supabase-einrichten.sql` geändert hat. Das ist genau dann
  der Fall, wenn ein **neues Feld pro Datensatz** dazukommt (Beträge, Status,
  HU-Monat, Kategorien). Dann die Datei komplett in den SQL-Editor einfügen und
  ausführen — sie ist so gebaut, dass sie beliebig oft laufen darf und nichts
  überschreibt.
- **Nein** bei allem, was nur die Bedienung betrifft: Ansichten, Gesten,
  Knöpfe, Texte, Farben, PDF-Aufbau. Nichts davon wird gespeichert.

Der HU-Kalender ist getrennt davon: die Edge Function muss nur neu deployt
werden, wenn sich `supabase-hu-kalender.ts` ändert.

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

## Fuhrpark ordnen

**Beim Anlegen** gibt es über der Bezeichnung eine Schnellauswahl: Hersteller
antippen, das Modellfeld füllt sich, beides zusammen landet als Text in der
Bezeichnung. Danach ist das Feld ganz normal — ein „#3" hinten dran bleibt
auch erhalten, wenn du das Modell nochmal wechselst. Steht ein Fahrzeug nicht
in der Liste, wählst du „Anderer Hersteller" oder tippst direkt ins Textfeld.

Gespeichert wird ausschliesslich die **Bezeichnung**, nicht Hersteller und
Modell getrennt. Sonst gäbe es zwei Wahrheiten nebeneinander, und beim ersten
Fahrzeug, das nicht in die Liste passt, finge das Aufräumen an. Die Liste steht
in `js/modelle.js` und lässt sich dort jederzeit ergänzen — sie umfasst die
gängigen Marken samt Transportern und Kleinbussen, dazu die üblichen
Anhängerhersteller.


**Kategorien** legst du selbst an (Einstellungen → Kategorien): anlegen,
umbenennen, in der Reihenfolge schieben, löschen. Über der Übersicht stehen sie
als Chips — antippen filtert, nochmal antippen hebt auf. Eine gelöschte
Kategorie nimmt kein Fahrzeug mit; die Fahrzeuge stehen danach ohne Zuordnung
da. Der Filter überlebt kein Neuladen, sonst sucht man ein Fahrzeug, das ein
vergessener Filter versteckt.

**Ausblenden** ist für Langzeitmieten gedacht — Fahrzeuge, die man monatelang
nicht sieht. Sie verschwinden aus der Übersicht, ein Chip „Ausgeblendete · 3"
holt sie zurück. Der Chip erscheint nur, wenn es welche gibt.

**Zustandsaufnahmen** sind Fotos, die keinen Schaden zeigen: der heile Wagen
bei Übergabe einer Langzeitmiete, oder die Runde ums Auto beim Radwechsel. Sie
stehen in einem eigenen Bereich, zählen nicht in die Schadenszahl und wandern
nicht in einen Schadensstand. Ein- und ausschaltbar je Fahrzeug — ein
Bestandsfahrzeug mit lauter Altschäden braucht sie nicht.

Intern liegen sie in derselben Tabelle wie die Schäden, unterschieden durch
`kind`. Das spart eine Tabelle und macht das Umwidmen später leicht, falls sich
im Alltag zeigt, dass die Grenze woanders verläuft.

---

## Was ein Schaden gekostet hat — intern

Jeder Schaden hat einen internen Block: **Stand** (offen, ausgebessert,
repariert, bleibt so), **geschätzter Schaden**, **vom Mieter erhalten**,
**Reparatur gekostet** und die **Mietvertragsnummer**. Gepflegt wird das nicht
draussen beim Erfassen, sondern später am Schreibtisch — Schaden antippen, im
Detail den Block „Intern" aufklappen.

In der Fahrzeugansicht steht darüber die Bilanz: was Mieter gezahlt haben, was
Versicherungen erstattet haben, was Reparaturen gekostet haben, und was unter
dem Strich **an mir hängenbleibt**. Offene Schätzungen werden getrennt
ausgewiesen — eine Schätzung ist eine Erwartung, kein Geld, und hat in
derselben Summe nichts zu suchen.

Die Beschriftung ist bewusst so gewählt: es geht hier nicht um Ertrag, sondern
darum, wie viel ein Schaden am Ende gekostet hat. Dass mal etwas übrig bleibt,
kommt vor — der Normalfall über den ganzen Fuhrpark ist es nicht.

**Beträge sind standardmässig verdeckt** und erscheinen als `••••`. Ein Tipp
auf das Auge in der Kopfzeile zeigt sie, ein zweiter versteckt sie wieder. Der
Grund ist praktisch: man steht mit dem Telefon neben dem Kunden und geht die
Schäden durch — da soll nicht danebenstehen, was der letzte Mieter gezahlt hat.

**Nichts davon verlässt das Haus.** Weder die Schadenübersicht als PDF noch ein
eingefrorener Schadensstand noch die Druckansicht enthalten Beträge,
Vertragsnummer oder Bearbeitungsstand. Ein eingefrorener Stand kopiert diese
Felder gar nicht erst mit. Der Testlauf prüft das an vier Stellen — wenn eines
Tages doch ein Betrag ins Kundendokument rutscht, schlägt er an.

### Wenn eine Versicherung zahlt

Ein Auswahlfeld **Reguliert über**: *Mieter zahlt selbst* (der Regelfall und
die Voreinstellung), *Vollkasko — eigene Versicherung*, *Teilkasko — Glas,
Wild, Diebstahl*, *Haftpflicht — Gegner zahlt*, *Trage ich selbst*.

Nur bei den drei Versicherungsfällen erscheint das Feld **Versicherung
erstattet**. Im Regelfall ist es nicht da — die grossen Schäden sind selten und
dürfen die Maske nicht bestimmen.

Massgeblich ist immer, **was tatsächlich über das Konto gelaufen ist**. Rechnet
die Werkstatt direkt mit der Versicherung ab, steht bei „Reparatur gekostet"
nur die eigene Selbstbeteiligung und die Erstattung bleibt leer. Unter dem
Strich kommt dasselbe heraus wie beim Weg über die volle Rechnung.

Glasschaden als Beispiel: Frontscheibe wird getauscht, Teilkasko, eigene SB
150 €. Eintrag: Reparatur gekostet 150 €, sonst nichts → bleibt an mir 150 €.

Beispiel Transporter XL, Schaden 3.500 €, Selbstbeteiligung 2.000 €:

| Feld | Wert |
|---|---|
| Vom Mieter erhalten | 2.000 € |
| Versicherung erstattet | 1.500 € |
| Reparatur gekostet | 3.500 € |
| **Unter dem Strich** | **gedeckt** |

Beim Haftpflichtschaden bleibt „Vom Mieter erhalten" leer und die volle Summe
steht bei der Erstattung. Die Fahrzeugbilanz weist Mieterzahlungen und
Erstattungen getrennt aus — sonst sähe ein Fahrzeug ertragreich aus, das in
Wirklichkeit nur einmal gut versichert war.

### Zur Mietvertragsnummer

Sie ist der einzige Kundenbezug in der App, und sie ist einer: über rentsoft
lässt sich damit eine Person zuordnen. Der Bestand ist damit nicht mehr ganz so
neutral wie vorher — Namen stehen zwar keine drin, aber ein Pseudonym ist
datenschutzrechtlich trotzdem ein Personenbezug. Das ist bei einer internen
Betriebsdokumentation dieser Grösse handhabbar; wer es genau wissen will, fragt
den Steuerberater oder einen Datenschutzbeauftragten. Namen gehören auf keinen
Fall hinein.

---

## Nummern, Suche, Archiv

**Jedes Fahrzeug hat eine Nummer**, jeder Schaden darunter eine eigene. Der
dritte Schaden am Fahrzeug 1 heisst `1.3` — kurz genug, um sie am Telefon
durchzugeben oder in eine rentsoft-Notiz zu schreiben. Bestehende Einträge
wurden beim ersten Start nachnummeriert, in der Reihenfolge ihrer Anlage.

**Die Suche** oben im Fuhrpark nimmt alles: Kennzeichen, Bezeichnung, VIN,
Mietvertragsnummer, Schadennummer, Kennung eines Standes, Beschreibungstext.
Gross- und Kleinschreibung, Bindestriche und Leerzeichen sind egal — `nomja123`
findet `NOM-JA 123`. Ab zwei Zeichen tritt der Fuhrpark zurück und die Treffer
erscheinen, nach Fahrzeugen, Schäden und Ständen getrennt.

**Archiv statt löschen.** Der Knopf im Fahrzeug heisst „Archivieren …". Ein
Leasingfahrzeug, das zurückgeht, wandert dorthin: aus dem Fuhrpark raus, aber
mit allen Schäden erhalten und weiterhin über die Suche auffindbar. Denn die
Schadensfrage klärt sich manchmal erst, wenn der Wagen längst weg ist. Ein Chip
„Archiv · 3" über der Übersicht holt sie hervor; endgültig löschen geht
weiterhin, liegt aber bewusst nicht auf dem Hauptweg.

**Papierkorb für Schäden.** Ein gelöschter Schaden behält seine Fotos 30 Tage
und lässt sich in den Einstellungen zurückholen. Erst danach wird der Platz
freigegeben. Draussen am Fahrzeug, mit nassen Fingern, ist ein Fehlgriff eben
kein Weltuntergang mehr.

---

## HU-Termine

Je Fahrzeug lässt sich die nächste Hauptuntersuchung eintragen — als **Monat**,
nicht als Tag. Auf der Plakette steht Monat und Jahr, fällig ist das Fahrzeug
bis zum letzten Tag dieses Monats; ein Tagesdatum wäre erfunden. Ältere
Einträge mit Tag werden beim Start automatisch auf den Monat gekürzt.

Im Fuhrpark erscheint acht Wochen vor Monatsende eine gelbe Marke, danach eine
rote. Der Kalendereintrag liegt auf dem Monatsletzten.

Bewusst **ohne Automatik**: die App rechnet keinen Rhythmus hoch. Mietwagen
müssen jährlich vorgeführt werden, aber wer im abgelaufenen Monat hinfährt,
verschiebt damit die nächste Fälligkeit — ein automatisches „plus zwölf Monate"
wäre also regelmässig falsch. Den neuen Monat trägst du nach der Vorführung
selbst ein.

Erinnern lässt die App den **Kalender des Geräts** — der Knopf „HU in Kalender"
erzeugt einen Termin am Monatsletzten mit zwei Weckern: einer am Ersten des
Fälligkeitsmonats, einer zwei Wochen vor Ablauf. Danach meldet sich iOS von selbst, auch wenn die App
monatelang nicht geöffnet wird.

Bewusst **keine** Push-Nachrichten: die könnte eine Web-App auf dem iPhone zwar
seit iOS 16.4, aber nur mit einem Server, der sie verschickt. GitHub Pages ist
reine Ablage. Über Supabase wäre es machbar und für zwei Termine im Jahr je
Fahrzeug völlig unverhältnismässig — der Kalender kann das besser und
zuverlässiger.

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

Im Projekt → **SQL Editor** → **New query** → den kompletten Inhalt von
`supabase-einrichten.sql` einfügen und **Run** drücken.

Die Datei ist bewusst so geschrieben, dass sie **beliebig oft** ausgeführt
werden darf: jede Anweisung prüft vorher, ob es das schon gibt. Kommen später
neue Felder dazu, ändert sich nur diese Datei — du fügst sie erneut komplett
ein, und alles Bestehende samt Daten bleibt unangetastet. Deshalb gibt es hier
keine Liste einzelner Nachrüst-Befehle mehr.

Der wichtigste Teil darin ist der Zugriffsschutz (**Row Level Security**). Ohne
ihn könnte jeder, der die Adresse der App kennt, die Daten lesen — der
öffentliche Schlüssel steht ja im Browser. Mit ihm kommt nur durch, wer
angemeldet ist.

### 3. Benutzer anlegen

Projekt → **Authentication** → **Users** → **Add user**. E-Mail und Passwort
vergeben, „Auto Confirm User" anhaken. Ein Konto für den Betrieb reicht; man
kann sich damit auf allen Geräten anmelden.

Unter **Authentication → Providers → Email** sollte „Confirm email" für dieses
Konto nicht im Weg stehen, und Registrierung von aussen (`Enable signups`)
gehört ausgeschaltet — sonst könnte sich jeder selbst ein Konto anlegen und
käme an die Daten.

### Zu den Schlüsseln

Supabase hat die API-Schlüssel umgestellt. Projekte, die seit Ende 2025
angelegt wurden, haben die alten `eyJ…`-Schlüssel (anon, service_role) zwar
noch im Dashboard stehen, aber **nicht mehr aktiv** — sie werden mit
„Invalid API key" abgewiesen.

Richtig ist der Wert, der mit **`sb_publishable_`** beginnt (Project Settings →
API Keys). Bei älteren Projekten funktioniert weiterhin der anon-Schlüssel mit
`eyJ`. Die App kommt mit beiden zurecht, sie reicht den Wert nur als `apikey`
weiter.

Der `sb_secret_`-Schlüssel (früher service_role) gehört **nie** in die App: er
umgeht den Zugriffsschutz vollständig.

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

**Mehrere Fotos zu einem Schaden:** Über **Album** lassen sich beliebig viele
Bilder in einem Rutsch auswählen; sie landen in der Reihenfolge im Schaden, in
der sie ausgewählt wurden. Die **Kamera** liefert im Browser bauartbedingt immer
nur ein Foto und schliesst sich danach — eine Web-App kann keine Kamerasitzung
über mehrere Auslöser offen halten. Ersatz: direkt unter dem Foto steht der
Knopf **◉ Noch ein Foto**, ein Tipp und die Kamera ist wieder auf. Wer lieber
in einem Zug knipst, macht die Bilder in der Kamera-App des iPhones und holt
sie danach über **Album** alle auf einmal herein.

**Zurück:** Jeder Wechsel der Ansicht steht im Verlauf des Browsers. Damit
greift am iPhone der Wisch vom linken Bildschirmrand, in Safari genauso wie in
der Web-App vom Home-Bildschirm; zusätzlich horcht die App selbst auf diese
Geste, weil sie im Standalone-Modus nicht überall zuverlässig ankommt. Ist ein
Dialog offen, schliesst der erste Wisch erst ihn — beim Markieren eines Fotos
ist die Geste ganz aus, sonst wäre die Zeichnung mit einem Wisch weg.

**Schadenskizze:** Beim Erfassen eines Schadens unter *Stelle am Fahrzeug* die
Ansicht wählen und auf die Stelle tippen. Ab da steht die Schadennummer dort —
in der Fahrzeugansicht und auf **Seite 1 des PDF**, direkt unter den Kopfdaten.
Zwei Ebenen liegen übereinander:

- **Die Nummern** kommen aus den Schäden selbst. Nichts wird doppelt gepflegt:
  Schaden gelöscht → Nummer weg. Sitzen mehrere dicht beieinander, fasst die
  Skizze sie zu einem Punkt zusammen und schreibt „1, 2" daneben — genau das,
  was ein Papierprotokoll an einer Stelle macht.
- **Die freie Zeichnung** (`Skizze bemalen`) ist für alles ohne eigene Nummer:
  ein Bereich, der durchgehend verkratzt ist, ein Kreuz, eine Anmerkung. Sie
  hängt am Fahrzeug und lässt sich einzeln löschen, ohne die Nummern zu
  berühren.

Die Umrisse liegen als Kurven im PDF, nicht als Bild — scharf beim Zoomen und
im Ausdruck. Es gibt sie in zwei Sorten:

- **Übernommene Vorlagen** in `js/formen-vorlagen.js`. Fertig gezeichnete
  Fahrzeugvorlagen werden mit `werkzeuge/vorlage-uebernehmen.py` eingelesen:
  Beschriftung, Maßlinien und Markenzeichen fliegen raus, die fünf Ansichten
  werden auseinandersortiert und auf ein gemeinsames Raster gerechnet. Woher
  eine Vorlage stammt und was damit erlaubt ist, steht in
  `werkzeuge/HERKUNFT.md` — **da gehört jede neue Form eingetragen.**
- **Von Hand gezeichnete Formen** in `js/skizze.js`. Sie bleiben als Notnagel
  stehen, solange für eine Klasse noch keine Vorlage da ist. Sie sehen
  deutlich einfacher aus; das ist die Grenze dessen, was sich als
  Zahlenkolonne setzen lässt.

Übernommen ist bisher der **Transporter**. Von Hand gezeichnet sind
**PKW kompakt** und **9-Sitzer**. Kombi, Van, SUV und Koffer mit Ladebordwand
folgen. Die Form steht beim Fahrzeug und wird aus der Kategorie vorbelegt.

**Gebrauchsspuren:** Im Schadendetail gibt es den Kippschalter *Gebrauchsspur*
— für Oberflächliches ausserhalb der Schadensrechnung: Kratzer am Ladeboden,
Abrieb im Radkasten, Schrammen an Türkanten. Es bleibt derselbe Eintrag mit
derselben Nummer, nur die Einsortierung ändert sich. Umschalten geht in beide
Richtungen, weil sich die Einschätzung ändert.

Gebrauchsspuren zählen nicht in die Schadenszahl, stehen im eigenen Block beim
Fahrzeug, auf der Skizze in Grau und im PDF in einem eigenen Abschnitt unter
der Schadensliste.

**Zum Wortlaut im PDF, bewusst so:** Der Abschnitt heisst *Gebrauchsspuren* und
sagt nur *„Erfasst und im Einzelfall bewertet."* Kein Wort über Kosten. Jeder
Satz mit „wird nicht berechnet" wäre eine Einladung, unvorsichtig zu sein — und
er würde binden: Wer beim nächsten Mieter doch kassieren will, hält sonst sein
eigenes Dokument in der Hand, auf dem das Gegenteil steht.

**Was zusammengehört, gehört in einen Eintrag.** Ein Radkasten mit zwanzig
Kratzern ist eine Gebrauchsspur, nicht zwanzig. Dafür gibt es die Anzahl und
mehrere Fotos je Eintrag.

Ein Schalter in den Einstellungen blendet Gebrauchsspuren komplett aus —
Skizze und PDF zugleich, damit beim Verschicken keine Überraschung wartet.
Erfasst bleiben sie trotzdem.

**Kilometerstand:** Beim Erfassen freiwillig anzugeben, bei Schäden wie bei
Zustandsaufnahmen. Er steht **nicht** im Kundendokument, solange der Schalter
in den Einstellungen aus ist — bei einem älteren Schaden weiss man ihn ohnehin
nicht, und ein leeres Feld auf dem Blatt wirft mehr Fragen auf, als es klärt.

**Reparierte Schäden:** Im Schadendetail unter *Interne Angaben* steht der
Stand. Wird er auf **repariert** gesetzt, verschwindet der Schaden aus der
Liste, aus der Skizze, aus der Schadenszahl und aus dem Kunden-PDF — er ist ja
nicht mehr am Fahrzeug. Er landet beim Fahrzeug im zugeklappten Block
**Reparierte Schäden**, mit Fotos, Beträgen und optionalem Reparaturdatum.
Stand zurück auf *offen* holt ihn wieder nach vorn.

Nur *repariert* archiviert. *Ausgebessert* heißt, es sieht besser aus, ist aber
noch da; *bleibt so* heißt, es bleibt. Beide gehören weiter auf jedes Dokument.

Das Geld bleibt in jedem Fall in der Bilanz — es ist geflossen. Und ein
eingefrorener Schadensstand ändert sich nicht rückwirkend.

**Warum Schadennummern Lücken haben dürfen:** Eine gelöschte Nummer wird nie
neu vergeben. Sonst würde eine Notiz im rentsoft-Protokoll oder ein
verschicktes PDF, in dem „1.3" steht, plötzlich auf einen anderen Schaden
zeigen — und das merkt niemand. Auf dem Kundendokument sieht man die Lücken
nicht: dort zählt die Reihenfolge des Blattes, 1, 2, 3.

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

## Als Nächstes dran (Stand Build 23)

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
