'use strict';

jest.useFakeTimers();

const { createMockBrowser } = require('./mock-browser');

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Set up a simulated moz-extension:// page environment.
 * Returns both the mockBrowser AND the original jest-mock API functions
 * (captured before shim.js overwrites them), so tests can mock return values.
 */
function setupPageEnv({ installBackground = true } = {}) {
  jest.resetModules();

  const mockBrowser = createMockBrowser();
  global.browser = mockBrowser;
  global.location = { protocol: 'moz-extension:' };

  // Save originals BEFORE shim patches them
  const originals = {
    tabsExecuteScript:      mockBrowser.tabs.executeScript,
    tabsInsertCSS:          mockBrowser.tabs.insertCSS,
    tabsRemoveCSS:          mockBrowser.tabs.removeCSS,
    scriptingExecuteScript: mockBrowser.scripting.executeScript,
    scriptingInsertCSS:     mockBrowser.scripting.insertCSS,
    scriptingRemoveCSS:     mockBrowser.scripting.removeCSS,
  };

  if (installBackground) {
    // Background captures the originals at load time
    require('../src/background');
  }

  const shimModule = require('../src/shim');
  return { mockBrowser, shimModule, originals };
}

function teardownPageEnv() {
  delete global.browser;
  delete global.location;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('shim.js — page-side', () => {
  afterEach(() => {
    teardownPageEnv();
    jest.clearAllTimers();
  });

  // 1. Intercepts tabs.executeScript and sends correct message
  test('intercepts tabs.executeScript and sends __fxInjectShim message with correct shape', async () => {
    const { mockBrowser } = setupPageEnv();
    const sendSpy = jest.spyOn(mockBrowser.runtime, 'sendMessage');

    await browser.tabs.executeScript(3, { code: 'document.title' });

    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        __fxInjectShim: true,
        method: 'tabs.executeScript',
        args: [3, { code: 'document.title' }],
      })
    );
  });

  // 2. Resolves with the value the real API returns (via background)
  test('resolves with the real API return value', async () => {
    const { originals } = setupPageEnv();
    originals.tabsExecuteScript.mockResolvedValueOnce(['injected-result']);

    const result = await browser.tabs.executeScript({ code: 'true' });
    expect(result).toEqual(['injected-result']);
  });

  // 3. tabId is optional — object-as-first-arg case
  test('passes through correctly when tabId is omitted (object as first arg)', async () => {
    const { mockBrowser, originals } = setupPageEnv();
    const sendSpy = jest.spyOn(mockBrowser.runtime, 'sendMessage');

    await browser.tabs.executeScript({ code: 'void 0' });

    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'tabs.executeScript',
        args: [{ code: 'void 0' }],
      })
    );
    // Background should spread single arg (no tabId)
    expect(originals.tabsExecuteScript).toHaveBeenCalledWith({ code: 'void 0' });
  });

  // 4. Errors from the real API propagate back as proper Error objects
  test('propagates API errors as proper Error objects at the call site', async () => {
    const { originals } = setupPageEnv();
    originals.tabsExecuteScript.mockRejectedValue(new Error('No permission'));

    await expect(browser.tabs.executeScript({ code: 'x' })).rejects.toThrow('No permission');
    await expect(browser.tabs.executeScript({ code: 'x' })).rejects.toBeInstanceOf(Error);
  });

  // 5. scripting.executeScript is shimmed
  test('intercepts scripting.executeScript', async () => {
    const { mockBrowser } = setupPageEnv();
    const sendSpy = jest.spyOn(mockBrowser.runtime, 'sendMessage');

    const injection = { target: { tabId: 7 }, func: () => 42 };
    await browser.scripting.executeScript(injection);

    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        __fxInjectShim: true,
        method: 'scripting.executeScript',
        args: [injection],
      })
    );
  });

  // 6. Shim is a no-op when protocol is not moz-extension:
  test('is a no-op when protocol is not moz-extension:', () => {
    jest.resetModules();

    const mockBrowser = createMockBrowser();
    global.browser = mockBrowser;
    global.location = { protocol: 'chrome-extension:' };

    const originalExecuteScript = mockBrowser.tabs.executeScript;
    require('../src/shim');

    // The original jest.fn() should be unchanged (not replaced by shim)
    expect(browser.tabs.executeScript).toBe(originalExecuteScript);

    delete global.browser;
    delete global.location;
  });

  // 7. Timeout triggers after 5 seconds
  test('rejects with FxInjectShimTimeoutError after 5 s if background does not respond', async () => {
    jest.resetModules();

    const mockBrowser = createMockBrowser();
    global.browser = mockBrowser;
    global.location = { protocol: 'moz-extension:' };

    // sendMessage hangs forever
    mockBrowser.runtime.sendMessage = () => new Promise(() => {});

    const { FxInjectShimTimeoutError } = require('../src/shim');

    const rejectionPromise = browser.tabs.executeScript({ code: 'x' });

    // Advance fake timers by 5 seconds
    jest.advanceTimersByTime(5000);

    await expect(rejectionPromise).rejects.toBeInstanceOf(FxInjectShimTimeoutError);
    await expect(rejectionPromise).rejects.toThrow(/timed out/);

    delete global.browser;
    delete global.location;
  });

  // 8. tabs.insertCSS and tabs.removeCSS are shimmed
  test('intercepts tabs.insertCSS', async () => {
    const { mockBrowser, originals } = setupPageEnv();
    const sendSpy = jest.spyOn(mockBrowser.runtime, 'sendMessage');

    await browser.tabs.insertCSS(5, { code: 'p{color:red}' });

    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'tabs.insertCSS', args: [5, { code: 'p{color:red}' }] })
    );
    expect(originals.tabsInsertCSS).toHaveBeenCalledWith(5, { code: 'p{color:red}' });
  });

  test('intercepts tabs.removeCSS', async () => {
    const { originals } = setupPageEnv();
    await browser.tabs.removeCSS({ code: 'p{color:red}' });
    expect(originals.tabsRemoveCSS).toHaveBeenCalledWith({ code: 'p{color:red}' });
  });

  // 9. scripting.insertCSS and scripting.removeCSS are shimmed
  test('intercepts scripting.insertCSS', async () => {
    const { originals } = setupPageEnv();
    await browser.scripting.insertCSS({ target: { tabId: 1 }, css: 'p{color:blue}' });
    expect(originals.scriptingInsertCSS).toHaveBeenCalled();
  });

  test('intercepts scripting.removeCSS', async () => {
    const { originals } = setupPageEnv();
    await browser.scripting.removeCSS({ target: { tabId: 1 }, css: 'p{color:blue}' });
    expect(originals.scriptingRemoveCSS).toHaveBeenCalled();
  });

  // 10. No background listener → descriptive rejection
  test('rejects with descriptive error when no background listener responds', async () => {
    jest.resetModules();

    const mockBrowser = createMockBrowser();
    global.browser = mockBrowser;
    global.location = { protocol: 'moz-extension:' };

    // sendMessage rejects as Firefox does when no listener exists
    mockBrowser.runtime.sendMessage = async () => {
      throw new Error('Could not establish connection. Receiving end does not exist.');
    };

    require('../src/shim');

    await expect(browser.tabs.executeScript({ code: 'x' }))
      .rejects.toThrow(/Could not establish connection/);

    delete global.browser;
    delete global.location;
  });
});
