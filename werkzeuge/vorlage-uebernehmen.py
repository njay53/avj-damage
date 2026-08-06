#!/usr/bin/env python3
"""Macht aus einer PDF-Fahrzeugvorlage die Pfaddaten fuer js/skizze.js.

Solche Vorlagen enthalten vier gezeichnete Ansichten, dazu Beschriftung und
Masslinien. Beides muss weg, die Ansichten muessen auseinandersortiert und auf
ein gemeinsames Raster gerechnet werden.

Sortiert wird nicht nach Anordnung auf dem Blatt — die schwankt von Vorlage zu
Vorlage, und die Masslinien laufen quer darueber hinweg. Stattdessen werden
Zuege, die einander beruehren oder dicht beieinander liegen, zu Gruppen
zusammengefasst. Eine Fahrzeugansicht ist eine dichte Gruppe, ein Wort ist
eine kleine, eine Masslinie eine lange flache. Die fuenf groessten Gruppen
sind die Ansichten.

Was das Werkzeug NICHT selbst entscheiden kann, ist die Blickrichtung: ob die
obere Seitenansicht die linke oder die rechte Fahrzeugseite zeigt, laesst sich
aus den Pfaden nicht ableiten. Das steht als Angabe dabei — lieber einmal
hinsehen als links und rechts vertauschen.

Aufruf:
    python3 vorlage-uebernehmen.py datei.pdf kennung "Name" "Hinweis" [nase-oben]

    nase-oben   in welche Richtung die Nase in der OBEREN Seitenansicht
                zeigt: "rechts" (Standard) oder "links"

Zusaetzlich:
    --weg ansicht:x,y,r   entfernt alles innerhalb eines Kreises. Gebraucht
                          fuer Markenzeichen im Kuehlergrill oder am Heck.
                          Koordinaten im fertigen Raster, mehrfach erlaubt.
    --grob N              laesst Kleinkram unter N Einheiten Ausdehnung weg
                          (Standard 0.7 — darunter ist auf dem Protokoll
                          ohnehin nichts mehr zu sehen)
    --draufsicht-wenden   dreht die Draufsicht um, falls die Nase nach dem
                          Aufrichten rechts statt links liegt
"""

import json
import sys

sys.path.insert(0, __file__.rsplit("/", 1)[0])
from vektor_lesen import inhaltsstrom, pfade, rahmen   # noqa: E402

RAND = 3.0        # Luft um die Zeichnung, in Rastereinheiten
ZIEL = 94.0       # so breit wird die Seitenansicht
NAEHE = 12.0      # ab welchem Abstand zwei Zuege als zusammengehoerig gelten
GERADE = 0.08     # bis zu welcher Abweichung eine Kurve als Gerade durchgeht
SPRUNG = 6.0      # ab welcher Laenge eine Ausreisser-Strecke abgetrennt wird

# Zur Wahl von GERADE: 0.35 war zu grob. Runde Enden — die Sicken im Dach,
# die Kante der Motorhaube — wurden dabei zu Pfeilspitzen, weil ein ganzer
# Bogen durch seine Sehne ersetzt wurde. Unter 0.1 bleibt die Form erhalten
# und es faellt trotzdem noch ein gutes Drittel Datenmenge weg.


def seitenhoehe(zuege):
    h = 0.0
    for zug in zuege:
        for b in zug["befehle"]:
            for i in range(2, len(b), 2):
                h = max(h, b[i])
    return h + 1


def kaesten(zuege, hoehe):
    raus = []
    for zug in zuege:
        r = rahmen(zug)
        if r:
            raus.append((zug, (r[0], hoehe - r[3], r[2], hoehe - r[1])))
    return raus


def gruppiere(eintraege, naehe=NAEHE):
    """Zuege, die einander beruehren, gehoeren zusammen."""
    n = len(eintraege)
    vater = list(range(n))

    def finde(a):
        while vater[a] != a:
            vater[a] = vater[vater[a]]
            a = vater[a]
        return a

    def vereine(a, b):
        ra, rb = finde(a), finde(b)
        if ra != rb:
            vater[rb] = ra

    for i in range(n):
        ax1, ay1, ax2, ay2 = eintraege[i][1]
        for j in range(i + 1, n):
            bx1, by1, bx2, by2 = eintraege[j][1]
            if ax1 - naehe <= bx2 and bx1 - naehe <= ax2 \
               and ay1 - naehe <= by2 and by1 - naehe <= ay2:
                vereine(i, j)

    aus = {}
    for i in range(n):
        aus.setdefault(finde(i), []).append(i)
    return list(aus.values())


def gruppenrahmen(eintraege, idx):
    xs, ys = [], []
    for i in idx:
        k = eintraege[i][1]
        xs += [k[0], k[2]]
        ys += [k[1], k[3]]
    return min(xs), min(ys), max(xs), max(ys)


