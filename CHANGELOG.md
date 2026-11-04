# Changelog

## [3.0.1] — 2026-11-04

### Added
- Data assistant: type **need backup** to download every table of the three databases (jz, pc, lf) as one zip. The zip has a folder per area (coal india, odr hzl, odr nalco, amm hzl, amm gujarat, amm pjpb, amm daily loading, ksk, other), one CSV per table, a `manifest.csv` with row counts checked against the server, and a `README.txt`.

### Changed
- Service worker cache bumped to `prtpl-v2.4` so the new assistant code reaches browsers.

## [3.0.0] — 2026-10-27

### Added
- Proper asset pipeline: `assets/css/prtpl.css`, `assets/js/prtpl.js`, `assets/img/`
- Completely rewritten Service Worker (`prtpl-v3.0`) with cache-first assets + network-first HTML
- Enhanced web app manifest with more shortcuts and better metadata
- This changelog

### Changed
- **Breaking (internal)**: All pages that previously inlined ~1100 lines of shared CSS+JS now load external files
- Page sizes reduced dramatically (e.g. `index.html` 1522 → ~400 lines)
- Loader timings made snappier
- Session stale refresh window tightened to 8 minutes
- Version bumped across the board to 3.0

### Fixed
- Maintenance burden of copy-pasting the entire shared layer into every HTML file
- Icon and image paths updated for new structure
- Service worker now correctly prioritizes own static assets for instant loads

### Security
- Re-emphasized that data-entry password checks must be moved to Supabase RPCs

---

## [2.x] — previous

Original monolithic single-file architecture with inlined shared layer.
