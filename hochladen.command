#!/bin/bash
#
# hochladen.command — lädt den aktuellen Stand nach GitHub
#
# Im Finder doppelklicken. Beim ersten Start fragt das Skript einmal nach der
# Repo-Adresse, danach genügt der Doppelklick.
#
# Passwörter oder Zugangsdaten werden hier nirgends gespeichert — beim ersten
# Hochladen fragt macOS danach und legt sie im Schlüsselbund ab.

cd "$(dirname "$0")" || exit 1

ende() {
  echo ""
  read -r -p "  Enter zum Schliessen "
  exit "${1:-0}"
}

echo ""
echo "  AVJ Schäden — Hochladen nach GitHub"
echo "  ───────────────────────────────────"
echo ""

# ---------------------------------------------------------------- git vorhanden?
# Achtung: auf dem Mac existiert /usr/bin/git auch ohne installierte
# Entwicklerwerkzeuge — es ist nur eine Hülle, die den Installationsdialog
# auslöst. Deshalb wird hier ein echter Aufruf getestet, nicht bloss der Pfad.
if ! git --version >/dev/null 2>&1; then
  echo "  Auf diesem Mac fehlen noch die Entwicklerwerkzeuge, zu denen git gehört."
  echo ""
  echo "  So installierst du sie:"
  echo "    1. Terminal öffnen (Spotlight: Cmd+Leertaste, 'Terminal')"
  echo "    2. Diese Zeile eingeben und Enter drücken:"
  echo ""
  echo "         xcode-select --install"
  echo ""
  echo "    3. Im Fenster auf 'Installieren' klicken und warten (ein paar Minuten)"
  echo "    4. Danach dieses Skript erneut doppelklicken"
  echo ""
  echo "  Alternative ohne Installation: die Dateien von Hand über"
  echo "  'Add file' → 'Upload files' auf github.com hochladen."
  ende 1
fi

# ---------------------------------------------------------------- Adresse prüfen
# Erlaubt sind:  https://github.com/nutzer/repo(.git)
#                git@github.com:nutzer/repo.git
#                nutzer/repo          (Kurzform)
adresse_normalisieren() {
  local eingabe="$1"
  eingabe="$(echo "$eingabe" | tr -d '[:space:]')"

  case "$eingabe" in
    https://github.com/*|git@github.com:*)
      echo "$eingabe"
      ;;
    */*)
      # Kurzform nutzer/repo. Der Nutzername darf keinen Punkt enthalten —
      # daran erkennt man eine Web-Adresse wie njay53.github.io/avj-damage.
      # Der Repo-Name dagegen darf Punkte haben (njay53/njay53.github.io).
      local nutzer="${eingabe%%/*}"
      local rest="${eingabe#*/}"
      case "$eingabe" in http*) echo ""; return ;; esac
      case "$nutzer" in
        *.*) echo "" ;;
        "") echo "" ;;
        *)
          case "$rest" in
            */*) echo "" ;;                       # mehr als zwei Ebenen
            "")  echo "" ;;
            *)   echo "https://github.com/${nutzer}/${rest%.git}.git" ;;
          esac
          ;;
      esac
      ;;
    *)
      echo ""
      ;;
  esac
}

adresse_erfragen() {
  echo "  Die Repo-Adresse ist NICHT die Adresse der Webseite."
  echo ""
  echo "    falsch:   njay53.github.io"
  echo "    richtig:  https://github.com/njay53/avj-damage.git"
  echo "    oder kurz: njay53/avj-damage"
  echo ""
  echo "  Du findest sie auf github.com im Repo unter dem grünen Knopf 'Code'."
  echo ""
  while true; do
    read -r -p "  Repo-Adresse: " EINGABE
    [ -z "$EINGABE" ] && { echo "  Nichts eingegeben — abgebrochen."; ende 1; }
    NEUE_ADRESSE="$(adresse_normalisieren "$EINGABE")"
    if [ -n "$NEUE_ADRESSE" ]; then
      echo "  → $NEUE_ADRESSE"
      echo ""
      return 0
    fi
    echo "  Das sieht nicht nach einer Repo-Adresse aus. Nochmal bitte."
    echo ""
  done
}

# ---------------------------------------------------------------- Einrichtung
if [ ! -d .git ]; then
  echo "  Noch nicht mit GitHub verbunden."
  echo ""
  adresse_erfragen
  git init -q -b main 2>/dev/null || { git init -q; git branch -M main; }
  git remote add origin "$NEUE_ADRESSE"
  echo "  Verbunden mit $NEUE_ADRESSE"
  echo ""
else
  VORHANDEN="$(git remote get-url origin 2>/dev/null)"
  GEPRUEFT="$(adresse_normalisieren "$VORHANDEN")"
  if [ -z "$GEPRUEFT" ]; then
    echo "  Die hinterlegte Adresse ist unbrauchbar: ${VORHANDEN:-keine}"
    echo ""
    adresse_erfragen
    git remote remove origin 2>/dev/null
    git remote add origin "$NEUE_ADRESSE"
    echo "  Adresse korrigiert."
    echo ""
  fi
fi

# ---------------------------------------------------------------- Änderungen
git add -A

if git diff --cached --quiet 2>/dev/null; then
  echo "  Keine Änderungen — es gibt nichts hochzuladen."
  ende 0
fi

echo "  Diese Dateien haben sich geändert:"
git diff --cached --name-status | sed 's/^/    /'
echo ""

read -r -p "  Kurze Beschreibung (Enter für Datum): " NACHRICHT
[ -z "$NACHRICHT" ] && NACHRICHT="Stand vom $(date '+%d.%m.%Y %H:%M')"

if ! git commit -q -m "$NACHRICHT"; then
  echo "  Commit fehlgeschlagen."
  echo "  Falls git nach Name und E-Mail fragt, einmal im Terminal setzen:"
  echo "    git config --global user.name \"Dein Name\""
  echo "    git config --global user.email \"deine@mail.de\""
  ende 1
fi

echo "  Lade hoch nach $(git remote get-url origin) …"
echo ""

if git push -u origin main; then
  echo ""
  echo "  Fertig. GitHub Pages braucht ein bis zwei Minuten."
  echo ""
  echo "  WICHTIG: Auf iPhone und iPad die Seite einmal neu laden,"
  echo "  sonst zeigt der Zwischenspeicher noch die alte Fassung."
else
  echo ""
  echo "  Hochladen fehlgeschlagen. Häufigste Gründe:"
  echo "    · GitHub-Anmeldung fehlt oder wurde abgelehnt"
  echo "    · das Repo existiert noch nicht — auf github.com anlegen"
  echo "    · im Repo liegt schon etwas, das hier fehlt"
  echo "      (dann einmal im Terminal: git pull --rebase origin main)"
  echo ""
  echo "  Adresse ändern: git remote set-url origin NEUE-ADRESSE"
fi

ende 0
