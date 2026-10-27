# Prithvi Realcon Portal

Static portal (GitHub Pages) with a Supabase backend: login, hub pages and performance / dispatch dashboards.

## Structure
| Path | Purpose |
|---|---|
| `index.html` | Login (RPC `app_login`), session notices, return-to-page |
| `home_page.html`, `amm_home.html`, `odr_home.html`, `notices.html` | Hub pages |
| `*_dashboard.html`, `daily_rake_loading.html`, `hzl_odr.html`, `nlod_odr.html` | Data pages |
| `prtpl.js` + `prtpl.css` (now inlined in every page) | Shared layer: auth guard, theme, search palette, dialogs, quick menu, shortcuts, session safeguards |
| `sw.js`, `offline.html` | Offline cache worker and fallback screen |
| `robots.txt`, `manifest.webmanifest` | No-index rules, installable app metadata |

## Protecting a page
Add `<meta name="pr-access" content="KEY">` (empty content = any signed-in user) and keep the inlined `prtpl-js` block in `<head>` (copy it from any existing page).

## Shared API (`window.PRTPL`)
- `await PRTPL.confirm(message, {title, okLabel, cancelLabel, danger})` → boolean
- `await PRTPL.prompt(message, {title, placeholder, value, okLabel})` → string | null
- `PRTPL.notice(title, message)`, `PRTPL.toast(text, {type})`, `PRTPL.shortcuts()`, `PRTPL.signOut()`

## Session rules (config at top of `prtpl.js`)
Idle sign-out 30 min, hard limit 12 h (`maxSessionHours`), re-checked when a tab regains focus.

## Shortcuts
`Ctrl/⌘+K` or `/` search · `?` list · `G` then `H/A/O/N` jump to Home/AMM/ODR/Notices · `Esc` close.

## Motion and productivity
Animations are minimal by default (decorative effects off, short transitions). Switch to full via the palette icon panel, the quick menu or `PRTPL.setMotion('full')`; the OS reduced-motion setting is respected. Ctrl+K also lists recently visited pages first and an *Export table to CSV* action for every table on screen.

## Offline
`sw.js` loads pages network-first and keeps libraries/assets cached. Supabase calls are never cached. Bump `VERSION` in `sw.js` when you want to force a cache reset.

## Known security note
Data-entry pages (Gujarat, HZL, PJPB) compare a plain-text password in page source. Move that check to a Supabase RPC, as login does.
