/* Prithvi Realcon - activity tracker (activity-tracker.js)
   Silent: no UI, no console output, never blocks or slows a page.
   - logins (username and result only, never the password)
   - writes to any sheet (table, operation, row filter, new values, result)
   - downloads, image downloads, printing
   - page opens, and a heartbeat per open device (for "logged in now")
   Events are queued and sent in batches after the page has loaded. Nothing waits for the reply.
   Load it in <head>, before any page script, so window.fetch is wrapped before a Supabase client is created. */
(function () {
  'use strict';
  if (window.__PRACT) return;
  window.__PRACT = true;

  var PAGE = String(location.pathname || '').slice(0, 160);
  if (/sys-health-7c1e\.html$/i.test(PAGE)) return;          // the console itself is not tracked

  var HUB = 'https://gcedsyxvfmlyujhftiyf.supabase.co';
  var KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdjZWRzeXh2Zm1seXVqaGZ0aXlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ2Mjg5ODMsImV4cCI6MjExMDIwNDk4M30.QsFXFMT1zS62UIfdbgtpXJHEicCVglvXHqgvik5Q5Rk';
  var INGEST = HUB + '/rest/v1/rpc/activity_ingest';
  var FLUSH_MS = 8000, FAST_MS = 1500, HEARTBEAT_MS = 180000, MAX_QUEUE = 300;
  var FAST = { login: 1, write: 1, rpc: 1, download: 1, image_download: 1, print: 1, page_view: 1, page_close: 1 };   // sent quickly so they are not lost if the tab closes
  var SECRET = /pass|pwd|secret|token|key|otp/i;               // field names whose values are never stored

  var queue = [], timer = null, timerMs = 0, devId = '';
  try {
    devId = localStorage.getItem('pr-dev') || '';
    if (!devId) {
      devId = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2, 12));
      localStorage.setItem('pr-dev', devId);
    }
  } catch (e) { devId = 'nostore-' + Math.random().toString(36).slice(2, 10); }

  function who() {
    try {
      var a = JSON.parse(localStorage.getItem('amm-auth') || 'null');
      // the apps decide when a sign-in ends (maxSessionHours), so the tracker only checks that one exists
      if (a && a.user) {
        return { actor: String(a.user).slice(0, 80), name: String(a.name || a.user).slice(0, 120), signed: true };
      }
    } catch (e) {}
    return { actor: 'guest', name: '', signed: false };
  }

  function label(ua) {
    var b = 'Browser', o = 'Unknown OS';
    if (/Edg\//.test(ua)) b = 'Edge'; else if (/Chrome\//.test(ua)) b = 'Chrome';
    else if (/Firefox\//.test(ua)) b = 'Firefox'; else if (/Safari\//.test(ua)) b = 'Safari';
    if (/Windows/.test(ua)) o = 'Windows'; else if (/Android/.test(ua)) o = 'Android';
    else if (/iPhone|iPad/.test(ua)) o = 'iOS'; else if (/Mac OS/.test(ua)) o = 'macOS';
    else if (/Linux/.test(ua)) o = 'Linux';
    return b + ' / ' + o;
  }

  function tzName() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { return ''; } }

  var nativeFetch = window.fetch ? window.fetch.bind(window) : null;

  function arm(ms) {
    if (timer && timerMs <= ms) return;
    if (timer) clearTimeout(timer);
    timerMs = ms;
    timer = setTimeout(function () { flush(false); }, ms);
  }

  // The console can sign this device out. The server returns signout_ms (epoch ms); any sign-in made before it is ended here.
  function obeyServer(j) {
    if (!j || !j.signout_ms) return;
    try {
      var a = JSON.parse(localStorage.getItem('amm-auth') || 'null');
      if (a && a.user && (!a.at || j.signout_ms > a.at)) {
        localStorage.removeItem('amm-auth');
        sessionStorage.setItem('pr-reason', 'expired');
        location.reload();
      }
    } catch (e) {}
  }

  function flush(keep) {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!nativeFetch) return;
    var w = who(), ua = navigator.userAgent || '';
    var batch = {
      device: {
        id: devId, actor: w.actor, actor_name: w.name, signed_in: w.signed,
        user_agent: ua.slice(0, 240), platform: label(ua), screen: (screen.width || 0) + 'x' + (screen.height || 0),
        tz: tzName(), lang: String(navigator.language || '').slice(0, 20), page: PAGE
      },
      events: queue.splice(0, keep ? 15 : 200)
    };
    try {
      nativeFetch(INGEST, {
        method: 'POST', keepalive: !!keep,
        headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_batch: batch })   // the SQL function is activity_ingest(p_batch jsonb): PostgREST matches body keys to parameter names
      }).then(function (r) { return r.ok ? r.json() : null; })
        .then(obeyServer)
        .catch(function () {});
    } catch (e) {}
    if (queue.length && !timer) arm(FLUSH_MS);
  }

  function push(kind, d, actor) {
    if (queue.length >= MAX_QUEUE) return;
    queue.push({ kind: kind, actor: actor || who().actor, page: PAGE, t: new Date().toISOString(), d: d || {} });
    arm(FAST[kind] ? FAST_MS : FLUSH_MS);
  }

  function summarize(body) {
    if (body == null) return null;
    if (typeof body !== 'string' || body.length > 60000) return { note: 'bulk ' + (typeof body === 'string' ? body.length : 0) + ' chars' };
    var j;
    try { j = JSON.parse(body); } catch (e) { return { note: 'non-json' }; }
    var rows = Array.isArray(j) ? j : [j], first = rows[0] || {}, fields = {};
    Object.keys(first).slice(0, 40).forEach(function (k) {
      if (SECRET.test(k)) { fields[k] = '***'; return; }
      var v = first[k];
      fields[k] = (v === null ? 'null' : typeof v === 'object' ? JSON.stringify(v) : String(v)).slice(0, 80);
    });
    return { rows: rows.length, fields: fields };
  }

  function loginWatch(body, res) {
    var user = '';
    try { user = String(JSON.parse(body).p_username || '').slice(0, 80); } catch (e) {}   // the password is never read
    var fail = function () { push('login', { user: user, ok: false }, user || 'guest'); };
    res.then(function (r) {
      return r.clone().json().then(function (j) {
        var row = Array.isArray(j) ? j[0] : j;
        push('login', { user: user, ok: !!(r.ok && row && row.username) }, user || 'guest');
      }, fail);
    }, fail);
  }

  function watch(input, init, res) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    if (!/\.supabase\.(co|in)\/rest\/v1\//.test(url)) return;
    if (url.indexOf('activity_ingest') > -1 || url.indexOf('activity_dashboard') > -1) return;
    var method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return;

    var path = url.split('/rest/v1/')[1] || '';
    var q = path.indexOf('?');
    var name = q > -1 ? path.slice(0, q) : path;
    var query = q > -1 ? path.slice(q + 1) : '';
    if (name === 'rpc/app_login') { loginWatch(init && init.body, res); return; }

    var headers = (init && init.headers) || {};
    var prefer = String(headers.get ? headers.get('Prefer') : (headers.Prefer || headers.prefer || ''));
    var isRpc = name.indexOf('rpc/') === 0;
    var op = isRpc ? 'RPC'
      : method === 'POST' ? (/merge-duplicates/.test(prefer) ? 'UPSERT' : 'INSERT')
      : method === 'PUT' ? 'UPSERT' : method === 'PATCH' ? 'UPDATE' : 'DELETE';
    var d = { op: op, target: decodeURIComponent(name).slice(0, 80), filter: decodeURIComponent(query).slice(0, 200) };
    var sum = summarize(init && init.body);
    if (sum) d.summary = sum;
    var kind = isRpc ? 'rpc' : 'write';
    res.then(function (r) { d.ok = !!r.ok; d.status = r.status; push(kind, d); },
             function () { d.ok = false; d.status = 0; push(kind, d); });
  }

  if (nativeFetch) {
    window.fetch = function (input, init) {
      var res = nativeFetch.apply(window, arguments);
      try { watch(input, init, res); } catch (e) {}
      return res;
    };
  }

  function noteDownload(a) {
    if (!a || !a.getAttribute) return;
    var href = a.getAttribute('href') || '';
    var name = a.getAttribute('download') || '';
    var dl = a.hasAttribute('download');
    var IMG = /\.(png|jpe?g|webp|gif|bmp|svg)(\?|#|$)/i;
    var img = IMG.test(href) || IMG.test(name) || /^data:image\//i.test(href);   // blob:/data: links carry no extension, so the file name decides
    if (!dl && !img) return;
    var file = name || (/^(data|blob):/i.test(href) ? 'generated-file' : href.split('?')[0].split('/').pop()) || 'file';
    push(img ? 'image_download' : 'download', { file: String(file).slice(0, 160), blob: /^(blob|data):/i.test(href) });
  }

  // downloads started by a script (a.click() on a generated link) and by the user
  var proto = window.HTMLAnchorElement && HTMLAnchorElement.prototype;
  if (proto && proto.click) {
    var origClick = proto.click;
    proto.click = function () { try { noteDownload(this); } catch (e) {} return origClick.apply(this, arguments); };
  }
  document.addEventListener('click', function (e) {
    if (!e.isTrusted) return;                       // scripted clicks are handled above
    try { noteDownload(e.target && e.target.closest ? e.target.closest('a') : null); } catch (err) {}
  }, true);

  window.addEventListener('beforeprint', function () { push('print', {}); });
  // enter / leave: one page_view when the page opens (or the person comes back to it),
  // one page_close when they leave it (close, switch tab, lock phone, go to another page) with the seconds spent
  var enterAt = Date.now(), away = false;
  function leave() {
    if (away) { flush(true); return; }
    away = true;
    push('page_close', { secs: Math.max(0, Math.round((Date.now() - enterAt) / 1000)) });
    flush(true);
  }
  function back() {
    if (!away) return;
    away = false; enterAt = Date.now();
    push('page_view', { title: String(document.title || '').slice(0, 100), back: true });
  }
  window.addEventListener('pagehide', leave);
  window.addEventListener('pageshow', function (e) { if (e && e.persisted) back(); });
  document.addEventListener('visibilitychange', function () { if (document.hidden) leave(); else back(); });
  setInterval(function () { if (!document.hidden) flush(false); }, HEARTBEAT_MS);

  push('page_view', { title: String(document.title || '').slice(0, 100) });
})();
