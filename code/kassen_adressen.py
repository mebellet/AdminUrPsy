"""Postanschriften der Pflegekassen – redaktionell gepflegt, vom Skript geprüft.

Warum nicht automatisch von den Webseiten der Kassen? Die Seiten haben keine Schnittstelle,
ändern ihren Aufbau häufig, und automatisches Auslesen („Scraping“) widerspricht unserer Regel
„verlinken, nicht scrapen“, solange es keine Erlaubnis gibt. Deshalb:

  1. Ein Mensch trägt die Anschrift mit Quelle in code/quellen/kassen-adressen.csv ein.
  2. Dieses Skript prüft die Tabelle (gibt es die Kasse? ist die Anschrift vollständig? ist die Prüfung alt?)
     und schreibt data/pflegekassen-adressen.json für die App.
  3. Mit --pruefen lädt es jede Quelle einmal und schaut nur nach, ob PLZ und Ort dort noch stehen.
     Es übernimmt nichts automatisch – es meldet nur, was ein Mensch ansehen sollte.

Später möglich: Adressdatei der ARGE·IK (Institutionskennzeichen) – Nutzungsrechte vorher klären.

Spalten der CSV (Trennzeichen ;):
  kasse_id     – ID aus data/kassen.json (z. B. barmer, aok-bayern)
  empfaenger   – erste Zeile der Anschrift, z. B. „Pflegekasse bei der AOK Nordost“
  anschrift    – weitere Zeilen, getrennt mit |  (z. B. „Postfach 10 79 63|28079 Bremen“)
  status       – belegt (offizielle Quelle) · zu_pruefen (indirekte Quelle) · offen (noch keine Anschrift)
  quelle_url   – woher die Anschrift stammt
  quelle_art   – z. B. Postanschrift-Seite, Pflegeantrag der Kasse, anderes Formular der Kasse
  geprueft_am  – JJJJ-MM-TT
  hinweis      – frei

Aufruf:
  python3 code/kassen_adressen.py            # Tabelle prüfen und JSON schreiben
  python3 code/kassen_adressen.py --pruefen  # zusätzlich jede Quelle abrufen und PLZ/Ort suchen
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import html
import re
import sys

import gemeinsam as g

CSV = g.QUELLEN / "kassen-adressen.csv"
STATUS = ("belegt", "zu_pruefen", "offen")
MAX_ALTER_TAGE = 180


def einlesen(pfad=CSV) -> list[dict]:
    with open(pfad, encoding="utf-8", newline="") as f:
        zeilen = [z for z in csv.DictReader((l for l in f if not l.startswith("#")), delimiter=";")]
    for z in zeilen:
        for k in list(z):
            z[k] = (z[k] or "").strip()
    return zeilen


def pruefe_zeile(z: dict, bekannte_ids: set[str]) -> list[str]:
    fehler = []
    if z["kasse_id"] not in bekannte_ids:
        fehler.append(f"unbekannte kasse_id „{z['kasse_id']}“ (nicht in data/kassen.json)")
    if z["status"] not in STATUS:
        fehler.append(f"status muss einer von {STATUS} sein")
    if z["status"] != "offen":
        if not z["empfaenger"] or not z["anschrift"]:
            fehler.append("Empfänger und Anschrift fehlen")
        elif not re.search(r"\b\d{5}\b", z["anschrift"]):
            fehler.append("keine 5-stellige PLZ in der Anschrift")
        if not z["quelle_url"].startswith("http"):
            fehler.append("quelle_url fehlt")
    if z["geprueft_am"]:
        try:
            alter = (dt.date.today() - dt.date.fromisoformat(z["geprueft_am"])).days
            if alter > MAX_ALTER_TAGE:
                fehler.append(f"Prüfung ist {alter} Tage alt – bitte neu prüfen")
        except ValueError:
            fehler.append("geprueft_am ist kein Datum (JJJJ-MM-TT)")
    return fehler


def text_aus_quelle(url: str) -> str:
    inhalt = g.laden(url)
    if inhalt[:4] == b"%PDF":
        text, _ = g.pdf_text(inhalt)
    else:
        text = html.unescape(re.sub(r"<[^>]+>", " ", inhalt.decode("utf-8", "replace")))
    return re.sub(r"\s+", " ", text)


def quelle_pruefen(z: dict) -> str:
    """Steht die PLZ (und der Ort) der Anschrift noch in der Quelle?"""
    m = re.search(r"\b(\d{5})\s+([^|]+)$", z["anschrift"])
    if not m:
        return "übersprungen (keine PLZ)"
    plz, ort = m.group(1), m.group(2).strip()
    try:
        text = text_aus_quelle(z["quelle_url"])
    except Exception as e:  # Netzfehler, 404 …
        return f"⚠️ Quelle nicht abrufbar: {e}"
    plz_da = re.search(r"\b" + plz[:2] + r"\s?" + plz[2:] + r"\b", text) is not None
    ort_da = ort.split()[0].lower() in text.lower()
    if plz_da and ort_da:
        return "ok (PLZ und Ort gefunden)"
    if plz_da:
        return "⚠️ PLZ gefunden, Ort nicht – bitte ansehen"
    return "⚠️ PLZ nicht mehr in der Quelle – bitte ansehen"


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--pruefen", action="store_true", help="jede Quelle abrufen und PLZ/Ort suchen")
    a = p.parse_args(argv)

    bekannte = {k["id"] for k in g.lesen("kassen.json")["kassen"]}
    zeilen = einlesen()
    probleme = 0
    adressen = {}
    for z in zeilen:
        fehler = pruefe_zeile(z, bekannte)
        if fehler:
            probleme += 1
            print(f"  ⚠️ {z['kasse_id']}: " + "; ".join(fehler))
        if a.pruefen and z["status"] != "offen":
            print(f"  {z['kasse_id']}: {quelle_pruefen(z)}")
        adressen[z["kasse_id"]] = {
            "status": z["status"],
            "zeilen": ([z["empfaenger"]] + [x.strip() for x in z["anschrift"].split("|") if x.strip()]) if z["status"] != "offen" else [],
            "quelle": {"url": z["quelle_url"], "art": z["quelle_art"]} if z["quelle_url"] else None,
            "geprueft_am": z["geprueft_am"] or None,
            "hinweis": z["hinweis"] or None,
        }

    zaehler = {s: sum(1 for x in adressen.values() if x["status"] == s) for s in STATUS}
    print(f"Pflegekassen-Adressen: {len(adressen)} Einträge – " + ", ".join(f"{k}: {v}" for k, v in zaehler.items())
          + f" · {len(bekannte) - len(adressen)} Kassen ohne Eintrag")
    g.speichern("pflegekassen-adressen.json", {
        "meta": g.meta(
            "Postanschriften der Pflegekassen (für Anträge von Versicherten)",
            [{"name": "redaktionell gepflegt: code/quellen/kassen-adressen.csv (je Eintrag eigene Quelle)"}],
            erzeugt_von="code/kassen_adressen.py", pruefen_in_tagen=90,
            hinweis="status „belegt“ = offizielle Postanschrift-Seite oder Pflegeantrag der Kasse; "
                    "„zu_pruefen“ = indirekte Quelle; „offen“ = noch keine Anschrift, die App bittet dann um Eingabe."),
        "adressen": adressen,
    })
    return 1 if probleme else 0


if __name__ == "__main__":
    sys.exit(main())