def ansichten_finden(eintraege):
    """Die fuenf groessten Gruppen sind die Ansichten. Welche welche ist,
       ergibt sich aus Seitenverhaeltnis und Lage."""
    gruppen = []
    for idx in gruppiere(eintraege):
        r = gruppenrahmen(eintraege, idx)
        gruppen.append({
            "idx": idx, "rahmen": r,
            "flaeche": (r[2] - r[0]) * (r[3] - r[1]),
        })
    gruppen.sort(key=lambda g: -g["flaeche"])
    fuenf = gruppen[:5]
    if len(fuenf) < 5:
        raise SystemExit("Nur %d Ansichten gefunden — Vorlage anders aufgebaut?" % len(fuenf))

    def breite(g):
        return g["rahmen"][2] - g["rahmen"][0]

    def hoehe(g):
        return g["rahmen"][3] - g["rahmen"][1]

    # Die Draufsicht ist die einzige, die deutlich hoeher als breit ist.
    hoch = [g for g in fuenf if hoehe(g) > breite(g) * 1.6]
    if len(hoch) != 1:
        raise SystemExit("Draufsicht nicht eindeutig (%d Kandidaten)" % len(hoch))
    oben = hoch[0]
    rest = [g for g in fuenf if g is not oben]

    # Seitenansichten sind die beiden breitesten.
    rest.sort(key=lambda g: -breite(g) / hoehe(g))
    seiten = sorted(rest[:2], key=lambda g: g["rahmen"][1])
    stirn = sorted(rest[2:], key=lambda g: g["rahmen"][1])

    return {
        "oben": oben,
        "seite_oben": seiten[0], "seite_unten": seiten[1],
        "stirn_oben": stirn[0], "stirn_unten": stirn[1],
    }


def punkte(zug, hoehe):
    raus = []
    for b in zug["befehle"]:
        if b[0] == "Z":
            raus.append(("Z",))
        elif b[0] == "C":
            raus.append(("C", b[1], hoehe - b[2], b[3], hoehe - b[4], b[5], hoehe - b[6]))
        else:
            raus.append((b[0], b[1], hoehe - b[2]))
    return raus


def wende(befehle, achse):
    """Spiegelt an einer senkrechten Achse — aus rechts wird links."""
    raus = []
    for b in befehle:
        if b[0] == "Z":
            raus.append(("Z",))
            continue
        neu = [b[0]]
        for i in range(1, len(b), 2):
            neu += [achse - b[i], b[i + 1]]
        raus.append(tuple(neu))
    return raus


def drehen(befehle, ymax):
    """Draufsicht aufrichten: die Nase zeigt in der Vorlage nach unten oder
       oben, wir wollen sie links haben — wie in den Seitenansichten."""
    raus = []
    for b in befehle:
        if b[0] == "Z":
            raus.append(("Z",))
            continue
        neu = [b[0]]
        for i in range(1, len(b), 2):
            neu += [ymax - b[i + 1], b[i]]
        raus.append(tuple(neu))
    return raus


def masse(alle):
    xs, ys = [], []
    for befehle in alle:
        for b in befehle:
            for i in range(1, len(b), 2):
                xs.append(b[i])
                ys.append(b[i + 1])
    return min(xs), min(ys), max(xs), max(ys)


