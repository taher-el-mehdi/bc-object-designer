# Changelog

All notable changes to this project will be documented in this file.

---

## [1.1.0] - 2026-02-04

### ✨ Added
- **Progress Bar** - Visual feedback during file upload and processing with percentage display
- **Object Type Support** - Full support for objects without IDs (ControlAddIn, Interface, Profile)
- **Smart Storage Keys** - Type-based composite keys (`table_18`, `interface_myname`) for reliable source retrieval
- **Type Normalization** - Automatic mapping (e.g., EnumType → enum) for consistent storage/retrieval
- **Enhanced Parsing** - Improved AL file parsing with better name extraction for all object types

### 🔧 Fixed
- **Fixed Navbar** - Top bar and banner now stay visible when scrolling through large files
- **Mobile Layout** - Responsive topbar with proper button organization on mobile devices
- **Source Retrieval** - Objects without IDs now correctly retrieve their source code
- **Upload Button** - Renamed "Clear cache" to "Upload application" with proper reset behavior
- **First Visit UX** - Navbar hidden until application is uploaded; auto-restores from cache on reload

### 🛠 Improved
- **IndexedDB Storage** - Enhanced with progress reporting and object metadata
- **Mobile Responsiveness** - Complete mobile-first redesign with flexible layouts
- **Progress Tracking** - Detailed status messages (Reading → Parsing → Storing)
- **Console Logging** - Better debugging information for storage operations

---

## [1.0.0] - 2026-02-02

### 🎉 Initial Release
- Upload and explore Business Central `.app` artifacts locally
- Browse all object types (Tables, Pages, Reports, Codeunits, Queries, etc.)
- View full AL source code with syntax highlighting
- Interactive ER diagram visualization
- RDLC layout visual preview
- Frontend-only processing for privacy and security
