// Netlify Function — live read/write to the Airtable "20/12" base.
// Uses AIRTABLE_TOKEN (set as a Netlify env var). The token never reaches the browser.
//
//   GET  /.netlify/functions/airtable?action=payout   -> live PAYOUT array for the worksheet
//   POST /.netlify/functions/airtable  { id, funding?, payout? }  -> update a staff record
//
// funding = "Grant" | "Support-only"   (Funding Type  fld3ZAimtplTJ9vIL)
// payout  = "Active" | "Paused" | "Finished"  (Payout Status  fld0xauS1j40Pb74f)

const BASE = "appZoeYCd8dlQfV7C";
const T_STAFF = "tblRlieYQq691CpZy";
const T_DONORS = "tblUid9W2ZKw9rgC6";

const F = {
  name:"fldKIVYCUN1dny1dl", country:"fldjL8JA2HNxqL3Cj", cycle:"fld1Zht3OcR1QrUDZ",
  start:"fldudbqnWklCCIjU1", month:"fldhNcawK5r08JcdR", salary:"fldXj9cej4rHswNrn",
  max:"fldd2WBCcqqs6tuHf", acct:"flddjBMi71O1qpskH", paid:"fldJp3vB8ngxj5gyA",
  curPay:"fldovmz5RURLvS3wf", curSub:"fldjAH4OECgBQjgw9",
  funding:"fld3ZAimtplTJ9vIL", status:"fld0xauS1j40Pb74f",
};
const D = { name:"fldO3kLf4ThXF2yMA", amt:"fldwUQJrh9QNIOr4L", freq:"fldnzW8Z3m8WtyyK8",
  dstatus:"fldbFqZCHBSRZf02e", stafflink:"fldtMNFYggmi8IbnL" };
const T_GRANT = "tblx9H88s1h73dYFo";
const G = { name:"fldGo5dMQbEWl1qOQ", dep:"fldHiaTsly9kKS4vS", paid:"fldm3PndZVKK8EYpA",
  wa:"fldv5Kaik45nsU4o3", fees:"fldaDkQcCa67uPpoc", date:"fldrmE8b5OGNjwNBm", src:"fld4qITAJvCzEt0yV" };
const T_MSG = "tblfd2a3hx8x0NdSe";
const M = { coach:"fld34KByNlXMGYg3Q", from:"fldyEklsaH2Bk2tus", text:"fldbrw0nZTI2LYjlb" };
const T_EMAIL = "tblWigjcOuSvDmpuO";
const E = { date:"fldwofjb5avf41aeB", subject:"fldDAu0dyYO8OCmeO", to:"fldfkxhP69eA7cZe0",
  cc:"fldnF9i00jD8TmO2F", sent:"fldJ3ii3DRlc0k6MK" };
// fields for the approval queue
const A = { pref:"fld4zG96Q7fJ8667g", budget:"fldERasO2urJRKhwe", email:"fldmbttAOTOAKWA7O", age:"fldShBfTD7mMFykTk",
  coach:"fldRPbkFFaR0YW9E8", coachEmail:"fldZEz2vM85lVbQCA", uplink:"fldqNyavY4tp4v7ML", uplinkEmail:"fldXprH8aL679a0Sa",
  lead:"fldeKeyhBKCQZLq1j", leadEmail:"fldUEqhu1Y5z5qulY", onbNotes:"fldZ2VWzRfi8vWsCE", onbDate:"flduitgP9yAPno6mT",
  melLink:"fld9UYikghOY3rldi", melAppr:"fld3L6c7XC7fd44fQ", dirAppr:"fldGeaBDzLfzC5Ms8" };
const first1 = v => Array.isArray(v) ? (v[0]||"") : (v||"");
const T_MEET = "tbl3K9aK8sEfFNRrc";
const MT = { staff:"fld33nlmgq6Thxs55", coach:"fldUmJEySFox5lqZd", date:"fldTPvH6C7V0v4lMX", notes:"fldsq0SXxGgTL8KVu" };

// weekly MPD updates — the funnel the "Who to reach" diagnosis is built from
const T_UPD = "tbllEWxhxxmvEdbKa";
const U = { name:"fldQ1YrcYTNYPGUbA", asks:"fldjt72R8YzSY7Rqb", mtgs:"fldJuVlQyjIxLdD42",
  partners:"fldgG3I4PmkjABpvL", hours:"fldZMv04zpxKIA1BZ", coachMtg:"fldfVK5Fqi7Ldlbpt",
  comments:"fldXrlGdy9NaP2BCk" };
