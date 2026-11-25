"""Bündelt alle Dateien aus data/ zu einem Datenpaket für den Prototyp (prototype/js/datenpaket.js).

Warum eine .js-Datei statt die JSON-Dateien direkt zu laden? Browser erlauben fetch() nicht,
wenn man eine Seite per Doppelklick (file://) öffnet. Als Skript eingebunden funktioniert der
Prototyp überall – auch offline. Später (App) wird daraus ein „Regionspaket“, das die App als
Ganzes lädt: nie einzelne Abfragen, die etwas über die Person verraten.

Aufruf:  python3 code/baue_datenpaket.py
"""
from __future__ import annotations

import json
import sys

import gemeinsam as g

ZIEL = g.WURZEL / "prototype" / "js" / "datenpaket.js"


def main() -> int:
    paket = {}
    for pfad in sorted(g.DATEN.rglob("*.json")):
        schluessel = str(pfad.relative_to(g.DATEN).with_suffix("")).replace("\\", "/")
        paket[schluessel] = json.loads(pfad.read_text(encoding="utf-8"))
    kopf = ("/* Automatisch erzeugt von code/baue_datenpaket.py am " + g.heute() + " – nicht von Hand ändern.\n"
            "   Inhalt: alle Datensätze aus data/ (" + ", ".join(paket) + "). */\n")
    ZIEL.write_text(kopf + "window.AU_DATEN = " + json.dumps(paket, ensure_ascii=False, separators=(",", ":")) + ";\n",
                    encoding="utf-8")
    print(f"Datenpaket: {len(paket)} Datensätze → {ZIEL.relative_to(g.WURZEL)} ({ZIEL.stat().st_size // 1024} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
