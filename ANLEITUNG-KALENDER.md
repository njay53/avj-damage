# HU-Kalender einrichten

Ziel: ein Kalender auf iPhone und iPad, der sich **von allein aktualisiert**.
HU-Termin in der App ändern — Kalender zieht nach. Neues Fahrzeug anlegen —
Termin erscheint. Fahrzeug archivieren — Termin verschwindet.

Einmalige Einrichtung, danach nie wieder. Dauert etwa zehn Minuten.

---

## Schritt 1 — Ein Wort ausdenken

Der Kalender kann sich nicht anmelden. Statt eines Passworts steckt ein langes
Zufallswort in der Adresse. Denk dir eines aus oder lass es dir vom
Passwortmanager erzeugen: **mindestens 20 Zeichen**, Buchstaben und Zahlen,
keine Umlaute, keine Leerzeichen.

Beispiel für die Länge (nimm nicht dieses):

```
k7Qf2mXbT4wRn9sJhL3v
```

Schreib es dir auf, du brauchst es zweimal.

---

## Schritt 2 — Wort bei Supabase hinterlegen

1. Supabase öffnen, dein Projekt wählen.
2. Links unten **Project Settings** (Zahnrad).
3. Im Menü **Edge Functions** anklicken.
4. Abschnitt **Secrets** → **Add new secret**.
5. Name: `KALENDER_TOKEN` — genau so geschrieben, gross, mit Unterstrich.
   Value: dein Wort aus Schritt 1.
6. **Save** / **Add secret**.

Gleich noch ein zweites Geheimnis anlegen, die Funktion braucht es zum Lesen:

7. Nochmal **Add new secret**.
8. Name: `SB_SECRET_KEY`
   Value: den Schlüssel, der mit **`sb_secret_`** anfängt.
   Den findest du unter **Project Settings → API Keys**. Achtung: das ist
   *nicht* der `sb_publishable_`-Schlüssel aus der App, sondern der geheime
   daneben. Er bleibt bei Supabase und taucht nirgends im Browser auf.
9. Speichern.

---

## Schritt 3 — Funktion anlegen

1. Links in der Seitenleiste **Edge Functions**.
2. Knopf **Deploy a new function** → **Via Editor**.
3. Als Namen eintragen: `hu-kalender` — genau so, klein, mit Bindestrich.
4. Den kompletten Inhalt der Datei **`supabase-hu-kalender.ts`** in den Editor
   einfügen. Vorhandenen Beispielcode vorher löschen.
5. **Wichtig, bevor du deployst:** such nach der Einstellung **Verify JWT**
   und schalte sie **aus**. Sie steht je nach Ansicht direkt beim Deployen oder
   danach unter *Function Settings → Verify JWT / Enforce JWT*.

   Ohne das antwortet die Funktion jedem mit „401" — auch dem Kalender, denn
   der kann sich nicht anmelden. Den Schutz übernimmt bei uns das Wort in der
   Adresse.
6. **Deploy function**.

Nach ein paar Sekunden steht die Funktion in der Liste.

---

## Schritt 4 — Prüfen, ob sie antwortet

Bau dir die Adresse zusammen:

```
https://DEINPROJEKT.supabase.co/functions/v1/hu-kalender?token=DEINWORT
```

`DEINPROJEKT` ist der Teil, der auch in der Projekt-URL in der App steht.

Ruf sie im Browser auf. Richtig ist, wenn eine Datei heruntergeladen wird oder
ein Text erscheint, der mit `BEGIN:VCALENDAR` anfängt.

Wenn stattdessen etwas anderes kommt:

| Meldung | Ursache |
|---|---|
| `401 Nicht berechtigt` | Wort in der Adresse stimmt nicht mit `KALENDER_TOKEN` überein |
| `401 Invalid JWT` oder ähnlich | **Verify JWT** ist noch an (Schritt 3.5) |
| `Funktion ist nicht vollstaendig eingerichtet` | `SB_SECRET_KEY` fehlt |
| `Datenbank nicht erreichbar` | Falscher Schlüssel bei `SB_SECRET_KEY` |
| Leerer Kalender ohne Fehler | Passt — es hat nur noch kein Fahrzeug einen HU-Monat |

---

## Schritt 5 — Auf dem iPhone abonnieren

Der bequeme Weg über die App:

1. Schadenmanager öffnen → **Zahnrad** → Karte **HU-Kalender abonnieren**.
2. Dein Wort ins Feld **Kalenderwort** eintragen.
3. **Kalender abonnieren** antippen. iOS fragt nach — bestätigen und einen
   Kalender auswählen bzw. den neuen anlegen lassen.

Falls das nicht greift, der Weg von Hand:

1. **Einstellungen** → **Apps** → **Kalender** → **Accounts**
   (auf älteren iOS-Fassungen: Einstellungen → Kalender → Accounts).
2. **Account hinzufügen** → **Andere** → **Kalenderabo hinzufügen**.
3. Die Adresse aus Schritt 4 einfügen → **Weiter** → **Sichern**.

Auf dem zweiten Gerät genauso. Die Adresse kannst du dir in der App über
**Adresse kopieren** in die Zwischenablage legen.

---

## Wie oft wird aktualisiert?

Das bestimmt iOS, nicht wir. Die Funktion schlägt sechs Stunden vor. Einstellen
lässt es sich unter *Einstellungen → Apps → Kalender → Accounts → Abonnierte
Kalender → Aktualisierung*. Für HU-Termine reicht täglich locker.

Ein geänderter Termin ist also nicht in derselben Minute im Kalender — aber
spätestens am nächsten Tag, und das Jahre im Voraus.

---

## Was dabei sichtbar wird

In der Kalenderdatei stehen Fahrzeugname, Kennzeichen, VIN falls gepflegt und
der HU-Monat. **Keine Fotos, keine Schäden, keine Beträge, keine Kundendaten.**

Der Schutz ist allein das Wort in der Adresse. Wer sie hat, sieht diese Liste.
Deshalb: die Adresse nicht in Chats weitergeben, nicht auf Zettel schreiben,
die herumliegen. Braucht jemand keinen Zugriff mehr, änderst du einfach das
`KALENDER_TOKEN` bei Supabase — dann sind alle alten Adressen tot und du
abonnierst auf deinen Geräten neu.

---

## Wieder loswerden

- **Abo entfernen:** Einstellungen → Apps → Kalender → Accounts → das
  Abonnement → Account löschen.
- **Funktion abschalten:** Supabase → Edge Functions → `hu-kalender` → löschen.
  Die Termine in der App bleiben davon unberührt, ebenso der Knopf
  „HU in Kalender" für einzelne Fahrzeuge.
