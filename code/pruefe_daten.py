"""Prüft alle Dateien in data/ – die Regel „jede Angabe mit Quelle, Stand und nächster Prüfung“.

Meldet:
  - fehlende Pflichtangaben im Kopf (meta: titel, stand, naechste_pruefung, quellen)
  - überfällige Prüfungen (naechste_pruefung liegt in der Vergangenheit)
  - Fragebögen (data/fragebogen/*.json): doppelte Feldnamen, Bedingungen mit unbekannten Feldern

Rückgabewert 1 bei Fehlern (z. B. für eine spätere automatische Prüfung auf GitHub).
Aufruf:  python3 code/pruefe_daten.py
"""
from __future__ import annotations

import datetime as dt
import json
import re
import sys

import gemeinsam as g

PFLICHT = ("titel", "stand", "naechste_pruefung", "quellen")


def pruefe_meta(name: str, d: dict) -> tuple[list[str], list[str]]:
    fehler, warnungen = [], []
    m = d.get("meta")
    if not isinstance(m, dict):
        return [f"{name}: Kopf „meta“ fehlt"], []
    for k in PFLICHT:
        if not m.get(k):
            fehler.append(f"{name}: meta.{k} fehlt")
    try:
        if dt.date.fromisoformat(m.get("naechste_pruefung", "")) < dt.date.today():
            warnungen.append(f"{name}: Prüfung überfällig seit {m['naechste_pruefung']}")
    except ValueError:
        fehler.append(f"{name}: meta.naechste_pruefung ist kein Datum")
    return fehler, warnungen


def pruefe_fragebogen(name: str, d: dict) -> list[str]:
    fehler, namen = [], []
    for p in d.get("pages", []):
        for e in p.get("elements", []):
            namen.append(e.get("name"))
    doppelt = {n for n in namen if namen.count(n) > 1}
    if doppelt:
        fehler.append(f"{name}: doppelte Feldnamen {sorted(doppelt)}")
    bekannt = set(namen) | {"anschrift_fehlt"}  # Variablen, die die App setzt
    for p in d.get("pages", []):
        for obj in [p] + p.get("elements", []):
            for feld in re.findall(r"\{([\w.-]+)\}", obj.get("visibleIf", "")):
                if feld not in bekannt:
                    fehler.append(f"{name}: Bedingung bei „{obj.get('name')}“ nutzt unbekanntes Feld {{{feld}}}")
    return fehler


def main() -> int:
    fehler, warnungen, n = [], [], 0
    for pfad in sorted(g.DATEN.rglob("*.json")):
        name = str(pfad.relative_to(g.DATEN))
        try:
            d = json.loads(pfad.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            fehler.append(f"{name}: kein gültiges JSON ({e})")
            continue
        n += 1
        f, w = pruefe_meta(name, d)
        fehler += f
        warnungen += w
        if name.startswith("fragebogen/"):
            fehler += pruefe_fragebogen(name, d)
    for w in warnungen:
        print(f"  ⚠️ {w}")
    for f in fehler:
        print(f"  ✗ {f}")
    print(f"Datenprüfung: {n} Dateien, {len(fehler)} Fehler, {len(warnungen)} Warnungen")
    return 1 if fehler else 0


if __name__ == "__main__":
    sys.exit(main())
