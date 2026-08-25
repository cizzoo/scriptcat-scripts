// ==UserScript==
// @name         WhatsApp Web - Hide Sidebar
// @namespace    https://github.com/cizzoo/scriptcat-scripts
// @version      0.1.5
// @description  Ctrl+. toggles the chat list sidebar on web.whatsapp.com and lets the conversation pane fill the freed width.
// @author       cizzoo
// @match        https://web.whatsapp.com/*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/cizzoo/scriptcat-scripts/main/scripts/whatsapp/wa-hide-sidebar.user.js
// @downloadURL  https://raw.githubusercontent.com/cizzoo/scriptcat-scripts/main/scripts/whatsapp/wa-hide-sidebar.user.js
// ==/UserScript==

(function () {
  "use strict";

  const NS = "sc-wa-hide-sidebar";
  const STORAGE_KEY = "waHideSidebar.hidden";

  // WhatsApp Web wraps everything in hashed, build-generated class names that change
  // on nearly every release. #main (active conversation column) is an id that has
  // stayed stable across WA Web's redesigns, so it's used directly. #side (the chat
  // list) is also stable, but it turns out #side wraps only the search box + filter
  // tabs + scrollable chat list - the "WhatsApp" title bar (new-chat/menu icons) and
  // the "end-to-end encrypted" footer notice are its SIBLINGS inside a shared parent
  // that has no id or data-testid of its own. Hiding #side alone leaves that header
  // and footer floating in place. So instead we hide #side's *parent*, which covers
  // the whole left column. This is inferred from the current DOM (confirmed against
  // pasted markup on 2026-08-25) rather than a documented WA Web contract, so if a
  // future WA Web build restructures the left column, re-check with devtools.
  const MAIN_SELECTOR = "#main";
  // Confirmed via devtools: the leftover divider line is this dedicated (visually
  // empty - just a wrapper around a blank span) drawer element, a sibling of the
  // left column and #main rather than part of either.
  const DIVIDER_SELECTOR = '[data-testid="drawer-left"]';

  function getLeftColumn() {
    const side = document.querySelector("#side");
    return side ? side.parentElement : null;
  }

  GM_addStyle(`
    .${NS}-hidden {
      display: none !important;
    }
    /* Assumes the left column and #main sit in a flex row where #main already has
       flex-grow: 1, so hiding the left column should make #main fill the row on its
       own. The extra rules below are a defensive fallback in case WA Web's layout
       for the row turns out to be grid- or margin-based instead of flex-based. */
    #main.${NS}-expanded {
      width: 100% !important;
      max-width: 100% !important;
      margin-left: 0 !important;
      flex: 1 1 100% !important;
    }
  `);

  let hidden = !!GM_getValue(STORAGE_KEY, false);

  function apply() {
    // Toggle each side independently. WA Web's "no chat selected" placeholder
    // screen doesn't render #main at all, so requiring both to exist before
    // touching either one meant closing a chat could permanently strand the
    // sidebar's hidden class out of sync with the `hidden` variable - the
    // toggle kept flipping internally but nothing on screen reflected it.
    const leftColumn = getLeftColumn();
    if (leftColumn) {
      leftColumn.classList.toggle(`${NS}-hidden`, hidden);
    }
    const main = document.querySelector(MAIN_SELECTOR);
    if (main) {
      main.classList.toggle(`${NS}-expanded`, hidden);
    }
    const divider = document.querySelector(DIVIDER_SELECTOR);
    if (divider) {
      divider.classList.toggle(`${NS}-hidden`, hidden);
    }
  }

  function toggle() {
    hidden = !hidden;
    GM_setValue(STORAGE_KEY, hidden);
    apply();
  }

  function onKeydown(e) {
    if (e.repeat) return;
    // Plain Ctrl+. only - excluding Shift/Alt/Meta keeps this from firing on
    // Ctrl+Shift+. or other combos that happen to share the base key.
    if (e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey && e.key === ".") {
      e.preventDefault();
      e.stopPropagation();
      toggle();
    }
  }

  // Capture phase so this runs before WA Web's own composer/keyboard-shortcut
  // handlers get a chance to see (and possibly swallow) the event.
  document.addEventListener("keydown", onKeydown, true);

  // WA Web mounts its React tree asynchronously, so #side/#main won't exist yet at
  // document-idle on a fresh load. Debounce so bursts of message/typing-indicator
  // mutations (constant on this page) don't re-run apply() hundreds of times a
  // second - 150ms is imperceptible for a layout toggle.
  let debounceTimer = null;
  function scheduleApply() {
    if (debounceTimer) return;
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      apply();
    }, 150);
  }

  const observer = new MutationObserver(scheduleApply);
  observer.observe(document.body, { childList: true, subtree: true });

  apply(); // covers the case where #side/#main already exist when this runs
})();