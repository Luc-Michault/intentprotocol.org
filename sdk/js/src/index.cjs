// CJS wrapper — delegates to the ESM module via dynamic import
// For environments that don't support ESM yet.

let _mod;

async function load() {
  if (!_mod) _mod = await import('./index.js');
  return _mod;
}

module.exports = new Proxy(
  {},
  {
    get(_, key) {
      if (key === 'then') return undefined; // avoid thenable trap
      return async (...args) => {
        const mod = await load();
        const val = mod[key];
        return typeof val === 'function' ? val(...args) : val;
      };
    },
  },
);

// Also export a load() for explicit async initialization
module.exports.load = load;
