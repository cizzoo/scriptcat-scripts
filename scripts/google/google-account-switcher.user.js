// ==UserScript==
// @name         Google Account Switcher
// @namespace    https://github.com/cizzoo/scriptcat-scripts
// @version      0.1.0
// @description  Ctrl+LeftAlt+1..9 switches the active Google account (authuser index N-1) on any Google app, in the same tab.
// @author       cizzoo
// @match        *://mail.google.com/*
// @match        *://drive.google.com/*
// @match        *://docs.google.com/*
// @match        *://calendar.google.com/*
// @match        *://contacts.google.com/*
// @match        *://keep.google.com/*
// @match        *://photos.google.com/*
// @match        *://meet.google.com/*
// @match        *://chat.google.com/*
// @match        *://groups.google.com/*
// @match        *://myaccount.google.com/*
// @grant        none
// @run-at       document-start
// @updateURL    https://raw.githubusercontent.com/cizzoo/scriptcat-scripts/main/scripts/google/google-account-switcher.user.js
// @downloadURL  https://raw.githubusercontent.com/cizzoo/scriptcat-scripts/main/scripts/google/google-account-switcher.user.js
// ==/UserScript==

(function () {
  "use strict";
  // Hosts that encode the account index as a path segment (/u/N/...) instead
  // of a query parameter. Everything else on Google's apps uses ?authuser=N.
  const PATH_STYLE_HOSTS = new Set([
    "mail.google.com",
    "drive.google.com",
  ]);
  /**
   * Build the next URL for the given target authuser index (0-based).
   * Returns null if the current URL can't be safely rewritten.
   */
  function buildSwitchedUrl(targetIndex) {
    const url = new URL(window.location.href);
    if (PATH_STYLE_HOSTS.has(url.hostname)) {
      // Path style: .../mail/u/0/..., .../drive/u/2/...
      // Replace an existing /u/<n>/ segment, or insert one right after the
      // first path segment (e.g. /mail, /drive) if none is present yet.
      const uSegmentRe = /\/u\/\d+(\/|$)/;
      if (uSegmentRe.test(url.pathname)) {
        url.pathname = url.pathname.replace(uSegmentRe, `/u/${targetIndex}$1`);
      } else {
        const match = url.pathname.match(/^(\/[^/]+)(\/.*)?$/);
        if (!match) return null;
        const [, firstSegment, rest] = match;
        url.pathname = `${firstSegment}/u/${targetIndex}${rest || "/"}`;
      }
      return url.toString();
    }
    // Query style: ?authuser=N (docs/sheets/slides, calendar, contacts, keep,
    // photos, meet, chat, groups, myaccount, etc.)
    url.searchParams.set("authuser", String(targetIndex));
    return url.toString();
  }
  function isLeftAlt(event) {
    // event.location distinguishes physical left/right Alt keys.
    // KeyboardEvent.DOM_KEY_LOCATION_LEFT === 1
    return event.altKey; //&& event.location === 1;
  }
  document.addEventListener(
    "keydown",
    function (event) {
      if (!isLeftAlt(event) || !event.ctrlKey || event.shiftKey || event.metaKey) {
        return;
      }
      // event.code is layout-independent: "Digit1".."Digit9"
      const digitMatch = /^Digit([1-9])$/.exec(event.code);
      if (!digitMatch) return;
      const targetIndex = Number(digitMatch[1]) - 1; // Ctrl+Alt+1 -> authuser=0
      const nextUrl = buildSwitchedUrl(targetIndex);
      if (!nextUrl) return;
      event.preventDefault();
      event.stopPropagation();
      if (nextUrl !== window.location.href) {
        window.location.href = nextUrl;
      }
    },
    true // capture, so we win over the page's own shortcut handling where possible
  );
})();