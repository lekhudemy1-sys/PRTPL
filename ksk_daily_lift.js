/* ==========================================================
   KSK Mahanadi – Daily Lift = previous day's lift per D.O.
   Applies to WASHERY and RCR. ROAD keeps its manual Daily Lift.

   Install: open ksk_mahanadi.html and add this line just before </body>
   (after the existing scripts):
     <script src="ksk_daily_lift.js"></script>
   ========================================================== */
(function () {
  if (typeof S === 'undefined' || typeof calc !== 'function' || typeof load !== 'function') return;

  var LIFT_SECS = ['WASHERY', 'RCR'];
  S.yLift = {};
  S.yDate = '';

  /* previous day in the device's local date (IST on Indian devices) */
  function prevDay() {
    var d = new Date();
    d.setDate(d.getDate() - 1);
    return iso(d);
  }

  /* Washery: inward receipts dated yesterday (ksk_sheet_rows, direction IN)
     RCR:     multi-upload truck rows dated yesterday (ksk_multi_upload_rows)  */
  async function loadYesterdayLift() {
    var ys = prevDay();
    S.yDate = ys;
    S.yLift = {};

    var lab = MB.find(function (c) { return c[0] === 'daily_lift'; });
    if (lab) lab[1] = 'Daily Lift (' + fD(ys) + ')';

    if (!db) return;
    try {
      var results = await Promise.all([
        fetchAll(function () {
          return db.from('ksk_sheet_rows')
            .select('do_key,net_wt,source_sheet')
            .eq('direction', 'IN')
            .eq('rec_date', ys)
            .order('id');
        }),
        fetchAll(function () {
          return db.from('ksk_multi_upload_rows')
            .select('do_key,do_no,net_wt')
            .eq('disp_date', ys)
            .order('id');
        })
      ]);
      var inw = results[0] || [], mul = results[1] || [], yl = {};

      inw.forEach(function (r) {
        if (String(r.source_sheet || '').indexOf('MULTI:') === 0) return;
        var k = String(r.do_key || '');
        if (!k) return;
        var o = (yl[k] = yl[k] || { W: 0, R: 0 });
        o.W += num(r.net_wt) || 0;
      });

      mul.forEach(function (r) {
        var k = String(r.do_key || r.do_no || '');
        if (!k) return;
        var o = (yl[k] = yl[k] || { W: 0, R: 0 });
        o.R += num(r.net_wt) || 0;
      });

      Object.keys(yl).forEach(function (k) {
        yl[k].W = r3(yl[k].W);
        yl[k].R = r3(yl[k].R);
      });
      S.yLift = yl;
    } catch (e) {
      S.yLift = {};
      toast('Daily lift could not be loaded: ' + exErr(e), true);
    }
  }

  /* override daily_lift inside the calculation for Washery and RCR */
  var _calc = calc;
  calc = function (d, ov) {
    var r = _calc(d, ov);
    var sec = normSec(d.section);
    if (LIFT_SECS.indexOf(sec) > -1) {
      var y = (S.yLift || {})[String(d.do_no)] || { W: 0, R: 0 };
      r.daily_lift = sec === 'RCR' ? y.R : y.W;
    }
    return r;
  };

  /* fetch yesterday's lift before every dashboard load */
  var _load = load;
  load = async function () {
    await loadYesterdayLift();
    return _load();
  };

  load();
})();
