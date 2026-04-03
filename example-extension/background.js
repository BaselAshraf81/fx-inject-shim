/**
 * background.js (example-extension)
 *
 * The entire migration for the background script is this one line.
 * Everything else in this file is identical to what it was before Firefox 149.
 */

// One line added — that's the entire migration for background.js
importScripts('vendor/shim-background.js');

// (Any existing background script code continues here, unchanged.)