const FREQ = ["fldWZG2uMRN9VPktA","fldue8vV2uSTEXljt","fldS64TFu35W4bd4w","fldGsTeZMRE7MKQhW",
  "fldgTxhzQUALZj0eW","fldV9PRyqZQFYrBd8","fldsXiCemS6IlsZg4","fldXPbngnb7eaIanV","fldG66SHyXF925998",
  "fldFR84P04Fiz1Obo","fldSqDwmlqqveYltc","fldjA21OiUkgtMunJ","fldgRCU7Ol0rggzJW","fldgHxED4hAjcRN1T",
  "fldd4xNwCffiYEM4E","fld2afmIBXPdv2Svu","fldkhCaQfQGlh3BrM","fldpdDbh1kmtZZsGS","fldugmHEAfSZEDy1W","fldKvrCrHmvxE1vb9"];
// staff funding/context for the care view
const C = { coach:"fldRPbkFFaR0YW9E8", month:"fldhNcawK5r08JcdR", weeks:"fldMe0SnURsO2hIiR",
  pct:"fldd4lIlxysqlxLLA" };

const FACTOR = [100,100,90,80,70,60,50,40,30,20,10,0];
const H = { Authorization:`Bearer ${process.env.AIRTABLE_TOKEN}`, "Content-Type":"application/json" };

async function listAll(table, fieldIds=[]){
  let out=[], offset;
  do{
    const u = new URL(`https://api.airtable.com/v0/${BASE}/${table}`);
    u.searchParams.set("returnFieldsByFieldId","true");
    u.searchParams.set("pageSize","100");
    for(const f of fieldIds) u.searchParams.append("fields[]", f);
    if(offset) u.searchParams.set("offset",offset);
    const r = await fetch(u, {headers:H});
    if(!r.ok) throw new Error(`Airtable ${table} ${r.status}: ${await r.text()}`);
    const j = await r.json();
    out = out.concat(j.records); offset = j.offset;
  } while(offset);
  return out;
}
const sel = v => (v && typeof v==="object") ? v.name : v;

async function buildPayout(){
  // staff in the current 2025-26 grant cycle, plus anyone flagged Support-only
  const staff = await listAll(T_STAFF, [F.name,F.country,F.cycle,F.start,F.month,F.salary,F.max,F.acct,F.paid,F.curPay,F.curSub,F.funding,F.status]);
  const cohort = staff.filter(r=>{
    const c = r.fields||{}; const cy = sel(c[F.cycle]);
    return cy==="2025-26" || sel(c[F.funding])==="Support-only";
  });
  // all donors grouped by staff record id
  const donors = await listAll(T_DONORS, [D.name,D.amt,D.freq,D.dstatus,D.stafflink]);
  const byStaff = {};
  for(const d of donors){
    const c=d.fields||{}; const links=c[D.stafflink]||[];
    for(const sid of links){ (byStaff[sid]=byStaff[sid]||[]).push(c); }
  }
  return cohort.map(r=>{
    const c=r.fields||{};
    const mo = Math.max(1, Number(c[F.month])||1);
    const sal = Number(c[F.salary])||0;
    const fac = FACTOR[Math.min(11,mo-1)];
    const base = Math.round(sal*fac/100*100)/100;
    const max = Number(c[F.max])||0;
    const paid = Math.round((Number(c[F.paid])||0)*100)/100;
    const ds = byStaff[r.id]||[];
    const givers = ds.filter(x=>sel(x[D.freq])==="Monthly" && sel(x[D.dstatus])==="Confirmed")
                     .map(x=>[(x[D.name]||"").trim(), Number(x[D.amt])||0])
                     .sort((a,b)=>b[1]-a[1]);
    const match = Math.round(givers.reduce((a,g)=>a+g[1],0)*100)/100;
    const other = ds.length - givers.length;
    const cur = Number(c[F.curPay])||0;
    const sub = Number(c[F.curSub])||0;
    const capped = max>0 && paid>=max-1;
    const held = base>0 && !capped && mo<=12 && cur===0;   // waiting on this month's update
    return {
      id:r.id, n:(c[F.name]||"").trim(), co:sel(c[F.country])||"", acct:(c[F.acct]||"").replace(/[^0-9]/g,""),
      mo, sal, fac, base, match, givers, other, paid, max, capped,
      nosub: held && sub===0, pend: held && sub>0,
      ft: sel(c[F.funding])||"Grant", ps: sel(c[F.status])||""
    };
  }).sort((a,b)=>a.n.localeCompare(b.n));
}

