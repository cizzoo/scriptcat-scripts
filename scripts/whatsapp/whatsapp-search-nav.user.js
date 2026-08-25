// ==UserScript==
// @name         WhatsApp Web — Search Shortcut & Chat List Arrow Navigation
// @namespace    https://github.com/cizzoo/scriptcat-scripts
// @version      0.2.0
// @description  Alt+/ focuses the chat search box. In the search box, Up/Down highlights chats in the list, Enter opens the highlighted chat, Esc clears the highlight and, if there's text, empties the search box.
// @author       cizzoo
// @match        https://web.whatsapp.com/*
// @grant        GM_addStyle
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/cizzoo/scriptcat-scripts/main/scripts/whatsapp/whatsapp-search-nav.user.js
// @downloadURL  https://raw.githubusercontent.com/cizzoo/scriptcat-scripts/main/scripts/whatsapp/whatsapp-search-nav.user.js
// ==/UserScript==

(function () {
  "use strict";

  /*
   * Selector notes (verified against live DOM, WA Web is a React SPA with
   * hashed/rotating utility classes — none of those are relied on below):
   *
   * - SEARCH_INPUT_SELECTOR: the chat-list search box is a real
   *   <input type="text" role="textbox">. The compose box is a contenteditable
   *   <div>, not an <input>, so "the text input with role=textbox" is a safe,
   *   class-free anchor. Its `id` (e.g. "_r_9_") is a React-generated per-render
   *   id — never rely on it. Its aria-label is locale text (Italian in the
   *   sample: "Cerca o avvia una nuova chat") — never match on that string, it
   *   changes with the user's WhatsApp language setting.
   *
   * - ROW_TESTID_SELECTOR: each chat row wraps a
   *   `[data-testid="cell-frame-container"]` inside a focusable
   *   `div[tabindex="0"]` that carries `aria-selected`. The testid has held
   *   across WA Web releases; tabindex/aria-selected are semantic attributes,
   *   not styling classes, so they're a safer anchor too.
   *
   * - The chat list is virtualized (rows come and go from the DOM as you
   *   scroll), so rows are re-queried on every keypress rather than cached.
   *
   * If WA Web changes and this breaks: re-inspect the search input and a
   * chat row, and diff against the notes above.
   */
  const SEARCH_INPUT_SELECTOR = 'input[type="text"][role="textbox"]';
  const ROW_TESTID_SELECTOR = '[data-testid="cell-frame-container"]';
  const NS = "sc-wa-search-nav";

  GM_addStyle(`
    .${NS}-highlight {
      outline: 2px solid #00a884;
      outline-offset: -2px;
      border-radius: 6px;
    }
  `);

  function getSearchInput() {
    return document.querySelector(SEARCH_INPUT_SELECTOR);
  }

  // The search box is a React-controlled input: writing to `.value` directly
  // updates the DOM but not React's internal state, so WA Web's own filtered
  // chat list wouldn't notice. The native setter + a real "input" event is
  // the standard way to make a React-controlled input notice an external
  // value change.
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value"
  ).set;

  function setInputValue(input, value) {
    nativeInputValueSetter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  // The row's own focusable wrapper is the click/highlight target, not the
  // inner cell-frame-container div.
  function rowWrapperOf(cell) {
    return cell.closest('[tabindex="0"]') || cell.parentElement;
  }

  // Currently rendered, visible chat rows, top to bottom. offsetParent !== null
  // filters out anything hidden (e.g. a stale node behind a modal), not
  // off-screen-but-scrolled rows, which still have layout.
  function getRows() {
    return Array.from(document.querySelectorAll(ROW_TESTID_SELECTOR))
      .filter((el) => el.offsetParent !== null)
      .map(rowWrapperOf);
  }

  let highlightedIndex = null;
  let highlightedEl = null;

  function clearHighlight() {
    if (highlightedEl) highlightedEl.classList.remove(`${NS}-highlight`);
    highlightedEl = null;
    highlightedIndex = null;
  }

  function setHighlight(rows, index) {
    if (highlightedEl) highlightedEl.classList.remove(`${NS}-highlight`);
    highlightedIndex = index;
    highlightedEl = rows[index] || null;
    if (highlightedEl) {
      highlightedEl.classList.add(`${NS}-highlight`);
      highlightedEl.scrollIntoView({ block: "nearest" });
    }
  }

  // --- Alt+/ : jump focus to the search box -------------------------------
  // e.code (physical key position) is used instead of e.key so this still
  // fires on keyboard layouts where Alt+/ would otherwise produce a different
  // character.
  document.addEventListener("keydown", (e) => {
    if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.code === "Slash") {
      const input = getSearchInput();
      if (!input) return; // fail quietly; sidebar not mounted yet
      e.preventDefault();
      input.focus();
      input.select();
    }
  });

  // --- Up/Down/Enter/Esc : highlight & open, scoped to the search box -----
  // The listener is attached to the input itself (not document-wide) on
  // purpose: arrow keys stay untouched everywhere else on the page, including
  // cursor movement inside the message compose box.
  function attachRowNav(input) {
    input.addEventListener("keydown", (e) => {
      if (!["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(e.key)) return;

      if (e.key === "Escape") {
        clearHighlight();
        if (input.value.length > 0) {
          e.preventDefault();
          setInputValue(input, "");
        }
        return;
      }

      const rows = getRows();
      if (rows.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = highlightedIndex === null ? 0 : Math.min(highlightedIndex + 1, rows.length - 1);
        setHighlight(rows, next);
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        const prev = highlightedIndex === null ? rows.length - 1 : Math.max(highlightedIndex - 1, 0);
        setHighlight(rows, prev);
        return;
      }

      if (e.key === "Enter" && highlightedIndex !== null && rows[highlightedIndex]) {
        e.preventDefault();
        rows[highlightedIndex].click();
        clearHighlight();
      }
    });

    // Further typing changes the filtered list; the old highlight target may
    // no longer correspond to a visible row, so drop it rather than leave it
    // pointing at something stale.
    input.addEventListener("input", clearHighlight);
  }

  // The sidebar (and the search input inside it) can remount on route
  // changes. A MutationObserver on document.body would fire constantly given
  // how mutation-heavy the chat UI is (messages, timestamps, typing
  // indicators), so a cheap periodic check is used instead of watching every
  // DOM change.
  function ensureAttached() {
    const input = getSearchInput();
    if (input && !input.dataset[NS]) {
      input.dataset[NS] = "1";
      attachRowNav(input);
    }
  }

  ensureAttached();
  setInterval(ensureAttached, 1500);
})();