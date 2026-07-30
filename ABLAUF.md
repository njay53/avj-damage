# Ablauf bei Änderungen

Kurzfassung zum Nachschlagen. Ausführlich steht alles in der README.

## Normaler Weg — ohne Terminal

1. Claude sagen, was geändert werden soll. Er schreibt direkt in diesen Ordner.
2. **`testen.command`** doppelklicken → prüft alles, schreibt `testergebnis.txt`
3. Claude sagen „Test ist durch" → er liest die Datei
4. **`hochladen.command`** doppelklicken → Beschreibung eintippen, Enter
5. Auf iPhone/iPad die Seite einmal neu laden

Schritt 2 und 3 kann man weglassen, wenn es nur um Text oder Farben ging.

## Falls doch mal das Terminal nötig ist

In den Ordner wechseln: `cd ` tippen, dann den Ordner aus dem Finder ins
Terminal ziehen, Enter.

| Zweck | Befehl |
|---|---|
| Testwerkzeuge holen (einmalig) | `npm install` |
| Test ausführen | `npm test` |
| Test in Datei schreiben | `npm test > testergebnis.txt 2>&1` |
| Stand ansehen | `git status` |
| Gemerkte GitHub-Anmeldung löschen | `printf "protocol=https\nhost=github.com\n" \| git credential-osxkeychain erase` |

## Wenn etwas klemmt

**„Konnte nicht ausgeführt werden, da du nicht über die notwendigen
Zugriffsrechte verfügst"** — dem Skript fehlt die Ausführungsberechtigung.
Das passiert immer, wenn Claude ein neues Skript anlegt: er darf Dateien
schreiben, aber dieses Recht nicht vergeben. Einmal im Terminal setzen, danach
bleibt es:

```
chmod +x "/Users/niran/Documents/Claude Cowork/avj programme/fahrzeugprotokoll/testen.command"
```

Für jedes andere Skript denselben Befehl mit dem passenden Dateinamen.

**Neue Fassung erscheint nicht auf dem Gerät** — in `sw.js` steht oben
`CACHE_VERSION`. Die muss bei jeder Änderung hochgezählt werden, sonst laden
die Geräte die alte Fassung aus dem Zwischenspeicher. Claude macht das
automatisch mit. Zur Not: Icon vom Homescreen löschen und neu ablegen.

**Hochladen wird abgelehnt** — meist liegt auf GitHub etwas, das lokal fehlt.
Das Skript bietet dann das Zusammenführen an.

**`CNAME` niemals löschen** — darin steht `avj-damage.rent-in-nom.de`. Ohne
diese Datei ist die App nur noch unter der github.io-Adresse erreichbar.

## Wichtige Dateien

| Datei | Wofür |
|---|---|
| `index.html` | Aufbau der Oberfläche |
| `css/app.css` | Aussehen |
| `js/annotate.js` | Foto markieren und zoomen |
| `js/fleet.js` | Fuhrpark und Schadensregister |
| `js/snapshot.js` | Schadensstände und Kennungen |
| `js/store.js` | Datenhaltung |
| `js/cloud.js` | Abgleich mit dem Server |
| `sw.js` | Offline-Betrieb, Cache-Version |
| `CNAME` | eigene Domain |
