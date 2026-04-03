# fx-inject-shim

A drop-in Firefox WebExtension compatibility shim for `tabs.executeScript`, `tabs.insertCSS`, `tabs.removeCSS`, `scripting.executeScript`, `scripting.insertCSS`, and `scripting.removeCSS`.

---

## The problem

Firefox 149 deprecated — and Firefox 152 removed — the ability to call script/CSS injection APIs directly from **extension pages** (`moz-extension://` documents such as popups, options pages, and sidebars). The calls work fine from a background script, but any call made directly from a popup or options page now throws an error.

The six affected APIs are:

```
browser.tabs.executeScript()   browser.scripting.executeScript()
browser.tabs.insertCSS()       browser.scripting.insertCSS()
browser.tabs.removeCSS()       browser.scripting.removeCSS()
```

Mozilla's recommended fix is to replace each call with a `runtime.sendMessage` round-trip to the background script. That is 30–80 lines of boilerplate per extension, and it forces you to rewrite every call site. `fx-inject-shim` does this for you automatically so **you change nothing at your call sites**.

---

## Installation

```bash
npm install fx-inject-shim
```

Or grab the standalone files for manual inclusion (no bundler required):

- `dist/shim.min.js` — page-side shim (include via `<script>` in your popup/options HTML)
- `dist/background.min.js` — background listener (include via `background.scripts` in your manifest)

---

## Migration — two lines, zero call-site changes

### Before (Firefox < 149, still works)

```js
// popup.js
const result = await browser.tabs.executeScript(tabId, {
  code: `document.body.style.background = 'red'`
});
```

```js
// background.js — no changes needed
```

### After (Firefox 152+ compatible)

```js
// popup.js — add ONE line at the very top
import 'fx-inject-shim';

// Everything below is UNCHANGED
const result = await browser.tabs.executeScript(tabId, {
  code: `document.body.style.background = 'red'`
});
```

```js
// background.js — add ONE line
import 'fx-inject-shim/background';
```

That is the **entire migration**. No call sites change. No promise chains to rewrite.

---

## Manual `<script>` usage (no bundler)

If your extension uses plain script tags rather than ES modules, copy the two files from `dist/` and load them:

```html
<!-- popup.html — shim must be loaded BEFORE your popup script -->
<script src="vendor/shim.min.js"></script>
<script src="popup.js"></script>
```

```json
// manifest.json — background listener loaded before any other background scripts
{
  "background": {
    "scripts": ["vendor/background.min.js", "background.js"]
  }
}
```

---

## Before / after code comparison

```js
// ── BEFORE ────────────────────────────────────────────────────────────────────
// popup.js (Firefox < 149)

async function highlightPage(tabId) {
  const [result] = await browser.tabs.executeScript(tabId, {
    code: 'document.querySelectorAll("p").length'
  });
  console.log('Found paragraphs:', result);

  await browser.tabs.insertCSS(tabId, {
    code: 'p { outline: 2px solid red }'
  });
}
```

```js
// ── AFTER ─────────────────────────────────────────────────────────────────────
// popup.js (Firefox 152+)

import 'fx-inject-shim'; // ← only change

async function highlightPage(tabId) {
  // Identical to before ↓
  const [result] = await browser.tabs.executeScript(tabId, {
    code: 'document.querySelectorAll("p").length'
  });
  console.log('Found paragraphs:', result);

  await browser.tabs.insertCSS(tabId, {
    code: 'p { outline: 2px solid red }'
  });
}
```

---

## How it works

The shim intercepts calls made from extension pages and routes them through the background script, which is the only context where injection APIs are still permitted.

```
Extension page (popup.js)           Background script
──────────────────────────          ─────────────────────────────────────

browser.tabs.executeScript(args)
  │  (shimmed — calls sendMessage)
  │
  └─► runtime.sendMessage({         onMessage listener (installed by
        __fxInjectShim: true,    ── fx-inject-shim/background)
        method: 'tabs.executeScript'   │
        args: [tabId, details]         │
      })                               ▼
                                   browser.tabs.executeScript(tabId, details)
                                   (original, pre-shim reference)
                                       │
  ◄──────────────────────────────────  │  Promise resolves/rejects
  Promise resolves with result         ▼
                                   sendMessage resolves → { ok: true, result }
                                   or { ok: false, error: { message, stack } }
```

**Error propagation**: If the real API rejects, the background serialises the Error (message + stack) into a plain object that can cross the structured-clone boundary, then the page-side shim reconstructs a proper `Error` object before rejecting the original promise.

**Timeout**: If the background script is not loaded and no response arrives within 5 seconds, the shim rejects with `FxInjectShimTimeoutError`.

**Safety**: The shim checks `location.protocol === 'moz-extension:'` before patching anything. If imported in a background script or a non-extension context it is a strict no-op, so it is safe to import unconditionally everywhere.

---

## API

### `import 'fx-inject-shim'`

Auto-detects context and installs the appropriate side. Recommended for most users.

### `import 'fx-inject-shim/background'`

Install only the background listener. Use this in your background script.

### Named exports

```js
import { installShim, installBackgroundListener, FxInjectShimTimeoutError } from 'fx-inject-shim';
```

| Export | Description |
|--------|-------------|
| `installShim()` | Manually install the page-side shim. Idempotent. |
| `installBackgroundListener()` | Manually install the background listener. Idempotent. |
| `FxInjectShimTimeoutError` | Error class thrown when the background does not respond within 5 s. |

---

## Manifest V3 note

Under MV3 the `browser.tabs.executeScript / insertCSS / removeCSS` APIs are **fully removed** (not just deprecated) in favour of `browser.scripting.*`. This shim covers `browser.scripting.executeScript`, `browser.scripting.insertCSS`, and `browser.scripting.removeCSS` as well.

However, in MV3 the background is a **service worker**, not a persistent background page. Service workers cannot use `importScripts` with `moz-extension://` URLs in the same way. If you are migrating to MV3, the recommended path is to use `browser.scripting.*` APIs directly in your background service worker rather than shimming them — the `scripting.*` APIs work fine from background service workers. The shim's `scripting.*` coverage is therefore most useful for MV2 extensions that use `scripting.*` calls from popup/options pages.

---

## Example extension

`example-extension/` is a complete, installable MV2 Firefox extension. Load it via `about:debugging → Load Temporary Add-on` and select `example-extension/manifest.json`. Click the toolbar button to toggle paragraph highlighting on any page.

---

## Running tests

```bash
npm test
```

Tests run in Node with no browser required. The `test/mock-browser.js` mock simulates the full `browser.runtime.onMessage` / `sendMessage` round-trip in-process.

---

## License

MIT
