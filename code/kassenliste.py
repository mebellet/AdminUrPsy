"""Kassenliste: alle gesetzlichen Krankenkassen (und damit Pflegekassen) mit Region.

Quelle: Krankenkassenliste des GKV-Spitzenverbands (PDF, wird laufend aktualisiert)
        https://www.gkv-spitzenverband.de/krankenkassenliste.pdf
Ergebnis:
  data/kassen.json        – Name, Kassenart, Webseite, Regionen (Bundesland-Kürzel)
  data/aok-regionen.json  – je Bundesland die dort geöffnete(n) AOK(s)
                            (damit die App bei „AOK“ anhand der PLZ die passende AOK vorschlagen kann)

Warum PLZ → AOK nur ein Vorschlag ist: Die zuständige Pflegekasse ist die Kasse, bei der die Person
versichert ist – nicht die am Wohnort. Die Regionen sagen nur, wo eine Kasse „geöffnet“ ist.
In Nordrhein-Westfalen sind zwei AOKs geöffnet; dort muss die Person wählen.

Aufruf:
  python3 code/kassenliste.py                 # lädt das PDF (mit Zwischenspeicher)
  python3 code/kassenliste.py --pdf datei.pdf # liest ein lokal gespeichertes PDF
  python3 code/kassenliste.py --text datei.txt  # liest bereits extrahierten Text (für Tests)
"""
from __future__ import annotations

import argparse
import re
import sys

import gemeinsam as g

URL = "https://www.gkv-spitzenverband.de/krankenkassenliste.pdf"
SEITE = "https://www.gkv-spitzenverband.de/service/krankenkassenliste/krankenkassen.jsp"

# Längste Namen zuerst, damit „Sachsen-Anhalt“ nicht als „Sachsen“ erkannt wird
_LAND = "|".join(sorted((re.escape(n) for n in g.LAENDER.values()), key=len, reverse=True))
_REGIONEN = (r"(?P<regionen>bundesweit|betriebsbezogen(?:\s*\(nur für Mitarbeitende wählbar\))?|branchenbezogen"
             rf"|(?:{_LAND})(?:\s*,\s*(?:{_LAND}))*)")
_EINTRAG = re.compile(
    r"(?P<name>\S.*?)\s+(?P<web>(?:https?://)?www\.\S+?)\s+"
    r"(?P<beitrag>\d{1,2},\d{1,2}\s?%|wird nicht erhoben)\s+" + _REGIONEN
)


def text_bereinigen(text: str) -> tuple[str, str | None]:
    """Macht aus dem PDF-Text eine einzige Zeile und entfernt Kopfzeilen."""
    stand = None
    m = re.search(r"Krankenkassenliste\s+(\d{2})\.(\d{2})\.(\d{4})", text)
    if m:
        stand = f"{m.group(3)}-{m.group(2)}-{m.group(1)}"
    t = re.sub(r"[ \t]+", " ", text)
    t = re.sub(r"(www\.\S*-)\s*\n\s*", r"\1", t)          # umbrochene Webadressen „www.bergische-\nkrankenkasse.de“
    t = re.sub(r"\s*\n\s*", " ", t)
    t = re.sub(r"Krankenkassenliste\s+\d{2}\.\d{2}\.\d{4}", " ", t)
    t = re.sub(r"Krankenkassenname\s+Homepage\s+Zusatzbeitrag\s+geöffnet in", " ", t)
    t = re.sub(r"Seite \d+ (?:von|/) \d+", " ", t)
    return re.sub(r"\s{2,}", " ", t).strip(), stand


def kassenart(name: str) -> str:
    n = name.upper()
    if n.startswith("AOK"):
        return "AOK"
    if "IKK" in n or "INNUNGSKRANKENKASSE" in n:
        return "IKK"
    if "KNAPPSCHAFT" in n:
        return "KBS"
    if "SVLFG" in n or "LANDWIRTSCHAFT" in n:
        return "SVLFG"
    if any(k in n for k in ("TECHNIKER", "BARMER", "DAK-GESUNDHEIT", "KKH", "HANDELSKRANKENKASSE", "HANSEATISCHE")):
        return "Ersatzkasse"
    if "BKK" in n or "BETRIEBSKRANKENKASSE" in n:
        return "BKK"
    # BKKs ohne „BKK“ im Namen (Stand 11/2026) – bei Bedarf ergänzen
    if any(k in n for k in ("BIG DIREKT", "VIACTIV", "HEIMAT KRANKENKASSE", "BERGISCHE KRANKENKASSE")):
        return "BKK"
    return "sonstige"


