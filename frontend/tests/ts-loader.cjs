/* Shared test helper: compile TS/TSX in memory (no new dependency) and load it with optional module mocks. */
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

/**
 * mocks: module id → exports. env: values for `import.meta.env` (CommonJS has no import.meta),
 * defaulting to a production build without VITE_API_BASE_URL.
 */
function loader(mocks = {}, env = { DEV: false, PROD: true, MODE: 'production' }) {
  const cache = new Map();
  function load(file) {
    file = path.resolve(root, file);
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} };
    cache.set(file, module);
    const native = createRequire(file);
    const requireTs = (id) => {
      if (Object.hasOwn(mocks, id)) return mocks[id];
      if (id.startsWith('.')) {
        const base = path.resolve(path.dirname(file), id);
        const found = ['.ts', '.tsx'].map((ext) => base + ext).find((p) => fs.existsSync(p));
        if (found) return load(found);
      }
      return native(id);
    };
    const source = fs.readFileSync(file, 'utf8').replace(/import\.meta\.env/g, '__importMetaEnv');
    const code = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    new Function('require', 'module', 'exports', '__importMetaEnv', code)(requireTs, module, module.exports, env);
    return module.exports;
  }
  return load;
}

module.exports = { loader, root };
