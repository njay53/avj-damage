#!/usr/bin/env python3
"""Liest Vektorpfade aus einer PDF-Zeichnung.

Gebraucht fuer die Schadenskizze: fertige Fahrzeugvorlagen liegen als PDF vor,
die Umrisse darin sind Pfade. Dieses Werkzeug holt sie heraus, damit sie in
das Format von js/skizze.js ueberfuehrt werden koennen.

Bewusst ohne PDF-Bibliothek: die Vorlagen sind haeufig leicht beschaedigt
(kaputte Sprungtabelle), und kein Leser kommt damit klar. Der Inhaltsstrom
selbst ist aber heil, und mehr braucht es nicht.
"""

import re
import sys
import zlib


def inhaltsstrom(pfad):
    """Holt den Seiteninhalt heraus, ohne auf die Sprungtabelle zu bauen."""
    d = open(pfad, "rb").read()

    # Das groesste FlateDecode-Objekt ist der Seiteninhalt. Metadaten und
    # Objektstroeme sind um Groessenordnungen kleiner.
    bester = None
    for m in re.finditer(rb"(\d+) 0 obj", d):
        start = m.end()
        kopf_ende = d.find(b"stream", start)
        if kopf_ende < 0 or kopf_ende - start > 400:
            continue
        kopf = d[start:kopf_ende]
        if b"FlateDecode" not in kopf:
            continue
        s = kopf_ende + len(b"stream")
        if d[s:s + 1] == b"\r":
            s += 1
        if d[s:s + 1] == b"\n":
            s += 1
        e = d.find(b"endstream", s)
        if e < 0:
            continue
        try:
            roh = zlib.decompress(d[s:e])
        except zlib.error:
            continue
        if bester is None or len(roh) > len(bester):
            bester = roh
    if bester is None:
        raise SystemExit("Kein lesbarer Inhaltsstrom gefunden.")
    return bester.decode("latin1")


def pfade(text):
    """Zerlegt den Inhaltsstrom in einzelne Zuege.

    Zurueck kommt je Zug: die Befehle in Nutzerkoordinaten und ob er
    gefuellt oder nur gestrichen wurde. Gefuellte Zuege sind meist Text
    oder Flaechen, gestrichene meist Konturen.
    """
    zahl = r"-?\d*\.?\d+"
    marke = re.compile(
        r"(" + zahl + r")\s+(" + zahl + r")\s+(" + zahl + r")\s+(" + zahl + r")\s+"
        r"(" + zahl + r")\s+(" + zahl + r")\s+(c)\b"
        r"|(" + zahl + r")\s+(" + zahl + r")\s+([ml])\b"
        r"|(" + zahl + r")\s+(" + zahl + r")\s+(" + zahl + r")\s+(" + zahl + r")\s+(re)\b"
        r"|\b(h|n|S|s|f\*?|F|B\*?|b\*?|W\*?|q|Q)\b"
        r"|(" + zahl + r")\s+(" + zahl + r")\s+(" + zahl + r")\s+(" + zahl + r")\s+"
        r"(" + zahl + r")\s+(" + zahl + r")\s+(cm)\b"
    )

    ctm = [1, 0, 0, 1, 0, 0]
    stapel = []
    ergebnis = []
    laufend = []

    def wandle(x, y):
        a, b, c, d, e, f = ctm
        return (a * x + c * y + e, b * x + d * y + f)

    def abschluss(art):
        nonlocal laufend
        if laufend:
            ergebnis.append({"art": art, "befehle": laufend})
        laufend = []

    for m in marke.finditer(text):
        g = m.groups()
        if g[6] == "c":
            p = [float(v) for v in g[0:6]]
            laufend.append(("C",) + wandle(p[0], p[1]) + wandle(p[2], p[3]) + wandle(p[4], p[5]))
        elif g[9] in ("m", "l"):
            x, y = float(g[7]), float(g[8])
            laufend.append((g[9].upper(),) + wandle(x, y))
        elif g[14] == "re":
            x, y, w, hh = [float(v) for v in g[10:14]]
            ecken = [wandle(x, y), wandle(x + w, y), wandle(x + w, y + hh), wandle(x, y + hh)]
            laufend.append(("M",) + ecken[0])
            for e in ecken[1:]:
                laufend.append(("L",) + e)
            laufend.append(("Z",))
        elif g[15] is not None:
            op = g[15]
            if op == "h":
                laufend.append(("Z",))
            elif op in ("S", "s"):
                if op == "s":
                    laufend.append(("Z",))
                abschluss("strich")
            elif op in ("f", "f*", "F", "B", "B*", "b", "b*"):
                abschluss("flaeche")
            elif op == "n":
                laufend = []
            elif op == "q":
                stapel.append(list(ctm))
            elif op == "Q":
                if stapel:
                    ctm = stapel.pop()
        elif g[22] == "cm":
            n = [float(v) for v in g[16:22]]
            a, b, c, d, e, f = ctm
            ctm = [
                n[0] * a + n[1] * c, n[0] * b + n[1] * d,
                n[2] * a + n[3] * c, n[2] * b + n[3] * d,
                n[4] * a + n[5] * c + e, n[4] * b + n[5] * d + f,
            ]

    abschluss("strich")
    return ergebnis


def rahmen(zug):
    xs, ys = [], []
    for b in zug["befehle"]:
        werte = b[1:]
        for i in range(0, len(werte), 2):
            xs.append(werte[i])
            ys.append(werte[i + 1])
    if not xs:
        return None
    return (min(xs), min(ys), max(xs), max(ys))


if __name__ == "__main__":
    zuege = pfade(inhaltsstrom(sys.argv[1]))
    print(len(zuege), "Züge")
    voll = [z for z in zuege if z["art"] == "flaeche"]
    strich = [z for z in zuege if z["art"] == "strich"]
    print(" davon gefüllt:", len(voll), " gestrichen:", len(strich))
