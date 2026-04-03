/**
 * popup.js
 *
 * This file is written exactly as it would have been before Firefox 149.
 * No changes are needed — the shim loaded in popup.html handles the rest.
 *
 * The single added line is the <script src="vendor/shim-page.js"> in popup.html.
 */

const btn    = document.getElementById('btn');
const status = document.getElementById('status');

function setStatus(msg, cls) {
  status.textContent = msg;
  status.className   = cls || '';
}

btn.addEventListener('click', async () => {
  btn.disabled = true;
  setStatus('Injecting…');

  try {
    // ── This call is UNCHANGED from pre-Firefox-149 code ──
    // The shim intercepts it and routes through the background script.
    const [result] = await browser.tabs.executeScript({
      code: `
        (function() {
          const existing = document.getElementById('__fx_inject_demo__');
          if (existing) {
            existing.remove();
            return 'removed';
          }
          const style = document.createElement('style');
          style.id = '__fx_inject_demo__';
          style.textContent = 'p { outline: 3px solid #0060df !important; background: #ddeeff !important; }';
          document.head.appendChild(style);
          return 'added';
        })()
      `
    });

    if (result === 'added') {
      setStatus('✓ Paragraphs highlighted!', 'ok');
      btn.textContent = 'Remove Highlight';
    } else {
      setStatus('✓ Highlight removed.', 'ok');
      btn.textContent = 'Highlight Paragraphs';
    }
  } catch (err) {
    setStatus('Error: ' + err.message, 'error');
    console.error('fx-inject-shim demo error:', err);
  } finally {
    btn.disabled = false;
  }
});
