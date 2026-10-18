'use strict';
// extension/background.js — the content-script registration and open-tab
// injection that the Sep 2026 incident turned on. Runs the real worker file in a
// vm with chrome.* stubbed; what it cannot prove is Chrome's own behaviour (that
// an update clears dynamic scripts, that an orphan's runtime.id reads undefined),
// which stays a real-Chrome check.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const EXT = path.join(__dirname, '..', 'extension');
const FILES = ['concepts.js', 'content.js', 'extract.js', 'explain.js'];

function boot({ granted = true, registered = [], tabs = [] } = {}) {
  const listeners = {};
  const calls = { register: 0, unregister: 0, injected: [] };
  let reg = registered.map(s => ({ ...s }));
  const ev = name => ({ addListener: fn => (listeners[name] = listeners[name] || []).push(fn) });
  const tick = () => new Promise(r => setImmediate(r));
  const chrome = {
    runtime: { onInstalled: ev('installed'), onStartup: ev('startup'), onMessage: ev('message'), lastError: null },
    permissions: { contains: async () => granted, onAdded: ev('added'), onRemoved: ev('removed') },
    scripting: {
      getRegisteredContentScripts: async ({ ids }) => { await tick(); return reg.filter(s => ids.includes(s.id)); },
      registerContentScripts: async scripts => {
        await tick();
        for (const s of scripts) { if (reg.some(r => r.id === s.id)) throw new Error('Duplicate script ID'); reg.push(s); }
        calls.register++;
      },
      unregisterContentScripts: async ({ ids }) => { reg = reg.filter(s => !ids.includes(s.id)); calls.unregister++; },
      insertCSS: async () => {},
      executeScript: async ({ target, func, files }) => {
        const tab = tabs.find(t => t.id === target.tabId);
        if (func) return [{ result: tab.probe }];
        calls.injected.push({ tabId: tab.id, files: JSON.parse(JSON.stringify(files)) });   // vm-realm arrays fail strict deepEqual
        return [{}];
      }
    },
    tabs: { query: async () => tabs.filter(t => /^https?:/.test(t.url)) },
    storage: { local: { get: async () => ({}), set: async () => {}, remove: async () => {} }, onChanged: ev('changed') },
    identity: {}
  };
  const ctx = vm.createContext({ chrome, console: { log() {}, warn() {} }, fetch: async () => ({ ok: false }), setTimeout, clearTimeout, AbortController, URL, TextEncoder, crypto: globalThis.crypto, btoa, atob });
  ctx.self = ctx;
  ctx.importScripts = (...f) => f.forEach(n => vm.runInContext(fs.readFileSync(path.join(EXT, n), 'utf8'), ctx, { filename: n }));
  vm.runInContext(fs.readFileSync(path.join(EXT, 'background.js'), 'utf8'), ctx, { filename: 'background.js' });
  const settle = () => new Promise(r => setTimeout(r, 30));
  const fire = async (name, arg) => { for (const fn of listeners[name] || []) fn(arg); await settle(); };
  return { calls, fire, settle, registered: () => JSON.parse(JSON.stringify(reg)) };
}

test('a worker start re-registers a missing content script with no event at all', async () => {
  const w = boot({ registered: [] });
  await w.settle();
  assert.deepEqual(w.registered().map(s => s.js), [FILES]);
});

test('a registration left by 1.0.4 (no explain.js) is replaced, not trusted', async () => {
  const w = boot({ registered: [{ id: 'decoder-highlighter', js: ['concepts.js', 'content.js'], css: ['content.css'] }] });
  await w.fire('installed', { reason: 'update', previousVersion: '1.0.4' });
  assert.deepEqual(w.registered().map(s => s.js), [FILES]);
});

test('an up-to-date registration is left alone', async () => {
  const w = boot({ registered: [{ id: 'decoder-highlighter', js: FILES, css: ['content.css'] }] });
  await w.fire('startup');
  assert.equal(w.calls.register, 0);
  assert.equal(w.calls.unregister, 0);
});

test('wake-up sync and onInstalled sync do not collide on the script id', async () => {
  const w = boot({ registered: [] });
  await w.fire('installed', { reason: 'update', previousVersion: '1.1.0' });
  assert.equal(w.calls.register, 1);
  assert.equal(w.registered().length, 1);
});

test('without the all-sites grant the script is unregistered and no tab is touched', async () => {
  const w = boot({ granted: false, registered: [{ id: 'decoder-highlighter', js: FILES, css: ['content.css'] }], tabs: [{ id: 1, url: 'https://a.com', probe: true }] });
  await w.fire('installed', { reason: 'update', previousVersion: '1.1.0' });
  assert.equal(w.registered().length, 0);
  assert.equal(w.calls.injected.length, 0);
});

test('on update, open web tabs get the scripts — except discarded, non-web, and pre-1.1.1 orphan tabs', async () => {
  const w = boot({ tabs: [
    { id: 1, url: 'https://news.example/ai', probe: true },          // untouched or a retire-capable copy
    { id: 2, url: 'https://old.example', probe: false },             // pre-1.1.1 underlines, cannot retire
    { id: 3, url: 'https://sleeping.example', probe: true, discarded: true },
    { id: 4, url: 'chrome://extensions', probe: true }
  ] });
  await w.fire('installed', { reason: 'update', previousVersion: '1.1.0' });
  assert.deepEqual(w.calls.injected, [{ tabId: 1, files: FILES }]);
});

test('granting all-sites lights up every open tab, not only the active one', async () => {
  const w = boot({ tabs: [{ id: 1, url: 'https://a.com', probe: true }, { id: 2, url: 'https://b.com', probe: true }] });
  await w.fire('added', { origins: ['<all_urls>'] });
  assert.deepEqual(w.calls.injected.map(c => c.tabId), [1, 2]);
});
