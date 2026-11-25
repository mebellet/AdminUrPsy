"""Gemeinsame Hilfsfunktionen für alle Skripte in code/.

Grundsätze (siehe code/README.md):
- Die Skripte laufen NUR bei der Datenpflege (auf dem eigenen Rechner oder später in einer
  GitHub Action), nie in der App. Die App lädt nur die fertigen Dateien aus data/.
- Jede Datei in data/ hat einen Kopf "meta" mit Quelle, Stand und nächster Prüfung.
- Heruntergeladene Rohdateien (PDFs, HTML) landen nur im Zwischenspeicher code/_cache/
  und werden NICHT ins Repository übernommen (Urheberrecht der Kassen).
- Nur Python-Standardbibliothek, außer pypdf zum Lesen von PDFs.
"""
from __future__ import annotations

import datetime as _dt
import hashlib
import json
import pathlib
import sys
import time
import urllib.request

WURZEL = pathlib.Path(__file__).resolve().parent.parent   # Repository-Ordner
DATEN = WURZEL / "data"
QUELLEN = WURZEL / "code" / "quellen"
CACHE = WURZEL / "code" / "_cache"

# Wir sagen offen, wer wir sind (gute Praxis beim Abrufen öffentlicher Daten).
USER_AGENT = "AdminUrPsy-Datenpflege/0.1 (+https://github.com/mebellet/AdminUrPsy)"


def heute() -> str:
    return _dt.date.today().isoformat()


def in_tagen(tage: int) -> str:
    return (_dt.date.today() + _dt.timedelta(days=tage)).isoformat()


def laden(url: str, *, cache: bool = True, pause: float = 1.0, timeout: int = 30) -> bytes:
    """Lädt eine Datei aus dem Internet (mit einfachem Zwischenspeicher).

    pause: Wartezeit in Sekunden nach jedem echten Abruf – damit wir Server nicht belasten.
    """
    CACHE.mkdir(parents=True, exist_ok=True)
    datei = CACHE / (hashlib.sha1(url.encode()).hexdigest()[:16] + "_" + url.rsplit("/", 1)[-1][-60:].replace("?", "_"))
    if cache and datei.exists():
        return datei.read_bytes()
    anfrage = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(anfrage, timeout=timeout) as antwort:
        inhalt = antwort.read()
    datei.write_bytes(inhalt)
    time.sleep(pause)
    return inhalt


def pdf_text(inhalt: bytes) -> tuple[str, list[str]]:
    """Text und Namen der ausfüllbaren Felder eines PDFs (braucht pypdf)."""
    try:
        import io
        import pypdf
    except ImportError:  # pragma: no cover
        sys.exit("Bitte zuerst installieren:  python3 -m pip install -r code/requirements.txt")
    leser = pypdf.PdfReader(io.BytesIO(inhalt))
    text = "\n".join((seite.extract_text() or "") for seite in leser.pages)
    felder = list((leser.get_fields() or {}).keys())
    return text, felder


def meta(titel: str, quellen: list[dict], *, erzeugt_von: str, pruefen_in_tagen: int = 90,
         hinweis: str = "", lizenz: str = "") -> dict:
    """Einheitlicher Kopf für jede Datei in data/ (Regel: Quelle, Stand, nächste Prüfung)."""
    m = {
        "titel": titel,
        "stand": heute(),
        "naechste_pruefung": in_tagen(pruefen_in_tagen),
        "erzeugt_von": erzeugt_von,
        "quellen": quellen,
    }
    if hinweis:
        m["hinweis"] = hinweis
    if lizenz:
        m["lizenz"] = lizenz
    return m


def speichern(name: str, inhalt: dict) -> pathlib.Path:
    """Schreibt data/<name> als gut lesbares JSON (UTF-8, sortierte Reihenfolge wie übergeben)."""
    DATEN.mkdir(parents=True, exist_ok=True)
    ziel = DATEN / name
    ziel.write_text(json.dumps(inhalt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"  geschrieben: {ziel.relative_to(WURZEL)}")
    return ziel


def lesen(name: str) -> dict:
    return json.loads((DATEN / name).read_text(encoding="utf-8"))


# Bundesländer: Kürzel wie in der App (standort.js)
LAENDER = {
    "BW": "Baden-Württemberg", "BY": "Bayern", "BE": "Berlin", "BB": "Brandenburg",
    "HB": "Bremen", "HH": "Hamburg", "HE": "Hessen", "MV": "Mecklenburg-Vorpommern",
    "NI": "Niedersachsen", "NW": "Nordrhein-Westfalen", "RP": "Rheinland-Pfalz",
    "SL": "Saarland", "SN": "Sachsen", "ST": "Sachsen-Anhalt", "SH": "Schleswig-Holstein",
    "TH": "Thüringen",
}
NAME_ZU_KUERZEL = {v: k for k, v in LAENDER.items()}
