# Prithvi Realcon portal

Static site (GitHub Pages) + Supabase. Every page loads the shared layer in `assets/`:
`prtpl.css` and `prtpl.js` (loader, page transitions, login/access guard, Ctrl+K search, themes, dark mode, toasts).

## Loading animation (Lottie)
1. On LottieFiles open your animation, then Download -> **Lottie JSON** (or **dotLottie**).
2. Save it as `assets/loader.json` (or `assets/loader.lottie`).
3. Commit. It is detected automatically and shown in the centre of every page load.
   Until the file exists, a branded truck loader is shown instead.

Optional settings (put before the `prtpl.js` tag): `window.PRTPL_CONFIG = { lottie: 'assets/loader.json', idleMinutes: 30 };`

## Inner sheets
Dashboards and entry sheets (pages with `pr-access`) automatically load `assets/prtpl-inner.css/js`:
staggered panel entrance, hover/press feedback, themed scrollbars and focus rings, row hover tint,
a loading shimmer on empty value boxes, and a small site button (bottom-left) for Home and Ctrl+K search.
Each sheet keeps its own party colours.

## Page access
Each page declares what it needs with `<meta name="pr-access" content="amm:HZL">`.
Users without that access are sent back to the home page; signed-out users go to the login page.
This is a front-end gate. Keep Supabase Row Level Security on for real data protection.

## Keyboard
`Ctrl/Cmd + K` or `/` opens quick navigation. `Esc` closes dialogs.