def kennung(name: str) -> str:
    """Stabile, lesbare ID aus dem Namen, z. B. „aok-bayern-die-gesundheitskasse“ → „aok-bayern“."""
    s = name.lower()
    for a, b in (("ä", "ae"), ("ö", "oe"), ("ü", "ue"), ("ß", "ss"), ("&", " und "), ("+", " und ")):
        s = s.replace(a, b)
    s = re.sub(r"^aok\s*-\s*die gesundheitskasse (?:fuer|in) ", "aok ", s)   # „AOK - Die Gesundheitskasse in Hessen“
    s = re.sub(r"\s*-?\s*die gesundheitskasse.*$", "", s)
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s


def regionen(roh: str):
    roh = roh.strip()
    if roh.startswith("betriebsbezogen"):
        return "betriebsbezogen"
    if roh in ("bundesweit", "branchenbezogen"):
        return roh
    return [g.NAME_ZU_KUERZEL[x.strip()] for x in roh.split(",")]


def auslesen(text: str) -> tuple[list[dict], str | None, str]:
    t, stand = text_bereinigen(text)
    kassen, ende = [], 0
    for m in _EINTRAG.finditer(t):
        name = m.group("name").strip(" ,;")
        web = m.group("web").rstrip(".,;")
        if not web.startswith("http"):
            web = "https://" + web
        kassen.append({
            "id": kennung(name),
            "name": name,
            "art": kassenart(name),
            "webseite": web,
            "regionen": regionen(m.group("regionen")),
        })
        ende = m.end()
    rest = t[ende:].strip()
    return kassen, stand, rest


def aok_regionen(kassen: list[dict]) -> dict:
    zuordnung = {k: [] for k in g.LAENDER}
    for k in kassen:
        if k["art"] == "AOK" and isinstance(k["regionen"], list):
            for land in k["regionen"]:
                zuordnung[land].append(k["id"])
    return zuordnung


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--pdf", help="lokales PDF statt Download")
    p.add_argument("--text", help="bereits extrahierter Text (Tests)")
    p.add_argument("--neu", action="store_true", help="Zwischenspeicher ignorieren und neu laden")
    a = p.parse_args(argv)

    if a.text:
        text = open(a.text, encoding="utf-8").read()
    else:
        inhalt = open(a.pdf, "rb").read() if a.pdf else g.laden(URL, cache=not a.neu)
        text, _ = g.pdf_text(inhalt)

    kassen, stand, rest = auslesen(text)
    print(f"Kassenliste: {len(kassen)} Kassen erkannt (Stand der Liste: {stand or 'unbekannt'})")
    if rest:
        print(f"  ⚠️ nicht zugeordneter Rest am Ende ({len(rest)} Zeichen): {rest[:120]!r}")
    if len(kassen) < 80:
        print("  ⚠️ Weniger als 80 Kassen – hat sich das Layout des PDFs geändert? Nichts geschrieben.")
        return 1
    ids = [k["id"] for k in kassen]
    doppelt = {i for i in ids if ids.count(i) > 1}
    if doppelt:
        print(f"  ⚠️ doppelte IDs: {sorted(doppelt)}")

    quellen = [{"name": "GKV-Spitzenverband: Krankenkassenliste (PDF)", "url": URL, "stand_der_quelle": stand},
               {"name": "GKV-Spitzenverband: Krankenkassenliste (Webseite)", "url": SEITE}]
    hinweis = ("Die Daten stammen von den Krankenkassen selbst (laut GKV-Spitzenverband automatisiert aus dem "
               "Datenaustausch). Kassenart und ID werden vom Skript abgeleitet.")
    g.speichern("kassen.json", {
        "meta": g.meta("Gesetzliche Krankenkassen und Pflegekassen", quellen,
                       erzeugt_von="code/kassenliste.py", pruefen_in_tagen=30, hinweis=hinweis),
        "kassen": kassen,
    })
    g.speichern("aok-regionen.json", {
        "meta": g.meta("AOK je Bundesland (Vorschlag anhand der PLZ)", quellen,
                       erzeugt_von="code/kassenliste.py", pruefen_in_tagen=30,
                       hinweis="Nur ein Vorschlag: Maßgeblich ist die Kasse auf der Versichertenkarte. "
                               "Gibt es in einem Land mehrere AOKs (NRW), muss die Person wählen."),
        "laender": aok_regionen(kassen),
    })
    return 0


if __name__ == "__main__":
    sys.exit(main())
