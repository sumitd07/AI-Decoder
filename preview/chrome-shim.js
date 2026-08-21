// Dev-only chrome.* stand-in so extension/popup.html can be opened in a normal
// tab (preview-server injects this for /extension/popup.html?shim=1). It fakes
// only the browser APIs — popup.js, popup.html and their CSS are the real files.
(function () {
  const store = {}; const listeners = [];
  const granted = !/[?&]granted=0/.test(location.search);
  window.chrome = {
    runtime: { lastError: null, sendMessage: async () => ({ ok: false }) },
    storage: {
      local: {
        get(keys, cb) { const out = {}; (Array.isArray(keys) ? keys : [keys]).forEach(k => { if (k in store) out[k] = store[k]; }); cb ? cb(out) : null; },
        set(obj, cb) { const ch = {}; Object.keys(obj).forEach(k => { ch[k] = { oldValue: store[k], newValue: obj[k] }; store[k] = obj[k]; }); listeners.forEach(f => f(ch, 'local')); cb && cb(); }
      },
      onChanged: { addListener(fn) { listeners.push(fn); } }
    },
    permissions: { contains: (p, cb) => cb(granted), request: (p, cb) => cb(true), remove: (p, cb) => cb(true) },
    tabs: { query: (q, cb) => cb([]) },
    scripting: { insertCSS: () => Promise.resolve(), executeScript: () => Promise.resolve() }
  };
  // popup.js reads a Supabase session through supa.js; signed-out is the state
  // that shows the most chrome, so leave it signed out.
  window.__shimReady = true;
})();
