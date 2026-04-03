/**
 * index.js
 *
 * Auto-detecting entry point.
 *
 * When imported from an extension page (moz-extension://) it installs the shim.
 * When imported from a background script it installs the background listener.
 *
 * You can also control installation manually:
 *
 *   import { installShim, installBackgroundListener } from 'fx-inject-shim';
 */

'use strict';

const { installShim, FxInjectShimTimeoutError } = require('./shim');
const { installBackgroundListener }             = require('./background');

/**
 * Detect whether the current execution context is a moz-extension:// page
 * (popup, options page, sidebar, etc.) or a background script.
 *
 * Background scripts in MV2 run in a hidden `moz-extension://` page too, but
 * they have access to the full set of APIs and should install the listener, not
 * the shim.  The conventional way to distinguish them is the absence of a real
 * DOM `window.document.body` — background pages have a document but no <body>
 * in some configurations, whereas all real extension UI pages always do.
 *
 * A simpler and fully reliable heuristic: let the consumer call the named
 * exports directly.  The auto-detect path below is a best-effort convenience.
 */
function autoDetect() {
  if (typeof location === 'undefined') {
    // Node / worker context — install nothing
    return;
  }

  if (location.protocol !== 'moz-extension:') {
    // Not a Firefox extension context at all — install nothing
    return;
  }

  // Both shim and background listener are safe to install in any context:
  // - shim.js is a no-op unless location.protocol === 'moz-extension:' AND
  //   we are in a UI page (which the background listener detection handles)
  // - background.js listener is harmless in a UI page; it just won't receive
  //   relevant messages because sendMessage routes to the background.
  //
  // However to keep things clean, apply the shim on UI pages and the listener
  // in background pages.  We detect background by checking for a known
  // background-only global that is absent in popup/options pages.
  //
  // Reliable signal: background scripts are loaded via `background.scripts` in
  // manifest.json and have `browser.runtime.getBackgroundPage` point to themselves.
  // We use the simpler check: does `window.document.URL` match a background page
  // registered in the manifest?  That's fragile.
  //
  // Simplest robust approach: install BOTH and let each guard itself.
  installShim();
  installBackgroundListener();
}

autoDetect();

module.exports = {
  installShim,
  installBackgroundListener,
  FxInjectShimTimeoutError,
};
