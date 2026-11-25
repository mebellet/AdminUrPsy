# AdminUrPsy – Pilot

**Anträge und Hilfe – an einem Ort.** AdminUrPsy soll Menschen mit psychischer Erkrankung helfen, Verwaltungsaufgaben rund um die benötigte Unterstützung zu bewältigen: Über Ansprüche informieren, Anträge ausfüllen, Fristen im Blick behalten, die zuständige Stelle finden. Alle persönlichen Daten bleiben dabei auf dem eigenen Gerät.

> ⚠️ **Pilotprojekt.** Dieses Repository zeigt lediglich das Design, den geplanten Aufbau und einen ersten vorläufigen Schritt: den **formlosen Antrag auf Pflegegrad**. Alle anderen Bereiche sind noch Platzhalter.
AdminUrPsy ersetzt keine Beratung.

## Ausprobieren

Repository herunterladen („Code“ → „Download ZIP“), entpacken und `prototype/index.html` im Browser öffnen.

Der Prototyp lädt nichts von fremden Servern (keine Schriften, keine Tracker). Eingaben werden nur im Browser gespeichert.

## Aufbau

```
prototype/   Web-App (HTML, CSS, JavaScript – ohne Build-Schritt)
  index.html                     Startseite mit den 6 Bereichen
  bereiche/*.html                je Bereich eine Seite (Pilot: Platzhalter, außer Pflege)
  pflege/pflegegrad-antrag.html  Antrag auf Pflegegrad (Pilot)
  js/fragebogen.js               spielt Fragebögen im SurveyJS-JSON-Format ab
  js/antrag-pflegegrad.js        Kassenwahl, Brief, PDF (pdf-lib), Merkzettel
  js/datenpaket.js               alle Datensätze aus data/ (erzeugt im Ordner code, nicht von Hand ändern)
  vendor/pdf-lib.min.js          pdf-lib 1.17.1 (MIT-Lizenz)
data/        öffentliche Datensätze als JSON – jede Datei mit Quelle, Stand, nächster Prüfung
  kassen.json, aok-regionen.json, pflegekassen-adressen.json,
  pflegeantrag-merkmale.json, pflege-werte-2027.json, fragebogen/pflegegrad-antrag.json
code/        Python-Skripte, die die Datensätze aus dem Internet beziehen und prüfen (vorläufig, siehe code/README.md)
screenshots/ Bilder der Web-App
```

## Die 6 Bereiche

Therapien · Reha & Erwerbsminderungsrente · Grad der Behinderung · Teilhabe & Assistenz · Pflege & Entlastung · Familie & Kinder

Reha und Erwerbsminderungsrente gehören zusammen, weil vor einer Rente oft erst eine Reha verlangt wird.

## Was der Pilot zeigt: Antrag auf Pflegegrad

1. **Fragen statt Formular:** ein Fragebogen in einfacher Sprache, für dich selbst oder eine andere Person (Elternteil, Vollmacht, rechtliche Betreuung). Die Fragen stehen als JSON in `data/fragebogen/`.
2. **Zuständige Pflegekasse:** Liste aller gesetzlichen Kassen (GKV-Spitzenverband). Bei der AOK schlägt die App anhand der PLZ die regionale AOK vor. Ist eine geprüfte Anschrift im Datensatz, steht sie mit Quelle im Brief, sonst trägt man sie selbst ein.
3. **PDF im Gerät:** Brief an die Pflegekasse mit pdf-lib, dazu ein Merkzettel: was die Formulare der Kassen danach (fast) immer abfragen – vorläufig ermittelt durch einen Vergleich der Pflegeanträge von 4 Kassen.

## Grundsätze

- **Privacy by Design:** kein Konto, keine Tracker, keine Abfragen an fremde Server aus der App. Öffentliche Daten kommen als ganzes Paket.
- **Jede Angabe mit Quelle und Prüfdatum** (`meta` in jeder Datei unter `data/`, geprüft mit `code/pruefe_daten.py`).
- **Einfache Sprache**, Ansprache mit „du“. Ziel: Barrierefreiheit nach WCAG 2.2 AA.
- **Keine Rechts- oder Behandlungsberatung:** feste Fragen und Textbausteine, keine Bewertung des Einzelfalls.

## Lizenz

Code: EUPL-1.2 · Daten, Texte und Design: CC BY 4.0 · Name und Logo (das kleine Zeichen neben dem Namen) sind ausgenommen; die Blüte auf der Startseite gehört zum Design. Details in `LICENSE`.
Fremde Software: pdf-lib (MIT, siehe `prototype/vendor/LICENSE-pdf-lib.md`).
