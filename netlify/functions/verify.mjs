// Netlify Function — new-staff email verification for the MPD grant flow.
// Reached at /api/verify (redirect in netlify.toml). The Airtable token stays server-side.
//
//   POST /api/verify  { id }              -> arm verification: write a one-time token + confirm
//                                            link onto the staff record, clear Email Verified.
//                                            Returns { ok, link }. (Airtable then emails the link.)
//   GET  /api/verify?rec=<id>&t=<token>   -> the new staffer opens this from their inbox. If the
//                                            token matches, set Email Verified = true + Verified At,
//                                            clear the token, and show a friendly confirmation page.
//
// Why a click and not just a form field: a form can only check an address *looks* valid. Only a
// real, deliverable inbox that the person controls can open this link — that's the actual proof.

const KEY   = process.env.AIRTABLE_TOKEN || process.env.AIRTABLE_API_KEY || "";
const BASE  = "appZoeYCd8dlQfV7C";
const TABLE = "tblRlieYQq691CpZy";
const F = {
  name:"fldKIVYCUN1dny1dl", email:"fldmbttAOTOAKWA7O",
  verified:"fldfyaLwzSwqm4pM8", verifiedAt:"flddcZ5kfFG4nfPcZ",
  token:"fldig6SdjpymQg1aL", link:"fldfTObVibrzbokcD",
};
const H = { Authorization:`Bearer ${KEY}`, "Content-Type":"application/json" };
const rec = id => `https://api.airtable.com/v0/${BASE}/${TABLE}/${id}`;

function json(o, s=200){ return new Response(JSON.stringify(o), {status:s, headers:{"Content-Type":"application/json"}}); }

// on-brand confirmation page (Modern European palette, self-contained)
function page(title, heading, body, tone="ok"){
  const accent = tone==="ok" ? "#294c60" : "#e85d3f";
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>
  :root{color-scheme:light}
  *{box-sizing:border-box;margin:0}
  body{font-family:'Figtree',system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f4eee2;color:#1e2528;
    min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
  .card{background:#fffdf9;border:1px solid #e7ddc9;border-radius:20px;max-width:460px;width:100%;
    padding:34px 30px;text-align:center;box-shadow:0 14px 40px rgba(30,37,40,.10)}
  .badge{width:56px;height:56px;border-radius:16px;margin:0 auto 18px;display:grid;place-items:center;
    background:linear-gradient(140deg,#294c60,#e85d3f);color:#fff;font-size:26px}
  h1{font-size:21px;font-weight:800;letter-spacing:-.01em;margin-bottom:10px}
  p{font-size:14.5px;line-height:1.6;color:#55606a}
  .accent{color:${accent};font-weight:700}
  .foot{margin-top:22px;font-size:12px;color:#8a9098}
</style></head><body>
  <div class="card"><div class="badge">${tone==="ok"?"✓":"!"}</div>
    <h1>${heading}</h1><div>${body}</div>
    <div class="foot">Josiah Venture · Ministry Partner Development</div>
  </div></body></html>`, { status:200, headers:{"Content-Type":"text/html; charset=utf-8"} });
}

async function getRecord(id){
  const r = await fetch(rec(id)+"?returnFieldsByFieldId=true", {headers:H});
  if(!r.ok) return null;
  return r.json();
}

export default async (req) => {
  try{
    if(!KEY){ console.error("verify: no AIRTABLE_TOKEN"); return json({error:"Verification isn't set up yet."},500); }
    const url = new URL(req.url);
    const origin = url.origin;

    // ---- arm: create the token + link, clear verified ----
    if(req.method === "POST"){
      const b = await req.json().catch(()=>({}));
      const id = (b.id||"").trim();
      if(!id) return json({error:"missing record id"},400);
      const token = (globalThis.crypto?.randomUUID?.() || (Date.now().toString(36)+Math.random().toString(36).slice(2))).replace(/-/g,"");
      const link = `${origin}/api/verify?rec=${encodeURIComponent(id)}&t=${token}`;
      const r = await fetch(rec(id), { method:"PATCH", headers:H,
        body: JSON.stringify({ returnFieldsByFieldId:true, fields:{ [F.token]:token, [F.link]:link, [F.verified]:false } }) });
      if(!r.ok){ console.error("verify arm", r.status, await r.text()); return json({error:"Couldn't arm verification."},502); }
      return json({ ok:true, link });
    }

    // ---- confirm: the staffer opened the link ----
    if(req.method === "GET"){
      const id = url.searchParams.get("rec")||"";
      const token = url.searchParams.get("t")||"";
      if(!id || !token) return page("Link not valid", "This link isn't complete", "Please open the full link from your confirmation email, or ask your MPD director to resend it.", "err");
      const record = await getRecord(id);
      if(!record) return page("Link not valid", "We couldn't find that record", "Please ask your MPD director to resend your confirmation email.", "err");
      const f = record.fields||{};
      const first = (f[F.name]||"").split(/[ &]/)[0] || "there";
      if(f[F.verified] && !f[F.token]) return page("Already confirmed", `You're all set, ${first}`, "Your email is already confirmed — nothing more to do. Your MPD onboarding will begin on schedule.");
      if(!f[F.token] || token !== f[F.token]) return page("Link expired", "This link has expired", "For your security each confirmation link works once. Ask your MPD director to send a fresh one.", "err");
      const r = await fetch(rec(id), { method:"PATCH", headers:H,
        body: JSON.stringify({ fields:{ [F.verified]:true, [F.verifiedAt]:new Date().toISOString(), [F.token]:"" } }) });
      if(!r.ok){ console.error("verify confirm", r.status, await r.text()); return page("Something went wrong", "We hit a snag", "Please try the link again in a moment, or tell your MPD director.", "err"); }
      return page("Email confirmed", `Thank you, ${first} — you're confirmed!`, `We've verified <span class="accent">${(f[F.email]||"your email")}</span>. Your MPD onboarding emails will now come straight to you. Welcome to the journey.`);
    }

    return json({error:"method not allowed"},405);
  }catch(e){ console.error("verify fatal", e); return json({error:"Verification is temporarily unavailable."},500); }
};
