"""Alle Daten der Reihe nach aktualisieren.

  python3 code/alle.py            # mit Internet: Kassenliste und Formulare neu laden
  python3 code/alle.py --offline  # ohne Internet: nur prüfen und Datenpaket bauen

Reihenfolge:
  1. kassenliste.py              (Internet)  → data/kassen.json, data/aok-regionen.json
  2. kassen_adressen.py                      → data/pflegekassen-adressen.json
  3. pflegeantraege_vergleich.py (Internet)  → data/pflegeantrag-merkmale.json
  4. pflege_werte.py                         → data/pflege-werte-2027.json
  5. pruefe_daten.py                         (Quelle, Stand, Prüfdatum in allen Dateien)
  6. baue_datenpaket.py                      → prototype/js/datenpaket.js
"""
from __future__ import annotations

import sys

import baue_datenpaket
import kassen_adressen
import kassenliste
import pflege_werte
import pflegeantraege_vergleich
import pruefe_daten


def main() -> int:
    offline = "--offline" in sys.argv
    schritte = []
    if not offline:
        schritte += [("Kassenliste", lambda: kassenliste.main([]))]
    schritte += [("Pflegekassen-Adressen", lambda: kassen_adressen.main([]))]
    if not offline:
        schritte += [("Pflegeanträge vergleichen", lambda: pflegeantraege_vergleich.main([]))]
    schritte += [("Pflegewerte 2027", pflege_werte.main),
                 ("Daten prüfen", pruefe_daten.main),
                 ("Datenpaket bauen", baue_datenpaket.main)]
    ergebnis = 0
    for name, schritt in schritte:
        print(f"\n== {name} ==")
        rc = schritt() or 0
        if rc:
            print(f"   ⚠️ {name}: Rückgabewert {rc}")
            ergebnis = rc
    return ergebnis


if __name__ == "__main__":
    sys.exit(main())
