/*! Pulse Embed v2 – Lehrstuhl für Privatsphäre und Sicherheit in Informationssystemen, Universität Bamberg.
 *  Markup, Konfiguration und CSS-Variablen: docs/embed-v2.md
 *  Ohne Anmeldung stellt dieses Skript keine Anfragen an Pulse; Antworten bleiben im Browser. */
(function () {
    "use strict";
    if (window.__pulseEmbedV2) return;
    window.__pulseEmbedV2 = true;

    // ---------- Konfiguration ----------
    var script = document.currentScript || {};
    var data = (script.dataset) || {};
    var cfg = window.PulseConfig || {};
    function meta(name) {
        var el = document.querySelector('meta[name="' + name + '"]');
        return el ? el.getAttribute("content") : null;
    }
    function scriptOrigin() {
        try {
            var u = new URL(script.src);
            if (u.protocol === "https:" || u.protocol === "http:") return u.origin;
        } catch (e) { /* inline */ }
        return null;
    }
    var HOST = (cfg.host || data.host || scriptOrigin() || "https://pulse.psi.uni-bamberg.de").replace(/\/$/, "");
    var PRINT = cfg.print || data.print || "answers"; // answers | questions | hide

    function pageName() {
        var legacy = document.querySelector("pulse-page[name]");
        return cfg.page || data.page || meta("pulse:page") || (legacy && legacy.getAttribute("name")) || document.title || "Pulse";
    }
    // Nur eine bewusst gesetzte oder öffentliche Adresse verlassen den Browser, nie ein lokaler Dateipfad.
    function pageUrl() {
        var explicit = cfg.url || data.url || meta("pulse:url");
        if (explicit) return explicit;
        var canonical = document.querySelector('link[rel="canonical"]');
        if (canonical && /^https?:/.test(canonical.href)) return canonical.href;
        if (/^https?:$/.test(location.protocol)) return location.origin + location.pathname;
        return "";
    }

    // ---------- Texte ----------
    // Begriffe für Studierende: Frage, gewusst/nicht gewusst, „kommt per Mail wieder“.
    // Bewusst nicht: Konto, gespeichert, fällig, Stapel, lokal (Microcopy-Review, docs/embed-v2.md).
    var TEXT = {
        de: {
            label: "Selbsttest", reveal: "Antwort zeigen", hide: "Antwort verbergen",
            ask: "Gewusst?", yes: "Gewusst", no: "Nicht gewusst", next: "Nächste Frage",
            deckPos: "Frage {n} von {m}", deckDone: "Alle Fragen hier beantwortet.",
            askRemind: "Nur in diesem Browser gespeichert.", remind: "Dauerhaft sichern und per Mail wiederholen",
            saved: "Kommt per Mail wieder.",
            notDue: "Diese Frage kommt später per Mail wieder.",
            error: "Das hat nicht geklappt. Bitte später noch einmal versuchen.",
            sumTitle: "Fragen auf dieser Seite",
            sumPage: "Diese Seite enthält {n} zum Selbsttest.",
            sumNone: "Bisher wurde noch keine beantwortet.", sumNone1: "Sie wurde bisher noch nicht beantwortet.",
            sumAnswered: "Bisher {a} beantwortet, davon {k} gewusst.",
            sumMail: "{s} davon kommen per Mail wieder.", sumMailDue: "{s} davon kommen per Mail wieder, {d} sind jetzt schon wieder dran.",
            sumPitch: "Mit den Fragen prüfen Sie, ob Sie das Gelesene behalten haben: Überlegen Sie sich zuerst selbst eine Antwort und decken Sie dann die Lösung auf. Ihre Antworten werden bisher nur in diesem Browser gespeichert. Wenn Sie sich anmelden, sichern Sie sie dauerhaft, sehen Ihren Fortschritt über alle Seiten hinweg und bekommen die Fragen zum besseren Erinnern regelmäßig per Mail.",
            sumLogin: "Anmelden",
            sumAccount: "Angemeldet als {name}.", sumAccountNoName: "Angemeldet.",
            nextDue: "Jetzt wiederholen", howItWorks: "So funktioniert’s", more: "Mehr",
            question1: "1 Frage", questionN: "{n} Fragen",
            loginTitle: "Antworten dauerhaft sichern",
            loginIntro: "Mit der Anmeldung speichert Pulse Ihre Antworten dauerhaft statt nur in diesem Browser. Die Fragen kommen in wachsenden Abständen (1, 2, 4, 7, 14 Tage) per Mail wieder: höchstens eine Erinnerung am Tag, dazu mittwochs eine Auswahl. Reagieren Sie nicht, pausieren die Mails von selbst. Kein Passwort; abbestellen über den Link in jeder Mail. Ihre Antworten fließen nicht in Noten ein.",
            email: "E-Mail-Adresse", sendCode: "Code schicken", cancel: "Abbrechen",
            privacy: "Datenschutz",
            codeSent: "Code an {email} geschickt, gültig 10 Minuten. Nichts angekommen? Spam-Ordner prüfen. Diese Seite bitte offen lassen.",
            code: "Code aus der Mail", name: "Anrede in den Mails (optional)",
            confirm: "Bestätigen", back: "Andere Adresse",
            badCode: "Der Code stimmt nicht oder ist abgelaufen.", tooMany: "Zu viele Versuche. Bitte einen Moment warten.",
            badEmail: "Bitte eine gültige E-Mail-Adresse eingeben.",
            expired: "Auf diesem Gerät abgemeldet. Die Mails kommen weiter.", logout: "Abmelden",
            clearLocal: "Meine Antworten hier löschen",
            welcome: "Erledigt. Ihre Antworten aus diesem Browser sind übernommen, die Fragen kommen per Mail wieder.",
            welcomeLeft: "Angemeldet. Einige Antworten aus diesem Browser konnten noch nicht übertragen werden; Pulse versucht es beim nächsten Besuch erneut."
        },
        en: {
            label: "Self-test", reveal: "Show answer", hide: "Hide answer",
            ask: "Did you know it?", yes: "I knew it", no: "I didn't", next: "Next question",
            deckPos: "Question {n} of {m}", deckDone: "All questions here answered.",
            askRemind: "Saved in this browser only.", remind: "Keep it and review by email",
            saved: "Will come back by email.",
            notDue: "This question comes back later by email.",
            error: "That did not work. Please try again later.",
            sumTitle: "Questions on this page",
            sumPage: "This page has {n} for self-testing.",
            sumNone: "None answered yet.", sumNone1: "Not answered yet.",
            sumAnswered: "{a} answered so far, {k} of them known.",
            sumMail: "{s} of them will come back by email.", sumMailDue: "{s} of them will come back by email, {d} are up again already.",
            sumPitch: "The questions let you check whether you have kept what you read: think of an answer first, then reveal the solution. So far your answers are saved in this browser only. If you sign in, they are kept permanently, you can see your progress across all pages, and the questions come back to you by email regularly so you remember them better.",
            sumLogin: "Sign in",
            sumAccount: "Signed in as {name}.", sumAccountNoName: "Signed in.",
            nextDue: "Review now", howItWorks: "How it works", more: "More",
            question1: "1 question", questionN: "{n} questions",
            loginTitle: "Keep your answers",
            loginIntro: "Signing in keeps your answers permanently instead of in this browser only. The questions you answer come back by email at growing intervals (1, 2, 4, 7, 14 days): at most one reminder a day, plus a weekly selection on Wednesdays. If you don't respond, the emails pause by themselves. No password; unsubscribe via the link in every email. Your answers do not count towards any grade.",
            email: "Email address", sendCode: "Send code", cancel: "Cancel",
            privacy: "Privacy",
            codeSent: "Code sent to {email}, valid for 10 minutes. Nothing there? Check your spam folder. Please keep this page open.",
            code: "Code from the email", name: "Name for greeting in emails (optional)",
            confirm: "Confirm", back: "Use another address",
            badCode: "The code is wrong or has expired.", tooMany: "Too many attempts. Please wait a moment.",
            badEmail: "Please enter a valid email address.",
            expired: "Signed out on this device. The emails continue.", logout: "Sign out",
            clearLocal: "Delete my answers here",
            welcome: "Done. Your answers from this browser were added and the questions will come back by email.",
            welcomeLeft: "Signed in. Some answers from this browser could not be transferred yet; Pulse will try again on your next visit."
        }
    };
    function langOf(el) {
        var holder = el.closest("[lang]");
        var l = (holder && holder.getAttribute("lang")) || document.documentElement.lang || navigator.language || "de";
        return /^de/i.test(l) ? "de" : "en";
    }
    function t(el, key, vars) {
        var s = TEXT[langOf(el)][key];
        for (var k in (vars || {})) s = s.replace("{" + k + "}", vars[k]);
        return s;
    }

    // ---------- Speicher ----------
    var KEY_TOKEN = "pulse:v2:token", KEY_NAME = "pulse:v2:name", KEY_PENDING = "pulse:v2:pending";
    function store(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) { /* privat */ } }
    function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    // Ein Token des v1-Clients wird bewusst NICHT übernommen: v1 speicherte jede postMessage
    // ungeprüft als Token (A13). Er wird entfernt; die Anmeldung erfolgt neu per Code.
    store("pulse-token", null);
    var state = {
        token: load(KEY_TOKEN),
        name: load(KEY_NAME),
        questions: null, // "Seitenname\nhash" -> {isOpen}; der Server führt Fragen je Seite
        expired: false
    };
    function qkey(page, hash) { return (page == null ? "" : page) + "\n" + hash; }
    function pending() { try { return JSON.parse(load(KEY_PENDING)) || []; } catch (e) { return []; } }

    // ---------- Server ----------
    function api(method, path, body) {
        var headers = {"Accept": "application/json", "Content-Type": "application/json"};
        if (state.token) headers["X-API-KEY"] = state.token;
        return fetch(HOST + "/api/v1" + path, {method: method, headers: headers, body: body ? JSON.stringify(body) : undefined})
            .then(function (r) {
                if (r.status === 401 && state.token) { logout(true); }
                if (!r.ok) { var e = new Error("HTTP " + r.status); e.status = r.status; throw e; }
                return r.json().catch(function () { return null; });
            });
    }
    function refresh() {
        if (!state.token) { state.questions = null; return Promise.resolve(); }
        return api("GET", "/questions").then(function (list) {
            state.questions = {};
            (list || []).forEach(function (q) { state.questions[qkey(q.pageName, q.hash)] = q; });
        }).catch(function () { /* offline: wie anonym weiter */ });
    }
    function logout(expired) {
        var token = state.token;
        state.token = null; state.name = null; state.questions = null; state.expired = !!expired;
        store(KEY_TOKEN, null); store(KEY_NAME, null);
        if (!expired) store(KEY_PENDING, null); // Abmelden räumt den Browser vollständig auf
        if (token && !expired) {
            fetch(HOST + "/api/v1/auth/logout", {method: "POST", headers: {"X-API-KEY": token}}).catch(function () {});
        }
        renderAll();
    }
    // Überträgt Browser-Antworten einzeln. Entfernt wird nur, was der Server angenommen oder endgültig
    // abgelehnt hat (4xx); bei Netz- oder Serverfehlern bleibt die Antwort für den nächsten Versuch liegen.
    function syncPending() {
        var list = pending(), keep = [];
        return list.reduce(function (p, body) {
            return p.then(function () {
                return api("POST", "/questions", body).catch(function (e) {
                    if (!e || !e.status || e.status >= 500 || e.status === 429 || e.status === 401) keep.push(body);
                });
            });
        }, Promise.resolve()).then(function () {
            store(KEY_PENDING, keep.length ? JSON.stringify(keep) : null);
            return keep.length;
        });
    }

    // ---------- SHA-1 (WebCrypto, sonst kleiner Fallback für http-Seiten) ----------
    function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ("0" + b.toString(16)).slice(-2); }).join(""); }
    function sha1(str) {
        var bytes = new TextEncoder().encode(str);
        if (window.crypto && crypto.subtle) return crypto.subtle.digest("SHA-1", bytes).then(hex);
        return Promise.resolve(sha1Fallback(bytes));
    }
    function sha1Fallback(m) {
        var l = m.length, w = [], i, j, h = [1732584193, 4023233417, 2562383102, 271733878, 3285377520];
        var n = ((l + 8) >> 6) + 1, b = new Uint32Array(n * 16);
        for (i = 0; i < l; i++) b[i >> 2] |= m[i] << (24 - (i % 4) * 8);
        b[l >> 2] |= 0x80 << (24 - (l % 4) * 8); b[n * 16 - 1] = l * 8;
        for (i = 0; i < b.length; i += 16) {
            var a = h.slice();
            for (j = 0; j < 80; j++) {
                w[j] = j < 16 ? b[i + j] : rol(w[j - 3] ^ w[j - 8] ^ w[j - 14] ^ w[j - 16], 1);
                var f = j < 20 ? (a[1] & a[2]) | (~a[1] & a[3]) : j < 40 ? a[1] ^ a[2] ^ a[3] : j < 60 ? (a[1] & a[2]) | (a[1] & a[3]) | (a[2] & a[3]) : a[1] ^ a[2] ^ a[3];
                var k = j < 20 ? 1518500249 : j < 40 ? 1859775393 : j < 60 ? 2400959708 : 3395469782;
                var tmp = (rol(a[0], 5) + f + a[4] + k + w[j]) >>> 0;
                a = [tmp, a[0], rol(a[1], 30), a[2], a[3]];
            }
            for (j = 0; j < 5; j++) h[j] = (h[j] + a[j]) >>> 0;
        }
        return h.map(function (x) { return ("0000000" + x.toString(16)).slice(-8); }).join("");
    }
    function rol(x, s) { return ((x << s) | (x >>> (32 - s))) >>> 0; }

    // ---------- Hilfen ----------
    var uid = 0;
    function h(tag, attrs, children) {
        var el = document.createElement(tag);
        for (var k in (attrs || {})) {
            if (k === "text") el.textContent = attrs[k];
            else if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2), attrs[k]);
            else if (attrs[k] !== false && attrs[k] != null) el.setAttribute(k, attrs[k] === true ? "" : attrs[k]);
        }
        (children || []).forEach(function (c) { if (c) el.appendChild(c); });
        return el;
    }
    function plain(nodes) {
        return nodes.map(function (n) { return n.textContent; }).join(" ").replace(/\s+/g, " ").trim();
    }
    var STATE_ATTRS = ["initial", "1", "2", "3", "4", "final"];
    function statesOf(el) {
        // Eigene Wiederholungsabstände (Attribute wie im v1-Client), sonst Server-Standard
        for (var node = el; node && node.getAttribute; node = node.parentElement) {
            if (node.hasAttribute("state-initial-label")) {
                var s = {}, names = ["initialState", "state1", "state2", "state3", "state4", "finalState"];
                STATE_ATTRS.forEach(function (a, i) {
                    var label = node.getAttribute("state-" + a + "-label"), off = node.getAttribute("state-" + a + "-offset");
                    s[names[i] + "Label"] = label; s[names[i] + "Offset"] = off == null ? null : parseInt(off, 10);
                });
                return s;
            }
        }
        return null;
    }

    // ---------- Frage ----------
    var questions = [];
    function Question(el) {
        this.el = el;
        this.id = "pulse-" + (++uid);
        var details = el.querySelector(":scope > details");
        if (el.hasAttribute("question")) { // v1-Markup: Text in Attributen
            this.qNodes = [h("p", {text: el.getAttribute("question")})];
            this.aNodes = [h("p", {text: el.getAttribute("answer") || ""})];
            this.legacyText = el.getAttribute("question");
            el.textContent = "";
        } else {
            this.qNodes = Array.prototype.filter.call(el.childNodes, function (n) { return n !== details; });
            this.aNodes = details ? Array.prototype.filter.call(details.childNodes, function (n) { return n.nodeName !== "SUMMARY"; }) : [];
            if (details) details.remove();
        }
        this.qText = plain(this.qNodes);
        this.aText = plain(this.aNodes);
        this.key = el.getAttribute("key");
        if (!el.id) el.id = this.id;
        this.result = null; // in dieser Sitzung: true = gewusst, false = nicht gewusst
        this.group = el.getAttribute("group") || (el.closest("pulse-deck") && el.closest("pulse-deck").getAttribute("group")) || null;
        this.revealed = false;
        this.answered = false;
        this.build();
    }
    Question.prototype.build = function () {
        var self = this, el = this.el;
        el.classList.add("pulse-ready");
        this.qBox = h("div", {class: "pulse-q"});
        this.qNodes.forEach(function (n) { self.qBox.appendChild(n); });
        this.aBox = h("div", {class: "pulse-a", id: this.id + "-a", hidden: true});
        this.aNodes.forEach(function (n) { self.aBox.appendChild(n); });
        this.label = h("span", {class: "pulse-label"});
        this.revealBtn = h("button", {type: "button", class: "pulse-btn pulse-reveal", "aria-expanded": "false", "aria-controls": this.id + "-a", onclick: function () { self.toggle(); }});
        this.yesBtn = h("button", {type: "button", class: "pulse-btn pulse-yes", onclick: function () { self.answer(true); }});
        this.noBtn = h("button", {type: "button", class: "pulse-btn pulse-no", onclick: function () { self.answer(false); }});
        this.askText = h("span", {class: "pulse-ask"});
        this.grade = h("div", {class: "pulse-grade", hidden: true}, [this.askText, this.yesBtn, this.noBtn]);
        this.msg = h("div", {class: "pulse-msg", role: "status", "aria-live": "polite"});
        this.panel = h("div", {class: "pulse-panel", hidden: true});
        // Reihenfolge wie bei <details>: der Button bleibt stehen, die Antwort klappt darunter auf,
        // die Bewertung folgt unter der Antwort. So springt das angeklickte Bedienelement nicht weg.
        this.bar = h("div", {class: "pulse-bar"}, [this.revealBtn]);
        el.replaceChildren(this.label, this.qBox, this.bar, this.aBox, this.grade, this.msg, this.panel);
        this.ready = (this.key ? sha1("key:" + this.key) : sha1(this.legacyText || this.qText)).then(function (hash) { self.hash = hash; });
        this.render();
    };
    Question.prototype.status = function () {
        if (!state.token || !state.questions || !this.hash) return "new";
        var q = state.questions[qkey(pageName(), this.hash)];
        return !q ? "new" : q.isOpen ? "open" : "scheduled";
    };
    Question.prototype.render = function () {
        var el = this.el, st = this.answered ? "answered" : this.status();
        el.setAttribute("data-pulse-state", st);
        this.label.textContent = t(el, "label");
        this.revealBtn.textContent = t(el, this.revealed ? "hide" : "reveal");
        this.askText.textContent = t(el, "ask");
        this.yesBtn.textContent = t(el, "yes");
        this.noBtn.textContent = t(el, "no");
        this.grade.hidden = !this.revealed || this.answered || st === "scheduled";
        if (st === "scheduled" && this.revealed && !this.msg.textContent) this.msg.textContent = t(el, "notDue");
    };
    Question.prototype.toggle = function () {
        this.revealed = !this.revealed;
        this.aBox.hidden = !this.revealed;
        this.revealBtn.setAttribute("aria-expanded", String(this.revealed));
        this.render();
        if (this.revealed && !this.grade.hidden) this.yesBtn.focus();
    };
    // v1-Markup: Hash und gesendeter Text müssen übereinstimmen (Server prüft sha1(question) == hash),
    // deshalb den Attributtext unverändert senden statt der normalisierten Fassung.
    Question.prototype.sentText = function () { return this.legacyText != null ? this.legacyText : this.qText; };
    Question.prototype.body = function (remembered) {
        return {
            key: this.key || undefined, hash: this.hash, question: this.sentText(), answer: this.aText,
            groupName: this.group, pageName: pageName(), pageUrl: pageUrl(), remembered: remembered, states: statesOf(this.el)
        };
    };
    Question.prototype.localResult = function () {
        if (this.result !== null) return this.result;
        var self = this, page = pageName(), hit = pending().filter(function (b) { return b.hash === self.hash && b.pageName === page; })[0];
        return hit ? hit.remembered : null;
    };
    Question.prototype.answer = function (remembered) {
        var self = this, el = this.el;
        this.result = remembered;
        this.ready.then(function () {
            var st = self.status(), req;
            if (!state.token) {
                var list = pending().filter(function (b) { return b.hash !== self.hash || b.pageName !== pageName(); });
                list.push(self.body(remembered));
                store(KEY_PENDING, JSON.stringify(list));
                self.done();
                updateStatus();
                self.msg.replaceChildren(document.createTextNode(t(el, "askRemind") + " "),
                    h("button", {type: "button", class: "pulse-link", text: t(el, "remind"), onclick: function () { openLogin(self.panel, self.el); }}));
                return;
            }
            req = st === "open"
                ? api("PUT", "/questions/" + self.hash, {remembered: remembered, pageName: pageName(), question: self.sentText(), answer: self.aText})
                : api("POST", "/questions", self.body(remembered));
            req.then(function () {
                self.done();
                self.msg.textContent = t(el, "saved");
                if (state.questions) state.questions[qkey(pageName(), self.hash)] = {hash: self.hash, pageName: pageName(), isOpen: false};
                updateStatus();
            }).catch(function () { self.msg.textContent = t(el, "error"); });
        });
    };
    Question.prototype.done = function () {
        this.answered = true;
        this.render();
        updateStatus();
        this.revealBtn.focus();
        var deck = this.el.closest("pulse-deck");
        if (deck && deck.__pulse) deck.__pulse.answered(this);
    };

    // ---------- Stapel ----------
    function Deck(el) {
        this.el = el;
        this.items = [];
        this.pos = h("div", {class: "pulse-deck-pos", "aria-live": "polite"});
        this.nextBtn = h("button", {type: "button", class: "pulse-btn pulse-next", hidden: true, onclick: this.next.bind(this)});
        el.classList.add("pulse-ready");
        el.insertBefore(this.pos, el.firstChild);
        el.appendChild(h("div", {class: "pulse-deck-nav"}, [this.nextBtn]));
        el.__pulse = this;
    }
    // Reihenfolge: zunächst wie im Dokument. Einmal, sobald der Stand vom Server da ist, rücken fällige und neue
    // Fragen nach vorn – aber nur, solange noch niemand im Stapel etwas getan hat. Später (Login, Logout)
    // bleibt die aktuelle Frage stehen.
    Deck.prototype.order = function () {
        if (!this.queue) { this.queue = this.items.slice(); this.index = 0; }
        this.show();
    };
    Deck.prototype.initialOrder = function () {
        var touched = this.index > 0 || this.items.some(function (q) { return q.revealed || q.answered; });
        if (touched) return;
        var rank = {open: 0, "new": 1, answered: 2, scheduled: 3};
        this.queue = this.items.slice().sort(function (a, b) { return rank[a.status()] - rank[b.status()]; });
        this.index = 0;
    };
    Deck.prototype.show = function () {
        var self = this, cur = this.queue[this.index];
        this.items.forEach(function (q) { q.el.hidden = q !== cur; });
        this.nextBtn.hidden = true;
        this.nextBtn.textContent = t(this.el, "next");
        this.pos.textContent = cur ? t(this.el, "deckPos", {n: this.index + 1, m: this.queue.length}) : t(this.el, "deckDone");
    };
    Deck.prototype.answered = function (q) {
        if (this.queue[this.index] !== q) return;
        if (this.index < this.queue.length - 1) this.nextBtn.hidden = false;
        else this.pos.textContent = t(this.el, "deckDone");
    };
    Deck.prototype.next = function () {
        this.index++;
        this.show();
        var cur = this.queue[this.index];
        if (cur) cur.revealBtn.focus();
    };
    var decks = [];

    // ---------- Anmeldung ----------
    function openLogin(panel, context) {
        var el = context;
        document.querySelectorAll(".pulse-panel").forEach(function (p) { if (p !== panel) { p.hidden = true; p.textContent = ""; } });
        panel.hidden = false;
        var err = h("div", {class: "pulse-error", role: "alert"});
        var close = function () { panel.hidden = true; panel.textContent = ""; };
        var privacy = h("a", {class: "pulse-link", href: HOST + "/privacy-policy", target: "_blank", rel: "noopener", text: t(el, "privacy")});

        function stepEmail(prefill) {
            var input = h("input", {type: "email", autocomplete: "email", required: true, id: "pulse-email-" + (++uid), value: prefill || ""});
            var send = h("button", {type: "submit", class: "pulse-btn pulse-primary", text: t(el, "sendCode")});
            var form = h("form", {class: "pulse-form", novalidate: true, onsubmit: function (e) {
                e.preventDefault();
                var email = input.value.trim();
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { err.textContent = t(el, "badEmail"); input.focus(); return; }
                err.textContent = "";
                send.disabled = true;
                fetch(HOST + "/api/v1/auth/request", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({email: email, lang: langOf(el)})})
                    .then(function (r) { if (!r.ok) throw r; return r.json(); })
                    .then(function (res) { stepCode(email, res.requestId); })
                    .catch(function (r) { send.disabled = false; err.textContent = t(el, r && r.status === 429 ? "tooMany" : r && r.status === 400 ? "badEmail" : "error"); });
            }}, [
                h("p", {class: "pulse-panel-title", text: t(el, "loginTitle")}),
                h("p", {class: "pulse-note pulse-form-info", text: t(el, "loginIntro") + " "}, [privacy]),
                h("div", {class: "pulse-form-fields"}, [
                    h("label", {for: input.id, text: t(el, "email")}), input,
                    err,
                    h("div", {class: "pulse-actions"}, [send,
                        h("button", {type: "button", class: "pulse-btn", text: t(el, "cancel"), onclick: close})])])
            ]);
            panel.replaceChildren(form);
            input.focus();
        }

        function stepCode(email, requestId) {
            var code = h("input", {type: "text", inputmode: "numeric", autocomplete: "one-time-code", pattern: "[0-9]{6}", maxlength: "6", id: "pulse-code-" + (++uid)});
            var name = h("input", {type: "text", autocomplete: "name", maxlength: "100", id: "pulse-name-" + (++uid)});
            var confirm = h("button", {type: "submit", class: "pulse-btn pulse-primary", text: t(el, "confirm")});
            var form = h("form", {class: "pulse-form", novalidate: true, onsubmit: function (e) {
                e.preventDefault();
                var c = code.value.replace(/\D/g, "");
                if (c.length !== 6) { err.textContent = t(el, "badCode"); code.focus(); return; }
                confirm.disabled = true;
                fetch(HOST + "/api/v1/auth/verify", {method: "POST", headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({requestId: requestId, code: c, name: name.value})})
                    .then(function (r) { if (!r.ok) throw r; return r.json(); })
                    .then(function (res) {
                        state.token = res.token; state.name = res.name; state.expired = false;
                        store(KEY_TOKEN, res.token); store(KEY_NAME, res.name);
                        return syncPending().then(function (left) { state.syncLeft = left; return refresh(); });
                    })
                    .then(function () {
                        close();
                        renderAll();
                        var welcome = t(el, state.syncLeft ? "welcomeLeft" : "welcome");
                        if (context.__pulseQ) context.__pulseQ.msg.textContent = welcome;
                        if (context.__pulseS) { context.__pulseS.note = welcome; updateStatus(); }
                    })
                    .catch(function (r) { confirm.disabled = false; err.textContent = t(el, r && r.status === 429 ? "tooMany" : r && r.status === 400 ? "badCode" : "error"); code.focus(); });
            }}, [
                h("p", {class: "pulse-panel-title", text: t(el, "loginTitle")}),
                h("p", {class: "pulse-note pulse-form-info", text: t(el, "codeSent", {email: email})}),
                h("div", {class: "pulse-form-fields"}, [
                    h("label", {for: code.id, text: t(el, "code")}), code,
                    h("label", {for: name.id, text: t(el, "name")}), name,
                    err,
                    h("div", {class: "pulse-actions"}, [confirm,
                        h("button", {type: "button", class: "pulse-btn", text: t(el, "back"), onclick: function () { err.textContent = ""; stepEmail(email); }})])])
            ]);
            panel.replaceChildren(form);
            code.focus();
        }
        stepEmail();
    }

    // ---------- Zusammenfassung (frei platzierbar, kein Overlay) ----------
    // <pulse-summary> voll, <pulse-summary compact> bzw. <pulse-status> als eine Zeile.
    // Eigene Darstellung: Ereignis "pulse:update" auf document und window.Pulse (siehe docs/embed-v2.md).
    // due = Frage ist jetzt wieder beantwortbar (isOpen). Das heißt NICHT, dass sie heute per Mail kommt
    // (Reminder einmal täglich, höchstens 6 Fragen, nicht doppelt) – Texte dürfen das nicht versprechen.
    function stats() {
        var st = {total: questions.length, answered: 0, known: 0, saved: 0, due: 0, totalDue: 0,
            loggedIn: !!state.token, expired: state.expired, name: state.name || null, local: pending().length, items: []};
        questions.forEach(function (q) {
            var r = q.localResult(), srv = state.token && state.questions && q.hash ? state.questions[qkey(pageName(), q.hash)] : null, s = "new";
            if (r !== null) { st.answered++; if (r) st.known++; s = r ? "known" : "unknown"; }
            if (srv) {
                st.saved++;
                if (srv.isOpen && !q.answered) { st.due++; s = "due"; } else if (r === null) s = "saved";
            }
            st.items.push({id: q.el.id, state: s, text: q.qText});
        });
        if (state.questions) for (var k in state.questions) if (state.questions[k].isOpen) st.totalDue++;
        return st;
    }
    function count(el, n) { return n === 1 ? t(el, "question1") : t(el, "questionN", {n: n}); }
    function aboutUrl(el) { return HOST + "/about?lang=" + langOf(el); }
    function nextDue() {
        var q = questions.filter(function (x) { return x.status() === "open" && !x.answered; })[0];
        if (!q) return false;
        var deck = q.el.closest("pulse-deck");
        if (deck && deck.__pulse) { deck.__pulse.index = deck.__pulse.queue.indexOf(q); deck.__pulse.show(); }
        q.el.scrollIntoView({block: "center"});
        q.revealBtn.focus({preventScroll: true});
        return true;
    }
    var summaries = [];
    function Summary(el, compact) {
        this.el = el;
        this.compact = compact;
        this.panel = h("div", {class: "pulse-panel", hidden: true});
        el.classList.add("pulse-ready", compact ? "pulse-summary-compact" : "pulse-summary-full");
    }
    Summary.prototype.render = function (st) {
        var el = this.el, self = this;
        // Solange das Anmeldeformular offen ist, nicht neu aufbauen (Eingaben blieben sonst nicht erhalten)
        if (!this.panel.hidden && this.el.contains(this.panel)) return;
        var sep = function () { return h("span", {class: "pulse-sep", "aria-hidden": "true", text: "·"}); };
        var linkBtn = function (key, onclick) { return h("button", {type: "button", class: "pulse-link", text: t(el, key), onclick: onclick}); };
        var buttons = [], links = [];
        if (st.loggedIn && st.due) buttons.push(h("button", {type: "button", class: "pulse-btn pulse-primary", text: t(el, "nextDue"), onclick: nextDue}));
        if (!st.loggedIn) buttons.push(h("button", {type: "button", class: "pulse-btn pulse-primary", text: t(el, "sumLogin"), onclick: function () { openLogin(self.panel, el); }}));
        links.push(h("a", {class: "pulse-link", href: aboutUrl(el), target: "_blank", rel: "noopener", text: t(el, "howItWorks")}));
        links.push(h("a", {class: "pulse-link", href: HOST + "/privacy-policy", target: "_blank", rel: "noopener", text: t(el, "privacy")}));
        if (!st.loggedIn && st.local) links.push(linkBtn("clearLocal", window.Pulse.clearLocal));
        if (st.loggedIn) links.push(linkBtn("logout", function () { logout(false); }));
        var actions = h("div", {class: "pulse-actions"}, buttons.concat(links.reduce(function (acc, n, i) {
            if (i) acc.push(sep());
            acc.push(n);
            return acc;
        }, [])));

        var second = st.loggedIn && st.saved
            ? t(el, st.due ? "sumMailDue" : "sumMail", {s: st.saved, d: st.due})
            : st.answered ? t(el, "sumAnswered", {a: st.answered, k: st.known}) : t(el, st.total === 1 ? "sumNone1" : "sumNone");
        var numbers = t(el, "sumPage", {n: count(el, st.total)}) + " " + second;
        var text = this.note || (st.loggedIn
            ? (st.name ? t(el, "sumAccount", {name: st.name}) : t(el, "sumAccountNoName"))
            : (st.expired ? t(el, "expired") + " " : "") + t(el, "sumPitch"));
        this.note = null;
        // Punkte je Frage; in der Kurzform reine Anzeige (sie liegt in einem <summary>, Links darin wären verschachtelt)
        var compact = this.compact;
        var dots = h("ol", {class: "pulse-dots", "aria-hidden": "true"}, st.items.map(function (it, i) {
            return h("li", {"data-state": it.state}, [compact
                ? h("span", {class: "pulse-dot"})
                : h("a", {class: "pulse-dot", href: "#" + it.id, tabindex: "-1", title: (i + 1) + ": " + it.text})]);
        }));
        el.setAttribute("data-logged-in", String(st.loggedIn));
        el.setAttribute("data-due", String(st.due));

        if (this.compact) {
            // Eine Zeile: Punkte, Stand, rechts dezent „Mehr“. Die ganze Zeile klappt Erklärung und Aktionen auf.
            var more = h("details", {class: "pulse-sum-more"}, [
                h("summary", {class: "pulse-sum-line"}, [
                    h("span", {class: "pulse-sum-numbers", role: "status", text: numbers}),
                    h("span", {class: "pulse-sum-leader", "aria-hidden": "true"}),
                    h("span", {class: "pulse-sum-cue", text: t(el, "more")})]),
                h("div", {class: "pulse-sum-body"}, [h("p", {class: "pulse-sum-text", text: text}), actions])]);
            if (this.moreOpen) more.open = true;
            more.addEventListener("toggle", function () { self.moreOpen = more.open; });
            el.replaceChildren(more, this.panel);
        } else {
            el.replaceChildren(
                h("div", {class: "pulse-sum-head"}, [h("p", {class: "pulse-sum-title", text: t(el, "sumTitle")}), dots]),
                h("p", {class: "pulse-sum-numbers", role: "status", text: numbers}),
                h("p", {class: "pulse-sum-text", text: text}),
                actions, this.panel);
        }
    };
    function updateStatus() {
        var st = stats();
        summaries.forEach(function (s) { s.render(st); });
        try { document.dispatchEvent(new CustomEvent("pulse:update", {detail: st})); } catch (e) { /* alte Browser */ }
    }
    window.Pulse = {
        state: stats,
        login: function (container) {
            var panel = h("div", {class: "pulse-panel"});
            container.appendChild(panel);
            openLogin(panel, container);
        },
        logout: function () { logout(false); },
        clearLocal: function () {
            store(KEY_PENDING, null);
            questions.forEach(function (q) { q.result = null; });
            updateStatus();
        },
        nextDue: nextDue
    };

    function renderAll() {
        questions.forEach(function (q) { q.render(); });
        decks.forEach(function (d) { d.order(); });
        updateStatus();
    }

    // ---------- CSS ----------
    var CSS = "@layer pulse{" +
        ":where(pulse-question,pulse-deck,pulse-summary,pulse-status){--_accent:var(--pulse-accent,currentColor);--_rule:var(--pulse-rule,color-mix(in srgb,currentColor 25%,transparent));" +
        "--_bg:var(--pulse-bg,transparent);--_radius:var(--pulse-radius,.4em);--_ui:var(--pulse-ui-font,inherit);--_ui-size:var(--pulse-ui-size,.85em);" +
        "--_muted:var(--pulse-muted,color-mix(in srgb,currentColor 70%,transparent));--_space:var(--pulse-space,.75em);--_on-accent:var(--pulse-on-accent,Canvas)}" +
        ":where(pulse-question,pulse-deck){display:block;margin:var(--_space) 0;padding:var(--_space);border:1px solid var(--_rule);border-radius:var(--_radius);background:var(--_bg)}" +
        ":where(pulse-deck) :where(pulse-question){margin:0;padding:0;border:0;background:none}" +
        ":where(pulse-question)[hidden]{display:none}" +
        ":where(.pulse-label,.pulse-deck-pos){display:block;font-family:var(--_ui);font-size:calc(var(--_ui-size)*.85);letter-spacing:.06em;text-transform:uppercase;color:var(--_accent);margin-bottom:.35em}" +
        ":where(pulse-deck) :where(.pulse-label){display:none}" +
        ":where(.pulse-q)>:first-child,:where(.pulse-a)>:first-child{margin-top:0}:where(.pulse-q)>:last-child,:where(.pulse-a)>:last-child{margin-bottom:0}" +
        ":where(.pulse-q){font-weight:600}" +
        ":where(.pulse-a){margin-top:.6em;padding-left:.75em;border-left:2px solid var(--_rule)}" +
        ":where(.pulse-bar,.pulse-grade,.pulse-actions,.pulse-deck-nav){display:flex;flex-wrap:wrap;gap:.5em;align-items:center}" +
        ":where(.pulse-bar,.pulse-grade,.pulse-deck-nav){margin-top:.6em}:where(.pulse-grade)[hidden],:where(.pulse-btn)[hidden]{display:none}" +
        ":where(.pulse-btn){font:inherit;font-family:var(--_ui);font-size:var(--_ui-size);line-height:1.2;padding:.4em .9em;border:1px solid var(--_accent);border-radius:var(--_radius);background:transparent;color:var(--_accent);cursor:pointer}" +
        ":where(.pulse-btn):hover{background:color-mix(in srgb,var(--_accent) 12%,transparent)}" +
        ":where(.pulse-primary){background:var(--_accent);color:var(--_on-accent)}:where(.pulse-primary):hover{background:color-mix(in srgb,var(--_accent) 85%,black)}" +
        ":where(.pulse-btn):disabled{opacity:.5;cursor:wait}" +
        ":where(.pulse-link){font:inherit;padding:0;border:0;background:none;color:var(--_accent);text-decoration:underline;cursor:pointer}" +
        ":where(.pulse-btn,.pulse-link,.pulse-form input):focus-visible{outline:2px solid var(--_accent);outline-offset:2px}" +
        ":where(.pulse-ask,.pulse-msg,.pulse-note,.pulse-error){font-family:var(--_ui);font-size:var(--_ui-size)}" +
        ":where(.pulse-ask,.pulse-msg,.pulse-note){color:var(--_muted)}:where(.pulse-msg:not(:empty)){margin-top:.5em}" +
        ":where(.pulse-panel){margin-top:.75em;padding-top:.75em;border-top:1px solid var(--_rule)}" +
        ":where(.pulse-panel-title){font-family:var(--_ui);font-weight:600;margin:0 0 .3em}" +
        // Anmeldung: Erklärung links, Felder rechts; bei wenig Platz untereinander (ohne Media Query, nach verfügbarer Breite)
        ":where(.pulse-form){display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,17em),1fr));gap:.6em 1.75em;align-items:start;font-family:var(--_ui);font-size:var(--_ui-size)}" +
        ":where(.pulse-form .pulse-panel-title){grid-column:1/-1}" +
        ":where(.pulse-form-info){margin:0}" +
        // Schriftgröße nur einmal verkleinern (Formular in Zusammenfassung bzw. Hinweis im Formular)
        ":where(.pulse-form) :where(.pulse-note,.pulse-error,.pulse-btn){font-size:1em}:where(pulse-summary,pulse-status) :where(.pulse-form){font-size:1em}" +
        ":where(.pulse-form-fields){display:grid;gap:.35em}" +
        ":where(.pulse-form input:not([type=checkbox])){font:inherit;padding:.4em .5em;border:1px solid var(--_rule);border-radius:var(--_radius);background:transparent;color:inherit}" +
        ":where(.pulse-form-fields label){margin-top:.2em}:where(.pulse-check){display:flex;gap:.4em;align-items:baseline}" +
        ":where(.pulse-error:not(:empty)){color:var(--pulse-error,#b3261e)}" +
                ":where(pulse-summary,pulse-status){display:block;margin:var(--_space) 0;font-family:var(--_ui);font-size:var(--_ui-size)}" +
        ":where(.pulse-summary-full){padding:var(--_space);border:1px solid var(--_rule);border-radius:var(--_radius);background:var(--_bg)}" +
        ":where(.pulse-sum-head){display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.3em 1em}" +
        ":where(.pulse-sum-title){font-weight:600;margin:0}" +
        ":where(.pulse-sum-numbers){margin:.35em 0 0}:where(.pulse-summary-compact .pulse-sum-numbers){margin:0;flex:0 1 auto;min-width:0}" +
        ":where(.pulse-sum-text){margin:.35em 0 0;color:var(--_muted)}" +
        // Text links, gepunktete Führungslinie, „Mehr“ rechts. Bricht der Text um, steht die Linie auf dessen letzter Zeile.
        ":where(.pulse-sum-line){display:flex;flex-wrap:nowrap;align-items:flex-end;gap:.4em;cursor:pointer;list-style:none;padding:.2em 0}" +
        ":where(.pulse-sum-leader){flex:1 1 2em;min-width:2em;border-bottom:2px dotted color-mix(in srgb,currentColor 35%,transparent);margin-bottom:.3em}" +
        ":where(.pulse-sum-line)::-webkit-details-marker{display:none}" +
        ":where(.pulse-sum-cue){color:var(--_accent);white-space:nowrap}" +
        ":where(.pulse-sum-cue)::after{content:'';display:inline-block;width:.4em;height:.4em;margin-left:.45em;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:translateY(-.2em) rotate(45deg);transition:transform .15s}" +
        ":where(.pulse-sum-more[open] .pulse-sum-cue)::after{transform:translateY(0) rotate(-135deg)}" +
        ":where(.pulse-sum-line):focus-visible{outline:2px solid var(--_accent);outline-offset:2px}" +
        ":where(.pulse-sum-body){padding:.2em 0 .9em}" +
        ":where(pulse-summary,pulse-status) :where(.pulse-actions){margin-top:.6em;gap:.4em .6em}" +
        ":where(pulse-summary,pulse-status) :where(.pulse-actions) :where(.pulse-btn){font-size:1em}" +
        // Links rücken etwas vom Button ab, damit sie nicht wie ein Teil davon wirken
        ":where(pulse-summary,pulse-status) :where(.pulse-actions) :where(.pulse-btn+.pulse-link){margin-left:.5em}" +
        ":where(pulse-summary,pulse-status) :where(.pulse-link){color:var(--_muted)}" +
        ":where(.pulse-sep){color:var(--_muted)}" +
        ":where(.pulse-dots){display:inline-flex;flex-wrap:wrap;gap:3px;list-style:none;margin:0;padding:0}" +
        ":where(.pulse-dots li){display:block;margin:0}:where(.pulse-dot){display:block;width:.6em;height:.6em;border-radius:50%;border:1.25px solid var(--_accent);box-sizing:border-box}" +
        ":where(.pulse-dots [data-state=known] .pulse-dot){background:var(--_accent)}" +
        ":where(.pulse-dots [data-state=unknown] .pulse-dot){background:linear-gradient(90deg,var(--_accent) 50%,transparent 50%)}" +
        ":where(.pulse-dots [data-state=saved] .pulse-dot){background:color-mix(in srgb,var(--_accent) 35%,transparent)}" +
        ":where(.pulse-dots [data-state=due] .pulse-dot){border-color:var(--pulse-due,#b45309);background:var(--pulse-due,#b45309)}" +
        "@media (prefers-reduced-motion:reduce){:where(.pulse-sum-cue)::after{transition:none}}" +
        "}" +
        "@media print{:where(.pulse-bar,.pulse-grade,.pulse-msg,.pulse-panel,.pulse-deck-nav,.pulse-deck-pos,pulse-status,pulse-summary){display:none!important}" +
        (PRINT === "hide" ? "pulse-question,pulse-deck{display:none!important}" :
            PRINT === "questions" ? ".pulse-a{display:none!important}" :
                ".pulse-a{display:block!important}pulse-deck pulse-question[hidden]{display:block!important;margin-top:.8em}") +
        "}";
    function injectCss() {
        if ((cfg.style || data.style) === "none" || document.getElementById("pulse-embed-v2-css")) return;
        var style = h("style", {id: "pulse-embed-v2-css"});
        style.textContent = CSS;
        (document.head || document.documentElement).appendChild(style);
    }

    // ---------- Start ----------
    function init() {
        injectCss();
        document.querySelectorAll("pulse-question").forEach(function (el) {
            if (el.__pulseQ) return;
            var q = new Question(el);
            el.__pulseQ = q;
            questions.push(q);
        });
        document.querySelectorAll("pulse-deck").forEach(function (el) {
            if (el.__pulse) return;
            var d = new Deck(el);
            d.items = questions.filter(function (q) { return q.el.closest("pulse-deck") === el; });
            decks.push(d);
        });
        document.querySelectorAll("pulse-summary, pulse-status").forEach(function (el) {
            if (el.__pulseS) return;
            var s = new Summary(el, el.tagName === "PULSE-STATUS" || el.hasAttribute("compact"));
            el.__pulseS = s;
            summaries.push(s);
        });
        var hashes = Promise.all(questions.map(function (q) { return q.ready; }));
        renderAll();
        var sync = state.token && pending().length ? syncPending() : Promise.resolve();
        Promise.all([hashes, sync.then(refresh)]).then(function () {
            decks.forEach(function (d) { d.initialOrder(); });
            renderAll();
        });
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
})();
