"""Pflegeanträge mehrerer Kassen vergleichen: Welche Angaben fragen (fast) alle ab?

Wozu? Der formlose Antrag von AdminUrPsy sichert das Antragsdatum. Danach schickt die Pflegekasse
ihr eigenes Formular. Wenn wir wissen, was die Formulare fast immer abfragen, kann die App vorher sagen:
„Leg schon mal bereit: IBAN, Angaben zur Pflegeperson …“ (Schritt 2 „Vordruck vorbereiten“ im Konzept).

So arbeitet das Skript:
  1. liest die Liste der Formulare aus code/quellen/pflegeantraege.csv
  2. lädt jedes PDF (nur in den Zwischenspeicher code/_cache/, nicht ins Repository)
  3. liest Text und Namen der ausfüllbaren Felder (pypdf)
  4. sucht nach den Angaben aus code/quellen/merkmale.json (einfache Suchmuster)
  5. zählt: Wie viele Formulare fragen eine Angabe ab? Ab --schwelle (Standard 75 %) gilt sie als „gemeinsam“.

⚠️ Das ist eine Textsuche, kein Verstehen. Ergebnis = Vorschlag zum Prüfen durch einen Menschen.
   Gescannte PDFs ohne Text liefern nichts (wird gemeldet).

Aufruf:
  python3 code/pflegeantraege_vergleich.py
  python3 code/pflegeantraege_vergleich.py --schwelle 0.5 --details
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import sys

import gemeinsam as g

LISTE = g.QUELLEN / "pflegeantraege.csv"
MERKMALE = g.QUELLEN / "merkmale.json"


def normalisieren(text: str) -> str:
    t = text.replace("­", "")
    t = re.sub(r"(\w)-\s*\n\s*(\w)", r"\1\2", t)      # Silbentrennung am Zeilenende
    t = re.sub(r"\s+", " ", t)
    return t.lower()


def merkmale_finden(text: str, felder: list[str], merkmale: list[dict]) -> dict[str, str | None]:
    """Gibt je Merkmal den ersten Treffer (Textausschnitt) zurück oder None."""
    heuhaufen = normalisieren(text) + " " + normalisieren(" ".join(felder))
    gefunden = {}
    for m in merkmale:
        treffer = None
        for muster in m["muster"]:
            r = re.search(muster, heuhaufen)
            if r:
                a, b = max(0, r.start() - 25), min(len(heuhaufen), r.end() + 25)
                treffer = heuhaufen[a:b].strip()
                break
        gefunden[m["id"]] = treffer
    return gefunden


def formulare_lesen() -> list[dict]:
    with open(LISTE, encoding="utf-8", newline="") as f:
        return [z for z in csv.DictReader((l for l in f if not l.startswith("#")), delimiter=";")]


def auswerten(ergebnisse: list[dict], merkmale: list[dict], schwelle: float) -> list[dict]:
    lesbar = [e for e in ergebnisse if e["lesbar"]]
    n = len(lesbar) or 1
    zeilen = []
    for m in merkmale:
        bei = [e["kasse_id"] for e in lesbar if e["treffer"].get(m["id"])]
        zeilen.append({
            "id": m["id"],
            "label": m["label"],
            "anzahl": len(bei),
            "von": len(lesbar),
            "anteil": round(len(bei) / n, 2),
            "gemeinsam": len(bei) / n >= schwelle,
            "gefunden_bei": bei,
            "bereithalten": m.get("bereithalten", ""),
            "im_formlosen_antrag": m.get("im_formlosen_antrag", False),
        })
    return zeilen


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--schwelle", type=float, default=0.75, help="Anteil der Formulare, ab dem eine Angabe als gemeinsam gilt")
    p.add_argument("--details", action="store_true", help="Fundstellen ausgeben (zum Prüfen der Suchmuster)")
    a = p.parse_args(argv)

    merkmale = json.loads(MERKMALE.read_text(encoding="utf-8"))["merkmale"]
    ergebnisse = []
    for f in formulare_lesen():
        print(f"- {f['kasse_id']}: {f['url']}")
        try:
            text, felder = g.pdf_text(g.laden(f["url"]))
        except Exception as e:
            print(f"  ⚠️ nicht geladen: {e}")
            ergebnisse.append({"kasse_id": f["kasse_id"], "titel": f["titel"], "url": f["url"], "lesbar": False, "treffer": {}})
            continue
        lesbar = len(text.strip()) > 200
        if not lesbar:
            print("  ⚠️ kaum Text – vermutlich ein gescanntes PDF; wird nicht gezählt")
        treffer = merkmale_finden(text, felder, merkmale) if lesbar else {}
        if a.details:
            for k, v in treffer.items():
                print(f"    {'✓' if v else '·'} {k}: {v or ''}")
        ergebnisse.append({"kasse_id": f["kasse_id"], "titel": f["titel"], "url": f["url"], "lesbar": lesbar,
                           "ausfuellbare_felder": len(felder), "treffer": treffer})

    zeilen = auswerten(ergebnisse, merkmale, a.schwelle)
    gemeinsam = [z["label"] for z in zeilen if z["gemeinsam"]]
    print(f"\nGemeinsam (≥ {int(a.schwelle * 100)} % der lesbaren Formulare): " + ", ".join(gemeinsam))

    g.speichern("pflegeantrag-merkmale.json", {
        "meta": g.meta(
            "Was Pflegeanträge der Kassen abfragen (Vergleich)",
            [{"name": e["titel"], "url": e["url"]} for e in ergebnisse],
            erzeugt_von="code/pflegeantraege_vergleich.py", pruefen_in_tagen=180,
            hinweis="Automatische Textsuche nach festen Suchmustern (code/quellen/merkmale.json) – "
                    "Vorschlag, von einem Menschen zu prüfen. Die Formulare selbst sind nicht Teil des Repositorys."),
        "schwelle": a.schwelle,
        "formulare": [{"kasse_id": e["kasse_id"], "titel": e["titel"], "url": e["url"], "lesbar": e["lesbar"],
                       "ausfuellbare_felder": e.get("ausfuellbare_felder", 0)} for e in ergebnisse],
        "merkmale": zeilen,
    })
    return 0


if __name__ == "__main__":
    sys.exit(main())
