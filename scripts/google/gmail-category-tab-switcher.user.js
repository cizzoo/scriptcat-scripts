// ==UserScript==
// @name         Gmail Keyboard Cycling (Category Tabs + Message List)
// @namespace    https://github.com/cizzoo/scriptcat-scripts
// @version      0.2.1
// @description  Alt+PageUp/PageDown cycles Gmail's category tabs (Primary/Social/...). Alt+Up/Down moves a visual cursor row-by-row through the message list, without opening or selecting anything. Both no-op where their target isn't present (e.g. inside an open email).
// @author       cizzoo
// @match        https://mail.google.com/mail/*
// @grant        GM_addStyle
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/cizzoo/scriptcat-scripts/main/scripts/gmail/gmail-category-tab-switcher.user.js
// @downloadURL  https://raw.githubusercontent.com/cizzoo/scriptcat-scripts/main/scripts/gmail/gmail-category-tab-switcher.user.js
// ==/UserScript==

/*
 * NOTES - read before editing
 *
 * SELECTOR STRATEGY
 *   Gmail's own class names are short, generated, and reused across unrelated
 *   elements (e.g. "aKu"/"aKz"), so they are not usable as selectors. This
 *   script relies on ARIA tab widget semantics instead:
 *     [role="tablist"]  -> the container for the category tabs
 *     [role="tab"]      -> each individual tab (Primary/Social/Promotions/...)
 *     aria-selected      -> which tab is currently active
 *   Gmail renders this tablist only when category tabs are actually enabled
 *   and visible (inbox view with tabs on). If the user has tabs disabled, or
 *   is inside an open email/thread/other view, this tablist will not be
 *   present and the shortcut correctly no-ops.
 *
 *   IMPORTANT STRUCTURAL DETAIL (confirmed from live markup, 2026):
 *   the tablist is a <tr role="tablist"> inside <table class="aKk">, and each
 *   [role="tab"] lives inside a <td>, i.e. tabs are DESCENDANTS of the
 *   tablist, not direct children. A ':scope > [role="tab"]' query (direct
 *   children only) finds nothing here - must query all descendants. The row
 *   also contains one extra <td role="button"> (the "select tabs to
 *   show/hide" control), which does not carry role="tab" and is naturally
 *   excluded by an ARIA-based query.
 *
 * WHY NOT CLICK THE TAB DIRECTLY
 *   Gmail's tabs are React-controlled. Dispatching a real "click" MouseEvent
 *   on the target [role="tab"] element (rather than calling focus()/select()
 *   style APIs that do not exist here) is what actually triggers Gmail's own
 *   handler and switches the view - this mirrors an actual user click and
 *   needs no knowledge of Gmail's internal event wiring.
 *
 * SCOPE OF THE TABLIST QUERY
 *   There can be more than one [role="tablist"] on a Gmail page in some
 *   layouts (e.g. a settings dialog). We scope the query to the first
 *   tablist that contains role="tab" children with recognizable inbox
 *   category semantics (i.e. more than one tab, all direct/near children).
 *   If Gmail ever nests multiple genuine category tablists this heuristic
 *   would need revisiting, but no such case is known.
 *
 * KEYBOARD SCOPE
 *   Alt+PageUp/PageDown are not used natively by Gmail or by common browsers
 *   for page/tab navigation, so hijacking them is safe. We still only
 *   preventDefault() once we have confirmed a usable tablist exists, so the
 *   key combo falls through to default behaviour on any other Gmail view.
 *
 * SPA NAVIGATION
 *   Gmail is a single-page app that swaps the tablist in and out as the user
 *   navigates categories/threads without a full reload. We do not cache the
 *   tablist reference across keypresses - it is re-queried fresh on every
 *   keydown, which is cheap and immune to stale-node bugs after route swaps.
 *
 * ----------------------------------------------------------------------
 * PART 2 - MESSAGE LIST CURSOR (Alt+Up / Alt+Down)
 * ----------------------------------------------------------------------
 *
 * WHAT THIS DOES AND DOES NOT DO
 *   Moves a purely visual cursor row-by-row through the message list. It
 *   does NOT open the email, does NOT toggle Gmail's own checkbox selection,
 *   and does NOT touch aria-checked/read state. It is a separate, additive
 *   highlight - confirmed scope, do not conflate with Gmail's native j/k
 *   "select conversation" behaviour (which is a different, heavier-weight
 *   state involving Gmail's own toolbar actions).
 *
 * ROW SELECTOR
 *   Each email is a <tr role="row"> inside the message list <tbody>. This is
 *   a stable ARIA/structural marker: role="row" is not used elsewhere in the
 *   thread-list DOM subtree in the confirmed markup (checkboxes, star
 *   toggles etc. use role="checkbox"/"button"/"switch", not "row"). We do
 *   NOT rely on Gmail's own generated classes (e.g. "zA", "zE", "yO") for
 *   selection because those are unstable presentation classes that also
 *   encode read/unread state (zE = unread, yO = read) - useful to know but
 *   not something to build a selector on.
 *
 * WHY WE DRAW OUR OWN HIGHLIGHT INSTEAD OF REUSING GMAIL'S OWN CURSOR STYLE
 *   Gmail has its own internal "keyboard-selected row" concept (used by its
 *   native j/k shortcuts), but there is no confirmed, stable class name for
 *   it in this script's evidence - guessing one risks a silent no-op (the
 *   cursor logic runs fine, nothing visibly happens, and it looks like a
 *   dead feature). Instead we paint our own outline via a dedicated CSS
 *   class added through GM_addStyle, following this repo's style spec
 *   (accent colour, no invented green, etc). This guarantees visible
 *   feedback regardless of Gmail's internal naming.
 *
 * SCROLLING THE CURSOR INTO VIEW
 *   scrollIntoView({ block: "nearest" }) is used rather than "center" so the
 *   list doesn't jump unnecessarily when the row is already visible - this
 *   matters because the message list container is Gmail's own internally
 *   scrolling <div>, not the page body.
 *
 * CURSOR RESET ON NAVIGATION
 *   The cursor is intentionally NOT persisted across list reloads (e.g.
 *   switching category tabs, archiving a message, or Gmail's own periodic
 *   re-render of the thread list). We re-resolve "which row is the cursor
 *   on" by DOM node identity on every keypress; if that node has been
 *   removed from the document (row-list re-rendered), we fall back to
 *   cursor position 0 rather than trying to preserve a "logical" position,
 *   since Gmail's re-renders can reorder/remove rows in ways that make a
 *   remembered index meaningless.
 *
 * WHY Alt+Up/Down HERE BUT Alt+PageUp/PageDown FOR TABS
 *   Deliberately different key combinations for two different scopes so
 *   they are easy to keep separate in muscle memory: PageUp/PageDown reads
 *   as "switch section" (tabs), plain Up/Down as "move within a list"
 *   (messages). Plain Alt+Up/Down is not used natively by Gmail or common
 *   browser chrome, so hijacking it is safe; as with Part 1, preventDefault
 *   only fires once a usable message list row is actually found.
 *
 * v0.2.1 FIX
 *   activateTab()'s MouseEvent constructors previously passed `view:
 *   window`, which threw "Failed to convert value to 'Window'" in this
 *   userscript's execution context (this broke Alt+PageUp/PageDown, the
 *   Part 1 feature - Part 2's Alt+Up/Down was unaffected since it never
 *   dispatches synthetic mouse events). `view` is optional on
 *   MouseEventInit and not required for React to pick up the dispatch, so
 *   it was removed rather than sourcing "the correct" window reference.
 */

