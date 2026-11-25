# code/ – Skripte für die Datenpflege

Diese Python-Skripte laufen **nicht in der App**. Sie holen öffentliche Daten aus dem Internet, prüfen sie und legen sie als JSON in `data/` ab. Die App lädt nur diese fertigen Dateien (gebündelt in `prototype/js/datenpaket.js`) – sie fragt selbst nie im Internet nach. So verrät eine Abfrage wie „AOK + PLZ“ nichts über die Person.

## Start

```bash
python3 -m pip install -r code/requirements.txt   # nur pypdf, zum Lesen von PDFs
python3 code/alle.py                              # alles aktualisieren (braucht Internet)
python3 code/alle.py --offline                    # nur prüfen + Datenpaket bauen
python3 -m unittest discover -s code/tests -v     # Tests ohne Internet
```

Python 3.9 oder neuer. Außer `pypdf` nur die Standardbibliothek.

## Die Skripte

| Skript | Quelle | Ergebnis in `data/` | Art |
|---|---|---|---|
| `kassenliste.py` | Krankenkassenliste des GKV-Spitzenverbands (PDF, laufend aktualisiert) | `kassen.json`, `aok-regionen.json` | automatisch |
| `kassen_adressen.py` | `quellen/kassen-adressen.csv` (von Hand recherchiert, je Zeile mit Quelle und Prüfdatum) | `pflegekassen-adressen.json` | redaktionell + automatische Prüfung (`--pruefen`) |
| `pflegeantraege_vergleich.py` | Pflegeanträge von 4 Kassen (`quellen/pflegeantraege.csv`) + Suchmuster (`quellen/merkmale.json`) | `pflegeantrag-merkmale.json` | automatisch, Ergebnis von Hand prüfen |
| `pflege_werte.py` | `quellen/pflege-werte-2027.json` (aus dem Gesetzentwurf übernommen, mit Paragraf) | `pflege-werte-2027.json` | redaktionell + Plausibilitätsprüfung |
| `pruefe_daten.py` | alle Dateien in `data/` | – (Bericht) | Prüfung: Quelle, Stand, nächste Prüfung |
| `baue_datenpaket.py` | alle Dateien in `data/` | `prototype/js/datenpaket.js` | Bündeln für die App |
| `gemeinsam.py` | – | – | Hilfsfunktionen (Laden mit Zwischenspeicher, JSON-Kopf) |

## Grundsätze

- **Jede Datei in `data/` hat einen Kopf `meta`** mit Titel, Quellen, Stand und nächster Prüfung. `pruefe_daten.py` meldet fehlende Angaben und überfällige Prüfungen.
- **Verlinken statt auslesen:** Webseiten von Kassen werden nicht automatisch ausgelesen („gescrapt“). Anschriften werden von Hand recherchiert; das Skript prüft nur, ob PLZ und Ort in der angegebenen Quelle noch stehen.
- **Keine fremden Dokumente im Repository:** Heruntergeladene PDFs liegen nur im Zwischenspeicher `code/_cache/` (steht in `.gitignore`). Ins Repository kommt nur das Ergebnis (welche Angaben abgefragt werden).
- **Rücksichtsvoll abrufen:** Zwischenspeicher, 1 Sekunde Pause nach jedem Abruf, eigener User-Agent.
- **Ergebnisse sind Vorschläge:** Der Formularvergleich ist eine Textsuche. Bei Abweichungen gilt das Formular, nicht das Skript.

## Stand der Daten (25.11.2026)

Die Daten in `data/` wurden **einmal per Recherche befüllt**, weil die Arbeitsumgebung keinen Internetzugang für die Skripte hatte. Der Kopf jeder Datei sagt das (`erzeugt_von: "Recherche (Erstbefüllung) …"`). Beim ersten Lauf von `alle.py` mit Internet ersetzen die Skripte diese Daten. Die Skripte sind mit Testdaten geprüft (`code/tests/`), aber **noch nicht gegen die echten Quellen gelaufen** – beim ersten Lauf bitte die Ausgabe ansehen.

| Datensatz | Stand | Lücken |
|---|---|---|
| Kassenliste | 92 Kassen, Liste vom 24.11.2026 | – |
| Pflegekassen-Anschriften | 19 Kassen: 12 belegt, 4 zu prüfen, 3 offen (AOK Bayern, AOK Sachsen-Anhalt, DAK) | 73 Kassen noch ohne Eintrag – die App bittet dann um Eingabe |
| Formularvergleich | 4 Kassen (AOK PLUS, AOK Baden-Württemberg, Mobil, BKK24) | Ersatzkassen fehlen (kein stabiler PDF-Link gefunden) |
| Pflegewerte 2027 | Gesetzentwurf (BT-Drucksache 21/8869) | nach Beschluss (geplant 11./18.12.2026) abgleichen |

## Offene Punkte

- **Nutzungsrechte klären:** Kassenliste (GKV-Spitzenverband), ARGE·IK-Adressdatei (kostenpflichtig, 153 € + MwSt., Weitergabe in offenen Daten?), Formulare der Kassen (nur auswerten, nicht weitergeben).
- **Automatisch laufen lassen:** später als GitHub Action (z. B. wöchentlich `alle.py`, bei Änderungen ein Pull Request zum Prüfen).
- **PLZ → Bundesland** liegt noch als Näherung in `prototype/js/standort.js`. Später aus offenen Daten (z. B. OpenPLZ API, Lizenz prüfen) als eigenes Skript.
