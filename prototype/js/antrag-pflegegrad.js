/* AdminUrPsy – Pilot: formloser Antrag auf Pflegegrad
   Baut auf:  js/datenpaket.js  (Datensätze aus data/, erzeugt von code/baue_datenpaket.py)
              js/fragebogen.js  (Fragebogen-Abspieler, SurveyJS-Format)
              vendor/pdf-lib.min.js (PDF im Browser, MIT-Lizenz)
              js/standort.js    (PLZ → Bundesland, nur lokal)
   Alles läuft im Browser. Es wird nichts verschickt. */
(function () {
  var root = document.getElementById("antrag");
  var D = window.AU_DATEN;
  if (!root) return;
  if (!D || !window.AUFragebogen) { root.innerHTML = '<p class="card">Datenpaket fehlt. Bitte <code>python3 code/baue_datenpaket.py</code> ausführen.</p>'; return; }

  var FB = D["fragebogen/pflegegrad-antrag"];
  var KASSEN = D.kassen.kassen;
  var ADR = D["pflegekassen-adressen"].adressen;
  var AOK = D["aok-regionen"].laender;
  var MERK = D["pflegeantrag-merkmale"];
  var WERTE = D["pflege-werte-2027"];
  var LAENDER = { BW: "Baden-Württemberg", BY: "Bayern", BE: "Berlin", BB: "Brandenburg", HB: "Bremen", HH: "Hamburg", HE: "Hessen", MV: "Mecklenburg-Vorpommern", NI: "Niedersachsen", NW: "Nordrhein-Westfalen", RP: "Rheinland-Pfalz", SL: "Saarland", SN: "Sachsen", ST: "Sachsen-Anhalt", SH: "Schleswig-Holstein", TH: "Thüringen" };

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function kasse(id) { for (var i = 0; i < KASSEN.length; i++) if (KASSEN[i].id === id) return KASSEN[i]; return null; }
  function kurzname(k) {
    return k.name.replace(/^AOK\s*-\s*Die Gesundheitskasse (?:für|in) /i, "AOK ")   // „AOK - Die Gesundheitskasse in Hessen“ → „AOK Hessen“
      .replace(/\s*-\s*Die Gesundheitskasse.*$/i, "").replace(/-Die Gesundheitskasse.*$/i, "");
  }
  function datum(iso) { if (!iso) return ""; var p = iso.split("-"); return +p[2] + "." + +p[1] + "." + p[0]; }
  function heute() { return new Date().toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" }); }
  function land(plz) { return window.AUStandort && /^\d{5}$/.test(plz || "") ? window.AUStandort.landAusPlz(plz) : ""; }

  // ---------- Kasse finden: Name + PLZ → Vorschlag aus dem Datensatz ----------
  // Die Person gibt den Namen ein, wie sie ihn kennt („AOK“, „TK“, „IKK classic“).
  // Passen mehrere Kassen, wird die für das Bundesland der PLZ bevorzugt (z. B. die regionale AOK);
  // gibt es keine regionale, die allgemein (bundesweit) geöffnete. Maßgeblich bleibt die Versichertenkarte.
  var ABKUERZUNG = { tk: "techniker", ersatzkasse: "", ortskrankenkasse: "aok", "allgemeine ortskrankenkasse": "aok",
    betriebskrankenkasse: "bkk", innungskrankenkasse: "ikk", landwirtschaftliche: "svlfg", lkk: "svlfg", kbs: "knappschaft" };
  function norm(t) {
    t = String(t || "").toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
      .replace(/die gesundheitskasse/g, " ").replace(/allgemeine ortskrankenkasse/g, "aok")
      .replace(/betriebskrankenkasse/g, "bkk").replace(/innungskrankenkasse/g, "ikk").replace(/[^a-z0-9]+/g, " ").trim();
    return t;
  }
  function woerter(t) { return norm(t).split(" ").filter(Boolean).map(function (w) { return ABKUERZUNG[w] !== undefined ? ABKUERZUNG[w] : w; }).filter(Boolean); }
  // Treffer: jedes eingegebene Wort ist Anfang eines Worts im Kassennamen (oder in der Kennung)
  function trefferNachName(eingabe) {
    var q = woerter(eingabe); if (!q.length) return [];
    return KASSEN.filter(function (k) {
      var w = (norm(k.name) + " " + norm(kurzname(k)) + " " + k.id.replace(/-/g, " ")).split(" ");
      return q.every(function (x) { return w.some(function (y) { return y.indexOf(x) === 0; }); });
    });
  }
  // Rang je Kasse für ein Bundesland: 1 regional zuständig · 2 allgemein geöffnet · 3 nur für bestimmte Betriebe · 4 nicht in diesem Land
  function rang(k, l) {
    var r = k.regionen;
    if (Array.isArray(r)) {
      if (!l) return 2;
      if (r.indexOf(l) === -1) return 4;
      return r.length <= 3 ? 1 : 2;
    }
    if (r === "bundesweit") return 2;
    return 3;
  }
  var RANG_TEXT = { 1: "regionale Kasse für dein Bundesland", 2: "allgemein geöffnet – eine regionale Ausgabe gibt es nicht", 3: "nur für Beschäftigte bestimmter Betriebe oder Branchen", 4: "in deinem Bundesland nicht geöffnet" };

  function kasseFinden(w) {
    var l = land(w.plz), t = trefferNachName(w.kasse_name);
    t.sort(function (a, b) { return rang(a, l) - rang(b, l) || kurzname(a).localeCompare(kurzname(b), "de"); });
    var best = t.length ? rang(t[0], l) : 0;
    var oben = t.filter(function (k) { return rang(k, l) === best; });
    // Nur bei AOK gibt es regionale Ausgaben – ohne PLZ also kein Vorschlag
    if (!l && oben.length > 1) best = 0;
    return { land: l, treffer: t, oben: best ? oben : [], rang: best, eindeutig: best > 0 && best < 4 && oben.length === 1 ? oben[0] : null };
  }

  function kassenAuswahl(w, fund) {
    var sortiert = KASSEN.slice().sort(function (a, b) { return kurzname(a).localeCompare(kurzname(b), "de"); });
    var gruppen = [], gezeigt = {};
    function eintrag(k) { gezeigt[k.id] = 1; return { value: k.id, text: kurzname(k) }; }
    if (fund.oben.length) gruppen.push({ gruppe: "Vorschlag" + (fund.land ? " für PLZ " + w.plz : ""), choices: fund.oben.map(eintrag) });
    var rest = fund.treffer.filter(function (k) { return !gezeigt[k.id]; });
    if (rest.length) gruppen.push({ gruppe: "Weitere Treffer für „" + w.kasse_name + "“", choices: rest.map(eintrag) });
    gruppen.push({ gruppe: "Alle Krankenkassen (" + KASSEN.length + ")", choices: sortiert.map(function (k) { return { value: k.id, text: kurzname(k) }; }) });
    return gruppen;
  }

  function vorschlagHtml(w, fund) {
    if (!String(w.kasse_name || "").trim()) return "<p>Du hast keinen Namen eingetragen. Wähle die Kasse unten aus der Liste – oder geh einen Schritt zurück und trag den Namen ein.</p>";
    var l = fund.land, wo = l ? " für deine PLZ (" + esc(LAENDER[l]) + ")" : "";
    if (!fund.treffer.length) return "<p>Zu „" + esc(w.kasse_name) + "“ finden wir keine Kasse. Wähle sie unten aus der Liste aller Kassen.</p>";
    if (fund.eindeutig) {
      var k = fund.eindeutig;
      return '<p class="vorschlag">Vorschlag' + wo + ": <b>" + esc(kurzname(k)) + "</b></p><p>" + esc(RANG_TEXT[fund.rang]) + ". Prüf den Namen auf der Versichertenkarte – die gilt.</p>" +
        (fund.rang === 3 ? "<p>Diese Kasse ist nur für Beschäftigte bestimmter Betriebe geöffnet. Bist du sicher, dass es deine ist?</p>" : "");
    }
    if (fund.rang === 4) return "<p>Die Kassen zu „" + esc(w.kasse_name) + "“ sind in " + esc(LAENDER[l]) + " eigentlich nicht geöffnet. Prüf den Namen auf der Versichertenkarte und wähle unten.</p>";
    if (!l && fund.treffer.length > 1 && fund.treffer.every(function (k) { return Array.isArray(k.regionen); }))
      return "<p>Davon gibt es regionale Kassen. Gib oben deine PLZ ein, dann schlagen wir die passende vor.</p>";
    if (fund.oben.length === 2 && fund.oben.every(function (k) { return k.art === "AOK"; }))
      return "<p>In " + esc(LAENDER[l]) + " gibt es zwei AOKs: " + fund.oben.map(function (k) { return "<b>" + esc(kurzname(k)) + "</b>"; }).join(" und ") + ". Welche es ist, steht auf deiner Versichertenkarte. Wähle unten.</p>";
    return "<p>Zu „" + esc(w.kasse_name) + "“ passen " + (fund.oben.length || fund.treffer.length) + " Kassen" + wo + ". Wähle deine unten aus – der genaue Name steht auf der Versichertenkarte.</p>";
  }

  // Vorschlag übernehmen, solange die Person nicht selbst etwas anderes gewählt hat
  function kasseVorbereiten(f) {
    var w = f.werte, fund = kasseFinden(w);
    if (!w.kasse_selbst_gewaehlt && fund.eindeutig) w.kasse = fund.eindeutig.id;
    if (!w.kasse_selbst_gewaehlt && !fund.eindeutig && String(w.kasse_name || "").trim()) w.kasse = "";
    f.setzeAuswahl("kasse", kassenAuswahl(w, fund));
    // Hinweis nur, wenn nichts Passendes gefunden wurde (kein Name oder kein Treffer); sonst spricht die Vorauswahl für sich
    f.html.kasse_vorschlag = fund.treffer.length ? "" : vorschlagHtml(w, fund);
    var i = kassenInfo(w); f.setzeVariable("anschrift_fehlt", !!i.fehlt); f.html.kasse_info = i.html;
  }

  function kassenInfo(w) {
    var k = kasse(w.kasse); if (!k) return { html: "", fehlt: false };
    var a = ADR[k.id], h = "";
    var l = land(w.plz), aoks = l ? (AOK[l] || []) : [];
    if (k.art === "AOK" && aoks.length && aoks.indexOf(k.id) === -1)
      h += "<p>Hinweis: Für deine PLZ wäre eher " + aoks.map(function (id) { return esc(kurzname(kasse(id))); }).join(" oder ") + " zuständig. Schau auf deine Versichertenkarte – die gilt.</p>";
    if (k.art === "AOK" && aoks.length > 1 && aoks.indexOf(k.id) !== -1)
      h += "<p>In " + esc(LAENDER[l]) + " gibt es zwei AOKs. Welche es ist, steht auf deiner Versichertenkarte.</p>";
    if (a && a.status !== "offen" && a.zeilen.length) {
      h += "<p><b>Anschrift der Pflegekasse:</b><br>" + a.zeilen.map(esc).join("<br>") + "</p>";
      h += '<p class="quelle">Quelle: <a href="' + esc(a.quelle.url) + '" target="_blank" rel="noopener">' + esc(a.quelle.art || "Webseite der Kasse") + "</a>, geprüft am " + datum(a.geprueft_am) +
        (a.status === "zu_pruefen" ? " · <b>noch zu bestätigen</b>" : "") + "</p>";
      return { html: h, fehlt: false, adresse: a.zeilen };
    }
    h += "<p>Für diese Kasse haben wir noch keine geprüfte Anschrift" + (k.webseite ? ' – du findest sie auf <a href="' + esc(k.webseite) + '" target="_blank" rel="noopener">' + esc(k.webseite.replace(/^https?:\/\//, "")) + "</a>" : "") + ".</p>";
    return { html: h, fehlt: true };
  }

  // ---------- Brief ----------
  var ROLLE = { eltern: "als sorgeberechtigter Elternteil", vollmacht: "als bevollmächtigte Person", betreuung: "als rechtliche Betreuerin bzw. rechtlicher Betreuer" };
  function brief(w) {
    var fremd = w.fuer === "andere", N = (w.v_name || "").trim() || "die versicherte Person", rolle = ROLLE[w.rolle] || "";
    var k = kasse(w.kasse), info = kassenInfo(w);
    var empf = info.adresse ? info.adresse.slice() : [k ? "Pflegekasse bei der " + kurzname(k) : "Pflegekasse"].concat((w.kasse_anschrift || "").split("\n").filter(Boolean));
    if (empf.length < 2) empf.push("", "");
    var body = ["Sehr geehrte Damen und Herren,"];
    var geb = w.v_geburt ? " (geboren am " + datum(w.v_geburt) + ")" : "";
    if (w.art === "hoeher") body.push(fremd
      ? "hiermit beantrage ich " + (rolle ? rolle + " " : "") + "für " + N + geb + " eine erneute Begutachtung und die Einstufung in einen höheren Pflegegrad. Derzeit besteht Pflegegrad " + (w.pg_alt || "___") + ". Der Antrag gilt ab dem Datum dieses Schreibens."
      : "ich habe derzeit Pflegegrad " + (w.pg_alt || "___") + ". Mein Hilfebedarf ist größer geworden. Hiermit beantrage ich eine erneute Begutachtung und die Einstufung in einen höheren Pflegegrad. Der Antrag gilt ab dem Datum dieses Schreibens.");
    else body.push(fremd
      ? "hiermit beantrage ich " + (rolle ? rolle + " " : "") + "für " + N + geb + " Leistungen der Pflegeversicherung. Bitte stellen Sie fest, ob " + N + " pflegebedürftig ist, und ordnen Sie einen Pflegegrad zu. Der Antrag gilt ab dem Datum dieses Schreibens."
      : "hiermit beantrage ich Leistungen der Pflegeversicherung. Bitte stellen Sie fest, ob ich pflegebedürftig bin, und ordnen Sie mir einen Pflegegrad zu. Der Antrag gilt ab dem Datum dieses Schreibens.");
    if (fremd && w.rolle === "vollmacht") body.push("Eine Vollmacht liegt bei.");
    if (fremd && w.rolle === "betreuung") body.push("Eine Kopie meines Betreuerausweises liegt bei.");
    if (w.dringend === "ja") { body.push({ fett: "Der Antrag ist besonders dringend." }); body.push(((w.grund || "").trim() ? w.grund.trim() + " " : "") + "Ich bitte daher um eine vorrangige Bearbeitung und eine schnelle Entscheidung."); }
    if (w.psych) body.push((fremd ? N + " ist" : "Ich bin") + " wegen einer psychischen Erkrankung im Alltag eingeschränkt. Bitte berücksichtigen Sie das bei der Begutachtung, besonders in den Bereichen „Verhaltensweisen und psychische Problemlagen“, „Gestaltung des Alltagslebens und sozialer Kontakte“ und „Umgang mit krankheits- und therapiebedingten Anforderungen“.");
    if (w.arzt === "ja") {
      var pr = [["Hausarztpraxis", w.hausarzt], ["Fachärztliche Praxis", w.facharzt]].filter(function (x) { return (x[1] || "").trim(); }).map(function (x) { return x[0] + ": " + x[1].trim(); });
      body.push((fremd ? "Es besteht Einverständnis, dass Sie bzw. der Medizinische Dienst bei den behandelnden Ärztinnen und Ärzten von " + N : "Ich bin damit einverstanden, dass Sie bzw. der Medizinische Dienst bei meinen behandelnden Ärztinnen und Ärzten") + " Auskünfte und Befunde einholen, soweit sie für die Begutachtung nötig sind." + (pr.length ? " Behandelnd sind:" : ""));
      if (pr.length) body.push({ liste: pr });
    } else if (w.arzt === "fragen") body.push("Bitte sprechen Sie mich vorher an, bevor Sie Unterlagen bei " + (fremd ? "den behandelnden Ärztinnen und Ärzten von " + N : "meinen behandelnden Ärztinnen und Ärzten") + " anfordern.");
    var bitten = [];
    if (w.schriftlich) bitten.push("Bitte kündigen Sie den Termin für die Begutachtung schriftlich und mit ausreichend Vorlauf an.");
    if (fremd) bitten.push("Ich möchte bei der Begutachtung dabei sein. Bitte stimmen Sie den Termin mit mir ab.");
    if (w.gutachten) bitten.push("Bitte schicken Sie mir das Pflegegutachten zusammen mit dem Bescheid zu.");
    if (w.beratung) bitten.push("Bitte bieten Sie " + (fremd ? "uns" : "mir") + " eine kostenlose Pflegeberatung an.");
    if (bitten.length) { body.push("Außerdem bitte ich um Folgendes:"); body.push({ liste: bitten }); }
    body.push("Falls Sie ein eigenes Antragsformular brauchen, schicken Sie es mir bitte zu. Der Antrag gilt trotzdem ab dem Datum dieses Schreibens. Bitte bestätigen Sie mir den Eingang.");
    if (fremd) body.push("Bitte richten Sie Post und Rückfragen an mich" + (w.telefon ? " (Telefon " + w.telefon + ")" : "") + ".");
    var zusatz = fremd
      ? ["Versicherte Person: " + N + (w.v_geburt ? ", geboren am " + datum(w.v_geburt) : ""), "Versichertennummer: " + (w.v_versnr || "______________________")]
      : [(w.geburt ? "Geburtsdatum: " + datum(w.geburt) : ""), "Versichertennummer: " + (w.versnr || "______________________")].filter(Boolean);
    var ort = (w.plzort || "").replace(/^\d{5}\s*/, "").trim();
    return {
      absender: [w.name, w.strasse, w.plzort, w.telefon ? "Telefon: " + w.telefon : ""].filter(Boolean),
      empfaenger: empf, datum: (ort ? ort + ", " : "") + heute(),
      betreff: w.art === "hoeher" ? "Antrag auf Höherstufung des Pflegegrads" : "Antrag auf Leistungen der Pflegeversicherung – Feststellung eines Pflegegrads",
      zusatz: zusatz, body: body,
      anlagen: fremd && w.rolle === "vollmacht" ? ["Vollmacht"] : fremd && w.rolle === "betreuung" ? ["Kopie des Betreuerausweises"] : [],
      name: fremd ? (w.name || "") + " (" + (rolle ? rolle.replace(/^als /, "") + " " : "") + "für " + N + ")" : w.name
    };
  }

  // Was die Kasse später abfragt und noch nicht im Brief steht → Merkzettel
  function merkzettel() {
    return MERK.merkmale.filter(function (m) { return m.gemeinsam && !m.im_formlosen_antrag && m.bereithalten; });
  }

  // ---------- PDF mit pdf-lib ----------
  function winAnsi(s) { return String(s || "").replace(/[‐‑]/g, "-").replace(/ /g, " ").replace(/[^\x20-\x7E -ÿ€„“”‚‘’–—…•]/g, "?"); }
  async function pdfErzeugen(w) {
    var PL = window.PDFLib, b = brief(w);
    var doc = await PL.PDFDocument.create();
    doc.setTitle(b.betreff); doc.setProducer("AdminUrPsy (Pilot)"); doc.setCreator("AdminUrPsy");
    var R = await doc.embedFont(PL.StandardFonts.Helvetica), F = await doc.embedFont(PL.StandardFonts.HelveticaBold);
    var MM = 72 / 25.4, W = 210, H = 297, L = 25, RR = 20, page, y;
    var navy = PL.rgb(0.047, 0.161, 0.333), grau = PL.rgb(0.29, 0.365, 0.494), pink = PL.rgb(0.725, 0.231, 0.553);
    function neueSeite() { page = doc.addPage([W * MM, H * MM]); y = 20; }
    function zeile(t, o) { o = o || {}; var g = o.groesse || 11; page.drawText(winAnsi(t), { x: (o.x || L) * MM, y: (H - y) * MM, size: g, font: o.fett ? F : R, color: o.farbe || navy }); }
    function umbrechen(t, font, g, breite) {
      var worte = winAnsi(t).split(" "), z = [], akt = "";
      worte.forEach(function (wort) { var test = akt ? akt + " " + wort : wort; if (font.widthOfTextAtSize(test, g) / MM > breite && akt) { z.push(akt); akt = wort; } else akt = test; });
      if (akt) z.push(akt); return z;
    }
    function absatz(t, o) {
      o = o || {}; var g = o.groesse || 11, lh = g * 1.4 / MM, x = L + (o.einzug || 0);
      umbrechen(t, o.fett ? F : R, g, W - RR - x).forEach(function (z, i) {
        if (y + lh > H - 22) neueSeite();
        y += lh * 0.8;
        if (i === 0 && o.punkt) zeile("–", { x: x - 4.5, groesse: g });
        zeile(z, { x: x, groesse: g, fett: o.fett, farbe: o.farbe });
        y += lh * 0.2;
      });
      y += (o.danach != null ? o.danach : 2);
    }
    neueSeite();
    b.absender.forEach(function (t) { absatz(t, { groesse: 10, danach: 0 }); });
    y = Math.max(y + 6, 45);
    absatz(b.absender.slice(0, 3).join(", "), { groesse: 7, farbe: grau, danach: 1.5 });
    b.empfaenger.forEach(function (t) { if (t) absatz(t, { danach: 0 }); else { y += 5.5; page.drawLine({ start: { x: L * MM, y: (H - y) * MM }, end: { x: (L + 80) * MM, y: (H - y) * MM }, thickness: 0.4, color: grau }); } });
    y = Math.max(y + 8, 95);
    var dt = winAnsi(b.datum); page.drawText(dt, { x: (W - RR) * MM - R.widthOfTextAtSize(dt, 11), y: (H - y) * MM, size: 11, font: R, color: navy }); y += 8;
    absatz(b.betreff, { fett: true, danach: 1 });
    b.zusatz.forEach(function (t) { absatz(t, { groesse: 10, danach: 0 }); });
    y += 6;
    b.body.forEach(function (x) {
      if (typeof x === "string") absatz(x, { danach: 3.5 });
      else if (x.fett) absatz(x.fett, { fett: true, danach: 2 });
      else if (x.liste) { x.liste.forEach(function (t) { absatz(t, { einzug: 5, punkt: true, danach: 1 }); }); y += 2.5; }
    });
    absatz("Mit freundlichen Grüßen", { danach: 0 });
    y += 14; if (y > H - 30) { neueSeite(); y += 14; }
    page.drawLine({ start: { x: L * MM, y: (H - y) * MM }, end: { x: (L + 75) * MM, y: (H - y) * MM }, thickness: 0.4, color: navy });
    y += 1; absatz("Unterschrift", { groesse: 9, farbe: grau, danach: 1 });
    absatz(b.name, { groesse: 10 });
    if (b.anlagen.length) { y += 3; absatz("Anlagen", { fett: true, groesse: 10, danach: 0.5 }); b.anlagen.forEach(function (t) { absatz(t, { groesse: 10, einzug: 5, punkt: true, danach: 0.3 }); }); }

    // Seite 2: Merkzettel (nicht mitschicken)
    neueSeite();
    absatz("Merkzettel – nicht mitschicken", { fett: true, groesse: 15, farbe: pink, danach: 2 });
    absatz("Nach deinem Antrag schickt die Pflegekasse meist ein eigenes Formular. Diese Angaben fragen die Formulare fast immer ab – leg sie schon bereit:", { danach: 4 });
    merkzettel().forEach(function (m) { absatz(m.label + (m.bereithalten ? ": " + m.bereithalten : ""), { einzug: 5, punkt: true, danach: 1.5 }); });
    y += 4;
    absatz("Grundlage: Vergleich der Pflegeanträge von " + MERK.formulare.length + " Kassen (" + MERK.formulare.map(function (f) { return kurzname(kasse(f.kasse_id) || { name: f.kasse_id }); }).join(", ") + "), Stand " + datum(MERK.meta.stand) + ".", { groesse: 9, farbe: grau });
    absatz("Erstellt mit AdminUrPsy (Pilot). Allgemeine Hilfe, keine Rechtsberatung.", { groesse: 9, farbe: grau });

    var bytes = await doc.save();
    var url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    var a = document.createElement("a"); a.href = url; a.download = (w.art === "hoeher" ? "Antrag-Hoeherstufung-Pflegegrad" : "Antrag-Pflegegrad") + ".pdf";
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  // ---------- Fertig-Seite ----------
  function zusammenfassung(w) {
    var b = brief(w), h = '<p>Hier ist dein Brief. Ändern kannst du alles über die Kreise oben oder „Zurück“.</p><div class="letter-preview"><p><b>' + esc(b.betreff) + "</b></p>";
    b.body.forEach(function (x) {
      if (typeof x === "string") h += "<p>" + esc(x) + "</p>";
      else if (x.fett) h += "<p><b>" + esc(x.fett) + "</b></p>";
      else h += "<ul>" + x.liste.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>";
    });
    h += "<p>Mit freundlichen Grüßen<br>" + esc(b.name) + "</p></div>";
    h += '<div class="pdf-actions"><button class="btn" type="button" id="pdf">Antrag als PDF herunterladen</button><button class="btn ghost" type="button" id="neu">Alles löschen</button></div>';
    h += '<h3>Leg schon mal bereit</h3><p>Danach schickt dir die Pflegekasse meist ein eigenes Formular. Das fragen die Formulare von ' + MERK.formulare.length + ' Kassen (fast) alle ab:</p><ul class="checks">' +
      merkzettel().map(function (m) { return "<li><b>" + esc(m.label) + "</b>" + (m.bereithalten ? " – " + esc(m.bereithalten) : "") + "</li>"; }).join("") + "</ul>";
    h += '<p class="quelle">Quelle: <code>data/pflegeantrag-merkmale.json</code> · Stand ' + datum(MERK.meta.stand) + ".</p>";
    return h;
  }

  // ---------- Start ----------
  var loc = {}; try { loc = JSON.parse(localStorage.getItem("adminurpsy-standort")) || {}; } catch (e) {}
  var f = AUFragebogen.start(root, FB, {
    speicherSchluessel: "adminurpsy-pilot-pflegegrad",
    vorbelegung: { plz: loc.plz || "" },
    vorSeite: function (p, f) {
      kasseVorbereiten(f);
      if (p.name === "fertig") f.html.zusammenfassung = zusammenfassung(f.werte);
    },
    nachSeite: function (p, f, el) {
      var b = el.querySelector("#pdf"); if (b) b.addEventListener("click", function () { b.disabled = true; pdfErzeugen(f.werte).catch(function (e) { alert("PDF konnte nicht erstellt werden: " + e.message); }).then(function () { b.disabled = false; }); });
      var n = el.querySelector("#neu"); if (n) n.addEventListener("click", function () { if (n.dataset.sicher) { f.loeschen(); location.reload(); } else { n.dataset.sicher = "1"; n.textContent = "Wirklich alles löschen?"; } });
    },
    beiAenderung: function (name, wert, f) {
      // Name und PLZ werden einfach eingetragen; der Vorschlag kommt erst auf der nächsten Seite (vorSeite → kasseVorbereiten)
      if (name === "kasse") { f.werte.kasse_selbst_gewaehlt = !!wert; f.speichern(); return; }
      if (name === "plz" || name === "kasse_name") {
        var suche = (f.werte.plz || "") + "|" + (f.werte.kasse_name || "");
        if (suche === f.werte.kasse_suche) return;
        f.werte.kasse_suche = suche;
        f.werte.kasse_selbst_gewaehlt = false;                                                 // neue Angabe → neuer Vorschlag
        f.speichern();
      }
    }
  });
  window.AUPilot = { brief: function () { return brief(f.werte); }, pdf: function () { return pdfErzeugen(f.werte); }, werte: f.werte };
})();
