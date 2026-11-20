/* ===== KSK Mahanadi: Excel download (Washery / RCR) =====
   Add AFTER the "log-date-fix" script and BEFORE ksk_daily_lift.js:
     <script src="ksk_excel_download.js"></script>
   Or paste this whole file inside a <script> tag at the same place.

   Washery file : Dashboard | Inward | Dispatch | Info
   RCR file     : Dashboard | RCR Log | Rakes | Rake Allocation | Info
   Everything follows the From / To date range chosen on the dashboard.
   (Rows with no readable date are left out only while a range is active.)
*/
(function(){
 if(typeof S==='undefined'||typeof TD==='undefined'||typeof XLSX==='undefined'){console.error('[excel-dl] dashboard not ready');return}

 /* ---------- range helpers (same rule as the dashboard) ---------- */
 const rangeOn=()=>!!S.asTo||(!!S.asFromSet&&S.asFrom!==S.minDate);
 const inRange=v=>{
  if(!rangeOn())return true;
  const d=pd(v);if(!d)return false;
  const F=pd(S.asFrom),T=pd(S.asTo);
  return (!F||d>=F)&&(!T||d<=T);
 };
 const rangeText=()=>rangeOn()
  ?('From '+(S.asFrom?fD(S.asFrom):'start')+' to '+(S.asTo?fD(S.asTo):'latest entry'))
  :'Complete data';
 const fileTag=()=>rangeOn()?((S.asFrom||'start')+'_to_'+(S.asTo||'latest')):('all-data-'+iso(new Date()));

 /* ---------- sheet builder ----------
    types per column: 'd' date, 'q' quantity (2 decimals), 'i' integer, 't' text */
 function sheet(heads,types,rows,total){
  const aoa=[heads,...rows];
  if(total)aoa.push(total);
  const ws=XLSX.utils.aoa_to_sheet(aoa,{cellDates:true});
  for(let r=1;r<aoa.length;r++){
   types.forEach((t,c)=>{
    const a=ws[XLSX.utils.encode_cell({r,c})];if(!a)return;
    if(t==='d'&&a.t==='d')a.z='dd-mmm-yyyy';
    else if(t==='q'&&a.t==='n')a.z='#,##0.00';
    else if(t==='i'&&a.t==='n')a.z='0';
   });
  }
  ws['!cols']=heads.map((h,c)=>{
   let w=String(h).length;
   aoa.slice(1,300).forEach(r=>{const v=r[c];const l=v instanceof Date?11:String(v==null?'':v).length;if(l>w)w=l});
   return{wch:Math.min(42,w+2)};
  });
  ws['!autofilter']={ref:XLSX.utils.encode_range({s:{r:0,c:0},e:{r:Math.max(0,aoa.length-(total?2:1)),c:heads.length-1}})};
  return ws;
 }
 const totalRow=(types,rows,label)=>types.map((t,c)=>{
  if(c===0)return label+' · '+rows.length;
  if(t==='q'||t==='i'){let s=0;rows.forEach(r=>{if(typeof r[c]==='number')s+=r[c]});return t==='q'?Math.round(s*1000)/1000:s}
  return null;
 });
 const dv=v=>{const d=pd(v);return d||(v==null||String(v).trim()===''?null:String(v))};
 const txt=v=>v==null||String(v).trim()===''?null:String(v).trim();

 /* ---------- Dashboard sheet (same columns as the on-screen table) ---------- */
 function dashSheet(key,sec){
  const cols=[];
  TD[key].g.forEach(([gl,cs])=>cs.forEach(c=>cols.push({k:c[0],t:c[2],h:(gl?gl+' · ':'')+c[1]})));
  const rows=S.rows.filter(x=>normSec(x.section)===sec).sort((a,b)=>(num(a.sn_no)||0)-(num(b.sn_no)||0));
  const types=cols.map(c=>c.t==='dt'?'d':c.t==='q'?'q':c.t==='i'||c.t==='id'?'i':'t');
  const body=rows.map(x=>cols.map(c=>{
   const v=x[c.k];
   if(c.t==='dt')return dv(v);
   if(c.t==='q'||c.t==='i'||c.t==='id')return num(v);
   if(c.k==='days_left'){const n=num(v);return n!==null&&n<0?null:n}
   return txt(v);
  }));
  /* the first "id" column is D.O. No; add a Status column at the end */
  const heads=cols.map(c=>c.h).concat('Status');
  types.push('t');
  body.forEach((r,i)=>r.push(isClosed(rows[i])?'Closed':'Open'));
  return sheet(heads,types,body,totalRow(types,body,'Total'));
 }

 /* ---------- Log sheets from TB field lists ---------- */
 function logSheet(tbKey,rows,dateKey){
  const F=TB[tbKey].f;
  const types=F.map(([,,ty])=>ty==='d'?'d':ty==='n'?'q':ty==='i'?'i':'t');
  const body=rows.map(r=>F.map(([k,,ty])=>{
   const v=r[k];
   if(ty==='d')return dv(v);
   if(ty==='n'||ty==='i')return num(v);
   return txt(v);
  }));
  return sheet(F.map(f=>f[1]),types,body,totalRow(types,body,'Total'));
 }
 const byDate=k=>(a,b)=>{
  const x=pd(a[k]),y=pd(b[k]);
  if(x&&y&&x-y)return x-y;
  if(x&&!y)return -1;if(!x&&y)return 1;
  return (a.id||0)-(b.id||0);
 };
 const doKey=r=>String(r.do_key||r.do_no||'');

 function infoSheet(title){
  return XLSX.utils.aoa_to_sheet([
   [title],
   ['Date range',rangeText()],
   ['Generated',new Date().toLocaleString('en-GB')],
   ['Note','D.O. quantities, balances, trips, asking and days left on the Dashboard sheet are calculated only from movements inside the date range.'],
   ['Note',rangeOn()?'Log rows with no readable date are left out while a range is active.':'No range active: every row is included.']
  ]);
 }

 /* ---------- WASHERY: Dashboard + Inward + Dispatch ---------- */
 async function washery(){
  const dos=new Set(S.rows.filter(x=>normSec(x.section)==='WASHERY').map(x=>String(x.do_no)));
  const all=await fetchAll(()=>db.from('ksk_sheet_rows').select('*').order('id'));
  const mine=all.filter(r=>dos.has(doKey(r)));
  const inw=mine.filter(r=>r.direction==='IN'&&inRange(r.rec_date)).sort(byDate('rec_date'));
  const out=mine.filter(r=>r.direction==='OUT'&&inRange(r.disp_date)).sort(byDate('disp_date'));
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,dashSheet('w','WASHERY'),'Dashboard');
  XLSX.utils.book_append_sheet(wb,logSheet('ksk_inward',inw),'Inward');
  XLSX.utils.book_append_sheet(wb,logSheet('ksk_dispatch',out),'Dispatch');
  XLSX.utils.book_append_sheet(wb,infoSheet('KSK Mahanadi · Washery'),'Info');
  XLSX.writeFile(wb,'ksk-mahanadi-washery-'+fileTag()+'.xlsx',{cellDates:true});
  return `Washery Excel downloaded (${inw.length} inward, ${out.length} dispatch rows)`;
 }

 /* ---------- RCR: Dashboard + full log (+ rakes) ---------- */
 async function rcr(){
  const vals={};S.vals.forEach(v=>vals[String(v.do_no)]=v);
  const dos=new Set(S.rows.filter(x=>normSec(x.section)==='RCR').map(x=>String(x.do_no)));
  const all=await fetchAll(()=>db.from('ksk_multi_upload_rows').select('*').order('id'));
  const rows=all.filter(r=>dos.has(doKey(r))&&inRange(r.disp_date)).sort(byDate('disp_date'));

  const heads=['Dispatch Date','D.O. No.','Colliery','Party','Sr. No.','Vehicle No.','Gate Pass','Unique No. (LR)','Net Wt. (MT)','D.O. Qty (MT)','Issue Date','Lapsing Date','Source Sheet','Source Row'];
  const types=['d','t','t','t','t','t','t','t','q','q','d','d','t','i'];
  const body=rows.map(r=>{
   const d=vals[doKey(r)]||{};
   return [dv(r.disp_date),txt(r.do_key||r.do_no),txt(d.colliery),txt(d.party_name),txt(r.sn),txt(r.vehicle_no),txt(r.gate_pass),txt(r.unique_no),num(r.net_wt),num(d.do_qty),dv(d.issue_date),dv(d.lapsing_date),txt(r.source_sheet),num(r.source_row)];
  });
  const logWs=sheet(heads,types,body,totalRow(types,body,'Total'));

  /* rake register and allocation (filtered by RR Date) */
  const rakes=(S.rakes||[]).filter(x=>inRange(x.rr_date));
  const rt=['t','d','q','q','q','t','t'];
  const rb=rakes.map(x=>[txt(x.rr_no),dv(x.rr_date),num(x.rr_qty),num(x.ch_qty),num(x.plant_rec_qty),txt(x.loading_grade),txt(x.loaded_do_no)]);
  const rakeWs=sheet(['RR No.','RR Date','RR Qty','CH Qty','Plant Rec Qty','Loading Grade','Loaded D.O. No.'],rt,rb,totalRow(rt,rb,'Total'));

  const rd={};(S.rakes||[]).forEach(x=>rd[String(x.rr_no)]=x.rr_date);
  const al=(S.allocRows||[]).filter(x=>inRange(rd[String(x.rr_no)]));
  const at=['t','d','t','t','q'];
  const ab=al.map(x=>{const d=vals[String(x.do_no)]||{};return[txt(x.rr_no),dv(rd[String(x.rr_no)]),txt(x.do_no),txt(d.colliery),num(x.qty)]});
  const allocWs=sheet(['RR No.','RR Date','D.O. No.','Colliery','Allocated Qty (MT)'],at,ab,totalRow(at,ab,'Total'));

  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,dashSheet('r','RCR'),'Dashboard');
  XLSX.utils.book_append_sheet(wb,logWs,'RCR Log');
  XLSX.utils.book_append_sheet(wb,rakeWs,'Rakes');
  XLSX.utils.book_append_sheet(wb,allocWs,'Rake Allocation');
  XLSX.utils.book_append_sheet(wb,infoSheet('KSK Mahanadi · RCR'),'Info');
  XLSX.writeFile(wb,'ksk-mahanadi-rcr-'+fileTag()+'.xlsx',{cellDates:true});
  return `RCR Excel downloaded (${rows.length} log rows)`;
 }

 /* ---------- buttons ---------- */
 async function run(fn,btn){
  if(!db)return toast('Not connected',true);
  const old=btn.textContent;btn.disabled=true;btn.textContent='Preparing…';
  try{toast(await fn())}
  catch(e){toast('Excel failed: '+(exErr(e)||e.message||e),true)}
  finally{btn.disabled=false;btn.textContent=old}
 }
 if(!document.getElementById('xl-w')){
  $('#dl').insertAdjacentHTML('afterend',
   '<button id="xl-w" class="btn small" title="Dashboard + Inward + Dispatch, for the selected date range">⬇ Excel · Washery</button>'+
   '<button id="xl-r" class="btn small" title="Dashboard + RCR log, for the selected date range">⬇ Excel · RCR</button>');
  $('#xl-w').onclick=e=>run(washery,e.currentTarget);
  $('#xl-r').onclick=e=>run(rcr,e.currentTarget);
 }
})();
