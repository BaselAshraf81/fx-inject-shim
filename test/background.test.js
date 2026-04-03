'use strict';

const { createMockBrowser } = require('./mock-browser');

// ─── Setup global `browser` before requiring the module ──────────────────────

let mockBrowser;

beforeEach(() => {
  // Reset modules so installBackgroundListener re-runs fresh each test
  jest.resetModules();

  mockBrowser = createMockBrowser();
  global.browser = mockBrowser;

  // Load the module fresh (auto-installs listener)
  require('../src/background');
});

afterEach(() => {
  delete global.browser;
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('background listener', () => {
  test('ignores messages not tagged with __fxInjectShim', async () => {
    const listeners = mockBrowser.runtime.onMessage._listeners;
    expect(listeners.length).toBe(1);
    const handler = listeners[0];

    const result = handler({ someOtherMessage: true }, {});
    expect(result).toBe(false);

    // Real API must NOT have been called
    expect(mockBrowser.tabs.executeScript).not.toHaveBeenCalled();
  });

  test('dispatches tabs.executeScript with correct args and resolves', async () => {
    const listeners = mockBrowser.runtime.onMessage._listeners;
    const handler = listeners[0];

    const response = await handler(
      { __fxInjectShim: true, method: 'tabs.executeScript', args: [42, { code: 'true' }] },
      {}
    );

    expect(mockBrowser.tabs.executeScript).toHaveBeenCalledWith(42, { code: 'true' });
    expect(response).toEqual({ ok: true, result: ['mock-execute-result'] });
  });

  test('dispatches tabs.insertCSS', async () => {
    const handler = mockBrowser.runtime.onMessage._listeners[0];
    const response = await handler(
      { __fxInjectShim: true, method: 'tabs.insertCSS', args: [{ code: 'body{color:red}' }] },
      {}
    );
    expect(mockBrowser.tabs.insertCSS).toHaveBeenCalledWith({ code: 'body{color:red}' });
    expect(response).toEqual({ ok: true, result: undefined });
  });

  test('dispatches tabs.removeCSS', async () => {
    const handler = mockBrowser.runtime.onMessage._listeners[0];
    await handler(
      { __fxInjectShim: true, method: 'tabs.removeCSS', args: [{ code: 'body{color:red}' }] },
      {}
    );
    expect(mockBrowser.tabs.removeCSS).toHaveBeenCalledWith({ code: 'body{color:red}' });
  });

  test('dispatches scripting.executeScript', async () => {
    const handler = mockBrowser.runtime.onMessage._listeners[0];
    const injection = { target: { tabId: 5 }, func: () => {} };
    const response = await handler(
      { __fxInjectShim: true, method: 'scripting.executeScript', args: [injection] },
      {}
    );
    expect(mockBrowser.scripting.executeScript).toHaveBeenCalledWith(injection);
    expect(response.ok).toBe(true);
  });

  test('dispatches scripting.insertCSS', async () => {
    const handler = mockBrowser.runtime.onMessage._listeners[0];
    await handler(
      { __fxInjectShim: true, method: 'scripting.insertCSS', args: [{ target: { tabId: 1 }, css: 'p{color:blue}' }] },
      {}
    );
    expect(mockBrowser.scripting.insertCSS).toHaveBeenCalled();
  });

  test('dispatches scripting.removeCSS', async () => {
    const handler = mockBrowser.runtime.onMessage._listeners[0];
    await handler(
      { __fxInjectShim: true, method: 'scripting.removeCSS', args: [{ target: { tabId: 1 }, css: 'p{color:blue}' }] },
      {}
    );
    expect(mockBrowser.scripting.removeCSS).toHaveBeenCalled();
  });

  test('serializes API errors and returns { ok: false, error } envelope', async () => {
    mockBrowser.tabs.executeScript.mockRejectedValueOnce(new Error('Permission denied'));

    const handler = mockBrowser.runtime.onMessage._listeners[0];
    const response = await handler(
      { __fxInjectShim: true, method: 'tabs.executeScript', args: [{ code: 'x' }] },
      {}
    );

    expect(response.ok).toBe(false);
    expect(response.error.__fxInjectShimError).toBe(true);
    expect(response.error.message).toBe('Permission denied');
  });

  test('returns { ok: false } for unknown method', async () => {
    const handler = mockBrowser.runtime.onMessage._listeners[0];
    const response = await handler(
      { __fxInjectShim: true, method: 'tabs.unknownThing', args: [] },
      {}
    );
    expect(response.ok).toBe(false);
    expect(response.error.message).toMatch(/unknown method/);
  });

  test('listener is idempotent — calling installBackgroundListener twice registers only one listener', () => {
    const { installBackgroundListener } = require('../src/background');
    installBackgroundListener(); // second call
    installBackgroundListener(); // third call
    expect(mockBrowser.runtime.onMessage._listeners.length).toBe(1);
  });
});
