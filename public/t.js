/* SidFast tracking script — https://your-host/t.js?site=s_xxx */
(function () {
  "use strict";
  if (window.sidfast && window.sidfast.__installed) return;

  var doc = document;
  var win = window;

  var script =
    doc.currentScript ||
    (function () {
      var all = doc.getElementsByTagName("script");
      for (var i = 0; i < all.length; i++) {
        if (all[i].src && all[i].src.indexOf("/t.js") !== -1) return all[i];
      }
      return null;
    })();

  var host = "";
  var siteKey = "";
  if (script) {
    try {
      var u = new URL(script.src, location.href);
      host = u.origin;
      siteKey = u.searchParams.get("site") || "";
    } catch (e) {}
  }
  if (win.SIDFAST_HOST) host = win.SIDFAST_HOST;
  if (win.SIDFAST_SITE) siteKey = win.SIDFAST_SITE;
  if (!host || !siteKey) return;

  var ENDPOINT = host + "/api/collect";
  var VISITOR_TTL = 365 * 24 * 60 * 60 * 1000;
  var SESSION_TTL = 30 * 60 * 1000;

  // Headless/CDP-driven browsers expose navigator.webdriver — those visits are
  // automation, not people. Keep the API surface intact so pages that call
  // sidfast(...) don't throw; only the beacon is dropped.
  var automated = false;
  try {
    automated = !!(win.navigator && win.navigator.webdriver);
  } catch (e) {}

  function storage(kind, key, value) {
    try {
      var s = kind === "l" ? localStorage : sessionStorage;
      if (value === undefined) return s.getItem(key);
      s.setItem(key, value);
    } catch (e) {
      return null;
    }
  }

  function rand(n) {
    var out = "";
    var bytes = new Uint8Array(n);
    (win.crypto || win.msCrypto).getRandomValues(bytes);
    for (var i = 0; i < n; i++) out += ("0" + bytes[i].toString(16)).slice(-2);
    return out;
  }

  var visitorId = storage("l", "sf_v");
  if (!visitorId) {
    visitorId = rand(16);
    storage("l", "sf_v", visitorId);
  }

  var now = Date.now();
  var sessionId = storage("s", "sf_s");
  var expires = parseInt(storage("s", "sf_e") || "0", 10);
  if (!sessionId || !expires || now > expires) {
    sessionId = rand(12);
    storage("s", "sf_s", sessionId);
  }
  storage("s", "sf_e", String(now + SESSION_TTL));

  function utmOf() {
    var out = {};
    try {
      var p = new URLSearchParams(location.search);
      ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].forEach(
        function (k) {
          var v = p.get(k);
          if (v) out[k] = v;
        }
      );
    } catch (e) {}
    return out;
  }

  function send(payload, done) {
    if (automated) {
      if (done) done();
      return;
    }
    payload.site = siteKey;
    payload.visitor_id = visitorId;
    payload.session_id = sessionId;
    var body = JSON.stringify(payload);
    try {
      if (win.navigator && win.navigator.sendBeacon) {
        var blob = new Blob([body], { type: "text/plain;charset=UTF-8" });
        if (win.navigator.sendBeacon(ENDPOINT, blob)) {
          if (done) done();
          return;
        }
      }
    } catch (e) {}
    if (win.fetch) {
      win
        .fetch(ENDPOINT, {
          method: "POST",
          body: body,
          headers: { "Content-Type": "application/json" },
          keepalive: true,
          mode: "cors",
          credentials: "omit",
        })
        .then(function () {
          if (done) done();
        })
        .catch(function () {});
    }
  }

  function payloadFor(kind) {
    var utm = utmOf();
    var p = {
      type: kind,
      path: location.pathname + location.search,
      title: doc.title || "",
      referrer: kind === "pageview" ? doc.referrer || "" : "",
      screen: win.innerWidth + "x" + win.innerHeight,
      lang: (navigator.language || "").toLowerCase(),
    };
    for (var k in utm) p[k] = utm[k];
    return p;
  }

  var lastPath = location.pathname + location.search;
  var first = true;

  function pageview() {
    var path = location.pathname + location.search;
    if (path === lastPath && !first) return;
    lastPath = path;
    var p = payloadFor("pageview");
    if (!first) p.referrer = "";
    first = false;
    send(p);
  }

  function trackHistory() {
    var push = history.pushState;
    var replace = history.replaceState;
    history.pushState = function () {
      push.apply(this, arguments);
      setTimeout(pageview, 0);
    };
    history.replaceState = function () {
      replace.apply(this, arguments);
      setTimeout(pageview, 0);
    };
    win.addEventListener("popstate", function () {
      setTimeout(pageview, 0);
    });
  }

  var api = function (cmd, a, b) {
    if (cmd === "goal") {
      var name = typeof a === "string" ? a : (a && a.name) || "";
      var meta = typeof a === "object" ? a : b || {};
      if (!name) return;
      var p = payloadFor("goal");
      p.type = "goal";
      p.goal = name;
      p.meta = meta;
      send(p);
    } else if (cmd === "payment") {
      var opts = a || {};
      var pay = payloadFor("pageview");
      pay.type = "payment";
      pay.amount = opts.amount;
      pay.currency = opts.currency;
      pay.email = opts.email;
      pay.goal = opts.goal;
      pay.meta = opts.meta || opts;
      pay.timestamp = opts.timestamp;
      pay.referrer = "";
      send(pay);
    } else if (cmd === "pageview") {
      pageview();
    }
  };
  api.__installed = true;
  api.site = siteKey;
  win.sidfast = api;

  function boot() {
    trackHistory();
    pageview();
  }

  if (doc.readyState === "loading") {
    doc.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
