/* Prithvi Realcon - Data assistant (ai-chat.js)
   Read-only. Pure JavaScript, no AI service, no server.
   Add to any page:  <script src="ai-chat.js"></script>
   ---------------------------------------------------------------
   Modules: rake dispatch, daily rake loading (+ image), Gujarat / HZL / PJPB billing and performance, ODR pending rakes, KSK inward and dispatch.
   Exports: CSV and PNG on every answer.
*/
(function () {
  'use strict';
  if (window.__PRAI) return;
  window.__PRAI = true;

  /* ===== CONFIG (project URL + public anon key, same as your pages) ===== */
  const CONFIG = {
      "jz": {
          "url": "https://jzkrywwrsewchtiqsczk.supabase.co",
          "key": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6a3J5d3dyc2V3Y2h0aXFzY3prIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE1NDU0MzQsImV4cCI6MjEwNzEyMTQzNH0.IDwfVhqDI9uXfAALCVKBD0pNjsNVu38fW4eEueaKDSs"
      },
      "pc": {
          "url": "https://pycmkjrmdieaqsbgrher.supabase.co",
          "key": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5Y21ranJtZGllYXFzYmdyaGVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEwMjMxNzAsImV4cCI6MjEwNjU5OTE3MH0.9IE2c2FZ4BPv6Rvhfa_VniQ7LJvQ_c4EGDXFihYR4Lc"
      },
      "lf": {
          "url": "https://lflsewvyhyfmuegksscy.supabase.co",
          "key": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmbHNld3Z5aHlmbXVlZ2tzc2N5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0NTY3MjIsImV4cCI6MjEwNzAzMjcyMn0.BKNDWGKs4MX7MFL4FD0ECesgFciFmMRpMdmQUnARj7s"
      }
  };
  // jz = dispatch / daily loading / ODR     pc = HZL, PJPB, Gujarat     lf = KSK, Jhabua

  /* ===== helpers ===== */
  const MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const nk = s => String(s == null ? '' : s).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const nsp = s => ' ' + String(s == null ? '' : s).toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim() + ' ';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = n => Number(n || 0).toLocaleString('en-IN');
  const p2 = n => String(n).padStart(2, '0');
  const iso = d => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  const mk = (y, m, d) => new Date(y, m, d);
  const dmy = s => { const a = s.split('-'); return a[2] + ' ' + MON3[+a[1] - 1] + ' ' + a[0]; };
  const monLabel = ym => MON3[+ym.slice(5, 7) - 1] + ' ' + ym.slice(0, 4);
  const utc = s => { const a = s.split('-').map(Number); return Date.UTC(a[0], a[1] - 1, a[2]); };
  const daysBetween = (a, b) => Math.round((utc(b) - utc(a)) / 864e5) + 1;
  const endOfMonth = (y, m) => mk(y, m + 1, 0);
  const today = () => new Date();
  // Indian financial year: Apr-Mar. fyStart = the calendar year in which the FY begins.
  const fyOf = d => (d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1);
  const fyName = y => y + '-' + String(y + 1).slice(2);
  const qOfMonth = m => Math.floor(((m - 3 + 12) % 12) / 3) + 1; // m = 0..11
  const qRange = (fy, q) => { const sm = 3 + (q - 1) * 3; return [mk(fy, sm, 1), endOfMonth(fy, sm + 2)]; };
  const qLabel = (fy, q) => 'Q' + q + ' FY ' + fyName(fy);
  const qKey = ds => { const d = mk(+ds.slice(0, 4), +ds.slice(5, 7) - 1, 1); return qLabel(fyOf(d), qOfMonth(d.getMonth())); };

  /* ===== Supabase REST (read only) ===== */
  async function rest(proj, table, params) {
    const p = CONFIG[proj];
    if (!p) throw new Error('Connection "' + proj + '" is not configured');
    const out = [], size = 1000;
    for (let from = 0; ; from += size) {
      const r = await fetch(p.url + '/rest/v1/' + encodeURIComponent(table) + '?' + params, {
        headers: { apikey: p.key, Authorization: 'Bearer ' + p.key, Range: from + '-' + (from + size - 1), 'Range-Unit': 'items' }
      });
      if (!r.ok) throw new Error('Could not read ' + table + ' (' + r.status + ')');
      const d = await r.json();
      out.push.apply(out, d);
      if (d.length < size || out.length > 300000) break;
    }
    return out;
  }

  /* ===== date understanding ===== */
  function monthIdx(w) { w = w.toLowerCase().slice(0, 3); return MON.indexOf(w); }
  const MONRE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
  function guessYear(m, now) { return m > now.getMonth() ? now.getFullYear() - 1 : now.getFullYear(); }

  function parseDates(q, now) {
    q = ' ' + q.toLowerCase().replace(/[,]/g, ' ').replace(/\s+/g, ' ') + ' ';
    let m;
    // 1) explicit day-level dates
    const toks = [];
    let t = q;
    t = t.replace(/(\d{4})-(\d{2})-(\d{2})/g, (a, y, mo, d) => { toks.push(mk(+y, +mo - 1, +d)); return ' '; });
    t = t.replace(/\b(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4})\b/g, (a, d, mo, y) => { toks.push(mk(y.length === 2 ? 2000 + +y : +y, +mo - 1, +d)); return ' '; });
    const dre = new RegExp('\\b(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:of\\s+)?' + MONRE + '\\b\\.?(?:\\s+(\\d{4}))?', 'g');
    const dre2 = new RegExp('\\b' + MONRE + '\\b\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?!\\d|\\s*(?:20)\\d\\d)', 'g');
    // "1 to 25 oct"
    m = t.match(new RegExp('\\b(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:to|till|until|-|and)\\s*(\\d{1,2})(?:st|nd|rd|th)?\\s*' + MONRE + '\\b\\.?(?:\\s+(\\d{4}))?'));
    if (m) {
      const mo = monthIdx(m[3]), y = m[4] ? +m[4] : guessYear(mo, now);
      return mkRange(mk(y, mo, +m[1]), mk(y, mo, +m[2]));
    }
    t = t.replace(dre, (a, d, mon, y) => { const mo = monthIdx(mon); toks.push(mk(y ? +y : guessYear(mo, now), mo, +d)); return ' '; });
    if (toks.length === 0) t = t.replace(dre2, (a, mon, d) => { const mo = monthIdx(mon); toks.push(mk(guessYear(mo, now), mo, +d)); return ' '; });
    if (toks.length >= 2) {
      toks.sort((a, b) => a - b);
      return mkRange(toks[0], toks[toks.length - 1]);
    }
    if (toks.length === 1) return mkRange(toks[0], toks[0]);

    // 2) quarters / FY
    m = q.match(/\bq([1-4])\b(?:\s*(?:of\s+)?(?:fy\s*)?(\d{4})(?:\s*[-/]\s*(\d{2,4}))?)?/);
    if (m) {
      const fy = m[2] ? +m[2] : fyOf(now);
      const r = qRange(fy, +m[1]);
      return { from: iso(r[0]), to: iso(r[1]), label: qLabel(fy, +m[1]), kind: 'quarter' };
    }
    if (/\b(this|current)\s+quarter\b/.test(q)) {
      const fy = fyOf(now), r = qRange(fy, qOfMonth(now.getMonth()));
      return { from: iso(r[0]), to: iso(r[1]), label: qLabel(fy, qOfMonth(now.getMonth())), kind: 'quarter' };
    }
    if (/\b(last|previous)\s+quarter\b/.test(q)) {
      let fy = fyOf(now), qq = qOfMonth(now.getMonth()) - 1;
      if (qq < 1) { qq = 4; fy -= 1; }
      const r = qRange(fy, qq);
      return { from: iso(r[0]), to: iso(r[1]), label: qLabel(fy, qq), kind: 'quarter' };
    }
    m = q.match(/\b(?:fy|f\.y\.|financial year)\s*(\d{4})(?:\s*[-/]\s*(\d{2,4}))?/);
    if (m) return fyRange(+m[1]);
    if (/\b(this|current)\s+(financial\s+year|fy|year)\b/.test(q)) return fyRange(fyOf(now));
    if (/\b(last|previous)\s+(financial\s+year|fy|year)\b/.test(q)) return fyRange(fyOf(now) - 1);

    // 3) months ("jan to mar", "oct 2026", "october")
    m = q.match(new RegExp('\\b' + MONRE + '\\b\\.?(?:\\s+(\\d{4}))?\\s*(?:to|till|until|-|and|se)\\s*' + MONRE + '\\b\\.?(?:\\s+(\\d{4}))?'));
    if (m) {
      const a = monthIdx(m[1]), b = monthIdx(m[3]);
      let y2 = m[4] ? +m[4] : guessYear(b, now), y1 = m[2] ? +m[2] : (a > b ? y2 - 1 : y2);
      return { from: iso(mk(y1, a, 1)), to: iso(endOfMonth(y2, b)), label: MON3[a] + ' ' + y1 + ' to ' + MON3[b] + ' ' + y2, kind: 'months' };
    }
    m = q.match(new RegExp('\\b' + MONRE + '\\b\\.?(?:\\s+(\\d{4}))?'));
    if (m && (m[1] !== 'may' || m[2] || /\bmay\s+(month|rake|data)/.test(q) || /(in|for|of|during)\s+may\b/.test(q))) {
      const mo = monthIdx(m[1]), y = m[2] ? +m[2] : guessYear(mo, now);
      return { from: iso(mk(y, mo, 1)), to: iso(endOfMonth(y, mo)), label: MON3[mo] + ' ' + y, kind: 'month' };
    }
    // 4) relative
    if (/\btoday\b/.test(q)) return mkRange(now, now);
    if (/\byesterday\b/.test(q)) { const y = mk(now.getFullYear(), now.getMonth(), now.getDate() - 1); return mkRange(y, y); }
    if (/\b(this|current)\s+month\b/.test(q)) return { from: iso(mk(now.getFullYear(), now.getMonth(), 1)), to: iso(endOfMonth(now.getFullYear(), now.getMonth())), label: MON3[now.getMonth()] + ' ' + now.getFullYear(), kind: 'month' };
    if (/\b(last|previous)\s+month\b/.test(q)) { const f = mk(now.getFullYear(), now.getMonth() - 1, 1); return { from: iso(f), to: iso(endOfMonth(f.getFullYear(), f.getMonth())), label: MON3[f.getMonth()] + ' ' + f.getFullYear(), kind: 'month' }; }
    m = q.match(/\b(?:last|past|previous)\s+(\d{1,3})\s+days?\b/);
    if (m) return mkRange(mk(now.getFullYear(), now.getMonth(), now.getDate() - (+m[1] - 1)), now);
    if (/\b(last|past)\s+week\b/.test(q)) return mkRange(mk(now.getFullYear(), now.getMonth(), now.getDate() - 6), now);
    return null;
  }
  function mkRange(a, b) {
    if (a > b) { const x = a; a = b; b = x; }
    const f = iso(a), t = iso(b);
    return { from: f, to: t, label: f === t ? dmy(f) : dmy(f) + ' to ' + dmy(t), kind: 'range' };
  }
  function fyRange(fy) { return { from: iso(mk(fy, 3, 1)), to: iso(mk(fy + 1, 2, 31)), label: 'FY ' + fyName(fy), kind: 'fy' }; }

  /* ===== dispatch data (project jz, table dispatch_entries) ===== */
  const D = { rows: new Map(), covered: [], areas: [], places: [], loadedDims: false };
  const MCFL_AREAS = ['KUR', 'CKP', 'IB'];
  const normSub = s => { s = String(s || '').trim().toUpperCase(); return s === 'MCL' ? 'MCFL' : s === 'WCL' ? 'WCF' : s; };
  const effSub = r => { const s = normSub(r.subsidiary); return (s === 'SECL' && MCFL_AREAS.indexOf(nk(r.area)) >= 0) ? 'MCFL' : s; };
  const catOf = t => t.indexOf('WASH') >= 0 ? 'wc' : t.indexOf('NON') >= 0 ? 'np' : t.indexOf('POWER') >= 0 ? 'p' : '';
  const catLabel = { p: 'Power', np: 'Non-power', wc: 'Wash coal', '': 'Unclassified' };

  async function ensureDispatch(from, to) {
    for (const c of D.covered) if (c[0] <= from && c[1] >= to) return;
    const rows = await rest('jz', 'dispatch_entries', 'select=id,entry_date,subsidiary,area,siding,destination,type&entry_date=gte.' + from + '&entry_date=lte.' + to + '&order=id');
    rows.forEach(r => { r.entry_date = String(r.entry_date).slice(0, 10); r._t = nk(r.type); r._c = catOf(r._t); r._s = effSub(r); D.rows.set(r.id, r); });
    D.covered.push([from, to]);
    buildDims();
  }
  function buildDims() {
    const a = new Set(), p = new Set();
    D.rows.forEach(r => {
      if (r.area && String(r.area).trim()) a.add(String(r.area).trim());
      if (r.siding && String(r.siding).trim()) p.add(String(r.siding).trim());
      if (r.destination && String(r.destination).trim()) p.add(String(r.destination).trim());
    });
    D.areas = Array.from(a); D.places = Array.from(p); D.loadedDims = true;
  }
  const STOP = new Set(['ALL', 'THE', 'AND', 'FOR', 'NA', 'NIL', 'NONE', 'OF', 'IN', 'TO', 'A', 'I']);
  function matchNames(q, list) {
    const Q = nsp(q), hit = [];
    list.slice().sort((x, y) => y.length - x.length).forEach(v => {
      const V = nsp(v).trim();
      if (V.length < 2 || STOP.has(V)) return;
      if ((' ' + Q + ' ').indexOf(' ' + V + ' ') >= 0 && !hit.some(h => nsp(h).indexOf(' ' + V + ' ') >= 0)) hit.push(v);
    });
    return hit;
  }

  /* ===== understanding a dispatch question ===== */
  function understand(q, now) {
    const L = q.toLowerCase();
    const c = { q };
    c.range = parseDates(q, now);
    c.defaultRange = false;
    if (!c.range) { c.range = fyRange(fyOf(now)); c.range.to = iso(now) < c.range.to ? iso(now) : c.range.to; c.range.label = 'FY ' + fyName(fyOf(now)) + ' so far'; c.defaultRange = true; }
    // type
    c.type = null; c.sub_t = null;
    if (/non[\s-]?power/.test(L)) c.type = 'np';
    else if (/wash(ed)?\s*coal|\bwc\b/.test(L)) c.type = 'wc';
    else if (/\bpower\b/.test(L)) c.type = 'p';
    if (/\bcpp\b/.test(L)) c.sub_t = 'CPP'; else if (/\beac\b/.test(L)) c.sub_t = 'EAC';
    // subsidiary
    c.subs = [];
    [['SECL', /\bsecl\b/], ['MCFL', /\b(mcfl|mcl)\b/], ['CCL', /\bccl\b/], ['NCL', /\bncl\b/], ['WCF', /\b(wcf|wcl)\b/]].forEach(x => { if (x[1].test(L)) c.subs.push(x[0]); });
    // named locations
    c.areas = matchNames(q, D.areas);
    c.places = matchNames(q, D.places).filter(p => c.areas.indexOf(p) < 0 || true);
    // metric
    c.avg = /\b(average|avg|mean|per\s*day|daily average|a day)\b/.test(L);
    // grouping
    c.group = null;
    if (/(month|monthly)[\s-]*wise|by month|each month|per month|month[\s-]?on[\s-]?month/.test(L)) c.group = 'month';
    else if (/quarter[\s-]*wise|quarterly|by quarter|each quarter/.test(L)) c.group = 'quarter';
    else if (/(day|date|daily)[\s-]*wise|by day|day by day|detail/.test(L) && !/per\s*day/.test(L)) c.group = 'day';
    else if (/area[\s-]*wise|by area/.test(L)) c.group = 'area';
    else if (/(subsidiary|subsidiaries|company|companies)[\s-]*wise|by subsidiary/.test(L)) c.group = 'sub';
    else if (/(destination|party|consumer|plant)[\s-]*wise|by destination/.test(L)) c.group = 'destination';
    else if (/siding[\s-]*wise|by siding/.test(L)) c.group = 'siding';
    else if (/(type|category)[\s-]*wise|power\s+(vs|and|&)\s+non/.test(L)) c.group = 'type';
    c.image = /\b(image|png|picture|photo|snapshot|screenshot)\b/.test(L);
    c.csv = /\b(csv|excel|download|export|sheet)\b/.test(L);
    return c;
  }

  function runDispatch(c) {
    const rows = [];
    D.rows.forEach(r => {
      if (r.entry_date < c.range.from || r.entry_date > c.range.to) return;
      if (c.type && r._c !== c.type) return;
      if (c.sub_t && r._t.indexOf(c.sub_t) < 0) return;
      if (c.subs.length && c.subs.indexOf(r._s) < 0) return;
      const loc = c.areas.concat(c.places);
      if (loc.length) {
        const ok = loc.some(v => { const V = nk(v); return nk(r.area) === V || nk(r.siding) === V || nk(r.destination) === V; });
        if (!ok) return;
      }
      rows.push(r);
    });
    const endEff = c.range.to > iso(today()) ? iso(today()) : c.range.to;
    const totalDays = Math.max(1, daysBetween(c.range.from, endEff));
    // choose grouping
    let g = c.group;
    const multiMonth = c.range.from.slice(0, 7) !== c.range.to.slice(0, 7);
    if (!g) {
      if (multiMonth) g = 'month';
      else if (c.areas.length || c.places.length) g = 'day';
      else if (c.subs.length === 1) g = 'area';
      else g = 'sub';
    }
    const keyOf = {
      month: r => r.entry_date.slice(0, 7), quarter: r => qKey(r.entry_date), day: r => r.entry_date,
      area: r => (String(r.area || '').trim() || '(blank)'), sub: r => r._s || '(blank)',
      destination: r => (String(r.destination || '').trim() || '(blank)'), siding: r => (String(r.siding || '').trim() || '(blank)'),
      type: r => catLabel[r._c]
    }[g];
    const map = new Map();
    rows.forEach(r => {
      const k = keyOf(r);
      let o = map.get(k); if (!o) { o = { k, p: 0, np: 0, wc: 0, o: 0, t: 0, first: r.entry_date }; map.set(k, o); }
      if (r._c === 'p') o.p++; else if (r._c === 'np') o.np++; else if (r._c === 'wc') o.wc++; else o.o++;
      o.t++;
      if (r.entry_date < o.first) o.first = r.entry_date;
    });
    let list = Array.from(map.values());
    const chrono = g === 'month' || g === 'day' || g === 'quarter';
    list.sort(chrono ? (a, b) => (a.first < b.first ? -1 : 1) : (a, b) => b.t - a.t);
    // days per group (for averages)
    const dayCount = o => {
      if (g === 'month') {
        const f = o.k + '-01', ey = +o.k.slice(0, 4), em = +o.k.slice(5, 7) - 1;
        let s = f < c.range.from ? c.range.from : f, e = iso(endOfMonth(ey, em)); if (e > endEff) e = endEff; if (e > c.range.to) e = c.range.to;
        return Math.max(1, daysBetween(s, e));
      }
      if (g === 'day') return 1;
      return totalDays;
    };
    const lab = o => g === 'month' ? monLabel(o.k) : g === 'day' ? dmy(o.k) : o.k;
    const gName = { month: 'Month', quarter: 'Quarter', day: 'Date', area: 'Area', sub: 'Subsidiary', destination: 'Destination', siding: 'Siding', type: 'Type' }[g];
    const total = { p: 0, np: 0, wc: 0, o: 0, t: 0 };
    list.forEach(o => { ['p', 'np', 'wc', 'o', 't'].forEach(k => total[k] += o[k]); });
    // columns
    const single = c.type ? c.type : null;
    const cols = [{ key: 'label', label: gName, align: 'l' }];
    const typeCols = single ? [[single, catLabel[single]]] : [['p', 'Power'], ['np', 'Non-power'], ['wc', 'Wash coal']];
    const div = c.avg;
    typeCols.forEach(x => cols.push({ key: x[0], label: x[1] + (div ? ' / day' : ''), align: 'r' }));
    if (!single) cols.push({ key: 't', label: 'Total' + (div ? ' / day' : ''), align: 'r' });
    // hide wash coal column if it is all zero
    const hideWc = !single && total.wc === 0;
    const useCols = cols.filter(cl => !(hideWc && cl.key === 'wc'));
    const val = (o, k, days) => div ? (days ? (o[k] / days) : 0) : o[k];
    const out = list.map(o => {
      const days = dayCount(o), row = { label: lab(o), _k: o.k };
      ['p', 'np', 'wc', 't'].forEach(k => { row[k] = val(o, k, days); });
      return row;
    });
    const trow = { label: 'Total', p: val(total, 'p', totalDays), np: val(total, 'np', totalDays), wc: val(total, 'wc', totalDays), t: val(total, 't', totalDays), _total: true };
    if (single) out.forEach(r => { r.t = r[single]; });
    const mainKey = single || 't';
    // headline
    const what = (c.type ? catLabel[c.type].toLowerCase() + ' rakes' : 'rakes');
    const scopeBits = [];
    if (c.subs.length) scopeBits.push(c.subs.join(' + '));
    if (c.areas.length) scopeBits.push(c.areas.join(' + '));
    if (c.places.length) scopeBits.push(c.places.join(' + '));
    if (c.sub_t) scopeBits.push(c.sub_t);
    const scope = scopeBits.length ? ' \u00b7 ' + scopeBits.join(' \u00b7 ') : '';
    const headNum = div ? (total[single || 't'] / totalDays) : total[single || 't'];
    let headline;
    if (!rows.length) headline = 'No rakes found for ' + c.range.label + scope + '.';
    else if (div) headline = 'Average ' + what + ' per day: ' + headNum.toFixed(2) + ' (' + fmt(total[single || 't']) + ' rakes over ' + totalDays + ' days, ' + c.range.label + scope + ').';
    else headline = 'Total ' + what + ': ' + fmt(headNum) + ' (' + c.range.label + scope + ').';
    const notes = [];
    if (c.defaultRange) notes.push('No dates given, so I used ' + c.range.label + ' (' + dmy(c.range.from) + ' to ' + dmy(c.range.to) + '). Add dates to change this.');
    if (c.avg && c.range.to > iso(today())) notes.push('Averages are counted up to today (' + dmy(iso(today())) + ').');
    if (/quarter/.test(c.range.kind + g)) notes.push('Quarters follow the financial year (Q1 = Apr-Jun).');
    return {
      kind: 'table', title: (div ? 'Average ' : 'Total ') + what + (div ? ' per day' : ''),
      subtitle: c.range.label + scope + ' \u00b7 by ' + gName.toLowerCase(),
      headline, notes, cols: useCols, rows: out, total: rows.length ? trow : null, main: mainKey, ctx: c, group: g, decimals: div ? 2 : 0,
      chips: chipsFor(c, g, out)
    };
  }

  /* ===== follow-up suggestions ===== */
  function compose(c, o) {
    o = o || {};
    const bits = [];
    const avg = o.avg != null ? o.avg : c.avg;
    const type = o.type !== undefined ? o.type : c.type;
    bits.push(avg ? 'average' : 'total');
    if (type) bits.push({ np: 'non-power', p: 'power', wc: 'wash coal' }[type]);
    bits.push('rakes');
    (o.subs || c.subs).forEach(s => bits.push(s));
    (o.areas || c.areas).forEach(s => bits.push(s));
    (o.places || c.places).forEach(s => bits.push(s));
    const g = o.group !== undefined ? o.group : null;
    if (g) bits.push({ month: 'month wise', quarter: 'quarter wise', day: 'day wise', area: 'area wise', sub: 'subsidiary wise', destination: 'destination wise', siding: 'siding wise', type: 'type wise' }[g]);
    const r = o.range || c.range;
    bits.push(r.kind === 'month' || r.kind === 'quarter' || r.kind === 'fy' ? r.label.replace(/^FY /, 'FY ') : (r.from === r.to ? dmy(r.from) : dmy(r.from) + ' to ' + dmy(r.to)));
    return bits.join(' ');
  }
  function chipsFor(c, g, rows) {
    const out = [];
    const last = rows.length ? rows[rows.length - 1]._k : null;
    const monthRange = ym => { const y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1; return { from: iso(mk(y, m, 1)), to: iso(endOfMonth(y, m)), label: MON3[m] + ' ' + y, kind: 'month' }; };
    if (g === 'month' && last) {
      const mr = monthRange(last);
      out.push(['Detail for ' + mr.label, compose(c, { range: mr, group: 'day' })]);
      out.push(['Area-wise for ' + mr.label, compose(c, { range: mr, group: 'area' })]);
    } else if (g === 'sub' || g === 'area') {
      out.push(['Day-wise detail', compose(c, { group: 'day' })]);
      if (g === 'sub') out.push(['Area-wise', compose(c, { group: 'area' })]);
    } else if (g === 'day') {
      out.push(['Area-wise', compose(c, { group: 'area' })]);
    }
    if (g !== 'month') out.push(['Month-wise', compose(c, { group: 'month' })]);
    if (g !== 'quarter') out.push(['Quarter-wise', compose(c, { group: 'quarter' })]);
    out.push([c.avg ? 'Show totals' : 'Average per day', compose(c, { avg: !c.avg, group: g })]);
    if (!c.type) out.push(['Only non-power', compose(c, { type: 'np', group: g })]);
    else out.push(['All types', compose(c, { type: null, group: g })]);
    return out.slice(0, 6);
  }

  /* ===== module registry (Part 2+ add themselves here) ===== */
  const MODULES = [];
  MODULES.push({
    id: 'dispatch',
    score(q) {
      let s = 0;
      if (/\b(rakes?|dispatch|siding|destination|loading|coal|power|secl|mcfl|mcl|ccl|ncl|wcf|wcl|cpp|eac)\b/i.test(q)) s += 2;
      if (/\b(total|average|how many|count)\b/i.test(q)) s += 1;
      return s;
    },
    async run(q) {
      const now = today();
      if (D.at && Date.now() - D.at > 60000) { D.rows.clear(); D.covered = []; D.loadedDims = false; D.at = 0; }   // always re-read after 1 minute
      if (!D.loadedDims) { D.at = Date.now(); await ensureDispatch(iso(mk(fyOf(now), 3, 1)), iso(now)); }
      const c = understand(q, now);
      await ensureDispatch(c.range.from, c.range.to > iso(now) ? iso(now) : c.range.to);
      return runDispatch(c);
    }
  });
  /* ================= MODULE: DAILY RAKE LOADING (amm_daily_entries, project jz) ================= */
  const LSUBS = [
    { k: 'SECL', n: 'South Eastern Coalfields', c: '#2f6fb5', t: '#e5edf7', p: ['Balco (CPP)', 'Balco (IPP)', 'Balco (E/A)', 'NTPC Jhabua', 'Gujrat (GETS)', 'Gujrat (TPHS)', 'HZL'] },
    { k: 'MCL', n: 'Mahanadi Coalfields', c: '#1b8a7f', t: '#e3f1ef', p: ['NTPC (IB)', 'NTPC (CKP)', 'HZL', 'NGPM (Talchar)', 'NLOD (Talchar)', 'NLOD (IB)', 'NLOD (CKP)'] },
    { k: 'WCL', n: 'Western Coalfields', c: '#7656a8', t: '#ece8f3', p: ['Gujrat (GETS)', 'Gujrat (TPHS)'] },
    { k: 'CCL', n: 'Central Coalfields', c: '#c4532a', t: '#f7e9e3', p: ['HZL', 'NTPC Jhabua'] },
    { k: 'NCL', n: 'Northern Coalfields', c: '#5b6a78', t: '#eaedf0', p: ['NTPC Jhabua'] }
  ];
  const LGROUPS = [
    { name: 'Balco', rows: [['SECL', [0, 1, 2]]], re: /\bbalco\b/ },
    { name: 'HZL', rows: [['SECL', [6]], ['MCL', [2]], ['CCL', [0]]], re: /\bhzl\b|hindustan zinc/ },
    { name: 'Jhabua', rows: [['SECL', [3]], ['MCL', [0, 1]], ['CCL', [1]], ['NCL', [0]]], re: /\bjhabua\b|\bpjpb\b/ },
    { name: 'Gujrat TPHS', rows: [['SECL', [5]], ['WCL', [1]]], re: /\btphs\b/ },
    { name: 'Gujrat GETS', rows: [['SECL', [4]], ['WCL', [0]]], re: /\bgets\b/ },
    { name: 'Gujrat Total', rows: [['SECL', [4, 5]], ['WCL', [0, 1]]], re: /\bguj(a)?rat\b|\bgpcl\b/ },
    { name: 'NGPM', rows: [['MCL', [3]]], re: /\bngpm\b/ },
    { name: 'NLOD', rows: [['MCL', [4, 5, 6]]], re: /\bnlod\b|\bnalco\b/ }
  ];
  const LSUBRE = [['SECL', /\bsecl\b/], ['MCL', /\b(mcl|mcfl)\b/], ['WCL', /\b(wcl|wcf)\b/], ['CCL', /\bccl\b/], ['NCL', /\bncl\b/]];
  const lnum = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
  const lhas = v => v !== undefined && v !== null && v !== '';
  const LCACHE = {};

  async function loadingRow(dateIso) {
    if (LCACHE[dateIso]) return LCACHE[dateIso];
    const rows = await rest('jz', 'amm_daily_entries', 'select=*&report_date=eq.' + dateIso);
    return (LCACHE[dateIso] = rows[0] || null);
  }
  async function loadingLatest(upTo) {
    const rows = await rest('jz', 'amm_daily_entries', 'select=*&order=report_date.desc&limit=1' + (upTo ? '&report_date=lte.' + upTo : ''));
    if (rows[0]) LCACHE[String(rows[0].report_date).slice(0, 10)] = rows[0];
    return rows[0] || null;
  }
  function lEntry(row, id) {
    const e = (row.entries && row.entries[id]) || {};
    const t = lnum(e.t), d = lhas(e.p) ? lnum(e.d) : 0, l = lhas(e.p) ? lnum(e.p) + d : lnum(e.l);
    return { t: t, d: d, l: l };
  }
  function lAgg(row, ids, left) {
    let t = 0, d = 0, l = 0;
    ids.forEach(id => { const e = lEntry(row, id); t += e.t; d += e.d; l += e.l; });
    const b = t - l;
    return { t: t, d: d, l: l, b: b, a: left > 0 ? b / left : NaN, pct: t > 0 ? l / t * 100 : 0 };
  }
  const lids = (sub, idx) => idx.map(i => sub + '-' + i);
  const lAll = () => { const o = []; LSUBS.forEach(s => s.p.forEach((_, i) => o.push(s.k + '-' + i))); return o; };
  const g4 = n => String(parseFloat(Number(n).toPrecision(8)));
  const askTxt = a => isFinite(a) ? a.toFixed(2) : '-';

  function loadingModel(row) {
    const rd = String(row.report_date).slice(0, 10), dim = lnum(row.days_in_month) || endOfMonth(+rd.slice(0, 4), +rd.slice(5, 7) - 1).getDate();
    const left = dim - (+rd.slice(8, 10));
    const subs = LSUBS.map(s => Object.assign({ s: s }, lAgg(row, lids(s.k, s.p.map((_, i) => i)), left)));
    const total = lAgg(row, lAll(), left);
    const groups = [];
    LGROUPS.forEach(gr => {
      const parts = gr.rows.map(r => ({ sub: r[0], a: lAgg(row, lids(r[0], r[1]), left) }));
      const all = []; gr.rows.forEach(r => lids(r[0], r[1]).forEach(x => all.push(x)));
      groups.push({ gr: gr, parts: parts, a: lAgg(row, all, left) });
    });
    return { rd: rd, dim: dim, left: left, subs: subs, total: total, groups: groups, row: row };
  }

  function loadingTable(m, c) {
    const cols = [
      { key: 'label', label: c.title || 'Party', align: 'l' }, { key: 't', label: 'Target', align: 'r', f: g4 }, { key: 'd', label: 'Today', align: 'r', f: g4 },
      { key: 'l', label: 'Loaded', align: 'r', f: g4 }, { key: 'b', label: 'Balance', align: 'r', f: g4 }, { key: 'a', label: 'Asking/day', align: 'r', f: askTxt }, { key: 'pct', label: '% done', align: 'r', f: v => Math.round(v) + '%' }
    ];
    return cols;
  }
  function pushRow(rows, label, a) { rows.push({ label: label, t: a.t, d: a.d, l: a.l, b: a.b, a: a.a, pct: a.pct }); }

  let LAT = 0;
  async function runLoading(q) {
    if (Date.now() - LAT > 60000) { Object.keys(LCACHE).forEach(k => delete LCACHE[k]); LAT = Date.now(); }
    const now = today(), L = q.toLowerCase();
    const r = parseDates(q, now);
    const upTo = r ? (r.to > iso(now) ? iso(now) : r.to) : null;
    let row = upTo ? (await loadingRow(upTo)) || await loadingLatest(upTo) : await loadingLatest();
    if (!row) return { kind: 'text', headline: 'No daily loading entry was found' + (upTo ? ' on or before ' + dmy(upTo) : '') + '.', notes: [], chips: [], ctx: {} };
    const m = loadingModel(row), when = dmy(m.rd);
    const subSel = LSUBRE.filter(x => x[1].test(L)).map(x => x[0]);
    const grSel = LGROUPS.filter(x => x.re.test(L) && !(x.name === 'Gujrat Total' && /\b(tphs|gets)\b/.test(L)));
    const rows = []; let title = 'Rake loading status', sub = 'Report date ' + when, cols, totalRow = null, group = 'sub';
    if (grSel.length) {
      const g = grSel[0];
      cols = loadingTable(m, { title: 'Subsidiary' });
      const gg = m.groups.find(x => x.gr === g);
      if (gg.parts.length > 1 || g.name.indexOf('Total') >= 0) gg.parts.forEach(p => pushRow(rows, p.sub, p.a));
      else pushRow(rows, gg.parts[0].sub, gg.parts[0].a);
      totalRow = Object.assign({ label: g.name + ' total', _total: true }, gg.a);
      title = g.name + ' rake loading'; group = 'party';
    } else if (subSel.length) {
      const s = LSUBS.find(x => x.k === subSel[0]);
      cols = loadingTable(m, { title: 'Party' });
      s.p.forEach((name, i) => pushRow(rows, name, lAgg(m.row, [s.k + '-' + i], m.left)));
      const a = m.subs.find(x => x.s === s);
      totalRow = Object.assign({ label: s.k + ' total', _total: true }, a);
      title = s.k + ' rake loading'; group = 'party';
    } else {
      cols = loadingTable(m, { title: 'Subsidiary' });
      m.subs.forEach(a => pushRow(rows, a.s.k, a));
      totalRow = Object.assign({ label: 'Total', _total: true }, m.total);
    }
    const t = totalRow;
    const ask = /\b(asking|ask)\b/.test(L), bal = /\b(balance|pending|remaining|left)\b/.test(L), ldd = /\b(loaded|loading)\b/.test(L), tgt = /\btarget/.test(L);
    let headline = title + ' on ' + when + ': ' + g4(t.l) + ' of ' + g4(t.t) + ' rakes loaded (' + Math.round(t.pct) + '%).';
    if (ask) headline = title + ' on ' + when + ': asking rate is ' + askTxt(t.a) + ' rakes a day for the ' + m.left + ' days left (balance ' + g4(t.b) + ').';
    else if (bal) headline = title + ' on ' + when + ': balance is ' + g4(t.b) + ' rakes (target ' + g4(t.t) + ', loaded ' + g4(t.l) + ').';
    else if (tgt && !ldd) headline = title + ' on ' + when + ': target is ' + g4(t.t) + ' rakes.';
    const notes = ['Loaded = loaded up to the previous day + today. Asking/day = balance / ' + m.left + ' days left in the month.'];
    if (upTo && m.rd !== upTo && r) notes.unshift('No entry for ' + dmy(upTo) + ', so this is the latest one before it.');
    const chips = [];
    if (group === 'sub') { LSUBS.slice(0, 3).forEach(s => chips.push([s.k + ' parties', 'rake loading status ' + s.k + ' ' + when])); chips.push(['Party-wise: HZL', 'rake loading HZL ' + when]); }
    else chips.push(['All subsidiaries', 'rake loading status ' + when]);
    chips.push(['Overall rake loading image', 'overall rake loading image ' + when]);
    const res = {
      kind: 'table', title: title, subtitle: when + ' \u00b7 days left ' + m.left, headline: headline, notes: notes, cols: cols, rows: rows, total: totalRow, main: 'l', ctx: {}, group: group, decimals: 0,
      chips: chips, draw: function () { return drawLoadingImage(m); }
    };
    if (/\b(overall|full|whole|complete|status)\b/.test(L) && IMGRE.test(L)) { res.ctx.image = true; res.rows = rows; }
    return res;
  }

  function drawLoadingImage(m) {
    const W = 1700, P = 40, S = 2, CD = '"Bricolage Grotesque",ui-sans-serif,system-ui,sans-serif', BT = '"Instrument Sans",ui-sans-serif,system-ui,sans-serif';
    const COL = {}; LSUBS.forEach(s => { COL[s.k] = [s.c, s.t]; });
    const mainRows = [{ t: 'head', cells: ['Party name', 'Target rakes', 'Today loading', 'Loaded rakes', 'Balance rakes', 'Asking / day', '% done'] }];
    LSUBS.forEach(s => {
      mainRows.push({ t: 'sec', key: s.k, cells: [s.k, s.n] });
      s.p.forEach((name, i) => { const a = lAgg(m.row, [s.k + '-' + i], m.left); mainRows.push({ t: 'row', key: s.k, cells: [name, g4(a.t), g4(a.d), g4(a.l), g4(a.b), askTxt(a.a), Math.round(a.pct) + '%'] }); });
      const a = m.subs.find(x => x.s === s);
      mainRows.push({ t: 'tot', key: s.k, cells: [s.k + ' total', g4(a.t), g4(a.d), g4(a.l), g4(a.b), askTxt(a.a), Math.round(a.pct) + '%'] });
    });
    mainRows.push({ t: 'grand', key: '', cells: ['Total', g4(m.total.t), g4(m.total.d), g4(m.total.l), g4(m.total.b), askTxt(m.total.a), Math.round(m.total.pct) + '%'] });
    const sumRows = [{ t: 'head', cells: ['Subsidiary', 'Party', 'Target', 'Loaded', 'Balance', 'Asking'] }];
    m.groups.forEach((gg, gi) => {
      const many = gg.parts.length > 1 && gg.gr.name !== 'Gujrat Total';
      if (gg.gr.name === 'Gujrat Total') { sumRows.push({ t: 'tot', gap: true, cells: ['', 'Gujrat Total', g4(gg.a.t), g4(gg.a.l), g4(gg.a.b), askTxt(gg.a.a)] }); return; }
      gg.parts.forEach((p, ri) => sumRows.push({ t: many ? 'row' : 'tot', gap: ri === 0 && gi > 0, cells: [p.sub, gg.gr.name, g4(p.a.t), g4(p.a.l), g4(p.a.b), askTxt(p.a.a)] }));
      if (many) sumRows.push({ t: 'tot', cells: ['', 'Total', g4(gg.a.t), g4(gg.a.l), g4(gg.a.b), askTxt(gg.a.a)] });
    });
    sumRows.push({ t: 'grand', cells: ['', 'Total', g4(m.total.t), g4(m.total.l), g4(m.total.b), askTxt(m.total.a)] });
    const rowH = r => r.t === 'sec' ? 38 : r.t === 'grand' ? 46 : r.t === 'head' ? 34 : 36;
    const tblH = rows => rows.reduce((h, r) => h + rowH(r) + (r.gap ? 10 : 0), 0);
    const TY = 626, H = TY + Math.max(tblH(mainRows), tblH(sumRows)) + 74;
    const cv = document.createElement('canvas'); cv.width = W * S; cv.height = H * S;
    const c = cv.getContext('2d'); c.scale(S, S);
    const path = (x, y, w, h, r) => { c.beginPath(); if (r && c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h); };
    const rect = (x, y, w, h, f, r) => { path(x, y, w, h, r); c.fillStyle = f; c.fill(); };
    const txt = (s, x, y, font, col, al) => { c.font = font; c.fillStyle = col; c.textAlign = al || 'left'; c.fillText(s, x, y); };
    const chip = (s, x, y, h, col, fs) => { c.font = '700 ' + fs + 'px ' + CD; const w = c.measureText(s).width + 16; rect(x, y, w, h, col, 4); txt(s, x + 8, y + h / 2 + fs * 0.35, '700 ' + fs + 'px ' + CD, '#fff'); return w; };
    function table(x, y, w, fr, rows, sum) {
      const tot = fr.reduce((a, b) => a + b, 0), xs = [x], nl = sum ? 2 : 1, last = fr.length - 1; let yy = y;
      fr.forEach(f => xs.push(xs[xs.length - 1] + w * f / tot));
      c.save(); path(x, y, w, tblH(rows), 8); c.clip();
      rows.forEach(r => {
        if (r.gap) { rect(x, yy, w, 10, '#fff'); yy += 10; }
        const h = rowH(r), col = COL[r.key] || ['#17283a', '#e8ecf0'], base = yy + h / 2 + 6;
        rect(x, yy, w, h, r.t === 'head' ? '#fafbfd' : r.t === 'tot' ? '#e2f3e8' : r.t === 'grand' ? '#17283a' : r.t === 'sec' ? col[1] : '#fff');
        if (r.t === 'sec') { rect(x, yy, 6, h, col[0]); const cw = chip(r.cells[0], x + 18, yy + 7, h - 14, col[0], 20); txt(r.cells[1], x + 18 + cw + 10, base, '400 15px ' + BT, '#55636f'); }
        else {
          if (!sum && r.t === 'row') { c.globalAlpha = 0.45; rect(x, yy, 6, h, col[0]); c.globalAlpha = 1; }
          r.cells.forEach((s, j) => {
            if (r.t === 'head') { txt(s, j < nl ? xs[j] + (j ? 8 : 18) : xs[j + 1] - 14, base - 2, '500 14px ' + BT, '#55636f', j < nl ? 'left' : 'right'); return; }
            if (j < nl) {
              if (sum && j === 0) { if (COL[s]) chip(s, xs[0] + 18, yy + 8, h - 16, COL[s][0], 16); return; }
              txt(s, xs[j] + (sum ? 8 : r.t === 'row' ? 24 : 18), base, r.t === 'grand' ? '700 24px ' + CD : (r.t === 'row' ? '400 17px ' : '600 17px ') + BT, r.t === 'grand' ? '#fff' : r.t === 'tot' ? '#0d5a30' : '#16212c');
              return;
            }
            const ask = j === (sum ? last : last - 1), pc = !sum && j === last;
            let colr = r.t === 'grand' ? (ask ? '#ffb400' : '#fff') : r.t === 'tot' ? '#0d5a30' : (s.charAt(0) === '-' && s.length > 1 ? '#b3261e' : '#16212c');
            let fnt = (r.t === 'grand' ? '700 26px ' : (r.t === 'tot' || ask) ? '700 20px ' : '500 20px ') + CD;
            if (pc) {
              const p = Math.max(0, Math.min(100, parseInt(s, 10) || 0));
              rect(xs[j] + 14, base - 14, 54, 9, r.t === 'grand' ? 'rgba(255,255,255,.22)' : r.t === 'tot' ? 'rgba(13,90,48,.18)' : '#e4e7e2', 4);
              if (p) rect(xs[j] + 14, base - 14, Math.max(8, 54 * p / 100), 9, r.t === 'grand' ? '#ffb400' : r.t === 'tot' ? '#1d8f4e' : col[0], 4);
              fnt = '500 18px ' + CD;
            }
            txt(s, xs[j + 1] - 14, base + 1, fnt, colr, 'right');
          });
        }
        rect(x, yy + h - (r.t === 'head' ? 2 : 1), w, r.t === 'head' ? 2 : 1, r.t === 'head' ? '#17283a' : '#e0e6ec');
        yy += h;
      });
      c.restore(); path(x, y, w, tblH(rows), 8); c.strokeStyle = '#c2ccd6'; c.lineWidth = 1; c.stroke();
    }
    rect(0, 0, W, H, '#f1f4f8'); rect(0, 0, W, 8, '#ffb400');
    txt('AMM daily rake loading status', P, 76, '700 48px ' + CD, '#17283a');
    txt("Coal India subsidiaries: target, today's loading, loaded and asking rakes", P, 106, '400 18px ' + BT, '#55636f');
    txt('Report date', W - P, 52, '400 15px ' + BT, '#55636f', 'right');
    txt(dmy(m.rd), W - P, 100, '700 44px ' + CD, '#17283a', 'right');
    const T = m.total, pc0 = T.t > 0 ? Math.min(100, T.l / T.t * 100) : 0;
    txt(g4(T.l) + ' of ' + g4(T.t) + ' rakes loaded', P, 190, '700 64px ' + CD, '#17283a');
    txt(g4(T.d) + ' loaded today. ' + g4(T.b) + ' rakes still to load (' + Math.round(T.pct) + '% of target). The asking rate is ' + askTxt(T.a) + ' rakes a day for the ' + m.left + ' days left in the month.', P, 226, '400 20px ' + BT, '#55636f');
    rect(P, 244, W - 2 * P, 10, '#dfe5ea', 5); if (pc0 > 0) rect(P, 244, Math.max(10, (W - 2 * P) * pc0 / 100), 10, '#1d8f4e', 5);
    const kp = [['Target rakes', g4(T.t)], ['Loaded today', g4(T.d)], ['Loaded rakes', g4(T.l)], ['Balance rakes', g4(T.b)], ['Asking rakes per day', askTxt(T.a)]], kw = (W - 2 * P - 64) / 5;
    kp.forEach((k, i) => {
      const x = P + i * (kw + 16), key = i === 4;
      rect(x, 278, kw, 96, key ? '#17283a' : '#fff', 10); if (!key) { path(x, 278, kw, 96, 10); c.strokeStyle = '#c2ccd6'; c.stroke(); }
      txt(k[0], x + 20, 308, '400 16px ' + BT, key ? '#a9b6c3' : '#55636f');
      txt(k[1], x + 20, 355, '700 50px ' + CD, key ? '#ffb400' : '#17283a');
    });
    const gp = 12, av = W - 2 * P - gp * (m.subs.length - 1), y0 = 404, bh = 92, gs = m.subs.reduce((a, b) => a + Math.max(b.t, 1), 0); let wx = P;
    m.subs.forEach((a, i) => {
      const k = a.s.k, cl = COL[k], bw = av * (0.35 / m.subs.length + 0.65 * Math.max(a.t, 1) / gs), p = Math.max(0, Math.min(100, Math.round(a.pct))), fh = bh * p / 100;
      rect(wx, y0, bw, bh, cl[1], 8);
      c.save(); path(wx, y0, bw, bh, 8); c.clip(); rect(wx, y0 + bh - fh, bw, fh, cl[0]);
      c.globalAlpha = 0.24; for (let sx = wx; sx < wx + bw; sx += 11) rect(sx, y0 + bh - fh, 2, fh, '#fff'); c.globalAlpha = 1; c.restore();
      path(wx + 1.5, y0 + 1.5, bw - 3, bh - 3, 7); c.strokeStyle = cl[0]; c.lineWidth = 3; c.stroke();
      rect(wx - 4, y0 + bh + 12, bw + 8, 3, '#17283a');
      [wx + bw * 0.14 + 8, wx + bw * 0.86 - 8].forEach(cx => { c.beginPath(); c.arc(cx, y0 + bh + 8, 8, 0, 6.2832); c.fillStyle = '#17283a'; c.fill(); });
      txt(k, wx, y0 + bh + 48, '700 28px ' + CD, cl[0]); txt(p + '%', wx + bw, y0 + bh + 48, '600 26px ' + CD, '#17283a', 'right');
      txt(g4(a.l) + ' of ' + g4(a.t) + ' rakes', wx, y0 + bh + 70, '400 15px ' + BT, '#55636f');
      wx += bw + gp;
    });
    txt('Subsidiary-wise loading', P, 612, '700 26px ' + CD, '#17283a'); txt('Party-wise summary', P + 984, 612, '700 26px ' + CD, '#17283a');
    table(P, TY, 960, [24, 11, 11, 11, 12, 16, 15], mainRows, false);
    table(P + 984, TY, 636, [15, 26, 13, 13, 15, 17], sumRows, true);
    txt('Loaded = loaded up to the previous day + today loading. Balance = Target - Loaded. Asking rakes per day = Balance / (days in month - day of the report date).', P, H - 28, '400 14px ' + BT, '#7b8794');
    return cv;
  }

  MODULES.push({
    id: 'loading',
    score(q) {
      const L = q.toLowerCase();
      let s = 0;
      if (/(rake|rakes)?\s*loading\s*(status|image|report|summary)|daily\s+(rake\s+)?loading|loading\s+status|asking\s+rake|rakes?\s+(still\s+)?(to\s+)?load|balance\s+rakes?|loaded\s+rakes?|target\s+rakes?/.test(L)) s += 7;
      if (/\boverall\b.*\b(rake|loading)\b|\b(rake|loading)\b.*\boverall\b/.test(L)) s += 2;
      if (/\b(balco|ngpm|tphs|gets)\b/.test(L) && /\b(loading|loaded|balance|asking|target)\b/.test(L)) s += 3;
      if (/\b(billing|penalty|gcv|reco|shortage|odr|indent|pending)\b/.test(L)) s -= 6;
      return s;
    },
    run: runLoading
  });
  /* ================= SHARED: money + month helpers ================= */
  const inr = v => { v = Number(v) || 0; return (v < 0 ? '-' : '') + '\u20b9 ' + Math.round(Math.abs(v)).toLocaleString('en-IN'); };
  const d1 = v => (Number(v) || 0).toLocaleString('en-IN', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  const d2f = v => (Number(v) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  const pctf = v => d1(v) + '%';
  const nnum = v => (v === '' || v == null || isNaN(+v)) ? 0 : +v;
  const sumBy = (a, f) => a.reduce((s, r) => s + nnum(f(r)), 0);
  const sumProdBy = (a, x, y) => a.reduce((s, r) => s + nnum(r[x]) * nnum(r[y]), 0);
  function monthsIn(from, to) {
    const out = []; let y = +from.slice(0, 4), m = +from.slice(5, 7) - 1; const ey = +to.slice(0, 4), em = +to.slice(5, 7) - 1;
    while (y < ey || (y === ey && m <= em)) { out.push(y + '-' + p2(m + 1)); m++; if (m > 11) { m = 0; y++; } }
    return out;
  }
  function perfRange(q) {
    const now = today(), r = parseDates(q, now);
    if (r) return { from: r.from, to: r.to > iso(now) ? iso(now) : r.to, label: r.label, kind: r.kind, given: true };
    const fy = fyOf(now);
    return { from: iso(mk(fy, 3, 1)), to: iso(now), label: 'FY ' + fyName(fy) + ' so far', kind: 'fy', given: false };
  }
  function perfMetric(q) {
    const L = q.toLowerCase();
    if (/penalt|overload|underload|punitive|ehbc|enhc|dead\s*freight|railway/.test(L)) return 'penalty';
    if (/\bgcv\b|grade|slippage|bonus/.test(L) && !/gcv\s*reco/.test(L)) return 'gcv';
    if (/weight|\brr\b|receive|received|shortage|excess|tonn|\bmt\b|quantity|qty/.test(L) && !/reco/.test(L)) return 'weights';
    if (/rakes?|target|loaded|balance|asking|materiali|placement/.test(L) && !/billing|bill\b|reco/.test(L)) return 'rakes';
    return 'billing';
  }
  const PARTY_RE = { gujarat: /\b(guj(a)?rat|gpcl|gets|tphs)\b/i, hzl: /\b(hzl|hindustan\s*zinc|zinc)\b/i, pjpb: /\b(pjpb|jhabua)\b/i };
  const PERF_RE = /\b(bill(ing)?|reco|penalt(y|ies)|gcv|shortage|excess|performance|materiali[sz]ation|rr\s*w(eigh)?t|plant\s*receiv|per\s*mt|expected)\b/i;
  const perfChips = (party, skip) => ['gujarat', 'hzl', 'pjpb'].filter(p => p !== skip).map(p => ['Total billing ' + p.toUpperCase(), 'total billing ' + p]);
  function viewChips(party, metric, extra) {
    const out = [];
    [['billing', 'Billing'], ['rakes', 'Rakes & target'], ['penalty', 'Penalty'], ['weights', 'Weights'], ['gcv', 'GCV']].forEach(m => { if (m[0] !== metric) out.push([m[1], m[1].toLowerCase() === 'billing' ? 'total billing ' + party : (m[0] === 'rakes' ? 'rakes target loaded ' + party : m[0] === 'weights' ? 'weights shortage ' + party : m[0] + ' ' + party)]); });
    return (extra || []).concat(out).slice(0, 6);
  }
  function rollup(list, keyFn, labelFn, sumKeys, fixFn) {
    const m = new Map();
    list.forEach(r => {
      const k = keyFn(r); let o = m.get(k);
      if (!o) { o = { _k: k, label: labelFn(k, r) }; sumKeys.forEach(x => o[x] = 0); m.set(k, o); }
      sumKeys.forEach(x => { o[x] += nnum(r[x]); });
    });
    const out = Array.from(m.values());
    if (fixFn) out.forEach(fixFn);
    return out;
  }
  function totalOf(rows, keys, fix) { const t = { label: 'Total', _total: true }; keys.forEach(k => { t[k] = sumBy(rows, r => r[k]); }); if (fix) fix(t); return t; }
  const COLF = { inr: inr, d1: d1, d2: d2f, pct: pctf, int: v => fmt(Math.round(v || 0)) };
  const mkCol = (key, label, f) => ({ key: key, label: label, align: 'r', f: COLF[f] || f });

  /* ================= GUJARAT (project pc) ================= */
  const G = {
    AREAS: ['SECL', 'WCL', 'MCL'], PARTIES: ['GETS', 'TPHS'], MINES: ['BGCK', 'BGWK', 'GGS', 'MNOG', 'RJCB', 'UMSG'],
    DF: { matTop: 2, matTiers: [[85, 0], [80, -5], [75, -7.5], [70, -10], [65, -20]], matBelow: -40, gcvSlip: [2, -5, -40, -60], gcvSlipAbove: -100 },
    DS: { svcSecl: 30, svcWcl: 30, qtyRate: 30, gcvBase: 30, deadFreight: 0 },
    BANDS: [[7000, 1], [6700, 2], [6400, 3], [6100, 4], [5800, 5], [5500, 6], [5200, 7], [4900, 8], [4600, 9], [4300, 10], [4000, 11], [3700, 12], [3400, 13], [3100, 14], [2800, 15], [2500, 16], [2200, 17]]
  };
  const gIsNum = v => v !== null && v !== undefined && v !== '' && !isNaN(Number(v));
  const gNum = v => (gIsNum(v) ? Number(v) : 0);
  const gUp = v => String(v == null ? '' : v).trim().toUpperCase();
  const gSum = (arr, key) => arr.reduce((s, r) => s + (gIsNum(r[key]) ? Number(r[key]) : 0), 0);
  function gWAvg(arr, vKey, wKey) {
    const f = arr.filter(r => gIsNum(r[vKey]) && gIsNum(r[wKey])), den = f.reduce((s, r) => s + Number(r[wKey]), 0);
    return den ? f.reduce((s, r) => s + Number(r[vKey]) * Number(r[wKey]), 0) / den : 0;
  }
  function gAvg(arr, key) { const v = arr.filter(r => gIsNum(r[key])); return v.length ? v.reduce((s, r) => s + Number(r[key]), 0) / v.length : 0; }
  function gDays(a, b) { const d = Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000); return d > 0 ? d : 0; }
  function gMonthInfo(period) { const Y = +period.slice(0, 4), M = +period.slice(5, 7), dim = new Date(Date.UTC(Y, M, 0)).getUTCDate(); return { start: period + '-01', end: period + '-' + p2(dim), dim: dim }; }
  function gShift(period, k) { const d = new Date(Date.UTC(+period.slice(0, 4), +period.slice(5, 7) - 1 + k, 1)); return d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1); }
  function gGradeNo(gcv) { if (!gIsNum(gcv)) return null; for (const b of G.BANDS) if (Number(gcv) > b[0]) return b[1]; return null; }
  const gGradeText = n => (n == null ? '' : 'G-' + p2(n));
  function gMatPct(mat, F) { if (mat > 100) return F.matTop; for (const t of F.matTiers) if (mat >= t[0]) return t[1]; return F.matBelow; }
  const gQStart = p => { const Y = +p.slice(0, 4), M = +p.slice(5, 7), s0 = [4, 7, 10, 1][Math.floor(((M + 8) % 12) / 3)]; return Y + '-' + p2(s0); };

  function gCompute(a) {
    const period = a.period, mi = gMonthInfo(period), ovr = a.ovr || (() => undefined);
    const pick = (id, v) => { const o = ovr(id); return o !== undefined ? o : v; };
    const S = Object.assign({}, G.DS, a.settings || {}), F = Object.assign({}, G.DF, a.formulas || {});
    const mrecs = (a.recs || []).filter(r => r.date >= mi.start && r.date <= mi.end);
    const lastDate = mrecs.reduce((m, r) => (r.date > m ? r.date : m), '');
    const rep = (a.reportDate && a.reportDate >= mi.start && a.reportDate <= mi.end) ? a.reportDate : (lastDate || mi.end);
    const daysPassed = Math.min(mi.dim, gDays(mi.start, rep) + 1);
    const daysRemaining = gDays(rep, gShift(period, 1) + '-03');
    const upto = mrecs.filter(r => r.date <= rep), withRecv = mrecs.filter(r => gIsNum(r.recv_wt));
    const rrAll = gSum(mrecs, 'rr_wt'), rrWithRecv = gSum(withRecv, 'rr_wt'), recvTotal = gSum(withRecv, 'recv_wt');
    const rows = [];
    G.PARTIES.forEach(p => G.AREAS.forEach(ar => {
      const t = (a.targets || []).find(x => x.period === period && gUp(x.party) === p && gUp(x.area) === ar);
      const target = t ? gNum(t.qtr_target) : 0, loaded = upto.filter(r => gUp(r.dstn) === p && gUp(r.area) === ar).length, bal = target - loaded;
      rows.push({ party: p, area: ar, target: target, loaded: loaded, bal: bal, ask: daysRemaining ? bal / daysRemaining : 0 });
    }));
    const parties = {};
    G.PARTIES.forEach(p => {
      const rs = rows.filter(r => r.party === p), target = gSum(rs, 'target'), loaded = gSum(rs, 'loaded');
      const mat = target > 0 ? (loaded / target) * 100 : 0, penaltyPct = target > 0 ? gMatPct(mat, F) : 0;
      const quantity = gSum(mrecs.filter(r => gUp(r.dstn) === p), 'rr_wt'), rate = S.qtyRate * penaltyPct / 100;
      parties[p] = { target: target, loaded: loaded, mat: mat, qty: quantity, amount: quantity * rate };
    });
    const tgtAll = gSum(rows, 'target'), loadAll = gSum(rows, 'loaded');
    const shortPct = rrWithRecv ? (rrWithRecv - recvTotal) * 100 / rrWithRecv : 0, shortMt = withRecv.length ? (rrWithRecv - recvTotal) / withRecv.length : 0;
    const areas = {};
    G.AREAS.forEach(ar => {
      const rs = rows.filter(r => r.area === ar), aRecs = mrecs.filter(r => gUp(r.area) === ar);
      areas[ar] = { target: gSum(rs, 'target'), loaded: gSum(rs, 'loaded'), ask: gSum(rs, 'ask'), rr: gSum(aRecs, 'rr_wt'), gcv: gWAvg(aRecs, 'gcv_arb', 'rr_wt'), loadingGcv: gWAvg(aRecs, 'loading_gcv', 'rr_wt'), unloadGrade: gGradeText(gGradeNo(gWAvg(aRecs, 'gcv_arb', 'rr_wt'))), loadGrade: gGradeText(gGradeNo(gWAvg(aRecs, 'loading_gcv', 'rr_wt'))) };
    });
    const gcvReco = pick('b-gcv', gSum(mrecs, 'bonus_penalty_rs'));
    const gcvRR = mrecs.filter(r => gIsNum(r.rr_wt) && gIsNum(r.bonus_penalty_rs)).reduce((s, r) => s + Number(r.rr_wt), 0);
    const qtyReco = pick('b-qty', parties.GETS.amount + parties.TPHS.amount);
    const rrSecl = gSum(mrecs.filter(r => gUp(r.area) === 'SECL'), 'rr_wt'), rrWcl = gSum(mrecs.filter(r => gUp(r.area) === 'WCL'), 'rr_wt');
    const svcSecl = pick('b-svc-secl', rrSecl * S.svcSecl), svcWcl = pick('b-svc-wcl', rrWcl * S.svcWcl);
    const pen = { ul: pick('p-ul', gSum(mrecs, 'ul_ch')), ol: pick('p-ol', gSum(mrecs, 'ol_ch')), pun: pick('p-pun', gSum(mrecs, 'pol_group')), ehbc: pick('p-ehbc', gSum(mrecs, 'ehbc_group')), enhc: pick('p-enhc', gSum(mrecs, 'enhc_charge')), dead: pick('p-dead', gNum(S.deadFreight)) };
    const penSum = pen.ul + pen.ol + pen.pun + pen.ehbc + pen.enhc + pen.dead;
    const penFromB = ovr('b-pen') !== undefined ? -ovr('b-pen') : penSum;
    const penTotal = pick('p-total', penFromB);
    const grossBill = qtyReco + gcvReco + svcSecl + svcWcl, totalBill = pick('b-total', grossBill - penTotal);
    const expBill = pick('b-exp', daysPassed ? totalBill / daysPassed * mi.dim : 0);
    const perMt = { qty: recvTotal ? qtyReco / recvTotal : 0, gcv: gcvRR ? gcvReco / gcvRR : 0, svcSecl: rrSecl ? svcSecl / rrSecl : 0, svcWcl: rrWcl ? svcWcl / rrWcl : 0, pen: rrAll ? -penTotal / rrAll : 0 };
    perMt.total = perMt.qty + perMt.gcv + (perMt.svcSecl + perMt.svcWcl) / 2 + perMt.pen;
    const mines = G.MINES.map(code => {
      const ms = mrecs.filter(r => gUp(r.siding) === code), rr = gSum(ms, 'rr_wt'), gcv = gWAvg(ms, 'gcv_arb', 'rr_wt'), lg = gWAvg(ms, 'loading_gcv', 'rr_wt');
      const un = gGradeNo(gcv), ld = gGradeNo(lg);
      return { code: code, rr: rr, gcv: gcv, slip: (un != null && ld != null) ? un - ld : null, bonus: gSum(ms, 'bonus_penalty_rs') };
    });
    return { period: period, rep: rep, daysPassed: daysPassed, daysRemaining: daysRemaining, dim: mi.dim, nRecs: mrecs.length, rows: rows, areas: areas, parties: parties, tgtAll: tgtAll, loadAll: loadAll, matAll: tgtAll ? loadAll * 100 / tgtAll : 0, shortPct: shortPct, shortMt: shortMt, askTotal: gSum(rows, 'ask'), qtyReco: qtyReco, gcvReco: gcvReco, svcSecl: svcSecl, svcWcl: svcWcl, rrSecl: rrSecl, rrWcl: rrWcl, pen: pen, penTotal: penTotal, totalBill: totalBill, expBill: expBill, perMt: perMt, mines: mines, rrAll: rrAll, recvTotal: recvTotal, avgRr: gAvg(mrecs, 'rr_wt'), avgCh: gAvg(mrecs, 'ch_wt') };
  }

  async function gujaratMonths(periods) {
    const keys = ['global']; periods.forEach(p => { keys.push(p); keys.push('ovr-m:' + p); keys.push('ovr-q:' + gQStart(p)); });
    const uk = Array.from(new Set(keys)), last = periods[periods.length - 1];
    const [recs, tgts, vals] = await Promise.all([
      rest('pc', 'gujarat_rake_records', 'select=*&date=gte.' + periods[0] + '-01&date=lte.' + gMonthInfo(last).end + '&order=id'),
      rest('pc', 'gujarat_rake_targets', 'select=*&period=in.' + encodeURIComponent('(' + periods.join(',') + ')') + '&order=id'),
      rest('pc', 'gujarat_dashboard_values', 'select=period_key,field_key,field_value&period_key=in.' + encodeURIComponent('(' + uk.map(k => '"' + k + '"').join(',') + ')') + '&order=period_key')
    ]);
    recs.forEach(r => { r.date = String(r.date).slice(0, 10); });
    const SET = {}, OVR = {}; let formulas = null;
    vals.forEach(r => {
      if (r.period_key === 'global') { if (r.field_key === 'formulas') { try { formulas = JSON.parse(r.field_value); } catch (e) { } } }
      else if (/^ovr-[mq]:/.test(r.period_key)) { (OVR[r.period_key] = OVR[r.period_key] || {}); if (gIsNum(r.field_value)) OVR[r.period_key][r.field_key] = Number(r.field_value); }
      else { (SET[r.period_key] = SET[r.period_key] || {})[r.field_key] = r.field_value; }
    });
    let F = Object.assign({}, G.DF, formulas || {});
    F.matTiers = (F.matTiers || G.DF.matTiers).map(t => [Number(t[0]), Number(t[1])]); F.gcvSlip = (F.gcvSlip || G.DF.gcvSlip).map(Number);
    return periods.map(p => {
      const s = SET[p] || {}, n = (v, d) => (gIsNum(v) ? Number(v) : d);
      const settings = { svcSecl: n(s.svcSecl, 30), svcWcl: n(s.svcWcl, 30), qtyRate: n(s.qtyRate, 30), gcvBase: n(s.gcvBase, 30), deadFreight: n(s.deadFreight, 0) };
      const ovr = id => { const m = OVR['ovr-m:' + p]; if (m && m[id] !== undefined) return m[id]; const qq = OVR['ovr-q:' + gQStart(p)]; if (qq && qq[id] !== undefined) return qq[id]; return undefined; };
      return gCompute({ period: p, recs: recs, targets: tgts, settings: settings, formulas: F, reportDate: s.reportDate || '', ovr: ovr });
    });
  }

  async function runGujarat(q) {
    const R = perfRange(q), metric = perfMetric(q), L = q.toLowerCase();
    const periods = monthsIn(R.from, R.to).slice(-24);
    const ms = await gujaratMonths(periods);
    const wantQ = /quarter[\s-]*wise|quarterly|\bq[1-4]\b/.test(L) || R.kind === 'quarter';
    const wantDetail = /\b(detail|party|plant|area[\s-]*wise|gets|tphs)\b/.test(L) && periods.length === 1;
    let cols, rows, total, title, sumKeys, headline, notes = [];
    const msData = ms.filter(m => m.nRecs > 0 || m.tgtAll > 0), msUse = msData.length ? msData : ms;
    const flat = msUse.map(m => ({
      _p: m.period, label: monLabel(m.period), totalBill: m.totalBill, perMt: m.perMt.total, rr: m.rrAll, qty: m.qtyReco, gcv: m.gcvReco, svc: m.svcSecl + m.svcWcl, pen: -m.penTotal, exp: m.expBill,
      tgt: m.tgtAll, load: m.loadAll, bal: m.tgtAll - m.loadAll, mat: m.matAll, ask: m.askTotal, pdr: m.daysPassed ? m.loadAll / m.daysPassed : 0,
      ul: m.pen.ul, ol: m.pen.ol, pun: m.pen.pun, ehbc: m.pen.ehbc, enhc: m.pen.enhc, dead: m.pen.dead, penT: m.penTotal,
      recv: m.recvTotal, avgRr: m.avgRr, shortPct: m.shortPct, shortMt: m.shortMt,
      gSecl: m.areas.SECL.gcv, gWcl: m.areas.WCL.gcv, gMcl: m.areas.MCL.gcv, lSecl: m.areas.SECL.loadingGcv, lWcl: m.areas.WCL.loadingGcv, lMcl: m.areas.MCL.loadingGcv, _m: m
    }));
    const fixQ = o => { o.perMt = o.rr ? o.perMtW / o.rr : 0; o.mat = o.tgt ? o.load * 100 / o.tgt : 0; o.bal = o.tgt - o.load; o.shortPct = o.rrR ? (o.rrR - o.recv) * 100 / o.rrR : 0; };
    flat.forEach(r => { r.perMtW = r.perMt * r.rr; r.rrR = r.rr; });
    let use = flat;
    if (wantQ && flat.length > 1) {
      use = rollup(flat, r => qKey(r._p + '-01'), (k) => k, ['totalBill', 'perMtW', 'rr', 'rrR', 'qty', 'gcv', 'svc', 'pen', 'exp', 'tgt', 'load', 'ask', 'ul', 'ol', 'pun', 'ehbc', 'enhc', 'dead', 'penT', 'recv'], fixQ);
      use.forEach(o => { o.pdr = 0; o.shortMt = 0; o.avgRr = 0; });
      notes.push('Quarter figures are the sum of the monthly figures (quarters run Apr-Jun, Jul-Sep, Oct-Dec, Jan-Mar).');
    }
    const lab = wantQ && flat.length > 1 ? 'Quarter' : 'Month';
    if (wantDetail) {
      const m = msUse[0];
      cols = [{ key: 'label', label: 'Party / area', align: 'l' }, mkCol('target', 'Target', 'int'), mkCol('loaded', 'Loaded', 'int'), mkCol('bal', 'Balance', 'int'), mkCol('ask', 'Asking/day', 'd2')];
      rows = m.rows.map(r => ({ label: r.party + ' \u00b7 ' + r.area, target: r.target, loaded: r.loaded, bal: r.bal, ask: r.ask }));
      total = totalOf(rows, ['target', 'loaded', 'bal', 'ask']);
      title = 'Gujarat rakes by party and area'; sumKeys = 'loaded';
      headline = 'Gujarat ' + monLabel(m.period) + ': ' + fmt(m.loadAll) + ' of ' + fmt(m.tgtAll) + ' rakes loaded (' + d1(m.matAll) + '% materialisation) up to ' + dmy(m.rep) + '.';
      return finish('gujarat', 'rakes', title, monLabel(m.period), headline, notes, cols, rows, total, 'loaded', R, q, L);
    }
    if (metric === 'billing') {
      cols = [{ key: 'label', label: lab, align: 'l' }, mkCol('totalBill', 'Total billing', 'inr'), mkCol('perMt', 'Per MT', 'd2'), mkCol('qty', 'Qty reco', 'inr'), mkCol('gcv', 'GCV reco', 'inr'), mkCol('svc', 'Service charge', 'inr'), mkCol('pen', 'Rly penalty', 'inr')];
      sumKeys = ['totalBill', 'qty', 'gcv', 'svc', 'pen']; title = 'Gujarat total billing';
    } else if (metric === 'rakes') {
      cols = [{ key: 'label', label: lab, align: 'l' }, mkCol('tgt', 'Target', 'int'), mkCol('load', 'Loaded', 'int'), mkCol('bal', 'Balance', 'int'), mkCol('mat', 'Mat. %', 'pct'), mkCol('ask', 'Asking/day', 'd2')];
      sumKeys = ['tgt', 'load', 'bal']; title = 'Gujarat rakes: target vs loaded';
    } else if (metric === 'penalty') {
      cols = [{ key: 'label', label: lab, align: 'l' }, mkCol('ul', 'Underload', 'inr'), mkCol('ol', 'Overload', 'inr'), mkCol('pun', 'Punitive', 'inr'), mkCol('ehbc', 'EHBC', 'inr'), mkCol('enhc', 'ENHC', 'inr'), mkCol('dead', 'Dead freight', 'inr'), mkCol('penT', 'Total', 'inr')];
      sumKeys = ['ul', 'ol', 'pun', 'ehbc', 'enhc', 'dead', 'penT']; title = 'Gujarat railway penalties';
    } else if (metric === 'weights') {
      cols = [{ key: 'label', label: lab, align: 'l' }, mkCol('rr', 'RR weight', 'int'), mkCol('recv', 'Plant receive', 'int'), mkCol('shortPct', 'Short/excess %', 'd2'), mkCol('shortMt', 'MT per rake', 'd1'), mkCol('avgRr', 'Avg RR/rake', 'int')];
      sumKeys = ['rr', 'recv']; title = 'Gujarat weights and shortage';
    } else {
      cols = [{ key: 'label', label: lab, align: 'l' }, mkCol('gSecl', 'SECL GCV', 'int'), mkCol('gWcl', 'WCL GCV', 'int'), mkCol('gMcl', 'MCL GCV', 'int'), mkCol('lSecl', 'SECL loading GCV', 'int'), mkCol('lWcl', 'WCL loading GCV', 'int')];
      sumKeys = []; title = 'Gujarat GCV (RR-weighted)';
    }
    rows = use;
    total = sumKeys.length && rows.length > 1 ? totalOf(rows, sumKeys, t => { t.perMt = sumBy(rows, r => r.perMtW != null ? r.perMtW : r.perMt * r.rr) / (sumBy(rows, r => r.rr) || 1); t.mat = t.tgt ? t.load * 100 / t.tgt : 0; t.bal = t.tgt - t.load; t.shortPct = 0; }) : null;
    if (total && metric === 'weights') { total.shortPct = NaN; }
    const main = { billing: 'totalBill', rakes: 'load', penalty: 'penT', weights: 'rr', gcv: 'gSecl' }[metric];
    const T = total || rows[0] || {};
    const subj = { billing: 'Total billing', rakes: 'Rakes loaded', penalty: 'Total penalty', weights: 'RR weight', gcv: 'SECL GCV' }[metric];
    const val = metric === 'billing' ? inr(T.totalBill) : metric === 'rakes' ? fmt(T.load) + ' of ' + fmt(T.tgt) : metric === 'penalty' ? inr(T.penT) : metric === 'weights' ? fmt(T.rr) + ' MT' : fmt(T.gSecl);
    headline = rows.length ? 'Gujarat ' + subj.toLowerCase() + ' for ' + R.label + ': ' + val + (rows.length > 1 && total ? ' (sum of ' + rows.length + (lab === 'Month' ? ' months' : ' quarters') + ')' : '') + '.' : 'No Gujarat data found for ' + R.label + '.';
    if (!R.given) notes.push('No dates given, so I used ' + R.label + '. Add a month or dates to change this.');
    notes.push('Uses the same formulas and manual overrides as the Gujarat dashboard.');
    if (metric === 'billing' && flat.length) { const cur = flat[flat.length - 1]; if (cur._m.daysPassed < cur._m.dim && cur._p === iso(today()).slice(0, 7)) notes.push('Expected billing for ' + cur.label + ' (full month): ' + inr(cur.exp) + '.'); }
    return finish('gujarat', metric, title, R.label + ' \u00b7 by ' + lab.toLowerCase(), headline, notes, cols, rows, total, main, R, q, L, flat);
  }
  function finish(party, metric, title, subtitle, headline, notes, cols, rows, total, main, R, q, L, flat) {
    const chips = [];
    if (flat && flat.length > 1) { const last = flat[flat.length - 1]; chips.push(['Detail for ' + last.label, metric + ' ' + party + ' ' + last.label + (metric === 'billing' ? '' : '')].slice(0, 2)); }
    if (party === 'gujarat' && rows.length === 1 && metric !== 'rakes') chips.push(['Party and area detail', 'rakes target loaded gujarat by party ' + R.label]);
    if (!/quarter/.test(L) && rows.length > 1) chips.push(['Quarter-wise', (metric === 'billing' ? 'total billing ' : metric + ' ') + party + ' quarter wise ' + R.label]);
    return { kind: 'table', title: title, subtitle: subtitle, headline: headline, notes: notes, cols: cols, rows: rows, total: total, main: main, ctx: {}, group: 'month', decimals: 0, chips: viewChips(party, metric, chips).slice(0, 6) };
  }

  MODULES.push({
    id: 'gujarat',
    score(q) { let s = 0; if (PARTY_RE.gujarat.test(q) && !/\b(loading status|odr)\b/i.test(q)) s += 5; if (PERF_RE.test(q)) s += 3; if (!PARTY_RE.gujarat.test(q)) s = 0; return s; },
    run: runGujarat
  });

  /* ================= HZL (project pc) ================= */
  const HZ = { DF: { bands: [[0.05, 5], [0.3, 0], [0.5, -1], [1, -2], [1.5, -3]], aboveRate: -4, qtyPerRake: 3900, penaltyPct: 5 }, FIS: { 1: 4, 2: 7, 3: 10, 4: 1 } };
  const hKey = (fy, q) => fy + '-Q' + q;
  function hRange(key) {
    const fy = +key.slice(0, 4), q = +key.slice(-1), sy = q === 4 ? fy + 1 : fy, sm = HZ.FIS[q], em = sm + 3, ey = sy + (em > 12 ? 1 : 0), emm = em > 12 ? em - 12 : em;
    return { from: sy + '-' + p2(sm) + '-01', to: ey + '-' + p2(emm) + '-01' };
  }
  const hQuarterOf = ym => { const y = +ym.slice(0, 4), m = +ym.slice(5, 7), fy = m >= 4 ? y : y - 1, q = m >= 4 && m <= 6 ? 1 : m >= 7 && m <= 9 ? 2 : m >= 10 ? 3 : 4; return hKey(fy, q); };
  const hLabel = key => { const fy = +key.slice(0, 4), q = +key.slice(-1); return 'Q' + q + ' FY ' + fyName(fy); };
  const hPar = v => Number(String(v == null ? '' : v).replace(/[^0-9.\-]/g, '')) || 0;

  async function hzlQuarter(key, F) {
    const rg = hRange(key), DAY = 86400000, qs = new Date(rg.from + 'T00:00:00'), qe = new Date(rg.to + 'T00:00:00');
    const totalDays = Math.round((qe - qs) / DAY), t0 = today(); t0.setHours(0, 0, 0, 0);
    const daysPassed = Math.min(totalDays, Math.max(0, Math.floor((t0 - qs) / DAY) + 1));
    const [vals, recs, tgts] = await Promise.all([
      rest('pc', 'hzl_dashboard_values', 'select=field_key,field_value&period_key=eq.' + key),
      rest('pc', 'hzl_rake_records', 'select=*&date=gte.' + rg.from + '&date=lt.' + rg.to + '&order=id'),
      rest('pc', 'hzl_rake_targets', 'select=*&quarter=eq.Q' + key.slice(-1) + '&month=gte.' + rg.from.slice(0, 7) + '&month=lt.' + rg.to.slice(0, 7))
    ]);
    const saved = {}; vals.forEach(r => { saved[r.field_key] = r.field_value; });
    const SR = hPar(saved.svcRate);
    recs.forEach(r => { r.date = String(r.date).slice(0, 10); });
    const o = { key: key, recs: recs, tgts: tgts, from: rg.from, to: rg.to, daysPassed: daysPassed, totalDays: totalDays };
    const rrTotal = sumBy(recs, r => r.rr_wt), recvTotal = sumBy(recs, r => r.recv_wt);
    o.rakes = recs.length; o.rrTotal = rrTotal; o.recvTotal = recvTotal;
    o.normQty = rrTotal ? (recvTotal - rrTotal) / rrTotal * 100 : 0;
    const shortRate = (() => { for (const b of F.bands) if (o.normQty <= b[0]) return b[1]; return F.aboveRate; })();
    o.billQty = shortRate * recvTotal; o.billGcv = sumBy(recs, r => r.bonus_penalty);
    const reportDates = tgts.map(t => t.report_date).filter(Boolean).sort(), cutoff = reportDates.length ? reportDates[reportDates.length - 1] : rg.to;
    let svc = 0, tgtT = 0, loadT = 0;
    const per = {};
    [['Secl', 'SECL'], ['Ccl', 'CCL'], ['Mcl', 'MCL']].forEach(a => {
      const aT = tgts.filter(t => t.box_type === a[1]), aR = recs.filter(r => r.area === a[1]);
      const target = sumBy(aT, t => t.qtr_target), loaded = aR.filter(r => r.date <= cutoff).length;
      per[a[1]] = { target: target, loaded: loaded, ask: sumBy(aT, t => t.asking_per_day) };
      tgtT += target; loadT += loaded; svc += sumBy(aR, r => r.recv_wt) * SR;
    });
    o.per = per; o.tgt = tgtT; o.load = loadT; o.svc = svc;
    const ol = sumBy(recs, r => r.ol_ch), pun = sumBy(recs, r => r.pol_group), eh = sumBy(recs, r => r.ehbc_group), en = sumBy(recs, r => r.enhc_charge);
    o.ul = sumBy(recs, r => r.ul_ch); o.ol = ol; o.pun = pun; o.ehbc = eh; o.enhc = en; o.dead = sumBy(recs, r => r.dead_fr_chg);
    o.totalPen = ol + pun + eh + en; o.pen5 = -(o.totalPen * F.penaltyPct / 100);
    o.totalBill = o.billQty + o.billGcv + svc + o.pen5; o.perMt = rrTotal ? o.totalBill / rrTotal : 0;
    o.expBill = daysPassed ? (o.totalBill / daysPassed) * totalDays : 0;
    o.gcvArb = rrTotal ? sumProdBy(recs, 'rr_wt', 'gcv_arb') / rrTotal : 0; o.gcvAdb = rrTotal ? sumProdBy(recs, 'rr_wt', 'gcv_adb') / rrTotal : 0;
    return o;
  }
  async function hzlFormulas() {
    const F = JSON.parse(JSON.stringify(HZ.DF));
    try {
      const rows = await rest('pc', 'hzl_dashboard_values', 'select=field_key,field_value&period_key=eq.global');
      rows.forEach(r => {
        const v = r.field_value;
        if (r.field_key === 'f_bands') { try { const b = JSON.parse(v); if (Array.isArray(b) && b.length) F.bands = b.map(x => [Number(x[0]), Number(x[1])]); } catch (e) { } }
        if (r.field_key === 'f_above_rate') F.aboveRate = Number(v); if (r.field_key === 'f_qty_per_rake') F.qtyPerRake = Number(v); if (r.field_key === 'f_pen_pct') F.penaltyPct = Number(v);
      });
    } catch (e) { }
    return F;
  }
  async function runHzl(q) {
    const R = perfRange(q), metric = perfMetric(q), L = q.toLowerCase();
    const keys = Array.from(new Set(monthsIn(R.from, R.to).map(hQuarterOf)));
    const wantMonthly = /month[\s-]*wise|monthly|each month|by month/.test(L) && metric !== 'billing';
    const notes = [];
    if (wantMonthly || (metric !== 'billing' && !/quarter/.test(L) && keys.length === 1 && R.kind !== 'quarter' && R.kind !== 'fy')) {
      const F = await hzlFormulas();
      const qs = await Promise.all(keys.map(k => hzlQuarter(k, F)));
      const recs = [].concat.apply([], qs.map(x => x.recs)).filter(r => r.date >= R.from && r.date <= R.to);
      const byM = rollup(recs.map(r => ({ _p: r.date.slice(0, 7), rakes: 1, rr: nnum(r.rr_wt), recv: nnum(r.recv_wt), bonus: nnum(r.bonus_penalty), ul: nnum(r.ul_ch), ol: nnum(r.ol_ch), pun: nnum(r.pol_group), ehbc: nnum(r.ehbc_group), enhc: nnum(r.enhc_charge), gw: nnum(r.rr_wt) * nnum(r.gcv_arb) })), r => r._p, k => monLabel(k + '-01'), ['rakes', 'rr', 'recv', 'bonus', 'ul', 'ol', 'pun', 'ehbc', 'enhc', 'gw'], o => { o.shortPct = o.rr ? (o.rr - o.recv) * 100 / o.rr : 0; o.gcv = o.rr ? o.gw / o.rr : 0; o.penT = o.ol + o.pun + o.ehbc + o.enhc; });
      byM.sort((a, b) => (a._k < b._k ? -1 : 1));
      let cols, keysSum;
      if (metric === 'penalty') { cols = [{ key: 'label', label: 'Month', align: 'l' }, mkCol('ul', 'Underload', 'inr'), mkCol('ol', 'Overload', 'inr'), mkCol('pun', 'Punitive', 'inr'), mkCol('ehbc', 'EHBC', 'inr'), mkCol('enhc', 'ENHC', 'inr'), mkCol('penT', 'Total', 'inr')]; keysSum = ['ul', 'ol', 'pun', 'ehbc', 'enhc', 'penT']; }
      else if (metric === 'gcv') { cols = [{ key: 'label', label: 'Month', align: 'l' }, mkCol('gcv', 'RR-wt GCV', 'int'), mkCol('bonus', 'GCV bonus/penalty', 'inr')]; keysSum = ['bonus']; }
      else { cols = [{ key: 'label', label: 'Month', align: 'l' }, mkCol('rakes', 'Rakes', 'int'), mkCol('rr', 'RR weight', 'int'), mkCol('recv', 'Plant receive', 'int'), mkCol('shortPct', 'Short/excess %', 'd2')]; keysSum = ['rakes', 'rr', 'recv']; }
      const total = byM.length > 1 ? totalOf(byM, keysSum.concat(['rr', 'recv', 'rakes']), t => { t.shortPct = t.rr ? (t.rr - t.recv) * 100 / t.rr : 0; }) : null;
      const T = total || byM[0] || {};
      const hl = !byM.length ? 'No HZL records found for ' + R.label + '.' : 'HZL ' + (metric === 'penalty' ? 'penalties' : metric === 'gcv' ? 'GCV' : 'rakes and weights') + ' for ' + R.label + ': ' + (metric === 'penalty' ? inr(T.penT) : metric === 'gcv' ? 'GCV bonus/penalty ' + inr(T.bonus) : fmt(T.rakes) + ' rakes, RR weight ' + fmt(T.rr) + ' MT') + '.';
      if (!R.given) notes.push('No dates given, so I used ' + R.label + '.');
      notes.push('HZL billing is worked out per quarter on your dashboard, so month-wise billing is not shown.');
      return { kind: 'table', title: 'HZL monthly records', subtitle: R.label, headline: hl, notes: notes, cols: cols, rows: byM, total: total, main: keysSum[0], ctx: {}, group: 'month', decimals: 0, chips: viewChips('hzl', metric, [['Quarter billing', 'total billing hzl ' + R.label]]) };
    }
    const F = await hzlFormulas();
    const qs = await Promise.all(keys.slice(-8).map(k => hzlQuarter(k, F)));
    qs.sort((a, b) => (a.key < b.key ? -1 : 1));
    const rows = qs.map(o => ({ label: hLabel(o.key), _k: o.key, totalBill: o.totalBill, perMt: o.perMt, qty: o.billQty, gcv: o.billGcv, svc: o.svc, pen: o.pen5, exp: o.expBill, tgt: o.tgt, load: o.load, bal: o.tgt - o.load, rakes: o.rakes, rr: o.rrTotal, recv: o.recvTotal, shortPct: -o.normQty, ul: o.ul, ol: o.ol, pun: o.pun, ehbc: o.ehbc, enhc: o.enhc, penT: o.totalPen, gcvA: o.gcvArb, gcvD: o.gcvAdb }));
    let cols, sk, title, main;
    if (metric === 'rakes') { cols = [{ key: 'label', label: 'Quarter', align: 'l' }, mkCol('tgt', 'Target', 'int'), mkCol('load', 'Loaded', 'int'), mkCol('bal', 'Balance', 'int'), mkCol('rakes', 'Rakes recorded', 'int')]; sk = ['tgt', 'load', 'bal', 'rakes']; title = 'HZL rakes: target vs loaded'; main = 'load'; }
    else if (metric === 'penalty') { cols = [{ key: 'label', label: 'Quarter', align: 'l' }, mkCol('ul', 'Underload', 'inr'), mkCol('ol', 'Overload', 'inr'), mkCol('pun', 'Punitive', 'inr'), mkCol('ehbc', 'EHBC', 'inr'), mkCol('enhc', 'ENHC', 'inr'), mkCol('penT', 'Total', 'inr')]; sk = ['ul', 'ol', 'pun', 'ehbc', 'enhc', 'penT']; title = 'HZL railway penalties'; main = 'penT'; }
    else if (metric === 'weights') { cols = [{ key: 'label', label: 'Quarter', align: 'l' }, mkCol('rakes', 'Rakes', 'int'), mkCol('rr', 'RR weight', 'int'), mkCol('recv', 'Plant receive', 'int'), mkCol('shortPct', 'Short/excess %', 'd2')]; sk = ['rakes', 'rr', 'recv']; title = 'HZL weights and shortage'; main = 'rr'; }
    else if (metric === 'gcv') { cols = [{ key: 'label', label: 'Quarter', align: 'l' }, mkCol('gcvA', 'GCV (ARB)', 'int'), mkCol('gcvD', 'GCV (ADB)', 'int'), mkCol('gcv', 'GCV bonus/penalty', 'inr')]; sk = ['gcv']; title = 'HZL GCV'; main = 'gcvA'; }
    else { cols = [{ key: 'label', label: 'Quarter', align: 'l' }, mkCol('totalBill', 'Total billing', 'inr'), mkCol('perMt', 'Per MT', 'd2'), mkCol('qty', 'Qty reco', 'inr'), mkCol('gcv', 'GCV reco', 'inr'), mkCol('svc', 'Service', 'inr'), mkCol('pen', 'Penalty (5%)', 'inr')]; sk = ['totalBill', 'qty', 'gcv', 'svc', 'pen']; title = 'HZL total billing'; main = 'totalBill'; }
    const total = rows.length > 1 && sk.length ? totalOf(rows, sk) : null;
    const T = total || rows[0] || {};
    const hl = !rows.length ? 'No HZL data for ' + R.label + '.' : 'HZL ' + (metric === 'billing' ? 'total billing' : metric === 'rakes' ? 'rakes loaded' : metric === 'penalty' ? 'total penalty' : metric === 'weights' ? 'RR weight' : 'GCV (ARB)') + ' for ' + R.label + ': ' + (metric === 'billing' ? inr(T.totalBill) : metric === 'rakes' ? fmt(T.load) + ' of ' + fmt(T.tgt) : metric === 'penalty' ? inr(T.penT) : metric === 'weights' ? fmt(T.rr) + ' MT' : fmt(T.gcvA)) + (rows.length > 1 && total ? ' (sum of ' + rows.length + ' quarters)' : '') + '.';
    if (!R.given) notes.push('No dates given, so I used ' + R.label + '. Add a quarter or month to change this.');
    notes.push('HZL is calculated quarter by quarter, exactly as on your HZL dashboard.');
    if (metric === 'billing' && rows.length) { const last = qs[qs.length - 1]; if (last.daysPassed < last.totalDays) notes.push('Expected billing for ' + hLabel(last.key) + ' (full quarter): ' + inr(last.expBill) + '.'); }
    return { kind: 'table', title: title, subtitle: R.label + ' \u00b7 by quarter', headline: hl, notes: notes, cols: cols, rows: rows, total: total, main: main, ctx: {}, group: 'quarter', decimals: 0, chips: viewChips('hzl', metric, [['Month-wise records', 'rakes and weights hzl month wise ' + R.label]]) };
  }
  MODULES.push({
    id: 'hzl',
    score(q) { let s = 0; if (PARTY_RE.hzl.test(q)) s += 4; if (PERF_RE.test(q)) s += 3; if (/\b(odr|indent|pending|loading status|asking|balance rakes|loaded rakes)\b/i.test(q)) s -= 6; if (!PARTY_RE.hzl.test(q)) s = 0; return s; },
    run: runHzl
  });

  /* ================= PJPB / Jhabua (project pc) ================= */
  const PJ = { RECO: 4.73, GCV: 4.73, CF: 233 };
  const pjQuarterOf = ym => { const y = +ym.slice(0, 4), m = +ym.slice(5, 7); if (m >= 8 && m <= 10) return y + '-Q1'; if (m === 11 || m === 12) return y + '-Q2'; if (m === 1) return (y - 1) + '-Q2'; if (m >= 2 && m <= 4) return (y - 1) + '-Q3'; return (y - 1) + '-Q4'; };
  const pjName = key => { const y = +key.slice(0, 4), q = +key.slice(-1); return ['', 'Aug-Oct ' + y, 'Nov ' + y + '-Jan ' + (y + 1), 'Feb-Apr ' + (y + 1), 'May-Jul ' + (y + 1)][q]; };
  function pjRange(key) {
    const y = +key.slice(0, 4), q = +key.slice(-1); let sy, sm, ey, em;
    if (q === 1) { sy = y; sm = 8; ey = y; em = 10; } else if (q === 2) { sy = y; sm = 11; ey = y + 1; em = 1; } else if (q === 3) { sy = y + 1; sm = 2; ey = y + 1; em = 4; } else { sy = y + 1; sm = 5; ey = y + 1; em = 7; }
    const to = new Date(Date.UTC(ey, em, 4)); return { from: sy + '-' + p2(sm) + '-04', to: to.getUTCFullYear() + '-' + p2(to.getUTCMonth() + 1) + '-' + p2(to.getUTCDate()) };
  }
  const pjU = s => { const a = s.split('-').map(Number); return Date.UTC(a[0], a[1] - 1, a[2]); };
  const pjReco = h => (h < 60 ? 0.25 : h < 70 ? 0.5 : h < 80 ? 0.7 : h < 90 ? 0.8 : h < 100 ? 0.9 : 1) * PJ.RECO;
  function pjGcvPerMt(lg, ga) { if (lg == null || ga == null || lg === '' || ga === '') return null; const band = Math.max(0, (Number(lg) - Number(ga) - 200) / 100) * 0.2 * PJ.GCV; return -Math.min(band, 0.75 * PJ.GCV); }
  let PJ_AREAS = null, PJ_F = null;
  async function pjSetup() {
    if (PJ_F) return;
    PJ_F = { scSecl: 0, scMcl: 0, scCcl: 0, scNcl: 0 }; PJ_AREAS = ['SECL', 'IB', 'CKP', 'CCL', 'NCL'];
    try { const a = await rest('pc', 'pjpb_areas', 'select=code,sort_order&active=eq.true&order=sort_order'); if (a.length) PJ_AREAS = a.map(r => r.code); } catch (e) { }
    try {
      const s = await rest('pc', 'pjpb_settings', 'select=setting_key,setting_value');
      s.forEach(r => { const v = +r.setting_value; if (isNaN(v)) return; if (r.setting_key === 'sc_rate_secl') PJ_F.scSecl = v; if (r.setting_key === 'sc_rate_mcl') PJ_F.scMcl = v; if (r.setting_key === 'sc_rate_ccl') PJ_F.scCcl = v; if (r.setting_key === 'sc_rate_ncl') PJ_F.scNcl = v; });
      PJ_F._raw = s;
    } catch (e) { PJ_F._raw = []; }
  }
  async function pjQuarter(key) {
    await pjSetup();
    const rg = pjRange(key), DAY = 86400000, totalDays = Math.round((pjU(rg.to) - pjU(rg.from)) / DAY), endIncl = iso(new Date(pjU(rg.to) - DAY + new Date().getTimezoneOffset() * 0)).slice(0, 10);
    const e2 = new Date(pjU(rg.to) - DAY), endI = e2.getUTCFullYear() + '-' + p2(e2.getUTCMonth() + 1) + '-' + p2(e2.getUTCDate());
    const td = iso(today()), daysPassed = Math.min(totalDays, Math.max(0, Math.round((pjU(td) - pjU(rg.from)) / DAY) + 1));
    const [recs, tgts, per] = await Promise.all([
      rest('pc', 'pjpb_rake_records', 'select=*&loading_date=gte.' + rg.from + '&loading_date=lt.' + rg.to + '&order=loading_date,id'),
      rest('pc', 'pjpb_rake_targets', 'select=*&period_key=eq.' + key),
      rest('pc', 'pjpb_periods', 'select=*&period_key=eq.' + key)
    ]);
    recs.forEach(r => { r.loading_date = String(r.loading_date).slice(0, 10); });
    const cfRow = (PJ_F._raw || []).find(r => r.setting_key === 'carry_fwd_rake_' + key), cfv = cfRow && cfRow.setting_value !== '' ? +cfRow.setting_value : NaN, cf = isNaN(cfv) ? PJ.CF : cfv;
    let cut = (per[0] && per[0].report_date) || td; if (cut > endI) cut = endI;
    const rem = Math.max(0, Math.round((pjU(endI) - pjU(cut)) / DAY));
    const o = { key: key, n: recs.length, daysPassed: daysPassed, totalDays: totalDays, recs: recs };
    let tT = 0, tL = 0, tA = 0; o.areas = {};
    PJ_AREAS.forEach(a => { const t = sumBy(tgts.filter(x => x.area === a), x => x.qtr_target), l = recs.filter(r => r.area === a && r.loading_date <= cut).length, b = t - l, ask = rem > 0 ? Math.round(b / rem * 100) / 100 : 0; o.areas[a] = { t: t, l: l, ask: ask }; tT += t; tL += l; tA += ask; });
    o.tgt = tT; o.load = tL; o.ask = tA;
    const rr = sumBy(recs, r => r.rr_weight), rec = sumBy(recs, r => r.received_wt);
    o.rr = rr; o.recv = rec;
    const hVal = cf > 0 ? recs.length * 100 / cf : 0; o.qty = cf > 0 ? pjReco(hVal) * rr : 0;
    let gcvReco = 0; recs.forEach(r => { const pm = pjGcvPerMt(r.loading_gcv, r.gcv_arb); if (pm != null && r.rr_weight != null) gcvReco += pm * Number(r.rr_weight); });
    o.gcv = Math.round(gcvReco * 100) / 100;
    const rrOf = f => sumBy(recs.filter(f), r => r.rr_weight);
    o.svc = rrOf(r => r.area === 'SECL') * PJ_F.scSecl + rrOf(r => r.area === 'IB' || r.area === 'CKP') * PJ_F.scMcl + rrOf(r => r.area === 'CCL') * PJ_F.scCcl + rrOf(r => r.area === 'NCL') * PJ_F.scNcl;
    o.ul = sumBy(recs, r => r.underload_charges); o.pun = sumBy(recs, r => r.pol_group); o.ehbc = sumBy(recs, r => r.ehbc_group); o.enhc = sumBy(recs, r => r.enhc);
    o.penT = o.ul + o.pun + o.ehbc + o.enhc; o.pen = -Math.abs(o.penT);
    o.totalBill = o.qty + o.gcv + o.svc + o.pen; o.perMt = rr ? o.totalBill / rr : 0; o.exp = daysPassed ? o.totalBill / daysPassed * totalDays : 0;
    o.cut = cut;
    return o;
  }
  async function runPjpb(q) {
    const R = perfRange(q), metric = perfMetric(q);
    const keys = Array.from(new Set(monthsIn(R.from, R.to).map(pjQuarterOf)));
    const qs = await Promise.all(keys.slice(-6).map(pjQuarter)); qs.sort((a, b) => (a.key < b.key ? -1 : 1));
    const qsUse = qs.filter(o => o.n > 0 || o.tgt > 0), qsRows = qsUse.length ? qsUse : qs;
    const rows = qsRows.map(o => ({ label: pjName(o.key), totalBill: o.totalBill, perMt: o.perMt, qty: o.qty, gcv: o.gcv, svc: o.svc, pen: o.pen, tgt: o.tgt, load: o.load, bal: o.tgt - o.load, ask: o.ask, rr: o.rr, recv: o.recv, rakes: o.n, ul: o.ul, pun: o.pun, ehbc: o.ehbc, enhc: o.enhc, penT: o.penT }));
    let cols, sk, title, main;
    if (metric === 'rakes') { cols = [{ key: 'label', label: 'Quarter', align: 'l' }, mkCol('tgt', 'Target', 'int'), mkCol('load', 'Loaded', 'int'), mkCol('bal', 'Balance', 'int'), mkCol('ask', 'Asking/day', 'd2')]; sk = ['tgt', 'load', 'bal', 'ask']; title = 'Jhabua (PJPB) rakes'; main = 'load'; }
    else if (metric === 'penalty') { cols = [{ key: 'label', label: 'Quarter', align: 'l' }, mkCol('ul', 'Underload', 'inr'), mkCol('pun', 'Punitive', 'inr'), mkCol('ehbc', 'EHBC', 'inr'), mkCol('enhc', 'ENHC', 'inr'), mkCol('penT', 'Total', 'inr')]; sk = ['ul', 'pun', 'ehbc', 'enhc', 'penT']; title = 'Jhabua (PJPB) penalties'; main = 'penT'; }
    else if (metric === 'weights' || metric === 'gcv') { cols = [{ key: 'label', label: 'Quarter', align: 'l' }, mkCol('rakes', 'Rakes', 'int'), mkCol('rr', 'RR weight', 'int'), mkCol('recv', 'Received', 'int')]; sk = ['rakes', 'rr', 'recv']; title = 'Jhabua (PJPB) weights'; main = 'rr'; }
    else { cols = [{ key: 'label', label: 'Quarter', align: 'l' }, mkCol('totalBill', 'Total billing', 'inr'), mkCol('perMt', 'Per MT', 'd2'), mkCol('qty', 'Qty reco', 'inr'), mkCol('gcv', 'GCV reco', 'inr'), mkCol('svc', 'Service', 'inr'), mkCol('pen', 'Rly penalty', 'inr')]; sk = ['totalBill', 'qty', 'gcv', 'svc', 'pen']; title = 'Jhabua (PJPB) total billing'; main = 'totalBill'; }
    const total = rows.length > 1 ? totalOf(rows, sk) : null, T = total || rows[0] || {};
    const val = metric === 'rakes' ? fmt(T.load) + ' of ' + fmt(T.tgt) + ' rakes' : metric === 'penalty' ? inr(T.penT) : (metric === 'weights' || metric === 'gcv') ? fmt(T.rr) + ' MT' : inr(T.totalBill);
    const notes = [];
    if (!R.given) notes.push('No dates given, so I used ' + R.label + '.');
    notes.push('PJPB quarters run Aug-Oct, Nov-Jan, Feb-Apr and May-Jul, starting on the 4th, as on your PJPB dashboard.');
    return { kind: 'table', title: title, subtitle: R.label + ' \u00b7 by quarter', headline: rows.length ? 'Jhabua (PJPB) ' + (metric === 'rakes' ? 'rakes loaded' : metric === 'penalty' ? 'total penalty' : metric === 'billing' ? 'total billing' : 'RR weight') + ' for ' + R.label + ': ' + val + '.' : 'No PJPB data for ' + R.label + '.', notes: notes, cols: cols, rows: rows, total: total, main: main, ctx: {}, group: 'quarter', decimals: 0, chips: viewChips('pjpb', metric, []) };
  }
  MODULES.push({
    id: 'pjpb',
    score(q) { let s = 0; if (PARTY_RE.pjpb.test(q)) s += 4; if (PERF_RE.test(q) || /\b(rakes?|target|loaded)\b/i.test(q)) s += 3; if (/\b(loading status|odr|indent|asking|balance rakes|loaded rakes|image)\b/i.test(q)) s -= 6; if (!PARTY_RE.pjpb.test(q)) s = 0; return s; },
    run: runPjpb
  });

  /* billing question without a party: ask which one */
  MODULES.push({
    id: 'perf-pick',
    score(q) { return (/\b(bill(ing)?|reco|penalt(y|ies)|performance|materiali[sz]ation|shortage)\b/i.test(q) && !PARTY_RE.gujarat.test(q) && !PARTY_RE.hzl.test(q) && !PARTY_RE.pjpb.test(q) && !/\b(ksk|jsw|mahanadi)\b/i.test(q)) ? 4 : 0; },
    async run(q) {
      const L = q.toLowerCase(), m = perfMetric(q), prefix = m === 'billing' ? 'total billing ' : m === 'penalty' ? 'penalty ' : m === 'rakes' ? 'rakes target loaded ' : m === 'weights' ? 'weights shortage ' : 'gcv ';
      const rg = parseDates(q, today());
      const tail = rg ? ' ' + rg.label : '';
      return { kind: 'text', headline: 'Which party do you mean?', notes: ['Billing and performance are kept separately for each party.'], chips: [['Gujarat', prefix + 'gujarat' + tail], ['HZL', prefix + 'hzl' + tail], ['PJPB (Jhabua)', prefix + 'pjpb' + tail]], ctx: {} };
    }
  });
  /* ================= ODR: pending rakes / indents (project jz) ================= */
  const ODRS = {
    hzl: { name: 'HZL', table: 'HZL_ODR', filters: 'hzl_filters', dest: 'HZL' },
    nlod: { name: 'NALCO (NLOD)', table: 'NALCO_ODR', filters: 'nalco_filters', dest: 'NLOD' }
  };
  const ODR_CACHE = {};
  async function odrLoad(k) {
    const o = ODRS[k];
    if (ODR_CACHE[k] && Date.now() - ODR_CACHE[k].at < 60000) return ODR_CACHE[k];
    const [rows, fl] = await Promise.all([rest('jz', o.table, 'select=*&order=id'), rest('jz', o.filters, 'select=*&order=id').catch(() => [])]);
    const fmap = new Map(), dvs = new Map(); fl.forEach(f => { fmap.set(f.area + '|' + f.filter_type + '|' + f.value, f); if (String(f.filter_type).indexOf('dvs|') === 0) dvs.set(f.area + '|' + String(f.filter_type).slice(4), f.value); });
    return (ODR_CACHE[k] = { rows: rows, fmap: fmap, dvs: dvs, at: Date.now() });
  }
  async function runOdr(q) {
    const L = q.toLowerCase(), k = /\b(nalco|nlod)\b/.test(L) ? 'nlod' : 'hzl', o = ODRS[k], d = await odrLoad(k);
    const on = (a, t, v) => (d.fmap.get(a + '|' + t + '|' + v) || {}).accepted !== false;
    const areasAll = Array.from(new Set(d.rows.map(r => r.area).filter(Boolean)));
    const areaSel = matchNames(q, areasAll);
    const byDest = /(destination|dstn|party)[\s-]*wise|by destination/.test(L);
    const cnt = new Map(); let total = 0;
    d.rows.forEach(r => {
      if (areaSel.length && areaSel.indexOf(r.area) < 0) return;
      if (!on(r.area, 'sttn_from', r.sttn_from) || !on(r.area, 'dstn', r.dstn)) return;
      if (!byDest && String(r.dstn == null ? '' : r.dstn).trim().toUpperCase() !== o.dest) return;
      const key = byDest ? (r.dstn || '(blank)') : r.area + '|' + r.sttn_from;
      cnt.set(key, (cnt.get(key) || 0) + 1); total++;
    });
    let rows, cols;
    if (byDest) {
      rows = Array.from(cnt.entries()).map(e => ({ label: e[0], n: e[1] })).sort((a, b) => b.n - a.n);
      cols = [{ key: 'label', label: 'Destination', align: 'l' }, mkCol('n', 'Indents', 'int')];
    } else {
      rows = Array.from(cnt.entries()).map(e => { const p = e[0].split('|'); return { label: p[1], area: p[0], dvs: d.dvs.get(p[0] + '|' + p[1]) || '', n: e[1] }; }).sort((a, b) => (a.area < b.area ? -1 : a.area > b.area ? 1 : b.n - a.n));
      cols = [{ key: 'area', label: 'Area', align: 'l', text: true }, { key: 'label', label: 'Siding', align: 'l' }, { key: 'dvs', label: 'DVS', align: 'l', text: true }, mkCol('n', 'Pending', 'int')];
    }
    const tr = { label: 'Total', _total: true, n: total, area: '', dvs: '' };
    const tail = areaSel.length ? ' in ' + areaSel.join(' + ') : '';
    const notes = ['Counts indents that are ticked on in your ODR filters, as on the ' + o.name + ' ODR Summary tab. Data is as of the last upload.'];
    const chips = [];
    if (!byDest) chips.push(['Destination-wise', 'odr ' + o.name.split(' ')[0].toLowerCase() + ' pending destination wise']);
    Object.keys(ODRS).forEach(x => { if (x !== k) chips.push([ODRS[x].name + ' pending', 'pending rakes ' + (x === 'nlod' ? 'nalco' : 'hzl')]); });
    areasAll.slice(0, 3).forEach(a => { if (areaSel.indexOf(a) < 0) chips.push([a + ' only', 'pending rakes ' + o.name.split(' ')[0].toLowerCase() + ' ' + a]); });
    return {
      kind: 'table', title: o.name + ' pending rakes', subtitle: byDest ? 'by destination' : 'sidingwise' + tail, ctx: {}, group: 'siding', decimals: 0,
      headline: total ? (byDest ? 'Total indents' : o.name + ' pending indents') + tail + ': ' + fmt(total) + ' across ' + rows.length + (byDest ? ' destinations.' : ' sidings.') : 'No pending ' + o.name + ' indents found' + tail + '.',
      notes: notes, cols: cols, rows: rows, total: rows.length ? tr : null, main: 'n', chips: chips.slice(0, 6)
    };
  }
  MODULES.push({
    id: 'odr',
    score(q) { let s = 0; if (/\b(odr|indents?|dvs)\b/i.test(q)) s += 7; if (/\bpending\b/i.test(q)) s += 4; if (/\b(rakes?)\b/i.test(q) && /\bpending\b/i.test(q)) s += 1; if (/\b(billing|penalty|gcv|loading status)\b/i.test(q)) s -= 6; return s; },
    run: runOdr
  });

  /* ================= KSK Mahanadi: inward / dispatch (project lf) ================= */
  let KSK = null;
  async function kskLoad(from, to) {
    const key = from + '|' + to;
    if (KSK && KSK.key === key && Date.now() - KSK.at < 60000) return KSK.rows;
    const a = await rest('lf', 'ksk_sheet_rows', 'select=id,direction,rec_date,disp_date,vehicle_no,net_wt,do_key,source_sheet&or=' + encodeURIComponent('(and(rec_date.gte.' + from + ',rec_date.lte.' + to + '),and(disp_date.gte.' + from + ',disp_date.lte.' + to + '))') + '&order=id');
    KSK = { key: key, rows: a, at: Date.now() }; return a;
  }
  async function runKsk(q) {
    const L = q.toLowerCase(), now = today(), R = perfRange(q);
    const rowsAll = await kskLoad(R.from, R.to);
    const inRe = /\b(inward|received|receipt|in)\b/.test(L), outRe = /\b(dispatch|dispatched|despatch|outward|sale|sold|out)\b/.test(L);
    const dirs = inRe && !outRe ? ['IN'] : outRe && !inRe ? ['OUT'] : ['IN', 'OUT'];
    const isIn = r => String(r.direction || '').toUpperCase().indexOf('IN') === 0;
    const dateOf = r => String((isIn(r) ? r.rec_date : r.disp_date) || '').slice(0, 10);
    const rows = rowsAll.filter(r => { const d = dateOf(r); return d >= R.from && d <= R.to && dirs.indexOf(isIn(r) ? 'IN' : 'OUT') >= 0; });
    let g = /day[\s-]*wise|daily|by day/.test(L) ? 'day' : /(d\.?o\.?|do)[\s-]*wise|by d\.?o/.test(L) ? 'do' : /(source|sheet)[\s-]*wise/.test(L) ? 'sheet' : 'month';
    if (/quarter[\s-]*wise|quarterly/.test(L)) g = 'quarter';
    const keyOf = { month: r => dateOf(r).slice(0, 7), day: r => dateOf(r), quarter: r => qKey(dateOf(r)), do: r => String(r.do_key || '(none)'), sheet: r => String(r.source_sheet || '(none)') }[g];
    const m = new Map();
    rows.forEach(r => {
      const k = keyOf(r); let o = m.get(k); if (!o) { o = { k: k, first: dateOf(r), inN: 0, inW: 0, outN: 0, outW: 0 }; m.set(k, o); }
      if (isIn(r)) { o.inN++; o.inW += nnum(r.net_wt); } else { o.outN++; o.outW += nnum(r.net_wt); }
      if (dateOf(r) < o.first) o.first = dateOf(r);
    });
    let list = Array.from(m.values());
    const chrono = g !== 'do' && g !== 'sheet';
    list.sort(chrono ? (a, b) => (a.first < b.first ? -1 : 1) : (a, b) => (b.inW + b.outW) - (a.inW + a.outW));
    const lab = o => g === 'month' ? monLabel(o.k + '-01') : g === 'day' ? dmy(o.k) : o.k;
    const out = list.map(o => ({ label: lab(o), inN: o.inN, inW: o.inW, outN: o.outN, outW: o.outW, bal: o.inW - o.outW }));
    const cols = [{ key: 'label', label: { month: 'Month', day: 'Date', quarter: 'Quarter', do: 'D.O.', sheet: 'Sheet' }[g], align: 'l' }];
    if (dirs.indexOf('IN') >= 0) { cols.push(mkCol('inN', 'Inward trips', 'int')); cols.push(mkCol('inW', 'Inward wt', 'd2')); }
    if (dirs.indexOf('OUT') >= 0) { cols.push(mkCol('outN', 'Dispatch trips', 'int')); cols.push(mkCol('outW', 'Dispatch wt', 'd2')); }
    if (dirs.length === 2) cols.push(mkCol('bal', 'Inward - dispatch', 'd2'));
    const sk = ['inN', 'inW', 'outN', 'outW', 'bal'], total = out.length > 1 ? totalOf(out, sk) : null, T = total || out[0] || {};
    const main = dirs.length === 1 ? (dirs[0] === 'IN' ? 'inW' : 'outW') : 'inW';
    const parts = []; if (dirs.indexOf('IN') >= 0) parts.push('inward ' + d2f(T.inW) + ' (' + fmt(T.inN) + (T.inN === 1 ? ' trip)' : ' trips)')); if (dirs.indexOf('OUT') >= 0) parts.push('dispatch ' + d2f(T.outW) + ' (' + fmt(T.outN) + (T.outN === 1 ? ' trip)' : ' trips)'));
    const notes = []; if (!R.given) notes.push('No dates given, so I used ' + R.label + '.');
    notes.push('Weights are the net weights stored in your KSK sheet rows (inward by receipt date, dispatch by dispatch date).');
    const chips = [];
    if (g !== 'day') chips.push(['Day-wise', 'ksk ' + dirs.join(' ').toLowerCase().replace('in', 'inward').replace('out', 'dispatch') + ' day wise ' + R.label]);
    if (g !== 'do') chips.push(['D.O.-wise', 'ksk dispatch D.O. wise ' + R.label]);
    if (g !== 'month') chips.push(['Month-wise', 'ksk inward and dispatch month wise ' + R.label]);
    if (dirs.length === 2) { chips.push(['Only inward', 'ksk inward ' + R.label]); chips.push(['Only dispatch', 'ksk dispatch ' + R.label]); }
    return { kind: 'table', title: 'KSK Mahanadi ' + (dirs.length === 2 ? 'inward and dispatch' : dirs[0] === 'IN' ? 'inward' : 'dispatch'), subtitle: R.label, headline: out.length ? 'KSK ' + parts.join(' and ') + ' for ' + R.label + '.' : 'No KSK entries found for ' + R.label + '.', notes: notes, cols: cols, rows: out, total: total, main: main, ctx: {}, group: g, decimals: 0, chips: chips.slice(0, 6) };
  }
  MODULES.push({
    id: 'ksk',
    score(q) { let s = 0; if (/\b(ksk|mahanadi|washery|jsw)\b/i.test(q)) s += 8; if (/\b(d\.?o\.?\s*(summary|no)|road\s+sale|rcr)\b/i.test(q)) s += 5; return s; },
    run: runKsk
  });


  const EXAMPLES = [
    'total non-power rakes this month',
    'average rakes per day 1 Oct to 25 Oct',
    'rake loading status',
    'overall rake loading image',
    'total billing gujarat',
    'total billing hzl Q2',
    'penalty pjpb',
    'pending rakes hzl odr',
    'ksk inward and dispatch month wise'
  ];

  const IMGRE = /\b(image|png|picture|photo|snapshot|screenshot)\b/i;
  const CSVRE = /\b(csv|excel|download|export)\b/i;
  async function answer(q) {
    if (/^\s*(help|\?|what can you do|what can i ask|examples?)\s*\??\s*$/i.test(q)) return helpResult();
    let best = null, bs = 0;
    MODULES.forEach(m => { const s = m.score(q); if (s > bs) { bs = s; best = m; } });
    if (!best) return helpResult();
    const res = await best.run(q);
    res.ctx = res.ctx || {};
    if (res.ctx.image == null) res.ctx.image = IMGRE.test(q);
    if (res.ctx.csv == null) res.ctx.csv = CSVRE.test(q);
    return res;
  }
  function helpResult() {
    return {
      kind: 'text', headline: 'Here is what you can ask me. Tap any example.',
      notes: ['Add dates or a month ("Oct 2026", "Q2", "1 Oct to 25 Oct", "last month"), and say "as image" or "csv" to get a picture or a file.'],
      chips: EXAMPLES.map(e => [e, e])
    };
  }

  /* ===== export: CSV + PNG ===== */
  function cell(res, col, row) {
    if (col.key === 'label') return row.label;
    const v = row[col.key];
    if (col.text) return v == null ? '' : String(v);
    if (col.f) return col.f(v, row);
    return res.decimals ? Number(v || 0).toFixed(res.decimals) : fmt(v);
  }
  function toCSV(res) {
    const q = s => '"' + String(s).replace(/"/g, '""') + '"';
    const lines = [res.cols.map(c => q(c.label)).join(',')];
    res.rows.concat(res.total ? [res.total] : []).forEach(r => lines.push(res.cols.map(c => q(c.key === 'label' ? r.label : (c.text ? (r[c.key] == null ? '' : r[c.key]) : c.f ? Math.round((Number(r[c.key]) || 0) * 100) / 100 : (res.decimals ? Number(r[c.key] || 0).toFixed(res.decimals) : (r[c.key] || 0))))).join(',')));
    return '\ufeff' + lines.join('\r\n');
  }
  function download(name, blob) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
  }
  const fileStem = res => (res.title + ' ' + res.subtitle).replace(/[^A-Za-z0-9]+/g, '_').slice(0, 70);
  function accent() {
    try {
      const cs = getComputedStyle(document.documentElement);
      return (cs.getPropertyValue('--pr-a') || cs.getPropertyValue('--brand') || '').trim() || '#1d4ed8';
    } catch (e) { return '#1d4ed8'; }
  }
  function drawPng(res) {
    const S = 2, pad = 28, rowH = 36, accentC = accent();
    const cols = res.cols, rows = res.rows.concat(res.total ? [res.total] : []);
    const c0 = document.createElement('canvas'), x0 = c0.getContext('2d');
    x0.font = '600 14px system-ui,Segoe UI,Arial,sans-serif';
    const w = cols.map((cl, i) => {
      let m = x0.measureText(cl.label).width;
      rows.forEach(r => { m = Math.max(m, x0.measureText(cell(res, cl, r)).width); });
      return Math.max(i === 0 ? 120 : 84, Math.ceil(m) + 28);
    });
    const tableW = w.reduce((a, b) => a + b, 0);
    const chartRows = res.rows.length >= 2 && res.rows.length <= 24 ? res.rows : [];
    const chartH = chartRows.length ? 190 : 0;
    const W = Math.max(tableW + pad * 2, 520);
    const H = pad + 62 + (chartH ? chartH + 16 : 0) + rowH * (rows.length + 1) + pad + 22;
    const cv = document.createElement('canvas'); cv.width = W * S; cv.height = H * S;
    const g = cv.getContext('2d'); g.scale(S, S);
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
    g.fillStyle = accentC; g.fillRect(0, 0, W, 6);
    g.textBaseline = 'alphabetic';
    g.fillStyle = '#111827'; g.font = '700 21px system-ui,Segoe UI,Arial,sans-serif'; g.fillText(res.title, pad, pad + 20);
    g.fillStyle = '#6b7280'; g.font = '400 13px system-ui,Segoe UI,Arial,sans-serif'; g.fillText(res.subtitle, pad, pad + 42);
    let y = pad + 62;
    if (chartRows.length) {
      const cw = W - pad * 2, ch = chartH - 34, bw = Math.min(54, cw / chartRows.length - 8);
      const vals = chartRows.map(r => +r[res.main] || 0), mx = Math.max.apply(null, vals) || 1;
      g.strokeStyle = '#e5e7eb'; g.lineWidth = 1; g.beginPath(); g.moveTo(pad, y + ch); g.lineTo(pad + cw, y + ch); g.stroke();
      chartRows.forEach((r, i) => {
        const bh = Math.max(1, (vals[i] / mx) * (ch - 22)), bx = pad + (cw / chartRows.length) * (i + .5) - bw / 2;
        g.fillStyle = accentC; g.globalAlpha = .88; g.fillRect(bx, y + ch - bh, bw, bh); g.globalAlpha = 1;
        g.fillStyle = '#111827'; g.font = '600 11px system-ui,Arial,sans-serif'; g.textAlign = 'center';
        g.fillText(res.decimals ? vals[i].toFixed(res.decimals) : fmt(vals[i]), bx + bw / 2, y + ch - bh - 5);
        g.fillStyle = '#6b7280'; g.font = '400 10.5px system-ui,Arial,sans-serif';
        g.fillText(String(r.label).length > 11 ? String(r.label).slice(0, 10) + '\u2026' : r.label, bx + bw / 2, y + ch + 15);
      });
      g.textAlign = 'left'; y += chartH + 16;
    }
    // table
    let x = pad;
    g.fillStyle = accentC; g.fillRect(pad, y, tableW, rowH);
    g.fillStyle = '#ffffff'; g.font = '600 13px system-ui,Segoe UI,Arial,sans-serif';
    cols.forEach((cl, i) => { g.textAlign = cl.align === 'r' ? 'right' : 'left'; g.fillText(cl.label, cl.align === 'r' ? x + w[i] - 14 : x + 14, y + 23); x += w[i]; });
    y += rowH;
    rows.forEach((r, ri) => {
      g.fillStyle = r._total ? '#eef2ff' : (ri % 2 ? '#f8fafc' : '#ffffff'); g.fillRect(pad, y, tableW, rowH);
      g.strokeStyle = '#e5e7eb'; g.beginPath(); g.moveTo(pad, y + rowH); g.lineTo(pad + tableW, y + rowH); g.stroke();
      g.fillStyle = '#111827'; g.font = (r._total ? '700 ' : '400 ') + '13px system-ui,Segoe UI,Arial,sans-serif';
      x = pad;
      cols.forEach((cl, i) => { g.textAlign = cl.align === 'r' ? 'right' : 'left'; g.fillText(cell(res, cl, r), cl.align === 'r' ? x + w[i] - 14 : x + 14, y + 23); x += w[i]; });
      y += rowH;
    });
    g.textAlign = 'left'; g.fillStyle = '#9ca3af'; g.font = '400 11px system-ui,Arial,sans-serif';
    g.fillText('Prithvi Realcon \u00b7 generated ' + dmy(iso(today())), pad, H - 14);
    return cv;
  }

  /* ===== UI (shadow DOM so page styles cannot interfere) ===== */
  function signedIn() { try { return !!JSON.parse(localStorage.getItem('amm-auth')); } catch (e) { return false; } }
  function mount() {
    if (!signedIn()) return;   // no assistant on the sign-in page or for signed-out visitors
    const host = document.createElement('div');
    host.id = 'prai-host';
    document.body.appendChild(host);
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = '<style>' + CSS + '</style>' +
      '<button class="fab" aria-label="Open data assistant" title="Ask about your data"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/></svg><span>Ask data</span></button>' +
      '<section class="panel" role="dialog" aria-label="Data assistant" hidden>' +
      '<header><div><b>Data assistant</b><small>Rakes, loading, billing, ODR and KSK</small></div><div class="hb"><button class="ic" data-act="clear" title="Clear chat">Clear</button><button class="ic" data-act="close" aria-label="Close">&#10005;</button></div></header>' +
      '<div class="log" aria-live="polite"></div>' +
      '<form class="bar"><input type="text" autocomplete="off" placeholder="Ask e.g. total billing of Gujarat" aria-label="Your question"><button type="submit" aria-label="Send">&#10148;</button></form>' +
      '</section>';
    const $ = s => root.querySelector(s);
    const fab = $('.fab'), panel = $('.panel'), log = $('.log'), input = $('input'), form = $('form');
    root.host.style.setProperty('--ac', accent());

    /* placement: header chip beside Search (hub pages) > quick-menu item (dashboards) > floating button */
    let hb = null, mode = 'float';
    const bar = document.querySelector('.top-right, .pr-floatbar');
    if (bar) {
      hb = document.createElement('button'); hb.type = 'button'; hb.className = 'pr-chipbtn'; hb.id = 'prai-hdr';
      hb.setAttribute('aria-label', 'Ask the data assistant'); hb.setAttribute('aria-haspopup', 'dialog'); hb.setAttribute('aria-expanded', 'false');
      hb.innerHTML = '<i class="fas fa-comment-dots" aria-hidden="true"></i><span class="t">Ask data</span>';
      const sch = bar.querySelector('.pr-chipbtn');
      if (sch && sch.nextSibling) bar.insertBefore(hb, sch.nextSibling); else if (sch) bar.appendChild(hb); else bar.insertBefore(hb, bar.firstChild);
      mode = 'header'; panel.classList.add('hdr'); fab.hidden = true;
    } else {
      host.style.bottom = '72px'; host.style.right = '16px';   // sit above the page's back-to-top button
      const menu = document.getElementById('pr-menu'), sm = menu && menu.querySelector('[data-a=search]');
      if (sm) {
        const mb = document.createElement('button'); mb.type = 'button'; mb.setAttribute('role', 'menuitem'); mb.setAttribute('data-a', 'ai');
        mb.innerHTML = '<i class="fas fa-comment-dots"></i>Ask data'; sm.insertAdjacentElement('afterend', mb);
        mb.addEventListener('click', () => toggle(true));
      }
    }
    function toggle(open) {
      panel.hidden = !open; fab.hidden = open || mode === 'header';
      if (hb) hb.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) { if (!log.children.length) welcome(); input.focus(); }
    }
    fab.onclick = () => toggle(true);
    if (hb) hb.addEventListener('click', e => { e.stopPropagation(); toggle(panel.hidden); });
    root.addEventListener('click', e => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      if (b.dataset.act === 'close') toggle(false);
      if (b.dataset.act === 'clear') { log.innerHTML = ''; welcome(); }
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) toggle(false); });

    function add(html, cls) {
      const d = document.createElement('div'); d.className = 'm ' + cls; d.innerHTML = html;
      log.appendChild(d); log.scrollTop = log.scrollHeight; return d;
    }
    function chipsHtml(chips) {
      return chips && chips.length ? '<div class="chips">' + chips.map(c => '<button class="chip" data-q="' + esc(c[1]) + '">' + esc(c[0]) + '</button>').join('') + '</div>' : '';
    }
    function welcome() {
      add('<p><b>Ask me about your data.</b> I read it live from your Supabase tables and work out the numbers exactly. I can also give you the result as a CSV file or a PNG picture.</p>' + chipsHtml(EXAMPLES.map(e => [e, e])), 'bot');
    }
    function tableHtml(res) {
      const mx = Math.max.apply(null, res.rows.map(r => +r[res.main] || 0).concat([1]));
      const head = '<tr>' + res.cols.map(c => '<th class="' + c.align + '">' + esc(c.label) + '</th>').join('') + '</tr>';
      const body = res.rows.map(r => '<tr>' + res.cols.map((c, i) => {
        const bar = (c.key === res.main && res.rows.length > 1) ? '<i style="width:' + Math.round(((+r[c.key] || 0) / mx) * 100) + '%"></i>' : '';
        return '<td class="' + c.align + ((+r[c.key] < 0 && !c.text) ? ' neg' : '') + '">' + bar + '<span>' + esc(cell(res, c, r)) + '</span></td>';
      }).join('') + '</tr>').join('');
      const foot = res.total ? '<tr class="tot">' + res.cols.map(c => '<td class="' + c.align + '"><span>' + esc(cell(res, c, res.total)) + '</span></td>').join('') + '</tr>' : '';
      return '<div class="tw"><table><thead>' + head + '</thead><tbody>' + body + foot + '</tbody></table></div>';
    }
    function render(res) {
      let h = '<p class="hl">' + esc(res.headline) + '</p>';
      if (res.kind === 'table' && res.rows.length) h += tableHtml(res);
      (res.notes || []).forEach(n => { h += '<p class="note">' + esc(n) + '</p>'; });
      if (res.kind === 'table' && res.rows.length) h += '<div class="exp"><button class="ex" data-ex="csv">Download CSV</button><button class="ex" data-ex="png">Convert to PNG</button></div><div class="pv"></div>';
      h += chipsHtml(res.chips);
      const d = add(h, 'bot'); d._res = res;
      return d;
    }
    async function ask(q) {
      q = (q || '').trim(); if (!q) return;
      add(esc(q), 'me'); input.value = '';
      const wait = add('<span class="dots"><i></i><i></i><i></i></span>', 'bot');
      try {
        const res = await answer(q);
        wait.remove(); const d = render(res);
        if (res.ctx && res.ctx.image && res.rows && res.rows.length) showPng(d, res);
        if (res.ctx && res.ctx.csv && !res.ctx.image && res.rows && res.rows.length) download(fileStem(res) + '.csv', new Blob([toCSV(res)], { type: 'text/csv;charset=utf-8' }));
      } catch (err) {
        wait.remove(); add('<p class="hl err">Something went wrong while reading the data.</p><p class="note">' + esc(err.message || err) + '</p>', 'bot');
      }
    }
    function showPng(d, res) {
      const cv = res.draw ? res.draw(res) : drawPng(res), pv = d.querySelector('.pv');
      pv.innerHTML = ''; const img = new Image(); img.src = cv.toDataURL('image/png'); img.alt = res.title; pv.appendChild(img);
      const b = document.createElement('button'); b.className = 'ex'; b.textContent = 'Save PNG';
      b.onclick = () => cv.toBlob(bl => download(fileStem(res) + '.png', bl));
      pv.appendChild(b);
      log.scrollTop = log.scrollHeight;
    }
    log.addEventListener('click', e => {
      const chip = e.target.closest('.chip'); if (chip) { ask(chip.dataset.q); return; }
      const ex = e.target.closest('[data-ex]'); if (!ex) return;
      const d = ex.closest('.m'), res = d._res;
      if (ex.dataset.ex === 'csv') download(fileStem(res) + '.csv', new Blob([toCSV(res)], { type: 'text/csv;charset=utf-8' }));
      else showPng(d, res);
    });
    form.addEventListener('submit', e => { e.preventDefault(); ask(input.value); });
  }

  const CSS = [
    ':host{all:initial;position:fixed;z-index:2147483000;right:18px;bottom:18px;font:14px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#111827}',
    '*{box-sizing:border-box}[hidden]{display:none!important}',
    '.fab{display:flex;align-items:center;gap:8px;height:46px;padding:0 18px 0 15px;border:0;border-radius:23px;background:var(--ac,#1d4ed8);color:#fff;font:600 14px system-ui,sans-serif;cursor:pointer;box-shadow:0 8px 24px -8px rgba(0,0,0,.45)}',
    '.fab:hover{filter:brightness(1.08)}.fab:focus-visible,.ic:focus-visible,.chip:focus-visible,.ex:focus-visible,input:focus-visible,.bar button:focus-visible{outline:2px solid var(--ac,#1d4ed8);outline-offset:2px}',
    '.panel.hdr{top:84px;bottom:auto;right:max(14px,calc((100vw - 1120px) / 2));height:min(640px,calc(100vh - 100px))}@media(max-width:700px){.panel.hdr{top:76px;right:10px;height:calc(100vh - 90px)}}',
    '.panel{position:fixed;right:18px;bottom:18px;width:min(470px,calc(100vw - 20px));height:min(620px,calc(100vh - 36px));display:flex;flex-direction:column;background:#fff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;box-shadow:0 24px 60px -18px rgba(0,0,0,.45)}',
    'header{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px 14px;background:var(--ac,#1d4ed8);color:#fff}',
    'header b{display:block;font-size:15px}header small{display:block;opacity:.85;font-size:12px}',
    '.hb{display:flex;gap:4px}.ic{border:0;background:rgba(255,255,255,.16);color:#fff;border-radius:8px;padding:5px 9px;font:500 12px system-ui,sans-serif;cursor:pointer}.ic:hover{background:rgba(255,255,255,.28)}',
    '.log{flex:1;overflow:auto;padding:14px;display:flex;flex-direction:column;gap:10px;background:#f6f7f9}',
    '.m{max-width:94%;padding:10px 12px;border-radius:12px;word-wrap:break-word}.m p{margin:0 0 6px}.m p:last-child{margin-bottom:0}',
    '.me{align-self:flex-end;background:var(--ac,#1d4ed8);color:#fff;border-bottom-right-radius:4px}',
    '.bot{align-self:flex-start;background:#fff;border:1px solid #e5e7eb;border-bottom-left-radius:4px;width:94%}',
    '.hl{font-weight:600}.err{color:#b3261e}.note{color:#6b7280;font-size:12.5px}',
    '.tw{overflow-x:auto;margin:8px 0;border:1px solid #e5e7eb;border-radius:8px}',
    'table{border-collapse:collapse;width:100%;font-size:13px;white-space:nowrap}',
    'th{background:#f3f4f6;font-weight:600;padding:7px 10px;border-bottom:1px solid #e5e7eb}',
    'td{position:relative;padding:6px 10px;border-bottom:1px solid #f0f1f3}td span{position:relative}',
    '.neg{color:#b3261e}.l{text-align:left}.r{text-align:right;font-variant-numeric:tabular-nums}',
    'td i{position:absolute;left:0;top:3px;bottom:3px;background:var(--ac,#1d4ed8);opacity:.13;border-radius:0 4px 4px 0}',
    'tr.tot td{font-weight:700;background:#f8fafc;border-top:1px solid #d1d5db}',
    '.chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}',
    '.chip{border:1px solid #d1d5db;background:#fff;color:#111827;border-radius:999px;padding:5px 11px;font:500 12.5px system-ui,sans-serif;cursor:pointer}.chip:hover{border-color:var(--ac,#1d4ed8);color:var(--ac,#1d4ed8)}',
    '.exp{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}',
    '.ex{border:1px solid var(--ac,#1d4ed8);background:#fff;color:var(--ac,#1d4ed8);border-radius:8px;padding:6px 11px;font:600 12.5px system-ui,sans-serif;cursor:pointer}.ex:hover{background:var(--ac,#1d4ed8);color:#fff}',
    '.pv img{display:block;width:100%;margin-top:8px;border:1px solid #e5e7eb;border-radius:8px}.pv .ex{margin-top:6px}',
    '.bar{display:flex;gap:8px;padding:10px;border-top:1px solid #e5e7eb;background:#fff}',
    'input{flex:1;min-width:0;height:40px;border:1px solid #d1d5db;border-radius:10px;padding:0 12px;font:14px system-ui,sans-serif;background:#fff;color:#111827}',
    '.bar button{width:44px;border:0;border-radius:10px;background:var(--ac,#1d4ed8);color:#fff;font-size:16px;cursor:pointer}',
    '.dots{display:inline-flex;gap:4px}.dots i{width:7px;height:7px;border-radius:50%;background:#9ca3af;animation:b 1s infinite}.dots i:nth-child(2){animation-delay:.15s}.dots i:nth-child(3){animation-delay:.3s}',
    '@keyframes b{0%,60%,100%{opacity:.3}30%{opacity:1}}',
    '@media(prefers-reduced-motion:reduce){.dots i{animation:none}}',
    '@media print{:host{display:none}}'
  ].join('');

  window.PRAI = { MODULES: MODULES, rest: rest, helpers: { nk, esc, fmt, iso, dmy, parseDates, fyOf, fyName, qLabel, qRange, monLabel, MON3, daysBetween, endOfMonth, mk, today, accent, cell, toCSV, drawPng, download, fileStem, compose }, _test: { parseDates, understand, runDispatch, D, ensureDispatch } };
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
  }
})();
