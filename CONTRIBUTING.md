# Contributing to BC Object Designer

Thanks for your interest in improving the project! This guide helps you set up a smooth workflow and contribute high‑quality changes.

## Code Style
- Use ES modules with explicit exports. Keep modules focused:
  - `js/app.js` UI orchestration; event wiring and rendering.
  - `js/parser.js` data loading and normalization.
  - `js/storage.js` IndexedDB persistence.
  - `js/alsyntax.js` pseudo‑AL fallback rendering.
  - `js/highlightAL.js` lightweight tokenizer for highlighting.
- Prefer JSDoc on public functions and data shapes.
- Keep functions short and readable; avoid global state beyond the central `state` in `app.js`.
- Follow existing CSS variables and token classes; preserve dark/light compatibility.

## Project Structure
- `index.html` – App shell and layout, loads ES module entry.
- `css/app.css` – Theme, layout, code viewer, and token colors for light/dark modes.
- `css/symbolstreecontrol.css` – Legacy styling kept for compatibility.
- `js/app.js` – Main UI logic: rendering, events, persistence, code viewer.
- `js/parser.js` – Reads `.app`, parses `SymbolReference.json`, attaches `.al` sources.
- `js/storage.js` – IndexedDB persistence (save/restore/clear last session).
- `js/alsyntax.js` – Pseudo‑AL generator used when source is missing.
- `js/highlightAL.js` – Lightweight AL tokenizer used by the code viewer.
- `js/alsymbolkind.js` – AL symbol kind mapping (ES module).
- `js/compileFilter.js` – Compile filter utility (ES module).
- `js/symbolstreecontrol.js` – Legacy tree control module (not used by the new UI).

## Development
- Open with a static server (see Quick Start). Edit files and refresh.
- No build step; dependencies are loaded via CDN (`JSZip`).
- Preferred style:
  - ES modules with clear, single‑purpose exports.
  - JSDoc for functions and public APIs.
  - Keep UI and logic modular; avoid large frameworks.
  - Maintain accessibility, keyboard support, and light/dark compatibility.
  - Keep changes minimal and focused; avoid unrelated refactors in PRs.
Thanks for your interest in improving BC object designer! This guide helps you get productive quickly and keeps the codebase consistent.