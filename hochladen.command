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

geschafft() {
  echo ""
  echo "  Fertig. GitHub Pages braucht ein bis zwei Minuten."
  echo ""
  echo "  WICHTIG: Auf iPhone und iPad die Seite einmal neu laden,"
  echo "  sonst zeigt der Zwischenspeicher noch die alte Fassung."
}

hochladen() {
  echo "  Lade hoch nach $(git remote get-url origin) …"
  echo ""
  echo "  Falls nach Benutzername und Passwort gefragt wird:"
  echo "    Username = dein GitHub-Name"
  echo "    Password = das Token (beginnt mit github_pat_), NICHT das Kontopasswort"
  echo "    Beim Einfügen bleibt die Zeile leer — das ist normal."
  echo "    Nur EINMAL einfügen, dann Enter."
  echo ""

  local LOG
  LOG="$(mktemp -t avjpush)"

  git push -u origin main 2>&1 | tee "$LOG"
  local STATUS=${PIPESTATUS[0]}

  if [ "$STATUS" -eq 0 ]; then
    rm -f "$LOG"
    geschafft
    return 0
  fi

  # ------------------------------------------------------------------
  # Häufigster Fall beim allerersten Mal: auf GitHub liegt schon eine
  # README oder Lizenz, die beim Anlegen des Repos erzeugt wurde. Git
  # verweigert dann das Hochladen, um nichts zu überschreiben.
  # ------------------------------------------------------------------
  if grep -qiE "fetch first|non-fast-forward|rejected" "$LOG"; then
    echo ""
    echo "  Auf GitHub liegt bereits etwas, das hier fehlt —"
    echo "  meist die README, die beim Anlegen des Repos erzeugt wurde."
    echo ""
    echo "  Ich kann den Stand von GitHub holen und deinen daraufsetzen."
    echo "  Deine Dateien bleiben dabei erhalten."
    echo ""
    read -r -p "  Zusammenführen und nochmal versuchen? [j/n] " ANTWORT
    case "$ANTWORT" in
      j|J|ja|Ja|y|Y)
        echo ""
        if git pull --rebase origin main; then
          echo ""
          echo "  Zusammengeführt. Zweiter Versuch …"
          echo ""
          if git push -u origin main; then
            rm -f "$LOG"
            geschafft
            return 0
          fi
        else
          # Klassiker: beide Seiten haben eine README.md. Dann lässt sich das
          # nicht automatisch zusammenlegen.
          git rebase --abort 2>/dev/null
          echo ""
          echo "  Zusammenführen nicht möglich — dieselbe Datei wurde auf beiden"
          echo "  Seiten angelegt, fast immer die README.md."
          echo ""
          echo "  Das liegt derzeit auf GitHub:"
          git fetch -q origin main 2>/dev/null
          git log --oneline origin/main 2>/dev/null | sed 's/^/    /' | head -10
          echo ""
          git diff --name-only HEAD origin/main 2>/dev/null | sed 's/^/    /' | head -20
          echo ""
          echo "  Wenn dort nur die automatisch erzeugte README liegt, kannst du"
          echo "  deinen Stand durchsetzen. Alles, was oben steht, wird dabei"
          echo "  auf GitHub ersetzt. Deine Dateien hier bleiben unangetastet."
          echo ""
          read -r -p "  Stand auf GitHub mit deinem überschreiben? [j/n] " HART
          case "$HART" in
            j|J|ja|Ja|y|Y)
              echo ""
              if git push -u origin main --force; then
                rm -f "$LOG"
                geschafft
                return 0
              fi
              ;;
            *)
              echo "  Abgebrochen. Auf GitHub wurde nichts verändert."
              ;;
          esac
        fi
        ;;
      *)
        echo "  Abgebrochen. Es wurde nichts verändert."
        ;;
    esac
    rm -f "$LOG"
    return 1
  fi

  rm -f "$LOG"
  echo ""
  echo "  Hochladen fehlgeschlagen. Häufigste Gründe:"
  echo ""
  echo "    · Token falsch oder unvollständig eingefügt."
  echo "      Gemerkten Eintrag löschen und neu versuchen:"
  echo "        printf \"protocol=https\\nhost=github.com\\n\" | git credential-osxkeychain erase"
  echo ""
  echo "    · Das Repo existiert noch nicht — auf github.com anlegen."
  echo ""
  echo "  Der Commit bleibt erhalten. Dieses Skript einfach erneut starten —"
  echo "  es lädt dann den vorhandenen Stand hoch, ohne dass etwas verloren geht."
  return 1
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
  echo "  Terminal öffnen und eingeben:   xcode-select --install"
  echo "  Danach dieses Skript erneut doppelklicken."
  ende 1
fi

# ---------------------------------------------------------------- Adresse prüfen
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
            */*) echo "" ;;
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
  echo "    falsch:    njay53.github.io"
  echo "    richtig:   https://github.com/njay53/avj-damage.git"
  echo "    oder kurz: njay53/avj-damage"
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
  # Keine neuen Änderungen — aber vielleicht liegt hier ein fertiger Commit,
  # dessen Upload beim letzten Mal gescheitert ist. Der darf nicht liegenbleiben.
  OFFEN=0
  if git rev-parse HEAD >/dev/null 2>&1; then
    if git rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1; then
      OFFEN="$(git rev-list --count '@{u}'..HEAD 2>/dev/null || echo 0)"
    else
      OFFEN="$(git rev-list --count HEAD 2>/dev/null || echo 0)"
    fi
  fi

  if [ "${OFFEN:-0}" -gt 0 ]; then
    echo "  Keine neuen Änderungen — aber ${OFFEN} Commit(s) warten noch auf den Upload."
    echo ""
    hochladen
    ende 0
  fi

  echo "  Alles aktuell — es gibt nichts hochzuladen."
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

hochladen
ende 0
