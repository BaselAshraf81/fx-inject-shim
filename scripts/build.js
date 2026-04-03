/**
 * scripts/build.js
 *
 * Produces:
 *   dist/shim.min.js        — minified page-side shim (plain <script> includable)
 *   dist/background.min.js  — minified background listener
 *
 * Also copies the vendor scripts into example-extension/vendor/ so the demo
 * extension works without a bundler.
 *
 * Requires: terser (devDependency)
 * Run: node scripts/build.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');

let minify;
try {
  ({ minify } = require('terser'));
} catch {
  console.error('terser not found. Run `npm install` first.');
  process.exit(1);
}

const ROOT    = path.resolve(__dirname, '..');
const SRC     = path.join(ROOT, 'src');
const DIST    = path.join(ROOT, 'dist');
const VENDOR  = path.join(ROOT, 'example-extension', 'vendor');

// ─── Wrap a CJS module into a self-contained IIFE for browser <script> use ───
//
// The shim and background use `module.exports` / `require`, which are Node/CJS.
// For direct <script> inclusion we strip those and wrap in an IIFE that stubs
// out `module`, `exports`, and `require` just enough for the shim to load.
//
// The shim patches the global `browser` object directly and needs nothing from
// the outer environment other than `browser` and `location` existing globally,
// so the IIFE wrapper is sufficient.

function wrapForBrowser(src) {
  return `(function(){
var module={exports:{}};
var exports=module.exports;
function require(){ return {}; }
${src}
})();`;
}

async function build() {
  // Ensure output dirs exist
  fs.mkdirSync(DIST,   { recursive: true });
  fs.mkdirSync(VENDOR, { recursive: true });

  const targets = [
    { src: 'shim.js',       out: 'shim.min.js',       vendor: 'shim-page.js' },
    { src: 'background.js', out: 'background.min.js',  vendor: 'shim-background.js' },
  ];

  for (const t of targets) {
    const source  = fs.readFileSync(path.join(SRC, t.src), 'utf8');
    const wrapped = wrapForBrowser(source);

    const result = await minify(wrapped, {
      compress: {
        drop_console: false,  // keep dev warnings
        passes: 2,
      },
      mangle: true,
      format: { comments: false },
    });

    const minSrc = result.code;

    // dist/
    const distPath = path.join(DIST, t.out);
    fs.writeFileSync(distPath, minSrc, 'utf8');
    console.log(`✓ ${path.relative(ROOT, distPath)}  (${minSrc.length} bytes)`);

    // example-extension/vendor/  (unminified for easier debugging of the demo)
    const vendorPath = path.join(VENDOR, t.vendor);
    fs.writeFileSync(vendorPath, wrapped, 'utf8');
    console.log(`✓ ${path.relative(ROOT, vendorPath)}`);
  }

  console.log('\nBuild complete.');
}

build().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
