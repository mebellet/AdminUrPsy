"""Beträge, Schwellen und Fristen der Pflegeversicherung (Stand ab 1.1.2027) prüfen und bereitstellen.

Gesetzestexte haben keine Schnittstelle – die Werte werden von Hand aus dem Gesetz übernommen
(code/quellen/pflege-werte-2027.json, mit Paragraf und Quelle). Dieses Skript prüft sie auf
Vollständigkeit und Plausibilität und schreibt data/pflege-werte-2027.json für die App.

Nach dem Beschluss des Bundestags (geplant 11.12.2026) und der Verkündung:
  - Werte mit dem verkündeten Gesetz abgleichen, Quelle auf das Bundesgesetzblatt umstellen,
  - "entwurf": false setzen, Skript erneut laufen lassen.

Aufruf:  python3 code/pflege_werte.py
"""
from __future__ import annotations

import json
import sys

import gemeinsam as g

QUELLE = g.QUELLEN / "pflege-werte-2027.json"
PFLICHT = ["schwellen_punkte", "entlastungsbudget", "sachleistungsbudget", "sozialraumbudget",
           "entscheidungsfrist", "fristaussetzung", "widerspruchsfrist"]


def pruefen(d: dict) -> list[str]:
    fehler = []
    w = d.get("werte", {})
    for k in PFLICHT:
        if k not in w:
            fehler.append(f"fehlt: {k}")
        elif "paragraf" not in w[k]:
            fehler.append(f"{k}: Paragraf fehlt")
    s = w.get("schwellen_punkte", {}).get("wert", {})
    if s and [s[str(i)] for i in range(1, 6)] != sorted(s[str(i)] for i in range(1, 6)):
        fehler.append("schwellen_punkte: Werte müssen von Pflegegrad 1 bis 5 steigen")
    for k in ("entlastungsbudget", "sachleistungsbudget"):
        werte = w.get(k, {}).get("wert", {})
        reihe = [werte.get(str(i)) for i in range(2, 6)]
        if None in reihe or reihe != sorted(reihe):
            fehler.append(f"{k}: Pflegegrad 2–5 nötig, Beträge steigend")
    if not d.get("quellen"):
        fehler.append("quellen fehlen")
    return fehler


def main() -> int:
    d = json.loads(QUELLE.read_text(encoding="utf-8"))
    fehler = pruefen(d)
    for f in fehler:
        print(f"  ⚠️ {f}")
    if fehler:
        print("Nicht geschrieben – bitte Quelle korrigieren.")
        return 1
    m = g.meta(d["titel"], d["quellen"], erzeugt_von="code/pflege_werte.py", hinweis=d["rechtsstand"])
    m["naechste_pruefung"] = d.get("naechste_pruefung", m["naechste_pruefung"])
    g.speichern("pflege-werte-2027.json", {"meta": m, "entwurf": d.get("entwurf", True), "werte": d["werte"]})
    print("Pflegewerte 2027: ok" + (" (⚠️ Gesetzentwurf – noch nicht beschlossen)" if d.get("entwurf") else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
