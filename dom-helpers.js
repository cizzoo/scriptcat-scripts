/**
 * Shared DOM helpers for ScriptCat userscripts.
 * Include via:
 *   // @require https://raw.githubusercontent.com/cizzoo/scriptcat-scripts/main/lib/dom-helpers.js
 *
 * Exposes a global `ScriptCatHelpers` object (deliberately not using ESM,
 * since @require loads plain scripts into the page/sandbox context).
 */
(function (global) {
  "use strict";

  /**
   * Wait for an element matching `selector` to appear in the DOM.
   * Resolves with the element, or rejects after `timeoutMs`.
   */
  function waitForElement(selector, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(selector);
      if (existing) return resolve(existing);

      const observer = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el) {
          observer.disconnect();
          resolve(el);
        }
      });

      observer.observe(document.documentElement, { childList: true, subtree: true });

      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`waitForElement: "${selector}" not found within ${timeoutMs}ms`));
      }, timeoutMs);
    });
  }

  /**
   * Run `callback` whenever the DOM changes under `root` (default: document.body).
   * Returns a function to stop observing.
   */
  function onDomChange(callback, root = document.body) {
    const observer = new MutationObserver(callback);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }

  /**
   * Idempotent element insertion: only appends if no element with `id` already exists.
   */
  function insertOnce(id, factory, parent = document.body) {
    if (document.getElementById(id)) return document.getElementById(id);
    const el = factory();
    el.id = id;
    parent.appendChild(el);
    return el;
  }

  global.ScriptCatHelpers = { waitForElement, onDomChange, insertOnce };
})(typeof unsafeWindow !== "undefined" ? unsafeWindow : window);
