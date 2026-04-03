/**
 * shim.js
 *
 * Drop into extension pages (popup, options, sidebar) as the very first script.
 * Overrides the six deprecated injection APIs in-place on the real `browser`
 * object so existing call sites need zero changes.
 *
 * Usage:
 *   import 'fx-inject-shim';
 *   // browser.tabs.executeScript / scripting.executeScript etc. now work again
 */

'use strict';

const MESSAGE_TAG = '__fxInjectShim';
const TIMEOUT_MS  = 5000;

// ─── Custom error types ───────────────────────────────────────────────────────

class FxInjectShimTimeoutError extends Error {
  constructor(method) {
    super(`fx-inject-shim: timed out waiting for background response for "${method}" (${TIMEOUT_MS}ms)`);
    this.name = 'FxInjectShimTimeoutError';
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Reconstruct an Error from a serialized error payload sent by background.js.
 *
 * @param {{ message: string, stack: string }} errObj
 * @returns {Error}
 */
function deserializeError(errObj) {
  const e = new Error(errObj.message || 'Unknown error from fx-inject-shim background');
  if (errObj.stack) e.stack = errObj.stack;
  return e;
}

/**
 * Send a message to the background listener and return a Promise that:
 *   - resolves with the real API's return value
 *   - rejects with the real API's error (reconstructed as a proper Error)
 *   - rejects with FxInjectShimTimeoutError if no response in TIMEOUT_MS
 *
 * @param {string} method
 * @param {Array}  args
 * @returns {Promise<unknown>}
 */
function sendToBackground(method, args) {
  return new Promise((resolve, reject) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new FxInjectShimTimeoutError(method));
      }
    }, TIMEOUT_MS);

    browser.runtime
      .sendMessage({ [MESSAGE_TAG]: true, method, args })
      .then((response) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);

        if (!response) {
          // No listener registered (background script not loaded)
          reject(new Error(
            'fx-inject-shim: no response from background script. ' +
            'Make sure you imported "fx-inject-shim/background" in your background script.'
          ));
          return;
        }

        if (response.ok) {
          resolve(response.result);
        } else {
          reject(deserializeError(response.error));
        }
      })
      .catch((err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        // runtime.sendMessage itself failed (e.g. no receiving end)
        reject(err instanceof Error ? err : new Error(String(err)));
      });
  });
}

/**
 * For tabs.* methods: tabId is an optional first argument.
 * Normalise to always produce an args array of the form used internally.
 * We preserve the original shape so background.js can spread them verbatim.
 *
 * Heuristic: if the first argument is a plain object (or undefined/absent)
 * the caller omitted tabId and passed details directly.
 *
 * @param {IArguments|Array} rawArgs
 * @returns {Array}
 */
function normaliseTabsArgs(rawArgs) {
  const args = Array.from(rawArgs);
  if (args.length === 0) return args;
  // If first arg is a number, it is tabId. Otherwise it is the details object.
  // We pass through verbatim — no normalisation needed; background spreads them.
  return args;
}

// ─── Shim installer ───────────────────────────────────────────────────────────

function installShim() {
  // Only patch inside a moz-extension:// document
  if (typeof location === 'undefined' || location.protocol !== 'moz-extension:') {
    if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
      // Dev-mode warning only — not an error
      // (safe to import in background or non-extension contexts)
    }
    return; // no-op
  }

  if (typeof browser === 'undefined') {
    console.warn('fx-inject-shim: `browser` global not found; shim not applied.');
    return;
  }

  // ── tabs.executeScript ──────────────────────────────────────────────────────
  browser.tabs.executeScript = function executeScript(...args) {
    return sendToBackground('tabs.executeScript', normaliseTabsArgs(args));
  };

  // ── tabs.insertCSS ──────────────────────────────────────────────────────────
  browser.tabs.insertCSS = function insertCSS(...args) {
    return sendToBackground('tabs.insertCSS', normaliseTabsArgs(args));
  };

  // ── tabs.removeCSS ──────────────────────────────────────────────────────────
  browser.tabs.removeCSS = function removeCSS(...args) {
    return sendToBackground('tabs.removeCSS', normaliseTabsArgs(args));
  };

  // ── scripting.executeScript ─────────────────────────────────────────────────
  browser.scripting.executeScript = function executeScript(details) {
    return sendToBackground('scripting.executeScript', [details]);
  };

  // ── scripting.insertCSS ─────────────────────────────────────────────────────
  browser.scripting.insertCSS = function insertCSS(injection) {
    return sendToBackground('scripting.insertCSS', [injection]);
  };

  // ── scripting.removeCSS ─────────────────────────────────────────────────────
  browser.scripting.removeCSS = function removeCSS(injection) {
    return sendToBackground('scripting.removeCSS', [injection]);
  };
}

// Auto-install when imported
installShim();

// Named export for manual control and testing
module.exports = { installShim, FxInjectShimTimeoutError, _sendToBackground: sendToBackground };