function fmtDate(s){ const d=Date.parse(s); return d?new Date(d).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):(s||""); }

async function buildGrantFund(){
  const [budgets, staff] = await Promise.all([
    listAll(T_GRANT, [G.name,G.dep,G.paid,G.wa,G.fees,G.date,G.src]),
    listAll(T_STAFF, [F.name,F.cycle,F.paid,F.max,F.month]),
  ]);
  const byCycle={};
  for(const r of staff){ const c=r.fields||{}; const cy=sel(c[F.cycle]); if(!cy) continue;
    const paid=Math.round(Number(c[F.paid])||0), max=Number(c[F.max])||0, mo=Number(c[F.month])||0;
    const status=((max>0&&paid>=max-1)||mo>12)?"done":"on";
    (byCycle[cy]=byCycle[cy]||[]).push([(c[F.name]||"").trim(), paid, status]);
  }
  const cycles=budgets.map(r=>{ const c=r.fields||{}; const cy=sel(c[G.name]);
    return { cy, dep:Number(c[G.dep])||0, paid:Math.round(Number(c[G.paid])||0), fees:Number(c[G.fees])||0,
      wa:Number(c[G.wa])||0, date:fmtDate(c[G.date]), src:(c[G.src]||""), ppl:(byCycle[cy]||[]).sort((a,b)=>b[1]-a[1]) };
  }).sort((a,b)=>(b.dep)-(a.dep));
  if(cycles.length) cycles[0].active=true;
  let spoken=0;
  for(const r of staff){ const c=r.fields||{}; const paid=Number(c[F.paid])||0, max=Number(c[F.max])||0, mo=Number(c[F.month])||0;
    if(max>0 && !((paid>=max-1)||mo>12)) spoken+=Math.max(0,max-paid); }
  return { cycles, spoken:Math.round(spoken) };
}

async function buildMessages(){
  const rows=await listAll(T_MSG, [M.coach,M.from,M.text]);
  rows.sort((a,b)=>Date.parse(a.createdTime)-Date.parse(b.createdTime));
  const out={};
  for(const r of rows){ const c=r.fields||{}; const coach=(c[M.coach]||"").trim(); if(!coach) continue;
    const from = sel(c[M.from])==="Director"?"dir":"coach";
    const t = new Date(r.createdTime).toLocaleString('en-US',{weekday:'short',hour:'numeric',minute:'2-digit'});
    (out[coach]=out[coach]||[]).push({from, text:c[M.text]||"", t});
  }
  return out;
}

async function buildEmails(name){
  if(!name) return [];
  const u=new URL(`https://api.airtable.com/v0/${BASE}/${T_EMAIL}`);
  u.searchParams.set("returnFieldsByFieldId","true");
  u.searchParams.set("pageSize","50");
  u.searchParams.set("filterByFormula", `SEARCH("${name.replace(/"/g,"")}", ARRAYJOIN({Staff Members}))`);
  u.searchParams.append("sort[0][field]","Date");
  u.searchParams.append("sort[0][direction]","desc");
  const r=await fetch(u,{headers:H});
  if(!r.ok) throw new Error(`Airtable emails ${r.status}: ${await r.text()}`);
  const j=await r.json();
  return j.records.map(rec=>{ const c=rec.fields||{};
    return { date:c[E.date]||"", subject:c[E.subject]||"", to:c[E.to]||"", cc:c[E.cc]||"", sent: !!c[E.sent] }; });
}

