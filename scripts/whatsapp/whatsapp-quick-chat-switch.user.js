// ==UserScript==
// @name         WhatsApp Web - Quick Chat Switch
// @namespace    https://github.com/cizzoo/scriptcat-scripts
// @version      0.2.0
// @description  Hold the right Alt key (AltRight) and press 1-9 to jump straight to the Nth chat currently shown in the WhatsApp Web chat list, top to bottom. Left Alt does not trigger it. Fires even while a text field (message box, search box) is focused - on layouts where AltGr+digit types a bracket/special character, this shortcut takes priority instead.
// @author       cizzoo
// @match        https://web.whatsapp.com/*
// @grant        none
// @run-at       document-start
// @updateURL    https://raw.githubusercontent.com/cizzoo/scriptcat-scripts/main/scripts/whatsapp/whatsapp-quick-chat-switch.user.js
// @downloadURL  https://raw.githubusercontent.com/cizzoo/scriptcat-scripts/main/scripts/whatsapp/whatsapp-quick-chat-switch.user.js
// ==/UserScript==

(function () {
  "use strict";

  // Only the physical right Alt key arms the shortcut - left Alt must not.
  let altRightDown = false;

  function getChatRows() {
    // #pane-side > [data-testid="chat-list"] > [role="grid"] > div[role="row"]
    // WhatsApp virtualizes this list (only visible rows are rendered), so
    // querying fresh on every keypress naturally reflects "whatever chats
    // are currently visible, top to bottom" - no caching, no MutationObserver
    // needed since we don't inject any persistent DOM ourselves.
    const grid = document.querySelector(
      '#pane-side [data-testid="chat-list"] [role="grid"]'
    );
    if (!grid) return [];
    return Array.from(grid.querySelectorAll(':scope > div[role="row"]'));
  }

  function openChatAt(index) {
    const rows = getChatRows();
    const row = rows[index];
    if (!row) return;

    // Click the innermost row surface so WhatsApp's own (React) click
    // handler - attached higher up via event delegation - fires exactly
    // as if the user had clicked the row.
    const target =
      row.querySelector('[data-testid="cell-frame-container"]') || row;

    const opts = { bubbles: true, cancelable: true, view: window };
    target.dispatchEvent(new MouseEvent("mousedown", opts));
    target.dispatchEvent(new MouseEvent("mouseup", opts));
    target.dispatchEvent(new MouseEvent("click", opts));
  }

  document.addEventListener(
    "keydown",
    function (e) {
      if (e.code === "AltRight") {
        altRightDown = true;
        return;
      }

      if (!altRightDown) return;

      const match = /^Digit([1-9])$/.exec(e.code);
      if (!match) return;

      // No editable-field guard: this fires even while typing in the message
      // box or search box. On layouts where AltGr+digit types a bracket or
      // other special character, that character will no longer be typeable
      // this way - the shortcut wins instead.
      e.preventDefault();
      e.stopPropagation();

      openChatAt(Number(match[1]) - 1);
    },
    true
  );

  document.addEventListener(
    "keyup",
    function (e) {
      if (e.code === "AltRight") altRightDown = false;
    },
    true
  );

  // If the tab loses focus while AltRight is held (e.g. alt-tabbing away),
  // the keyup can be missed - reset defensively so it doesn't get stuck armed.
  window.addEventListener("blur", function () {
    altRightDown = false;
  });
})();