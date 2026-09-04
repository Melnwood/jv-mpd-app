// Netlify Function — Sandbox build-notes (Workbench table in the dedicated "MPD App — Build Notes" base).
// Reached at /api/notes (redirect in netlify.toml). The Airtable token stays server-side.
//
//   GET    /api/notes                                             -> all notes, newest first
//   POST   /api/notes  {note,who,screen,context,localId,shots[]}  -> create note + upload screenshots
//   PATCH  /api/notes  {id, state?, fix?, note?}                  -> update (tick done / write Fix / edit)
//   DELETE /api/notes  {id}                                       -> delete
//
// Env (all optional except the token):
//   AIRTABLE_API_KEY   — a token with access to the Build Notes base. If unset, falls back to
//                        AIRTABLE_TOKEN (the app token) — reuse it, but add this base to its access.
//   AIRTABLE_BASE_ID   — defaults to the base Claude created (below).
//   AIRTABLE_NOTES_TABLE — defaults to "Workbench".
//
// The base + table default in code, so the ONLY thing that must be true is that the token can
// read/write the Build Notes base. Diagnostics go to the server log, never to the tester.

const KEY  = process.env.AIRTABLE_API_KEY || process.env.AIRTABLE_TOKEN || "";
const BASE = process.env.AIRTABLE_BASE_ID || "appn2GPO2ffnBM9of";
const TABLE = process.env.AIRTABLE_NOTES_TABLE || "Workbench";
const SHOTS_FIELD = "fldJqjTGGk8rNv96o"; // Screenshots — the upload endpoint needs the field id
const H = { Authorization:`Bearer ${KEY}`, "Content-Type":"application/json" };
const api = `https://api.airtable.com/v0/${BASE}/${encodeURIComponent(TABLE)}`;

function json(o, s=200){ return new Response(JSON.stringify(o), {status:s, headers:{"Content-Type":"application/json"}}); }
const clean = v => (v==null ? "" : String(v));

async function listNotes(){
  const u = new URL(api);
  u.searchParams.set("pageSize","100");
  u.searchParams.append("sort[0][field]","LoggedAt");
  u.searchParams.append("sort[0][direction]","desc");
  let out=[], offset;
  do{
    if(offset) u.searchParams.set("offset", offset);
    const r = await fetch(u, {headers:H});
    if(!r.ok){ console.error("notes list", r.status, await r.text()); throw new Error("list "+r.status); }
    const j = await r.json();
    out = out.concat(j.records); offset = j.offset;
  } while(offset);
  return out.map(rec=>{ const f=rec.fields||{};
    return { id:rec.id, note:f.Note||"", who:f.Who||"", screen:f.Screen||"", state:f.State||"open",
      loggedAt:f.LoggedAt||rec.createdTime, fix:f.Fix||"", context:f.Context||"", localId:f.LocalId||"",
      shots:(f.Screenshots||[]).map(a=>a.url) };
  });
}

// Attachment upload needs the record to exist first (see README Traps). base64 straight to Airtable's
// content endpoint — no external hosting. A failed upload must NOT lose the note.
async function uploadShot(recId, shot){
  try{
    const url = `https://content.airtable.com/v0/${BASE}/${recId}/${SHOTS_FIELD}/uploadAttachment`;
    const r = await fetch(url, { method:"POST", headers:H,
      body: JSON.stringify({ contentType: shot.type||"image/jpeg", file: shot.data, filename: shot.name||"screenshot.jpg" }) });
    if(!r.ok){ console.error("notes upload", r.status, await r.text()); return false; }
    return true;
  }catch(e){ console.error("notes upload threw", e); return false; }
}

export default async (req) => {
  try{
    if(!KEY){ console.error("notes: no AIRTABLE_API_KEY / AIRTABLE_TOKEN set"); return json({error:"Notes aren't set up yet."}, 500); }
    const m = req.method;
    if(m==="GET") return json({notes: await listNotes()});

    const body = await req.json().catch(()=>({}));

    if(m==="POST"){
      const note = clean(body.note).trim();
      if(!note) return json({error:"Nothing to save."}, 400);
      const fields = {
        Note: note,
        Who: clean(body.who) || "Unknown",
        Screen: clean(body.screen) || "Somewhere",
        State: "open",
        LoggedAt: new Date().toISOString(),
        Context: clean(body.context),
        LocalId: clean(body.localId),
      };
      const r = await fetch(api, {method:"POST", headers:H, body:JSON.stringify({records:[{fields}]})});
      if(!r.ok){ console.error("notes create", r.status, await r.text()); return json({error:"Could not save your note."}, 502); }
      const rec = (await r.json()).records[0];
      // upload screenshots against the saved row — the text is already safe
      const shots = Array.isArray(body.shots) ? body.shots.slice(0,6) : [];
      let uploaded=0, failed=0;
      for(const s of shots){ if(s && s.data && await uploadShot(rec.id, s)) uploaded++; else failed++; }
      let urls=[];
      if(uploaded){ // attachment URLs are signed + short-lived — re-read, never cache
        const rr = await fetch(`${api}/${rec.id}`, {headers:H});
        if(rr.ok){ const f=(await rr.json()).fields||{}; urls=(f.Screenshots||[]).map(a=>a.url); }
      }
      return json({ok:true, id:rec.id, shots:urls, uploaded, failed});
    }

    if(m==="PATCH"){
      const id = clean(body.id); if(!id) return json({error:"missing id"}, 400);
      const fields = {};
      if(body.state !== undefined) fields.State = clean(body.state);
      if(body.fix   !== undefined) fields.Fix   = clean(body.fix);
      if(body.note  !== undefined) fields.Note  = clean(body.note);
      if(!Object.keys(fields).length) return json({error:"nothing to update"}, 400);
      const r = await fetch(api, {method:"PATCH", headers:H, body:JSON.stringify({records:[{id, fields}]})});
      if(!r.ok){ console.error("notes patch", r.status, await r.text()); return json({error:"Could not update."}, 502); }
      return json({ok:true});
    }

    if(m==="DELETE"){
      const id = clean(body.id) || new URL(req.url).searchParams.get("id");
      if(!id) return json({error:"missing id"}, 400);
      const r = await fetch(`${api}/${id}`, {method:"DELETE", headers:H});
      if(!r.ok){ console.error("notes delete", r.status, await r.text()); return json({error:"Could not delete."}, 502); }
      return json({ok:true});
    }
    return json({error:"method not allowed"}, 405);
  }catch(e){ console.error("notes fatal", e); return json({error:"Notes are temporarily unavailable."}, 500); }
};
