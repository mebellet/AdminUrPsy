"""Tests ohne Internet:  python3 -m unittest discover -s code/tests -v

Die Testtexte ahmen den Aufbau der echten Quellen nach (Stand 11/2026). Wenn ein Test nach einer
Änderung der Quelle fehlschlägt, zuerst den Testtext an die neue Quelle anpassen, dann das Skript.
"""
import json
import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

import gemeinsam as g  # noqa: E402
import kassen_adressen  # noqa: E402
import kassenliste  # noqa: E402
import pflegeantraege_vergleich as vergleich  # noqa: E402
import pruefe_daten  # noqa: E402

# So ähnlich sieht der Text aus, den pypdf aus der Krankenkassenliste liest (Zeilen umbrochen)
KASSENLISTE = """Krankenkassenliste 24.11.2026
Krankenkassenname Homepage Zusatzbeitrag geöffnet in
AOK - Die Gesundheitskasse
für Niedersachsen
www.aok.de/niedersachsen 2,98 % Niedersachsen
AOK NordWest - Die Gesundheitskasse www.aok.de/nordwest 2,99 % Nordrhein-Westfalen, Schleswig-Holstein
AOK Rheinland/Hamburg - Die Gesundheitskasse www.aok.de/rh 3,29 % Hamburg, Nordrhein-Westfalen
BARMER www.barmer.de 3,29 % bundesweit
BERGISCHE KRANKENKASSE www.bergische-
krankenkasse.de
3,79 % Hamburg, Hessen, Nordrhein-Westfalen
BMW BKK www.bmwbkk.de 2,90 % betriebsbezogen (nur für Mitarbeitende wählbar)
AOK Sachsen-Anhalt - Die Gesundheitskasse www.aok.de/san 3,10 % Sachsen-Anhalt
Sozialversicherung für Landwirtschaft, Forsten und Gartenbau (SVLFG) www.svlfg.de wird nicht erhoben branchenbezogen
Seite 1 von 5
"""

FORMULAR = """Antrag auf Leistungen der Pflegeversicherung  Erstantrag  Höherstufungsantrag
Versichertennummer: ____  Name, Vorname  Geburtsdatum  Anschrift  Telefon (freiwillig)
Ich beantrage: Pflegegeld / Pflegesachleistung / Kombinationsleistung
Angaben zur Pflege-
person: Name, Anschrift   Bankverbindung: IBAN, Kontoinhaber
Unterschrift des Versicherten / Bevollmächtigten / Betreuers   Datenschutz: Ihre Daten …"""


class Kassenliste(unittest.TestCase):
    def test_auslesen(self):
        kassen, stand, rest = kassenliste.auslesen(KASSENLISTE)
        self.assertEqual(stand, "2026-11-24")
        self.assertEqual(rest, "")
        ids = [k["id"] for k in kassen]
        self.assertEqual(ids, ["aok-niedersachsen", "aok-nordwest", "aok-rheinland-hamburg", "barmer",
                               "bergische-krankenkasse", "bmw-bkk", "aok-sachsen-anhalt",
                               "sozialversicherung-fuer-landwirtschaft-forsten-und-gartenbau-svlfg"])
        bergische = kassen[4]
        self.assertEqual(bergische["webseite"], "https://www.bergische-krankenkasse.de")
        self.assertEqual(bergische["regionen"], ["HH", "HE", "NW"])
        self.assertEqual(kassen[6]["regionen"], ["ST"])          # nicht als „Sachsen“ erkannt
        self.assertEqual(kassen[5]["regionen"], "betriebsbezogen")
        self.assertEqual(kassen[7]["art"], "SVLFG")

    def test_aok_regionen_nrw_hat_zwei(self):
        kassen, _, _ = kassenliste.auslesen(KASSENLISTE)
        r = kassenliste.aok_regionen(kassen)
        self.assertEqual(r["NW"], ["aok-nordwest", "aok-rheinland-hamburg"])
        self.assertEqual(r["NI"], ["aok-niedersachsen"])
        self.assertEqual(r["BY"], [])


class Vergleich(unittest.TestCase):
    def test_merkmale_finden(self):
        merkmale = json.loads(vergleich.MERKMALE.read_text(encoding="utf-8"))["merkmale"]
        t = vergleich.merkmale_finden(FORMULAR, ["IBAN_Feld"], merkmale)
        for gefunden in ("versichertennummer", "geburtsdatum", "antragsart", "leistungsart", "pflegeperson",
                         "bankverbindung", "vertretung", "unterschrift", "datenschutz"):
            self.assertTrue(t[gefunden], gefunden)
        for nicht in ("dolmetscher", "klinik", "andere_traeger"):
            self.assertIsNone(t[nicht], nicht)

    def test_auswerten_schwelle(self):
        m = [{"id": "a", "label": "A"}, {"id": "b", "label": "B"}]
        erg = [{"kasse_id": k, "lesbar": True, "treffer": {"a": "x", "b": "x" if k == "k1" else None}} for k in ("k1", "k2", "k3", "k4")]
        z = {x["id"]: x for x in vergleich.auswerten(erg, m, 0.75)}
        self.assertTrue(z["a"]["gemeinsam"])
        self.assertFalse(z["b"]["gemeinsam"])
        self.assertEqual(z["b"]["anteil"], 0.25)


class Adressen(unittest.TestCase):
    def test_tabelle_ist_gueltig(self):
        bekannte = {k["id"] for k in g.lesen("kassen.json")["kassen"]}
        for z in kassen_adressen.einlesen():
            fehler = [f for f in kassen_adressen.pruefe_zeile(z, bekannte) if "Tage alt" not in f]
            self.assertEqual(fehler, [], z["kasse_id"])

    def test_quelle_pruefen_ohne_netz(self):
        z = {"anschrift": "Postfach 10 79 63|28079 Bremen", "quelle_url": "https://example.org/x"}
        alt = g.laden
        try:
            g.laden = lambda url, **k: b"<html>Pflegekasse Postfach 10 79 63 28079 Bremen</html>"
            self.assertTrue(kassen_adressen.quelle_pruefen(z).startswith("ok"))
            g.laden = lambda url, **k: b"<html>Neue Anschrift 28195 Bremen</html>"
            self.assertIn("PLZ nicht mehr", kassen_adressen.quelle_pruefen(z))
        finally:
            g.laden = alt


class Daten(unittest.TestCase):
    def test_alle_daten_haben_kopf(self):
        for pfad in g.DATEN.rglob("*.json"):
            d = json.loads(pfad.read_text(encoding="utf-8"))
            fehler, _ = pruefe_daten.pruefe_meta(pfad.name, d)
            self.assertEqual(fehler, [], pfad.name)

    def test_fragebogen(self):
        d = json.loads((g.DATEN / "fragebogen" / "pflegegrad-antrag.json").read_text(encoding="utf-8"))
        self.assertEqual(pruefe_daten.pruefe_fragebogen("pflegegrad-antrag", d), [])


if __name__ == "__main__":
    unittest.main()
