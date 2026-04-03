(function(){
var module={exports:{}};
var exports=module.exports;
function require(){ return {}; }
/**
 * background.js
 *
 * Drop this into your background script (one import line).
 * Registers a single runtime.onMessage listener that handles all fx-inject-shim
 * forwarded calls and dispatches them to the real browser APIs.
 *
 * IMPORTANT: Captures original browser API references at load time so that even
 * if shim.js patches browser.tabs.* later, the background always calls the real
 * originals — preventing infinite recursion.
 *
 * Usage:
 *   import 'fx-inject-shim/background';
 *   // or: import { installBackgroundListener } from 'fx-inject-shim';
 */

'use strict';

const MESSAGE_TAG = '__fxInjectShim';

// Capture original API methods at load time.
// This must happen before shim.js has any chance to patch browser.tabs/scripting.
const _originals = {
  tabsExecuteScript:      browser.tabs.executeScript.bind(browser.tabs),
  tabsInsertCSS:          browser.tabs.insertCSS.bind(browser.tabs),
  tabsRemoveCSS:          browser.tabs.removeCSS.bind(browser.tabs),
  scriptingExecuteScript: browser.scripting.executeScript.bind(browser.scripting),
  scriptingInsertCSS:     browser.scripting.insertCSS.bind(browser.scripting),
  scriptingRemoveCSS:     browser.scripting.removeCSS.bind(browser.scripting),
};

/**
 * Serialize an error so it can cross the structured-clone boundary of
 * runtime.sendMessage (Error objects are not cloneable in all engines).
 */
function serializeError(err) {
  if (err instanceof Error) {
    return { __fxInjectShimError: true, message: err.message, stack: err.stack || '' };
  }
  return { __fxInjectShimError: true, message: String(err), stack: '' };
}

/**
 * Dispatch a shimmed method call to the real (pre-shim) browser API.
 */
function dispatch(method, args) {
  switch (method) {
    case 'tabs.executeScript':      return _originals.tabsExecuteScript(...args);
    case 'tabs.insertCSS':          return _originals.tabsInsertCSS(...args);
    case 'tabs.removeCSS':          return _originals.tabsRemoveCSS(...args);
    case 'scripting.executeScript': return _originals.scriptingExecuteScript(...args);
    case 'scripting.insertCSS':     return _originals.scriptingInsertCSS(...args);
    case 'scripting.removeCSS':     return _originals.scriptingRemoveCSS(...args);
    default:
      return Promise.reject(new Error(`fx-inject-shim: unknown method "${method}"`));
  }
}

/**
 * The onMessage handler.
 *
 * Returns a Promise for our own messages (keeping the channel open) and
 * `false` for everything else so Firefox knows we are not handling them and
 * other listeners can respond.
 *
 * NOTE: We deliberately do NOT use an async function. An async listener returns
 * a Promise for every message, blocking other listeners. We return a Promise
 * only for our own messages and `false` otherwise.
 */
function onMessageHandler(message, _sender) {
  if (!message || message[MESSAGE_TAG] !== true) {
    return false;
  }
  const { method, args } = message;
  return dispatch(method, args)
    .then((result) => ({ ok: true, result }))
    .catch((err)   => ({ ok: false, error: serializeError(err) }));
}

/**
 * Install the background listener. Idempotent — calling more than once is safe.
 */
function installBackgroundListener() {
  if (browser.runtime.onMessage.hasListener(onMessageHandler)) return;
  browser.runtime.onMessage.addListener(onMessageHandler);
}

// Auto-install when this module is imported
installBackgroundListener();

module.exports = { installBackgroundListener, _originals };

})();