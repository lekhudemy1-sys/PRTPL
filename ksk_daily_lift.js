/* ==========================================================
   KSK Mahanadi – Daily Lift = total lifted on the D.O.'s
   LAST LIFTING DAY (not literally yesterday).
   WASHERY : last day with received (IN) rows  -> daily_lift
             last day with dispatch (OUT) rows -> daily_dispatch
   RCR     : last day with multi-upload truck rows -> daily_lift
   ROAD keeps its manual Daily Lift.

   Install: open ksk_mahanadi.html and add this line just before </body>
   (after the existing scripts):
     <script src="ksk_daily_lift.js"></script>
   ========================================================== */
(function () {
  if (typeof S === 'undefined' || typeof calc !== 'function' || typeof load !== 'function') return;

  var LIFT_SECS = ['WASHERY', 'RCR'];
  S.lastLift = {};   // do_key -> { inD, inQ, outD, outQ, rcrD, rcrQ }

  /* group rows by D.O. and date, then pick the latest date with qty > 0 */
  function lastDayPerDO(rows, keyFn, dateFn, qtyFn) {
    var byDo = {};
    rows.forEach(function (r) {
      var k = keyFn(r), d = String(dateFn(r) || '').slice(0, 10);
      if (!k || !d) return;
      var o = (byDo[k] = byDo[k] || {});
      o[d] = (o[d] || 0) + (num(qtyFn(r)) || 0);
    });
    var out = {};
    Object.keys(byDo).forEach(function (k) {
      var best = '';
      Object.keys(byDo[k]).forEach(function (d) {
        if (byDo[k][d] > 0 && d > best) best = d;
      });
      if (best) out[k] = { d: best, q: r3(byDo[k][best]) };
    });
    return out;
  }

  async function loadLastLift() {
    S.lastLift = {};

    var lab = MB.find(function (c) { return c[0] === 'daily_lift'; });
    if (lab) lab[1] = 'Daily Lift (Last Lift Day)';

    if (!db) return;
    try {
      var results = await Promise.all([
        fetchAll(function () {
          return db.from('ksk_sheet_rows')
            .select('do_key,net_wt,source_sheet,rec_date')
            .eq('direction', 'IN')
            .order('id');
        }),
        fetchAll(function () {
          return db.from('ksk_sheet_rows')
            .select('do_key,net_wt,source_sheet,rec_date')
            .eq('direction', 'OUT')
            .order('id');
        }),
        fetchAll(function () {
          return db.from('ksk_multi_upload_rows')
            .select('do_key,do_no,net_wt,disp_date')
            .order('id');
        })
      ]);

      var notMulti = function (r) { return String(r.source_sheet || '').indexOf('MULTI:') !== 0; };
      var inw  = (results[0] || []).filter(notMulti);
      var outw = (results[1] || []).filter(notMulti);
      var mul  = results[2] || [];

      var inL  = lastDayPerDO(inw,  function (r) { return String(r.do_key || ''); },
                              function (r) { return r.rec_date; },  function (r) { return r.net_wt; });
      var outL = lastDayPerDO(outw, function (r) { return String(r.do_key || ''); },
                              function (r) { return r.rec_date; },  function (r) { return r.net_wt; });
      var rcrL = lastDayPerDO(mul,  function (r) { return String(r.do_key || r.do_no || ''); },
                              function (r) { return r.disp_date; }, function (r) { return r.net_wt; });

      var all = {};
      [inL, outL, rcrL].forEach(function (m) { Object.keys(m).forEach(function (k) { all[k] = 1; }); });
      Object.keys(all).forEach(function (k) {
        S.lastLift[k] = {
          inD:  (inL[k]  || {}).d, inQ:  (inL[k]  || {}).q || 0,
          outD: (outL[k] || {}).d, outQ: (outL[k] || {}).q || 0,
          rcrD: (rcrL[k] || {}).d, rcrQ: (rcrL[k] || {}).q || 0
        };
      });
    } catch (e) {
      S.lastLift = {};
      toast('Daily lift could not be loaded: ' + exErr(e), true);
    }
  }

  /* override daily lift / dispatch inside the calculation */
  var _calc = calc;
  calc = function (d, ov) {
    var r = _calc(d, ov);
    var sec = normSec(d.section);
    if (LIFT_SECS.indexOf(sec) > -1) {
      var y = (S.lastLift || {})[String(d.do_no)] || {};
      if (sec === 'RCR') {
        r.daily_lift = y.rcrQ || 0;
        r.daily_lift_date = y.rcrD || '';
      } else {
        r.daily_lift = y.inQ || 0;
        r.daily_lift_date = y.inD || '';
        if ('daily_dispatch' in r) {
          r.daily_dispatch = y.outQ || 0;
          r.daily_dispatch_date = y.outD || '';
        }
      }
    }
    return r;
  };

  /* fetch before every dashboard load */
  var _load = load;
  load = async function () {
    await loadLastLift();
    return _load();
  };

  load();
})();
