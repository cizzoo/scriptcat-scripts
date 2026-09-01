# ScriptCat Scripts Directory

This directory contains a collection of userscripts organized by target service or application. Each script enhances the user experience with keyboard shortcuts, UI improvements, and productivity features.

---

## Script Overview

### Claude Scripts (`/claude/`)

#### claude-project-switcher.user.js
- **Purpose**: Provides a fast project switcher for Claude.ai
- **What it does**: 
  - Press Ctrl+Shift+P to open a searchable overlay
  - Search for Claude projects by name
  - Navigate with arrow keys and select with Enter
  - Jump directly to any project in the same tab
- **Key features**:
  - Uses Claude's internal projects API
  - Caches project list for quick access
  - Keyboard-driven interface mimics IDE-style project switchers

#### claude-usage-widget.user.js
- **Purpose**: Monitor Claude API usage in real-time
- **What it does**:
  - Displays a floating widget showing daily (5-hour window) and weekly (7-day) usage percentages
  - Shows usage bars with color-coded warnings (orange at 70%, red at 90%)
  - Displays the Daily reset time and current model tier
  - Two independent toggle states:
    - Collapse (header click): Shrinks the panel in place and hides the weekly block
    - Dock (side tab click): Slides the panel off-screen, leaving only a 14px tab visible
- **Key features**:
  - Polls API every 5 minutes for fresh data
  - Persists collapse and dock state across reloads
  - Hides automatically when dialogs are open
  - Responsive: hidden on mobile (viewport width < 768px)

#### claude-context-folders.user.js
- **Purpose**: Organize project knowledge and context files with visual folders
- **What it does**: 
  - Adds folder-based organization to the Claude project knowledge grid
  - Assign files to colored folders for better visual grouping
  - Collapse/expand folders to reduce clutter
  - Rename, reorder, and delete folders
  - Copy and paste folder layouts to sync across devices
- **Key features**:
  - Color-coded folder stripes (6 color palette: Orchid, Rose, Amber, Sand, Moss, Fern)
  - Visual-only organization (Claude's actual retrieval is unaffected)
  - Double-click folder names to rename
  - Keyboard-accessible controls hidden until hover
  - Marks duplicate filenames with a "dup" badge
  - Stores layout in local ScriptCat storage (device-local, not synced to server)
  - Large script (48KB+) with comprehensive folder management

---

### Google Scripts (`/google/`)

#### google-account-switcher.user.js
- **Purpose**: Switch between Google accounts without opening a new tab
- **What it does**:
  - Press Ctrl+Alt+[1-9] to switch to a specific Google account
  - Works across all Google services: Gmail, Drive, Docs, Sheets, Slides, Calendar, Contacts, Keep, Photos, Meet, Chat, Groups, My Account
  - Different URL styles handled automatically (path-based for Mail/Drive, query-based for others)
- **Key features**:
  - Keyboard layout-independent (uses physical key positions)
  - No page reload needed; switches in the same tab
  - Supports up to 9 accounts (Ctrl+Alt+1 through Ctrl+Alt+9)
  - Runs at document-start for early interception

---

### WhatsApp Scripts (`/whatsapp/`)

#### wa-hide-sidebar.user.js
- **Purpose**: Toggle the chat list sidebar to maximize conversation space
- **What it does**:
  - Press Ctrl+. (Ctrl+period) to hide/show the chat sidebar
  - The conversation pane expands to fill the freed width
  - Toggle state persists across page reloads
- **Key features**:
  - Uses stable DOM selectors (#side, #main) that survive WA Web redesigns
  - Handles layout transitions smoothly
  - Debounces DOM mutations to avoid excessive layout recalculations
  - Independent application of visibility on left column, main pane, and divider

#### whatsapp-chat-search.user.js
- **Purpose**: Enhance chat search workflow on WhatsApp Web
- **What it does**:
  - Press Ctrl+F to open WhatsApp's in-chat search instead of the browser's find bar
  - Press Ctrl+F again while search is open to close it
  - Blocks the browser's native find dialog from appearing
- **Key features**:
  - Captures the keydown event early to intercept before browser handling
  - Supports multiple languages via fallback label matching

#### whatsapp-quick-chat-switch.user.js
- **Purpose**: Jump to a specific chat with a single key combination
- **What it does**:
  - Hold right Alt key and press 1-9 to jump to the Nth visible chat in the list
  - Example: AltRight+3 opens the 3rd chat in the sidebar (top to bottom)
  - Left Alt does not trigger the shortcut
- **Key features**:
  - Works with WhatsApp's virtualized chat list (only visible rows rendered)
  - Respects keyboard layout distinctions (right Alt only, not left Alt)
  - Defensive event handling: resets if focus is lost while Alt is held
  - No editable-field guard (works even while typing in message box)

#### whatsapp-search-nav.user.js
- **Purpose**: Navigate the chat list using keyboard shortcuts
- **What it does**:
  - Press Alt+/ to focus the chat search box
  - In the search box:
    - Up/Down arrow keys: Highlight chats in the filtered list
    - Enter: Open the highlighted chat
    - Esc: Clear the highlight; if there's search text, also clear it
  - Uses an outline highlight (green) to show the selected chat
- **Key features**:
  - Interacts only with the search input (arrow keys don't affect other page elements)
  - Virtualized list support: rows are queried fresh on every keypress
  - Auto-scroll to keep highlighted chat visible

---

### Example Script (`/example/`)

#### example-ui-tweaks.user.js
- **Purpose**: Template and reference implementation for userscript patterns
- **What it does**:
  - Demonstrates CSS injection to hide elements
  - Shows how to add a floating shortcut button
  - Example of toggling persisted state on button click
  - Handles SPA re-renders with MutationObserver
- **Key features**:
  - Well-commented for learning
  - Uses best practices: CSS over DOM removal, defensive existence checks, event-driven state management
  - Suitable as a starting point for new scripts
  - Includes common patterns like debouncing and state persistence

---

## Common Patterns and Notes

### Data Persistence
All scripts that need to remember state use ScriptCat's GM_setValue and GM_getValue:
- Local storage: Data stays on the device unless ScriptCat's cloud sync is enabled
- Examples: Sidebar visibility, collapse state, cached project lists, org IDs

### Keyboard Shortcuts
Scripts use various modifier combinations:
- Ctrl+Shift+P: Claude project switcher
- Ctrl+Alt+[1-9]: Google account switcher
- Ctrl+.: WhatsApp sidebar toggle
- Ctrl+F: WhatsApp search (intercepted)
- Alt+/: WhatsApp search box focus
- AltRight+[1-9]: WhatsApp chat quick switch
- Arrow keys: Navigation (context-dependent)

## Stability Notes

Claude scripts: Rely on internal, undocumented APIs. May break if Anthropic changes their endpoint structure. Every fetch is wrapped defensively (fails silently rather than throwing). If a script stops working, check the DevTools Network tab on the target page to see if the API response format has changed.

WhatsApp scripts: Use stable DOM anchors (IDs, data-testid, semantic attributes) that have survived redesigns. Periodically verify selectors if behavior changes. The chat list is virtualized, so scripts query the DOM fresh on each interaction rather than caching references.

Google scripts: Most robust because they rely on well-documented URL patterns and standard button clicks. Changes to Google's domain structure (unlikely) would be the main breaking point.

---

## Updates

All scripts include @updateURL and @downloadURL pointing to their raw GitHub URLs. ScriptCat will automatically check for updates and prompt installation when new versions are available.
