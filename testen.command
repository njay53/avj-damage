#!/bin/bash
#
# testen.command — führt den Funktionstest aus und schreibt das Ergebnis
# in testergebnis.txt, damit Claude es lesen kann.
#
# Im Finder doppelklicken. Beim ersten Start werden die Testwerkzeuge geholt.

cd "$(dirname "$0")" || exit 1

ende() {
  echo ""
  read -r -p "  Enter zum Schliessen "
  exit "${1:-0}"
}

echo ""
echo "  AVJ Schäden — Funktionstest"
echo "  ───────────────────────────"
echo ""

if ! node --version >/dev/null 2>&1; then
  echo "  Node.js fehlt auf diesem Mac."
  echo "  Zu holen als LTS-Fassung von nodejs.org, dann Terminal neu öffnen."
  ende 1
fi

if [ ! -d node_modules ]; then
  echo "  Erster Start — hole die Testwerkzeuge (dauert etwa eine Minute) …"
  echo ""
  if ! npm install; then
    echo ""
    echo "  Installation fehlgeschlagen. Ohne Netz geht es nicht."
    ende 1
  fi
  echo ""
fi

echo "  Test läuft …"
npm test > testergebnis.txt 2>&1
STATUS=$?

echo ""
if [ $STATUS -eq 0 ]; then
  echo "  ✓ ALLE PRÜFUNGEN BESTANDEN"
else
  echo "  ✗ Es gab Fehler:"
  echo ""
  grep -E "^  FEHL" testergebnis.txt | sed 's/^/  /' | head -20
  echo ""
  echo "  Vollständige Ausgabe steht in testergebnis.txt."
fi

echo ""
echo "  Ergebnis liegt in:  testergebnis.txt"
echo "  Claude kann die Datei direkt lesen — einfach Bescheid sagen."
ende 0
