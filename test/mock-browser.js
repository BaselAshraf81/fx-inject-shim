/**
 * mock-browser.js
 * Minimal browser WebExtension API mock for unit tests (no real Firefox required).
 */

'use strict';

function createMockBrowser() {
  // Track registered onMessage listeners
  const messageListeners = [];

  // Simulate runtime.sendMessage → delivers to registered listeners
  async function sendMessage(message) {
    for (const listener of messageListeners) {
      const result = listener(message, { id: 'mock-sender' });
      if (result && typeof result.then === 'function') {
        return result;
      }
      if (result === true) {
        // legacy sendResponse pattern — not used in our shim but handle gracefully
        return undefined;
      }
    }
    throw new Error('Could not establish connection. Receiving end does not exist.');
  }

  const browser = {
    tabs: {
      executeScript: jest.fn(async (_tabIdOrDetails, _details) => ['mock-execute-result']),
      insertCSS:     jest.fn(async () => undefined),
      removeCSS:     jest.fn(async () => undefined),
    },
    scripting: {
      executeScript: jest.fn(async () => [{ frameId: 0, result: 'mock-scripting-result' }]),
      insertCSS:     jest.fn(async () => undefined),
      removeCSS:     jest.fn(async () => undefined),
    },
    runtime: {
      sendMessage,
      onMessage: {
        addListener(fn) { messageListeners.push(fn); },
        removeListener(fn) {
          const idx = messageListeners.indexOf(fn);
          if (idx !== -1) messageListeners.splice(idx, 1);
        },
        hasListener(fn) { return messageListeners.includes(fn); },
        // Expose for test introspection
        _listeners: messageListeners,
      },
    },
  };

  return browser;
}

module.exports = { createMockBrowser };
