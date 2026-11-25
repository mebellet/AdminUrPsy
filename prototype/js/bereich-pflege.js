/* AdminUrPsy – Pilot: „Gut zu wissen“ auf der Seite Pflege & Entlastung.
   Die Zahlen kommen aus data/pflege-werte-2027.json (über js/datenpaket.js) – nicht aus dem HTML.
   So steht jede Zahl nur an einer Stelle und hat eine Quelle. */
(function () {
  var D = window.AU_DATEN && window.AU_DATEN["pflege-werte-2027"];
  var box = document.getElementById("werte-2027"), q = document.getElementById("werte-quelle");
  if (!D || !box) return;
  var w = D.werte;
  function euro(n) { return n.toLocaleString("de-DE") + " €"; }
  function datum(iso) { var p = iso.split("-"); return +p[2] + "." + +p[1] + "." + p[0]; }
  var eb = w.entlastungsbudget.wert, sr = w.sozialraumbudget.wert, fa = w.fristaussetzung.wert;
  var fakten = [
    [euro(eb["2"]) + "–" + euro(eb["5"]), "Entlastungsbudget pro Monat (Pflegegrad 2–5) – ersetzt das Pflegegeld"],
    [euro(sr.ab25), "Sozialraumbudget pro Monat für Hilfe im Alltag (unter 25 Jahren: " + euro(sr.unter25) + ")"],
    [w.schwellen_punkte.wert["2"] + " Punkte", "ab dann Pflegegrad 2 (bisher " + w.schwellen_punkte_bis_2026.wert["2"].toLocaleString("de-DE") + ")"],
    [datum(fa.von) + "–" + datum(fa.bis), "Entscheidungsfrist der Pflegekasse ausgesetzt – außer bei besonders dringenden Fällen"]
  ];
  box.innerHTML = fakten.map(function (f) { return '<div class="fact"><b>' + f[0] + "</b>" + f[1] + "</div>"; }).join("");
  if (q) q.innerHTML = (D.entwurf ? "<b>Gesetzentwurf – noch nicht beschlossen.</b> " : "") + "Quelle: " +
    D.meta.quellen.map(function (x) { return '<a href="' + x.url + '" target="_blank" rel="noopener">' + x.name + "</a>"; }).join(" · ") +
    " · Datensatz <code>data/pflege-werte-2027.json</code>, nächste Prüfung " + datum(D.meta.naechste_pruefung) + ".";
})();
