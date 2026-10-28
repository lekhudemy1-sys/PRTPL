# Changelog

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