async function buildApprovals(){
  const staff = await listAll(T_STAFF, [F.name,F.country,F.start,F.salary,F.acct,
    A.pref,A.budget,A.email,A.age,A.coach,A.coachEmail,A.uplink,A.uplinkEmail,A.lead,A.leadEmail,A.onbNotes,A.onbDate,A.melLink,A.melAppr,A.dirAppr]);
  return staff.filter(r=>{ const c=r.fields||{};
      return sel(c[A.dirAppr])==="Approved" && sel(c[A.melAppr])!=="Approved"; })
    .map(r=>{ const c=r.fields||{};
      return { id:r.id, n:(c[F.name]||"").trim(), also:"", co:sel(c[F.country])||"",
        age:Number(c[A.age])||"", budget:Number(c[A.budget])||0, salary:Number(c[F.salary])||0,
        cedarstone:(c[F.acct]||"").replace(/[^0-9]/g,""), start:fmtDate(c[F.start]||c[A.pref]), met:fmtDate(c[A.onbDate]),
        email:c[A.email]||"", emailOk:true,
        coach:first1(c[A.coach])||"—", coachEmail:first1(c[A.coachEmail])||"",
        uplink:first1(c[A.uplink])||"—", uplinkEmail:first1(c[A.uplinkEmail])||"",
        lead:first1(c[A.lead])||"—", leadEmail:first1(c[A.leadEmail])||"",
        approve:c[A.melLink]||"", record:`https://airtable.com/${BASE}/${T_STAFF}/${r.id}`,
        overview:(c[A.onbNotes]||"Approved by Dave & Geri — open the full application in Airtable for the meeting notes."),
        notes:[], next:[] };
    });
}

// Per-coach roster of their staff with a trailing-6-week funnel from the weekly MPD updates.
// Metrics only — the app turns them into the plain-language diagnosis (single source of truth).
async function buildCare(){
  const WINDOW_MS = 42*864e5;
  const now = Date.now();
  const [staff, updates] = await Promise.all([
    listAll(T_STAFF, [F.name,F.country,F.cycle,F.funding,F.status,F.month,F.max,F.paid,C.coach,C.weeks,C.pct]),
    listAll(T_UPD, [U.name,U.asks,U.mtgs,U.partners,U.hours,U.coachMtg,U.comments,...FREQ]),
  ]);
  const cohort = staff.filter(r=>{ const c=r.fields||{}; const cy=sel(c[F.cycle]);
    // active fundraisers only: in the current grant cycle (or support-only), still inside the window
    const paid=Number(c[F.paid])||0, max=Number(c[F.max])||0, mo=Number(c[F.month])||0;
    const done = (max>0 && paid>=max-1) || mo>12;
    return (cy==="2025-26" || sel(c[F.funding])==="Support-only") && !done && sel(c[F.status])!=="Finished";
  });
  const byStaff={};
  for(const u of updates){ const c=u.fields||{}; const link=c[U.name]||[]; const sid=link[0]; if(!sid) continue;
    (byStaff[sid]=byStaff[sid]||[]).push({t:Date.parse(u.createdTime)||0, c}); }
  const people = cohort.map(r=>{
    const c=r.fields||{};
    const ups=(byStaff[r.id]||[]).sort((a,b)=>b.t-a.t);
    const win = ups.filter(x=> now-x.t <= WINDOW_MS);
    let asks=0,mtgs=0,yes=0,monthly=0,onetime=0,hours=0,coachMet=0;
    for(const x of win){ const u=x.c;
      asks+=Number(u[U.asks])||0; mtgs+=Number(u[U.mtgs])||0;
      yes+=Number(u[U.partners])||0; hours+=Number(u[U.hours])||0;
      if(sel(u[U.coachMtg])==="Yes") coachMet++;
      for(const f of FREQ){ const v=sel(u[f]); if(!v) continue;
        if(/month/i.test(v)) monthly++; else if(/one/i.test(v)) onetime++; } }
    let note=""; for(const x of ups){ const t=(x.c[U.comments]||"").trim(); if(t){ note=t; break; } }
    const lastT=ups[0]?.t||0, daysSince = lastT? Math.floor((now-lastT)/864e5) : 999;
    let pct=Number(c[C.pct])||0; if(pct>1.5) pct=pct/100;
    return { id:r.id, n:(c[F.name]||"").trim(), co:sel(c[F.country])||"", coach:first1(c[C.coach])||"—",
      mo:Number(c[F.month])||0, wk:Math.round(Number(c[C.weeks])||0), pct:Math.round(pct*100)/100,
      ft:sel(c[F.funding])||"Grant", ps:sel(c[F.status])||"",
      asks, mtgs, yes, monthly, onetime, hours:Math.round(hours), weeks:win.length, coachMet, daysSince, note };
  });
  const coaches={};
  for(const p of people){ (coaches[p.coach]=coaches[p.coach]||[]).push(p); }
  return Object.entries(coaches)
    .map(([coach,list])=>({coach, staff:list.sort((a,b)=>a.n.localeCompare(b.n))}))
    .sort((a,b)=>a.coach.localeCompare(b.coach));
}

