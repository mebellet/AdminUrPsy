/* AdminUrPsy – Fragebogen-Abspieler (Pilot)
   Zeigt einen Fragebogen im SurveyJS-JSON-Format Seite für Seite an – ohne fremde Bibliothek.
   Unterstützt eine Teilmenge des Formats:
     Seiten: name, title, description, visibleIf, elements
     Elemente: radiogroup, checkbox, boolean (renderAs: checkbox), text (inputType), comment, dropdown, html
     Eigenschaften: name, title, description, isRequired, defaultValue, visibleIf, choices, maxLength, autocomplete,
                   dataList (Vorschläge beim Tippen in Textfeldern)
     visibleIf: {feld} = 'wert' · != · empty · notempty · contains, verknüpft mit and / or (ohne Klammern)
   Ob die SurveyJS Form Library (MIT) diesen Abspieler ersetzen kann, wird im Förderzeitraum getestet –
   das JSON bleibt dafür gleich.
   Antworten bleiben nur auf diesem Gerät (localStorage, Schlüssel = speicherSchluessel). */
(function () {
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function leer(v) { return v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length); }

  // ---- Bedingungen (visibleIf) ----
  function wert(token) {
    token = token.trim();
    var m = /^'(.*)'$/.exec(token) || /^"(.*)"$/.exec(token);
    if (m) return m[1];
    if (token === "true") return true;
    if (token === "false") return false;
    if (/^-?\d+(\.\d+)?$/.test(token)) return Number(token);
    return token;
  }
  function klausel(k, werte) {
    var m = /^\{([\w.-]+)\}\s*(notempty|empty|!=|=|contains)\s*(.*)$/.exec(k.trim());
    if (!m) { console.warn("Bedingung nicht verstanden:", k); return true; }
    var v = werte[m[1]], op = m[2], w = wert(m[3] || "");
    if (op === "empty") return leer(v);
    if (op === "notempty") return !leer(v);
    if (op === "contains") return Array.isArray(v) ? v.indexOf(w) !== -1 : String(v || "").indexOf(w) !== -1;
    var gleich = (v === w) || (String(v) === String(w) && !leer(v));
    return op === "=" ? gleich : !gleich;
  }
  function bedingung(ausdruck, werte) {
    if (!ausdruck) return true;
    return ausdruck.split(/\s+or\s+/).some(function (teil) {
      return teil.split(/\s+and\s+/).every(function (k) { return klausel(k, werte); });
    });
  }

  function start(root, json, opt) {
    opt = opt || {};
    var key = opt.speicherSchluessel || "adminurpsy-fragebogen";
    var gespeichert = {};
    try { gespeichert = JSON.parse(localStorage.getItem(key)) || {}; } catch (e) {}
    var f = { werte: gespeichert.werte || {}, variablen: {}, seite: gespeichert.seite || 0, html: {}, auswahl: {} };

    // Voreinstellungen
    json.pages.forEach(function (p) {
      p.elements.forEach(function (e) { if (e.defaultValue !== undefined && f.werte[e.name] === undefined) f.werte[e.name] = e.defaultValue; });
    });
    Object.keys(opt.vorbelegung || {}).forEach(function (k) { if (leer(f.werte[k])) f.werte[k] = opt.vorbelegung[k]; });

    function alle() { var o = {}; Object.keys(f.werte).forEach(function (k) { o[k] = f.werte[k]; }); Object.keys(f.variablen).forEach(function (k) { o[k] = f.variablen[k]; }); return o; }
    function speichern() { try { localStorage.setItem(key, JSON.stringify({ werte: f.werte, seite: f.seite })); } catch (e) {} }
    function seiten() { var w = alle(); return json.pages.filter(function (p) { return bedingung(p.visibleIf, w); }); }
    function sichtbar(e) { return bedingung(e.visibleIf, alle()); }
    function auswahl(e) { return f.auswahl[e.name] || e.choices || []; }

    // Jedes Feld steckt in einem Rahmen (data-feld), damit es einzeln neu gezeichnet werden kann (f.aktualisiere)
    function feld(e) { return '<div class="feld" data-feld="' + esc(e.name) + '">' + feldInhalt(e) + "</div>"; }
    function feldInhalt(e) {
      if (!sichtbar(e)) return "";
      var id = "q-" + e.name, v = f.werte[e.name];
      var beschr = e.description ? '<p class="hint" id="' + id + '-h">' + esc(e.description) + "</p>" : "";
      var aria = e.description ? ' aria-describedby="' + id + '-h"' : "";
      var titel = esc(e.title || e.name) + (e.isRequired ? ' <span class="req" aria-hidden="true">*</span>' : "");
      if (e.type === "html") {
        var inhalt = f.html[e.name] !== undefined ? f.html[e.name] : e.html;
        return inhalt ? '<div class="wiz-info" data-html="' + esc(e.name) + '">' + inhalt + "</div>" : "";
      }
      if (e.type === "radiogroup" || e.type === "checkbox") {
        var mehr = e.type === "checkbox", liste = mehr ? (v || []) : v;
        return '<fieldset class="wiz-choice"><legend>' + titel + "</legend>" + beschr + auswahl(e).map(function (c) {
          var cv = typeof c === "object" ? c.value : c, ct = typeof c === "object" ? c.text : c;
          var an = mehr ? liste.indexOf(cv) !== -1 : String(liste) === String(cv);
          return '<label class="choice"><input type="' + (mehr ? "checkbox" : "radio") + '" name="' + id + '" data-q="' + esc(e.name) + '" value="' + esc(cv) + '"' + (an ? " checked" : "") + "><span>" + esc(ct) + "</span></label>";
        }).join("") + "</fieldset>";
      }
      if (e.type === "boolean") {
        return '<div class="wiz-field"><label class="choice single"><input type="checkbox" id="' + id + '" data-q="' + esc(e.name) + '"' + (v ? " checked" : "") + aria + "><span>" + titel + "</span></label>" + beschr + "</div>";
      }
      var h = '<div class="wiz-field"><label for="' + id + '">' + titel + "</label>" + beschr;
      if (e.type === "comment") h += '<textarea id="' + id + '" data-q="' + esc(e.name) + '" rows="3"' + aria + ">" + esc(v) + "</textarea>";
      else if (e.type === "dropdown") {
        h += '<select id="' + id + '" data-q="' + esc(e.name) + '"' + aria + '><option value="">– bitte wählen –</option>' + auswahl(e).map(function (c) {
          if (c.gruppe) return '<optgroup label="' + esc(c.gruppe) + '">' + c.choices.map(function (x) { return '<option value="' + esc(x.value) + '"' + (String(v) === String(x.value) ? " selected" : "") + ">" + esc(x.text) + "</option>"; }).join("") + "</optgroup>";
          return '<option value="' + esc(c.value) + '"' + (String(v) === String(c.value) ? " selected" : "") + ">" + esc(c.text) + "</option>";
        }).join("") + "</select>";
      } else {
        var liste = f.auswahl[e.name] || e.dataList;
        h += '<input id="' + id + '" data-q="' + esc(e.name) + '" type="' + (e.inputType || "text") + '" value="' + esc(v) + '"' +
          (e.maxLength ? ' maxlength="' + e.maxLength + '"' : "") + (e.autocomplete ? ' autocomplete="' + e.autocomplete + '"' : "") +
          (liste && liste.length ? ' list="' + id + '-l"' : "") + aria + ">";
        if (liste && liste.length) h += '<datalist id="' + id + '-l">' + liste.map(function (x) { return '<option value="' + esc(x) + '">'; }).join("") + "</datalist>";
      }
      return h + "</div>";
    }

    var zeichnet = false;
    function zeichnen(fokus) {
      if (zeichnet) return;          // nicht neu zeichnen, während schon gezeichnet wird (z. B. durch blur/change)
      zeichnet = true;
      try { zeichnenJetzt(fokus); } finally { zeichnet = false; }
    }
    function zeichnenJetzt(fokus) {
      var s = seiten(); if (f.seite >= s.length) f.seite = s.length - 1;
      var p = s[f.seite];
      if (opt.vorSeite) opt.vorSeite(p, f);
      var h = '<div class="wiz"><div class="wiz-top"><span class="wiz-doc">' + esc(json.title) + '</span><span class="wiz-count">Schritt ' + (f.seite + 1) + " von " + s.length + "</span></div>";
      h += '<ol class="wiz-dots" aria-label="Schritte">' + s.map(function (x, k) {
        var t = esc(x.title) + (k < f.seite ? " (geschafft)" : k === f.seite ? " (jetzt)" : " (kommt noch)");
        return '<li class="' + (k < f.seite ? "done" : k === f.seite ? "now" : "todo") + '"' + (k === f.seite ? ' aria-current="step"' : "") + ">" +
          (k < f.seite ? '<button type="button" data-geh="' + k + '" title="Zurück zu: ' + t + '" aria-label="Schritt ' + (k + 1) + ": " + t + '"></button>' : '<span title="' + t + '" aria-label="Schritt ' + (k + 1) + ": " + t + '"></span>') + "</li>";
      }).join("") + "</ol>";
      h += '<h2 class="wiz-h" tabindex="-1">' + esc(p.title) + "</h2>" + (p.description ? '<p class="wiz-intro">' + esc(p.description) + "</p>" : "");
      h += '<form class="wiz-form" novalidate>' + p.elements.map(feld).join("") + '<p class="wiz-err" role="alert" hidden></p></form>';
      h += '<div class="wiz-nav">' + (f.seite > 0 ? '<button class="btn ghost" type="button" data-schritt="-1">← Zurück</button>' : "<span></span>") +
        (f.seite < s.length - 1 ? '<button class="btn" type="button" data-schritt="1">Weiter →</button>' : "") + "</div></div>";
      root.innerHTML = h;
      if (opt.nachSeite) opt.nachSeite(p, f, root);
      if (fokus) { var hd = root.querySelector(".wiz-h"); if (hd) hd.focus(); }
    }

    function pruefen() {
      var p = seiten()[f.seite], fehlt = p.elements.filter(function (e) { return e.isRequired && sichtbar(e) && leer(f.werte[e.name]); });
      if (!fehlt.length) return true;
      var er = root.querySelector(".wiz-err"); er.hidden = false;
      er.textContent = "Bitte noch ausfüllen: " + fehlt.map(function (e) { return e.title; }).join(", ");
      return false;
    }

    var zeiger = false;
    document.addEventListener("pointerdown", function () { zeiger = true; }, true);
    document.addEventListener("keydown", function () { zeiger = false; }, true);

    function eingabe(ev) {
      var el = ev.target, name = el.getAttribute && el.getAttribute("data-q"); if (!name) return;
      var e = null; json.pages.forEach(function (p) { p.elements.forEach(function (x) { if (x.name === name) e = x; }); });
      if (!e) return;
      if (e.type === "checkbox") f.werte[name] = Array.prototype.map.call(root.querySelectorAll('input[data-q="' + name + '"]:checked'), function (x) { return x.value; });
      else if (e.type === "boolean") f.werte[name] = el.checked;
      else f.werte[name] = el.value;
      speichern();
      if (opt.beiAenderung) opt.beiAenderung(name, f.werte[name], f, ev.type);
      // Bei Auswahlfeldern neu zeichnen, weil sich sichtbare Felder ändern können
      if (ev.type === "change" && e.type !== "text" && e.type !== "comment") {
        zeichnen(false);
        if (!zeiger) { var neu = root.querySelector('[data-q="' + name + '"][value="' + el.value + '"]') || root.querySelector('[data-q="' + name + '"]'); if (neu) neu.focus(); }
      }
    }
    root.addEventListener("input", eingabe);
    root.addEventListener("change", eingabe);
    root.addEventListener("click", function (ev) {
      var b = ev.target.closest("button"); if (!b) return;
      if (b.hasAttribute("data-geh")) { f.seite = +b.getAttribute("data-geh"); speichern(); zeichnen(true); }
      if (b.hasAttribute("data-schritt")) {
        var d = +b.getAttribute("data-schritt");
        if (d > 0 && !pruefen()) return;
        f.seite = Math.max(0, f.seite + d); speichern(); zeichnen(true);
        window.scrollTo(0, root.getBoundingClientRect().top + window.scrollY - 20);
      }
    });

    f.neuZeichnen = function () { zeichnen(false); };
    // Nur einzelne Felder neu zeichnen – das Feld, in dem gerade getippt wird, bleibt unberührt (Fokus bleibt)
    f.aktualisiere = function (namen) {
      json.pages.forEach(function (p) { p.elements.forEach(function (e) {
        if (namen.indexOf(e.name) === -1) return;
        var el = root.querySelector('[data-feld="' + e.name + '"]'); if (el) el.innerHTML = feldInhalt(e);
      }); });
    };
    f.speichern = speichern;
    f.setzeVariable = function (k, v) { f.variablen[k] = v; };
    f.setzeHtml = function (name, html) { f.html[name] = html; var el = root.querySelector('[data-html="' + name + '"]'); if (el) el.innerHTML = html; };
    f.setzeAuswahl = function (name, choices) { f.auswahl[name] = choices; };
    f.loeschen = function () { try { localStorage.removeItem(key); } catch (e) {} };
    f.bedingung = bedingung;
    zeichnen(false);
    return f;
  }

  window.AUFragebogen = { start: start, bedingung: bedingung };
})();
