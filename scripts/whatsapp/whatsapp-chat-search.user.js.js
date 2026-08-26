// ==UserScript==
// @name         WhatsApp Web - Chat Search
// @namespace    https://github.com/cizzoo/scriptcat-scripts
// @version      0.4.0
// @description  Intercepts Ctrl+F on web.whatsapp.com and triggers WhatsApp's own in-chat search instead of the browser's native find bar. Pressing Ctrl+F again while search is open closes it.
// @author       cizzoo
// @match        https://web.whatsapp.com/*
// @grant        none
// @run-at       document-start
// @updateURL    https://raw.githubusercontent.com/cizzoo/scriptcat-scripts/main/scripts/whatsapp/whatsapp-chat-search.user.js
// @downloadURL  https://raw.githubusercontent.com/cizzoo/scriptcat-scripts/main/scripts/whatsapp/whatsapp-chat-search.user.js
// ==/UserScript==

(function () {
  "use strict";

  const ICON_TITLE_SEARCH = "ic-search";
  const ICON_TITLE_CLOSE_CANDIDATES = ["ic-x-viewer-selected", "ic-x-alt", "ic-x", "ic-close", "x"];
  const LABEL_SEARCH_FALLBACK = ["search", "cerca", "buscar", "rechercher", "suchen", "ricerca"];
  const LABEL_CLOSE_FALLBACK = ["cancel", "close", "annulla", "cancelar", "fermer", "schliessen", "schließen", "chiudi"];

  // Finds the element furthest to the right side of the screen
  function getRightmostElement(elements) {
    let rightmost = null;
    let maxLeft = -1;
    for (const el of elements) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0 && rect.left > maxLeft) {
        maxLeft = rect.left;
        rightmost = el;
      }
    }
    return rightmost;
  }

  // Searches for buttons via the inner SVG title (most reliable)
  function findButtonsByIconTitles(titles) {
    const candidates = [];
    const svgTitles = document.querySelectorAll("svg > title");
    for (const titleEl of svgTitles) {
      const text = (titleEl.textContent || "").trim().toLowerCase();
      if (titles.some((t) => text === t.toLowerCase())) {
        const btn = titleEl.closest("button, [role='button']");
        if (btn) candidates.push(btn);
      }
    }
    return candidates;
  }

  // Fallback: searches for buttons via aria-labels
  function findButtonsByLabels(labelSubstrings) {
    const candidates = [];
    const btns = document.querySelectorAll("button[aria-label], [role='button'][aria-label], button[title], [role='button'][title]");
    for (const el of btns) {
      const label = (el.getAttribute("aria-label") || el.getAttribute("title") || "").toLowerCase();
      if (labelSubstrings.some((s) => label.includes(s))) candidates.push(el);
    }
    return candidates;
  }

  function findSearchCloseButton() {
    let candidates = findButtonsByIconTitles(ICON_TITLE_CLOSE_CANDIDATES);
    if (candidates.length === 0) candidates = findButtonsByLabels(LABEL_CLOSE_FALLBACK);

    // Filter out hidden buttons and buttons near the bottom of the screen.
    // The "cancel reply" close button is at the bottom, so rect.top will be high.
    // The sidebar close button is always in the header area (top of the screen).
    const headerCloseButtons = candidates.filter(el => {
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.top < 150;
    });

    return getRightmostElement(headerCloseButtons);
  }

  function findSearchOpenButton() {
    let candidates = findButtonsByIconTitles([ICON_TITLE_SEARCH]);
    if (candidates.length === 0) candidates = findButtonsByLabels(LABEL_SEARCH_FALLBACK);
    
    const visibleButtons = candidates.filter(el => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    });
    
    return getRightmostElement(visibleButtons);
  }

  function clickElement(el) {
    if (!el) return false;
    const clickTarget = el.closest("button, [role='button']") || el;
    clickTarget.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    clickTarget.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    clickTarget.click();
    return true;
  }

  function handleKeydown(e) {
    const isCtrlF = (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "f";
    if (!isCtrlF) return;

    // Immediately block the browser's native find bar
    e.preventDefault();
    e.stopImmediatePropagation();

    // 1. Try to close the search panel first
    const closeBtn = findSearchCloseButton();
    if (closeBtn) {
      clickElement(closeBtn);
      return;
    }

    // 2. If it is not open, open it
    const searchBtn = findSearchOpenButton();
    if (searchBtn) {
      clickElement(searchBtn);
      return;
    }

    console.warn("[WhatsApp Web - Ctrl+F] Intercepted shortcut, but could not find the target button in the DOM.");
  }

  // Capture phase + document-start to intercept before the browser
  window.addEventListener("keydown", handleKeydown, true);
})();