def sprungfrei(befehle, mindest):
    """Ausreisser-Strecken innerhalb eines Pfades abtrennen.

    In gekauften Vorlagen steht gelegentlich eine gerade Strecke quer durch
    ein Bauteil — der Zeichner ist mit gedruecktem Stift von einer Ecke zur
    naechsten gefahren, statt abzusetzen. Auf der Draufsicht des Sprinter
    laufen so zwei Linien von der Motorhaube in die Scheibe.

    Erkennbar sind sie daran, dass sie um ein Vielfaches laenger sind als
    alles andere im selben Pfad. Statt den ganzen Pfad wegzuwerfen — daran
    haengt die Motorhaubenkante — wird er an dieser Stelle aufgetrennt."""
    laengen = []
    letzter = None
    for b in befehle:
        if b[0] == "Z":
            continue
        ende = (b[5], b[6]) if b[0] == "C" else (b[1], b[2])
        if letzter is not None and b[0] == "L":
            laengen.append(((ende[0] - letzter[0]) ** 2 + (ende[1] - letzter[1]) ** 2) ** 0.5)
        letzter = ende
    if not laengen:
        return befehle
    laengen.sort()
    mitte = laengen[len(laengen) // 2]

    raus = []
    letzter = None
    for b in befehle:
        if b[0] == "Z":
            raus.append(b)
            letzter = None
            continue
        ende = (b[5], b[6]) if b[0] == "C" else (b[1], b[2])
        if b[0] == "L" and letzter is not None:
            weite = ((ende[0] - letzter[0]) ** 2 + (ende[1] - letzter[1]) ** 2) ** 0.5
            if weite > mindest and weite > mitte * 6:
                raus.append(("M", ende[0], ende[1]))     # absetzen statt ziehen
                letzter = ende
                continue
        raus.append(b)
        letzter = ende
    return raus


def strecken(befehle, toleranz):
    """Kurven, die praktisch gerade sind, als Gerade schreiben.

    Vorlagen aus Zeichenprogrammen bestehen fast nur aus Bezierkurven, auch
    dort, wo eine gerade Linie steht. Jede Kurve kostet drei Punktepaare
    statt einem. Bei einer Zeichnung, die spaeter vier Zentimeter breit ist,
    faellt der Unterschied ohnehin unter die Strichstaerke."""
    raus = []
    letzter = None
    for b in befehle:
        if b[0] == "C" and letzter is not None:
            x0, y0 = letzter
            x3, y3 = b[5], b[6]
            laenge = ((x3 - x0) ** 2 + (y3 - y0) ** 2) ** 0.5
            if laenge > 0:
                gerade = True
                for cx, cy in ((b[1], b[2]), (b[3], b[4])):
                    abstand = abs((x3 - x0) * (y0 - cy) - (x0 - cx) * (y3 - y0)) / laenge
                    if abstand > toleranz:
                        gerade = False
                        break
                if gerade:
                    raus.append(("L", x3, y3))
                    letzter = (x3, y3)
                    continue
        raus.append(b)
        if b[0] in ("M", "L"):
            letzter = (b[1], b[2])
        elif b[0] == "C":
            letzter = (b[5], b[6])
    return raus


def schreibe(befehle, faktor, xmin, ymin):
    t = []
    for b in befehle:
        if b[0] == "Z":
            t.append("Z")
            continue
        werte = []
        for i in range(1, len(b), 2):
            werte.append("%.1f,%.1f" % (
                RAND + (b[i] - xmin) * faktor,
                RAND + (b[i + 1] - ymin) * faktor,
            ))
        t.append(b[0] + " " + " ".join(werte))
    return " ".join(t)


def ausdehnung(befehle):
    xs, ys = [], []
    for b in befehle:
        for i in range(1, len(b), 2):
            xs.append(b[i])
            ys.append(b[i + 1])
    if not xs:
        return 0, 0, 0, 0, 0
    breite, hoehe = max(xs) - min(xs), max(ys) - min(ys)
    return breite, hoehe, (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, \
        (breite ** 2 + hoehe ** 2) ** 0.5


def aufraeumen(alle, faktor, xmin, ymin, weg, grob):
    """Doppelte Zuege, Kleinkram und Markenzeichen entfernen.

    Solche Vorlagen zeichnen fast jede Linie zweimal — einmal als Flaeche,
    einmal als Kontur. Fuer uns ist das nur doppelter Speicher. Und was
    kleiner als ein halber Millimeter im Ausdruck ist, kostet Platz, ohne
    dass es jemand sieht."""
    gesehen = set()
    raus = []
    entfernt = {"doppelt": 0, "klein": 0, "marke": 0}

    for befehle in alle:
        befehle = sprungfrei(befehle, SPRUNG / faktor)
        befehle = strecken(befehle, GERADE / faktor)
        text = schreibe(befehle, faktor, xmin, ymin)
        if text in gesehen:
            entfernt["doppelt"] += 1
            continue
        gesehen.add(text)

        # Ausdehnung im fertigen Raster beurteilen, nicht im Original
        skaliert = []
        for b in befehle:
            if b[0] == "Z":
                skaliert.append(("Z",))
                continue
            neu = [b[0]]
            for i in range(1, len(b), 2):
                neu += [RAND + (b[i] - xmin) * faktor, RAND + (b[i + 1] - ymin) * faktor]
            skaliert.append(tuple(neu))
        breite, hoehe, mx, my, diagonale = ausdehnung(skaliert)

        if diagonale < grob:
            entfernt["klein"] += 1
            continue
        if any((mx - wx) ** 2 + (my - wy) ** 2 < wr ** 2 and max(breite, hoehe) < wr * 2.2
               for wx, wy, wr in weg):
            entfernt["marke"] += 1
            continue
        raus.append((text, diagonale))
    return raus, entfernt


def main():
    argumente = [sys.argv[0]]
    weg = {}
    grob = 0.7
    draufsicht_wenden = False
    i = 1
    while i < len(sys.argv):
        a = sys.argv[i]
        if a == "--weg":
            i += 1
            ansicht, zahlen = sys.argv[i].split(":")
            x, y, r = [float(v) for v in zahlen.split(",")]
            weg.setdefault(ansicht, []).append((x, y, r))
        elif a == "--grob":
            i += 1
            grob = float(sys.argv[i])
        elif a == "--draufsicht-wenden":
            draufsicht_wenden = True
        else:
            argumente.append(a)
        i += 1
    sys.argv = argumente

    if len(sys.argv) < 4:
        raise SystemExit(__doc__)
    datei, kennung, anzeige = sys.argv[1], sys.argv[2], sys.argv[3]
    hinweis = sys.argv[4] if len(sys.argv) > 4 else ""
    nase_oben = sys.argv[5] if len(sys.argv) > 5 else "rechts"

    zuege = pfade(inhaltsstrom(datei))
    hoehe = seitenhoehe(zuege)
    eintraege = kaesten(zuege, hoehe)
    teile = ansichten_finden(eintraege)

    # Die obere Seitenansicht zeigt entweder die rechte oder die linke Seite.
    if nase_oben == "rechts":
        namen = {"seite_oben": "rechts", "seite_unten": "links"}
    else:
        namen = {"seite_oben": "links", "seite_unten": "rechts"}
    namen.update({"stirn_oben": "vorn", "stirn_unten": "hinten", "oben": "oben"})

    roh = {}
    for schluessel, gruppe in teile.items():
        alle = [punkte(eintraege[i][0], hoehe) for i in gruppe["idx"]]
        name = namen[schluessel]
        if name == "oben":
            _, _, _, ymax = masse(alle)
            alle = [drehen(b, ymax) for b in alle]
            if draufsicht_wenden:
                x1, _, x2, _ = masse(alle)
                alle = [wende(b, x1 + x2) for b in alle]
        roh[name] = alle

    # Ein Massstab fuer alle Ansichten. Sonst waere die Front so hoch wie das
    # ganze Fahrzeug lang.
    sx1, sy1, sx2, sy2 = masse(roh["links"])
    faktor = ZIEL / (sx2 - sx1)

    print("/* %s — aus einer Fahrzeugvorlage uebernommen." % anzeige)
    print("   Beschriftung und Masslinien sind entfernt, die Ansichten liegen")
    print("   auf einem gemeinsamen Massstab. Erzeugt von")
    print("   werkzeuge/vorlage-uebernehmen.py — nicht von Hand nachbessern,")
    print("   sondern die Vorlage neu einlesen. */")
    print("var %s = {" % kennung.upper().replace("-", "_"))
    print("  name: %s," % json.dumps(anzeige))
    print("  hinweis: %s," % json.dumps(hinweis))
    print("  ansichten: {")
    for name in ("links", "rechts", "vorn", "hinten", "oben"):
        alle = roh[name]
        x1, y1, x2, y2 = masse(alle)
        sauber, entfernt = aufraeumen(alle, faktor, x1, y1, weg.get(name, []), grob)
        print("    %s: { b: %.1f, h: %.1f, teile: [" % (
            name, (x2 - x1) * faktor + 2 * RAND, (y2 - y1) * faktor + 2 * RAND))
        laengste = max(d for _, d in sauber)
        for text, diagonale in sauber:
            stil = "vorlage_kontur" if diagonale >= laengste * 0.98 else "vorlage"
            print('      { stil: "%s", d: %s },' % (stil, json.dumps(text)))
        print("    ] },")
        sys.stderr.write("%-8s %3d Zuege (%d doppelt, %d klein, %d Marke)  %.1f x %.1f\n" % (
            name, len(sauber), entfernt["doppelt"], entfernt["klein"], entfernt["marke"],
            (x2 - x1) * faktor + 2 * RAND, (y2 - y1) * faktor + 2 * RAND))
    print("  }")
    print("};")


def nase_unten_erkennen(alle, x1, x2):
    """Nach dem Drehen: liegt die Nase rechts statt links?

    Die Nase ist das schmalere Ende — vorn laeuft die Karosserie zusammen,
    hinten steht sie senkrecht. Verglichen wird die Hoehe der Zeichnung im
    ersten und im letzten Zehntel."""
    schwelle = (x2 - x1) * 0.12
    links_y, rechts_y = [], []
    for befehle in alle:
        for b in befehle:
            for i in range(1, len(b), 2):
                x, y = b[i], b[i + 1]
                if x < x1 + schwelle:
                    links_y.append(y)
                elif x > x2 - schwelle:
                    rechts_y.append(y)
    if not links_y or not rechts_y:
        return False
    breit_links = max(links_y) - min(links_y)
    breit_rechts = max(rechts_y) - min(rechts_y)
    # Vorn laeuft die Karosserie zusammen, hinten steht sie breit und
    # senkrecht. Ist das linke Ende das breitere, liegt die Nase rechts.
    return breit_links >= breit_rechts


if __name__ == "__main__":
    main()
