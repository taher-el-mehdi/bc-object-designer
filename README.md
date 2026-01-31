# BC Object Designer

A fast, zero-backend web tool to explore Microsoft Dynamics 365 Business Central `.app` packages: browse objects by type, inspect metadata, and view real AL source when available (with syntax highlighting and line numbers). Sessions persist locally via IndexedDB so you can pick up where you left off.

## Features
- Objects by type: Sidebar groups (Tables, Pages, Reports, Codeunits, Enums, …) with counts.
- Object list + details: Select a type to see objects and open one to view its source.
- Real AL source: Extracts `.al` files from the `.app` zip when available; smart mapping using `ReferenceSourceFileName`.
- Pseudo‑AL fallback: Shows a readable outline when source is not included (ShowMyCode disabled).
- Code viewer: Line numbers, sticky header, copy-to-clipboard, and resizable split.
- Syntax highlighting: Lightweight AL tokenizer (comments, directives, attributes, keywords, types, numbers, strings). Single quotes and double quotes use distinct colors.
- Persistence: Saves and auto-restores the last loaded app and UI selections using IndexedDB.
- App info: Clean badges and a "Copy App Info JSON" button with success feedback.
- Modern UI: Sticky sidebar and top bar, keyboard-friendly navigation, light/dark theme aware.


## Contributing
Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) to get started.

## License
This project is licensed under the MIT License — see [LICENSE](LICENSE).