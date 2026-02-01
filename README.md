# BC Object Designer (Browser)

Fast, privacy-friendly object explorer for Microsoft Dynamics 365 Business Central.  
Load a `.app` symbol package directly in your browser to browse Tables, Pages, Reports, Codeunits, Enums, Queries, XmlPorts, Extensions, and more.   
No backend — your files never leave your device.

# [Live Demo in github pages](https://taher-el-mehdi.github.io/bc-object-designer/)
[![Live Demo](assets/demo.svg)](https://taher-el-mehdi.github.io/bc-object-designer/)

## Highlights
- **Zero install:** Open `index.html` in any modern browser (Chrome, Edge, Firefox). Works offline.
- **Drag & drop upload:** Drop a `.app` (or click Select) to parse `SymbolReferences.json`.
- **Rich navigation:** Sidebar types with counts; sortable object list; one-click code viewer.
- **Smart search:** Global search by name, type, ID substring, and ranges (e.g., `50000..50100`).
- **RDLC preview:** Visual renderer for `.rdl/.rdlc` layouts with zoom and fit.
- **ER diagram:** Quick, interactive overview of table relationships (zoom, pan, drag).
- **App info modal:** Name, Publisher, Version, Runtime, App ID, Symbol count.
- **Copy helpers:** Copy source and copy app metadata JSON to clipboard.
- **Cache & restore:** Saves last parsed state in IndexedDB; restore on reload.
- **Accessibility & keyboard:** Sidebar toggle, search shortcuts, and fullscreen diagrams/layout.

## Quick Start
1. Open `index.html` in a modern browser.
2. Drag & drop your Business Central `.app` package (or click “Select .app file”).
3. Pick an object type from the sidebar; click any row to view its source/outline.
4. Use the search box to filter globally by name, type, or ID.
5. For Reports, click “View Layout” to preview RDLC/Word layout; for Tables, use “View ER Diagram”.

## Features
- **Supported types:**
	- `Table`, `TableExtension`, `Page`, `PageExtension`, `Report`, `ReportExtension`, `Query`, `XmlPort`, `Codeunit`, `ControlAddIn`, `Enum`, `EnumType`, `EnumExtension`, `Interface`, `PermissionSet`, `PermissionSetExtension`, `Profile`, `PageCustomization`, `Entitlement`, `DotNetPackage`.
- **Object list:**
	- Sorted by numeric ID (IDs without numbers go last). Click to open details.
	- Table view headers switch automatically for search results (Type/ID/Name).
- **Code viewer:**
	- Line-numbered rendering with lightweight AL syntax highlighting. Copy to clipboard.
	- If real source is present in the `.app` (requires `ShowMyCode=true`), it’s displayed; otherwise a pseudo-AL outline is generated.
- **Global search:**
	- Name/type contains: `customer`, `page`, etc.
	- ID substring: `501` matches `50100`, `25010`, …
- **Report layouts:**
	- RDLC visual preview (zoom in/out, fit). Raw XML view toggle for RDLC/XML.
	- Word `.docx` shows as binary notice; XML fallback when available.
- **ER diagrams:**
	- Global diagram across tables; interactive SVG with zoom, pan, and entity drag.
	- Displays PK/FlowField and foreign key relations parsed from `TableRelation`.
- **App settings modal:**
	- View Name, Publisher, Version, Runtime Version, App ID, Filename, Symbol count.
	- Copy app info JSON in one click.
- **Persistence:**
	- Saves last state (filename, basic info, parsed objects) using IndexedDB.
	- “Clear cache” removes saved state.

## How It Works
- **Parsing:** `parser.js` reads `SymbolReferences.json` from `.app/.zip` via `JSZip`, normalizes object structures, and merges `TableExtension` fields/keys back into base tables.
- **Trees:** `symbolstreecontrol.js` renders a generic, keyboard-friendly tree control (used across views). `alsymbolkind.js` maps object kinds to iconography.
- **Code:** `highlightAL.js` provides a lightweight syntax highlighter; `alsyntax.js` emits pseudo-AL when source is unavailable.
- **Layouts:** `layoutViewer.js` locates RDLC/Word layout files within the package and shows visual or XML previews; `previewRDL.js` renders a simplified RDLC layout.
- **ER diagrams:** `er-diagram.js` builds an interactive SVG diagram from table relations.
- **State:** `storage.js` persists last parsed state using IndexedDB.

## Privacy & Limits
- **Privacy-first:** All parsing and rendering happens in the browser. No data is uploaded.

## Development
- Open the folder in VS Code and serve `index.html` with a static server, or just double-click it.
- The app uses `JSZip`, `Split.js`, and a small amount of jQuery for DOM interactions.
- Main entry is `js/app.js`; UI structure is in `index.html`; styles in `css/`.