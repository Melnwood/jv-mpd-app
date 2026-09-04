# Ministry Partner Development App (Josiah Venture)

Internal tool for the JV Ministry Partner Development (MPD) grant program — one place for staff, coaches, uplinks, country leaders, and the MPD directors.

## What's here
Single-file app in `index.html` (HTML/CSS/JS, no build step). Roles:
- **My desk (Mel)** — approvals, monthly payout, grant fund
- **Staff / Coach / Uplink / Country Leader** — their own views
- **MPD Director** — who to reach, coaches, monthly payout, grant fund

Restricted (director) tools: monthly payout worksheet (grant + coach-confirmed monthly match), grant fund with **Sola CSV upload**, coaches view with direct message line, and per-staff **Pause / Finished / Support-only** controls. Support-only staff draw no grant money. Staff past month 12 auto-leave the active payout window.

Data currently reflects a snapshot of the "20/12 2024-25" Airtable base (`appZoeYCd8dlQfV7C`), incl. the new **Funding Type** and **Payout Status** fields.

## Deploy
Static site — Netlify publishes the repo root (see `netlify.toml`). Access is gated by **Netlify team SSO** (JV team members log in with their own accounts). Configure under Site settings → Access control.

## Next
Wire live read/write to Airtable (Funding Type, Payout Status, payout figures) via a small backend / Netlify functions so the app is fully live and two-way.
