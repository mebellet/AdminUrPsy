/* AdminUrPsy – Standort (übernommen aus website/js/standort.js, erweitert um window.AUStandort)
   Ursprünglich: Standort & Krankenkasse
   Speichert nur lokal im Browser (localStorage). Nichts wird verschickt.
   Das Bundesland wird aus der PLZ abgeleitet (Näherung über PLZ-Bereiche),
   kann bei Grenzfällen aber von Hand korrigiert werden. */
(function () {
  var KEY = "adminurpsy-standort";

  var LAENDER = {
    BW: "Baden-Württemberg", BY: "Bayern", BE: "Berlin", BB: "Brandenburg",
    HB: "Bremen", HH: "Hamburg", HE: "Hessen", MV: "Mecklenburg-Vorpommern",
    NI: "Niedersachsen", NW: "Nordrhein-Westfalen", RP: "Rheinland-Pfalz",
    SL: "Saarland", SN: "Sachsen", ST: "Sachsen-Anhalt", SH: "Schleswig-Holstein",
    TH: "Thüringen"
  };

  /* PLZ → Bundesland.
     Grundregel über die ersten 2 Ziffern, Ausnahmen über 3–4 Ziffern (längste passende Ziffernfolge gewinnt).
     Näherung: Einige wenige PLZ liegen in zwei Ländern. Später durch amtliche Daten ersetzen
     (siehe arbeitsplaene/00-gesamtplan.md, Abschnitt 3). */
  var PLZ_LAND = {
    "01": "SN", "02": "SN", "03": "BB", "04": "SN", "06": "ST", "07": "TH", "08": "SN", "09": "SN",
    "10": "BE", "12": "BE", "13": "BE", "14": "BB", "15": "BB", "16": "BB", "17": "MV", "18": "MV", "19": "MV",
    "20": "HH", "21": "NI", "22": "HH", "23": "SH", "24": "SH", "25": "SH", "26": "NI", "27": "NI", "28": "NI", "29": "NI",
    "30": "NI", "31": "NI", "32": "NW", "33": "NW", "34": "HE", "35": "HE", "36": "HE", "37": "NI", "38": "NI", "39": "ST",
    "40": "NW", "41": "NW", "42": "NW", "44": "NW", "45": "NW", "46": "NW", "47": "NW", "48": "NW", "49": "NI",
    "50": "NW", "51": "NW", "52": "NW", "53": "NW", "54": "RP", "55": "RP", "56": "RP", "57": "NW", "58": "NW", "59": "NW",
    "60": "HE", "61": "HE", "63": "HE", "64": "HE", "65": "HE", "66": "SL", "67": "RP", "68": "BW", "69": "BW",
    "70": "BW", "71": "BW", "72": "BW", "73": "BW", "74": "BW", "75": "BW", "76": "BW", "77": "BW", "78": "BW", "79": "BW",
    "80": "BY", "81": "BY", "82": "BY", "83": "BY", "84": "BY", "85": "BY", "86": "BY", "87": "BY", "88": "BW", "89": "BW",
    "90": "BY", "91": "BY", "92": "BY", "93": "BY", "94": "BY", "95": "BY", "96": "BY", "97": "BY", "98": "TH", "99": "TH",
    // Ausnahmen
    "0460": "TH", "0461": "TH", "0462": "TH", "0463": "TH", "049": "BB", "0655": "TH", "0656": "TH", "0657": "TH",
    "140": "BE", "141": "BE", "172": "BB", "193": "BB",
    "210": "HH", "211": "HH", "215": "SH", "228": "SH", "229": "SH", "239": "MV",
    "275": "HB", "281": "HB", "282": "HB", "283": "HB", "287": "HB", "294": "ST",
    "364": "TH", "365": "TH", "372": "HE", "373": "TH", "388": "ST", "389": "ST",
    "494": "NW", "495": "NW", "534": "RP", "535": "RP", "575": "RP", "576": "RP",
    "637": "BY", "638": "BY", "639": "BY", "6648": "RP", "6649": "RP", "6650": "RP", "668": "RP", "669": "RP",
    "685": "HE", "686": "HE", "6943": "HE", "6948": "HE", "6950": "HE", "6951": "HE",
    "881": "BY", "892": "BY", "893": "BY", "894": "BY", "965": "TH", "979": "BW", "9787": "BW"
  };

  function landAusPlz(plz) {
    if (!/^\d{5}$/.test(plz || "")) return "";
    for (var n = 4; n >= 2; n--) {
      var k = plz.slice(0, n);
      if (PLZ_LAND[k]) return PLZ_LAND[k];
    }
    return "";
  }

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  }
  function save(d) {
    try { localStorage.setItem(KEY, JSON.stringify(d)); return true; } catch (e) { return false; }
  }

  var data = load();
  // Bundesland: Korrektur von Hand hat Vorrang, sonst aus PLZ
  function effectiveLand() { return data.landFix || landAusPlz(data.plz); }

  // --- PLZ-Fenster (Dialog, auf jeder Seite) ---
  var dialog = document.getElementById("standort");
  var form = document.getElementById("loc-form");
  function msg(t) { var m = document.getElementById("loc-msg"); if (m) m.textContent = t; }

  function store(fromUser) {
    var plz = (form.plz.value || "").trim();
    if (plz && !/^\d{5}$/.test(plz)) {
      if (fromUser) { msg("Bitte 5 Ziffern eingeben."); form.plz.focus(); }
      return false;
    }
    var landFix = form.land ? form.land.value : "";
    if (plz !== data.plz && !fromUser) { landFix = ""; if (form.land) form.land.value = ""; }
    data.plz = plz; data.landFix = landFix;
    var ok = save(data);
    msg(ok ? "Gespeichert." : "Speichern im Browser nicht möglich – gilt nur für diese Seite.");
    render();
    return true;
  }

  function openLoc() {
    if (!dialog) return;
    msg("");
    if (typeof dialog.showModal === "function") { if (!dialog.open) dialog.showModal(); }
    else { dialog.setAttribute("open", ""); }
    if (form) { form.plz.focus(); form.plz.select(); }
  }
  function closeLoc() {
    if (!dialog) return;
    if (typeof dialog.close === "function") dialog.close(); else dialog.removeAttribute("open");
  }

  if (form) {
    if (data.plz) form.plz.value = data.plz;
    if (form.land && data.landFix) form.land.value = data.landFix;
    form.addEventListener("submit", function (ev) { ev.preventDefault(); if (store(true)) closeLoc(); });
    form.plz.addEventListener("input", function () {
      form.plz.value = form.plz.value.replace(/\D/g, "").slice(0, 5);
      if (form.plz.value.length === 5) store(false);
    });
    if (form.land) form.land.addEventListener("change", function () { store(true); });
    var reset = document.getElementById("loc-reset");
    if (reset) reset.addEventListener("click", function () {
      data.plz = ""; data.landFix = ""; save(data); form.reset(); msg("Gelöscht."); render();
    });
  }
  if (dialog) dialog.addEventListener("click", function (ev) { if (ev.target === dialog) closeLoc(); }); // Klick neben das Fenster schließt

  document.querySelectorAll("[data-open-loc]").forEach(function (a) {
    a.addEventListener("click", function (ev) { ev.preventDefault(); openLoc(); });
  });
  if (location.hash === "#standort") openLoc();

  // --- Krankenkasse (nur auf Bereichsseiten, wo sie wichtig ist) ---
  document.querySelectorAll(".kasse-form").forEach(function (f) {
    if (data.kasse) f.kasse.value = data.kasse;
    f.addEventListener("submit", function (ev) {
      ev.preventDefault();
      data.kasse = (f.kasse.value || "").trim();
      save(data); render();
    });
  });

  // --- Alle Seiten: Anzeige ---
  function render() {
    var land = effectiveLand();

    document.querySelectorAll("[data-center-plz]").forEach(function (el) {
      el.textContent = data.plz || "";
      var link = el.closest(".center-link");
      if (link) link.classList.toggle("has-plz", !!data.plz);
    });

    document.querySelectorAll("[data-show]").forEach(function (el) {
      var k = el.getAttribute("data-show");
      el.textContent = k === "land" ? (LAENDER[land] || "unbekannt") : (data[k] || "");
    });

    document.querySelectorAll("[data-needs-plz]").forEach(function (el) { el.hidden = !data.plz; });
    document.querySelectorAll("[data-no-plz]").forEach(function (el) { el.hidden = !!data.plz; });
    document.querySelectorAll("[data-needs-kasse]").forEach(function (el) { el.hidden = !data.kasse; });

    document.querySelectorAll("[data-land-only]").forEach(function (el) {
      var list = el.getAttribute("data-land-only").split(",");
      el.hidden = !(land && list.indexOf(land) !== -1);
    });

    // Hinweise mit Ablaufdatum (z. B. „Noch bis 31.12.2026 …“) danach ausblenden
    var heute = new Date(), h = heute.getFullYear() + "-" + ("0" + (heute.getMonth() + 1)).slice(-2) + "-" + ("0" + heute.getDate()).slice(-2);
    document.querySelectorAll("[data-bis]").forEach(function (el) { el.hidden = h > el.getAttribute("data-bis"); });

    document.querySelectorAll("a[data-osm]").forEach(function (a) {
      var q = a.getAttribute("data-osm") + " " + (data.plz || "");
      a.href = "https://www.openstreetmap.org/search?query=" + encodeURIComponent(q.trim());
    });
  }

  render();
  // Für andere Skripte (z. B. Kassen-Vorschlag im Antrag): nur lesen, nichts verschicken
  window.AUStandort = { landAusPlz: landAusPlz, daten: function () { return data; } };
})();