(function () {
  "use strict";

  const NS = "sc-gmail-tabs";

  // --- Part 2 styling: our own visual cursor outline for message rows.
  // Uses the repo's accent token (see docs/claude-ai-style-spec.md tokens)
  // rather than an invented colour. Kept minimal: an inset outline so it
  // never shifts row height/layout (a border would add to box size unless
  // box-sizing is guaranteed, and Gmail's own row CSS is not ours to trust).
  try {
    GM_addStyle(`
      tr[role="row"].${NS}-cursor {
        outline: 2px solid #d97757;
        outline-offset: -2px;
      }
    `);
  } catch (err) {
    // If GM_addStyle is unavailable or blocked by CSP, the cursor logic
    // below still runs but produces no visible highlight. Fail quietly
    // rather than throwing into the page console.
  }

  /**
   * Find the Gmail category tablist, if present and usable.
   * Returns null if there is no tab bar to act on (correct no-op case).
   */
  function findCategoryTablist() {
    const candidates = document.querySelectorAll('[role="tablist"]');
    for (const list of candidates) {
      // Tabs are descendants (nested inside <td> cells), not direct children -
      // do not scope this query with ":scope >". role="tab" is specific
      // enough on its own; the row's other control (role="button") is
      // naturally excluded.
      const tabs = list.querySelectorAll('[role="tab"]');
      if (tabs.length >= 2) {
        return { list, tabs: Array.from(tabs) };
      }
    }
    return null;
  }

  function currentIndex(tabs) {
    const idx = tabs.findIndex((t) => t.getAttribute("aria-selected") === "true");
    return idx === -1 ? 0 : idx;
  }

  function activateTab(tab) {
    // Simulate a genuine user click; Gmail's React handlers are bound to
    // real pointer/mouse events, not to focus or programmatic selection.
    // NOTE: `view` is intentionally omitted. Passing `view: window` throws
    // "Failed to convert value to 'Window'" in this userscript execution
    // context (the script's own `window` reference is not recognized as a
    // valid Window object by the MouseEvent constructor here, likely due
    // to ScriptCat's isolated-world execution). `view` is optional per the
    // UIEvent spec and not needed for React's synthetic event system to
    // pick up the dispatch, so omitting it is the correct fix rather than
    // hunting for "the right" window reference to pass.
    tab.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    tab.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
    tab.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  }

  function cycleTab(direction) {
    const found = findCategoryTablist();
    if (!found) return false; // no tab bar visible -> correctly do nothing

    const { tabs } = found;
    const from = currentIndex(tabs);
    const to = (from + direction + tabs.length) % tabs.length;
    if (to === from) return true; // still "handled": bar exists, nothing to switch to

    activateTab(tabs[to]);
    return true;
  }

  // ------------------------------------------------------------------
  // PART 2 - message list cursor
  // ------------------------------------------------------------------

  const CURSOR_CLASS = `${NS}-cursor`;

  /**
   * Find all message rows currently in the DOM, in visual order.
   * Returns [] if there is no message list to act on (e.g. inside an open
   * email/thread view), which is the correct no-op case.
   */
  function findMessageRows() {
    // role="row" is scoped to the message list in the confirmed markup;
    // querySelectorAll already returns nodes in document order, which
    // matches visual top-to-bottom order for this list.
    return Array.from(document.querySelectorAll('tr[role="row"]'));
  }

  /**
   * Locate the row currently carrying our cursor class, if any, and
   * confirm it is still attached to the document (Gmail may have
   * re-rendered the list since we last set it).
   */
  function findCurrentCursorRow(rows) {
    const idx = rows.findIndex((r) => r.classList.contains(CURSOR_CLASS));
    return idx; // -1 if none found/stale
  }

  function setCursor(rows, index) {
    for (const r of rows) r.classList.remove(CURSOR_CLASS);
    const row = rows[index];
    row.classList.add(CURSOR_CLASS);
    // "nearest" avoids re-centering the list when the row is already
    // visible; the list container scrolls internally, not the page.
    row.scrollIntoView({ block: "nearest" });
  }

  function moveCursor(direction) {
    const rows = findMessageRows();
    if (rows.length === 0) return false; // no message list -> correct no-op

    const from = findCurrentCursorRow(rows);
    // No existing cursor (first use, or stale after a re-render): start
    // just off either end so the first press lands on row 0 (Down) or the
    // last row (Up), matching natural list-navigation expectations.
    const base = from === -1 ? (direction === 1 ? -1 : rows.length) : from;
    const to = Math.min(Math.max(base + direction, 0), rows.length - 1);

    setCursor(rows, to);
    return true;
  }

  function onKeyDown(e) {
    if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;

    if (e.key === "PageUp" || e.key === "PageDown") {
      const direction = e.key === "PageUp" ? -1 : 1;
      const handled = cycleTab(direction);
      if (handled) {
        e.preventDefault();
        e.stopPropagation();
      }
      return;
    }

    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      const direction = e.key === "ArrowUp" ? -1 : 1;
      const handled = moveCursor(direction);
      if (handled) {
        e.preventDefault();
        e.stopPropagation();
      }
      return;
    }
  }

  try {
    document.addEventListener("keydown", onKeyDown, true);
  } catch (err) {
    // Fail quietly on a page we do not recognise.
  }
})();