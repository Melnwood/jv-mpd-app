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
    const c = r.cellValuesByFieldId||{}; const cy = sel(c[F.cycle]);
    return cy==="2025-26" || sel(c[F.funding])==="Support-only";
  });
  // all donors grouped by staff record id
  const donors = await listAll(T_DONORS, [D.name,D.amt,D.freq,D.dstatus,D.stafflink]);
  const byStaff = {};
  for(const d of donors){
    const c=d.cellValuesByFieldId||{}; const links=c[D.stafflink]||[];
    for(const sid of links){ (byStaff[sid]=byStaff[sid]||[]).push(c); }
  }
  return cohort.map(r=>{
    const c=r.cellValuesByFieldId||{};
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

export default async (req) => {
  try{
    if(!process.env.AIRTABLE_TOKEN) return json({error:"AIRTABLE_TOKEN not set on the site."},500);
    if(req.method==="GET"){
      const url=new URL(req.url);
      if(url.searchParams.get("action")==="payout") return json({payout: await buildPayout()});
      return json({ok:true, hint:"use ?action=payout, or POST {id, funding?, payout?}"});
    }
    if(req.method==="POST"){
      const b = await req.json();
      if(!b.id) return json({error:"missing record id"},400);
      const fields={};
      if(b.funding!==undefined) fields[F.funding]=b.funding;   // "Grant" | "Support-only"
      if(b.payout!==undefined)  fields[F.status]=b.payout;     // "Active" | "Paused" | "Finished"
      if(!Object.keys(fields).length) return json({error:"nothing to update"},400);
      const r = await fetch(`https://api.airtable.com/v0/${BASE}/${T_STAFF}`, {
        method:"PATCH", headers:H,
        body: JSON.stringify({returnFieldsByFieldId:true, records:[{id:b.id, fields}]})
      });
      if(!r.ok) return json({error:`Airtable PATCH ${r.status}: ${await r.text()}`},502);
      return json({ok:true});
    }
    return json({error:"method not allowed"},405);
  }catch(e){ return json({error:String(e.message||e)},500); }
};
function json(obj,status=200){ return new Response(JSON.stringify(obj), {status, headers:{"Content-Type":"application/json"}}); }
