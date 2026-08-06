# Woher die Fahrzeugzeichnungen stammen

Diese Datei ist der Nachweis. Wer eine Form ergänzt, trägt sie hier ein —
sonst weiß in zwei Jahren niemand mehr, woher eine Zeichnung kommt und was
damit erlaubt ist.

## Übernommene Vorlagen

| Kennung | Datei | Quelle | Erlaubnis |
|---|---|---|---|
| `transporter` | `2025-mercedes-sprinter-v07-1-20scale.pdf` | ANJ Graphics, kostenlose Vektorvorlage | Per Mail angefragt am 5.8.2026, Zusage erhalten: *„That wouldn't be an issue"* — mit der Bitte, das fertige Ergebnis zu zeigen. |

**Offen:** ANJ das fertige Beispiel-PDF schicken. Das war ihre einzige Bedingung.

## Selbst gezeichnet

`pkw-kompakt` und `neunsitzer` in `js/skizze.js` sind von Hand gezeichnet und
gehören uns. Sie bleiben als Notnagel stehen, bis für ihre Klasse eine bessere
Vorlage da ist.

## Was beim Übernehmen entfernt wird

- Beschriftung und Maßlinien — passiert automatisch
- Kleinkram unter 0,7 Rastereinheiten — auf dem Protokoll ohnehin unsichtbar
- Ausreißer-Strecken: gelegentlich zieht der Zeichner eine Gerade quer durch
  ein Bauteil, statt abzusetzen. In der Sprinter-Draufsicht liefen so zwei
  Linien von der Motorhaube in die Scheibe. Erkennbar daran, dass sie um ein
  Vielfaches länger sind als alles andere im selben Pfad — der Pfad wird dort
  aufgetrennt, nicht weggeworfen.
- Markenzeichen — nur falls welche drin sind, über `--weg ansicht:x,y,r`

**Beim Sprinter waren keine Markenzeichen drin.** Ich hatte zuerst einen Ring
im Kühlergrill für den Stern gehalten und entfernt — das war die Fassung des
Emblems, kein Emblem. Der Ring ist wieder drin. Vor dem Entfernen also
nachsehen, was man da eigentlich wegnimmt.

## Regeln für neue Vorlagen

1. **Vektor, nicht Bild.** PDF, EPS, AI oder SVG. Ein JPG oder PNG nützt nichts.
2. **Nutzung geklärt.** Kostenlos herunterladbar heißt nicht automatisch, dass
   es in ein eigenes Produkt darf. Im Zweifel den Anbieter fragen — das dauert
   eine Mail und steht danach hier in der Tabelle.
3. **Keine Wasserzeichen entfernen.** Wenn eine Datei ein Wasserzeichen trägt,
   ist sie nicht lizenziert. Dann entweder kaufen oder eine andere nehmen.
4. **Möglichst aus einer Serie.** Nebeneinander auf einem Blatt fällt sofort
   auf, wenn die Zeichnungen von verschiedenen Händen stammen.

## Aufruf

```
cd werkzeuge
python3 vorlage-uebernehmen.py vorlage.pdf kennung "Name" "Hinweis" rechts \
    --weg vorn:18.6,26.0,2.4 > teil.js
```

`rechts` sagt, wohin die Nase in der **oberen** Seitenansicht zeigt. Das kann
das Werkzeug nicht selbst erkennen, und wenn es falsch steht, sind links und
rechts vertauscht — auf einem Schadendokument der schlimmste denkbare Fehler.
Also einmal hinsehen.