export default async (req) => {
  try{
    if(!process.env.AIRTABLE_TOKEN) return json({error:"AIRTABLE_TOKEN not set on the site."},500);
    if(req.method==="GET"){
      const url=new URL(req.url), action=url.searchParams.get("action");
      if(action==="payout") return json({payout: await buildPayout()});
      if(action==="approvals") return json({approvals: await buildApprovals()});
      if(action==="grantfund") return json(await buildGrantFund());
      if(action==="messages") return json({messages: await buildMessages()});
      if(action==="care") return json({care: await buildCare()});
      if(action==="emails") return json({emails: await buildEmails(url.searchParams.get("staff"))});
      if(action==="staff"){ const rows=await listAll(T_STAFF,[F.name]);
        const names=[...new Set(rows.map(r=>((r.fields||{})[F.name]||"").trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
        return json({staff:names}); }
      if(action==="meetings"){ const staff=url.searchParams.get("staff");
        const rows=await listAll(T_MEET,[MT.staff,MT.coach,MT.date,MT.notes]);
        const list=rows.map(r=>r.fields||{}).filter(c=>!staff || (c[MT.staff]||"")===staff)
          .map(c=>({date:c[MT.date]||"", coach:c[MT.coach]||"", notes:c[MT.notes]||""}))
          .sort((a,b)=>Date.parse(b.date||0)-Date.parse(a.date||0));
        return json({meetings:list}); }
      return json({ok:true, hint:"?action=payout|grantfund|messages|emails|staff, or POST {id,funding?,payout?} / {message:{coach,from,text}}"});
    }
    if(req.method==="POST"){
      const b = await req.json();
      // log a coaching meeting
      if(b.meeting){
        const m=b.meeting;
        const r=await fetch(`https://api.airtable.com/v0/${BASE}/${T_MEET}`, { method:"POST", headers:H,
          body: JSON.stringify({records:[{fields:{[MT.staff]:m.staff||"", [MT.coach]:m.coach||"", [MT.date]:m.date||"", [MT.notes]:m.notes||""}}]}) });
        if(!r.ok) return json({error:`Airtable meeting ${r.status}: ${await r.text()}`},502);
        return json({ok:true});
      }
      // append a coach<->director message
      if(b.message){
        const m=b.message;
        const r = await fetch(`https://api.airtable.com/v0/${BASE}/${T_MSG}`, { method:"POST", headers:H,
          body: JSON.stringify({records:[{fields:{[M.coach]:m.coach, [M.from]:(m.from==="dir"?"Director":"Coach"), [M.text]:m.text}}]}) });
        if(!r.ok) return json({error:`Airtable message ${r.status}: ${await r.text()}`},502);
        return json({ok:true});
      }
      // update a staff record's Funding Type / Payout Status / grant cap / approval
      if(!b.id) return json({error:"missing record id"},400);
      const fields={};
      if(b.funding!==undefined) fields[F.funding]=b.funding;
      if(b.payout!==undefined)  fields[F.status]=b.payout;
      if(b.maxpay!==undefined)  fields[F.max]=Number(b.maxpay)||0;
      if(b.approve===true){ fields[A.melAppr]="Approved"; }
      if(!Object.keys(fields).length) return json({error:"nothing to update"},400);
      const r = await fetch(`https://api.airtable.com/v0/${BASE}/${T_STAFF}`, { method:"PATCH", headers:H,
        body: JSON.stringify({returnFieldsByFieldId:true, records:[{id:b.id, fields}]}) });
      if(!r.ok) return json({error:`Airtable PATCH ${r.status}: ${await r.text()}`},502);
      return json({ok:true});
    }
    return json({error:"method not allowed"},405);
  }catch(e){ return json({error:String(e.message||e)},500); }
};
function json(obj,status=200){ return new Response(JSON.stringify(obj), {status, headers:{"Content-Type":"application/json"}}); }
