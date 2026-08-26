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
   * Wait for an arbitrary condition, not just a selector match - e.g. "a
   * second [role=menu] has appeared" (a submenu opening), where the target
   * isn't identifiable by a fixed CSS selector alone. Polls `fn` on an
   * interval; resolves with the first truthy value `fn` returns, or rejects
   * after `timeoutMs`.
   */
  function waitForCondition(fn, timeoutMs = 10000, intervalMs = 50) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const tick = () => {
        let result;
        try {
          result = fn();
        } catch {
          result = undefined;
        }
        if (result) return resolve(result);
        if (Date.now() - start > timeoutMs) {
          return reject(new Error(`waitForCondition: condition not met within ${timeoutMs}ms`));
        }
        setTimeout(tick, intervalMs);
      };
      tick();
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

  global.ScriptCatHelpers = { waitForElement, waitForCondition, onDomChange, insertOnce };
})(typeof unsafeWindow !== "undefined" ? unsafeWindow : window);