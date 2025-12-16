const fs = require('fs');
const path = require('path');

const cache = {
  timestamp: 0,
  ttlMs: 30000,
  signature: '',
  keys: [],
};

function toPosixPath(p) {
  return String(p).split(path.sep).join('/');
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function patternToRegex(pattern) {
  // Minimal .gitignore-like glob to regex:
  // - supports *, ?, **
  // - supports leading '/' (anchored at repo root)
  // - supports trailing '/' (directory prefix)
  const anchored = pattern.startsWith('/');
  let p = anchored ? pattern.slice(1) : pattern;
  const dirOnly = p.endsWith('/');
  if (dirOnly) p = p.slice(0, -1);

  let re = '';
  for (let i = 0; i < p.length; i += 1) {
    const ch = p[i];
    const next = p[i + 1];

    if (ch === '*' && next === '*') {
      re += '.*';
      i += 1;
      continue;
    }
    if (ch === '*') {
      re += '[^/]*';
      continue;
    }
    if (ch === '?') {
      re += '[^/]';
      continue;
    }

    re += escapeRegex(ch);
  }

  if (anchored) {
    // Match from root
    return new RegExp(`^${re}${dirOnly ? '(/|$)' : '$'}`);
  }

  // Match anywhere in the path
  return new RegExp(`(^|/)${re}${dirOnly ? '(/|$)' : '$'}`);
}

function loadGitignoreMatchers(rootDir) {
  const ignoreFile = path.join(rootDir, '.gitignore');
  if (!fs.existsSync(ignoreFile)) {
    return [];
  }

  let raw = '';
  try {
    raw = fs.readFileSync(ignoreFile, 'utf8');
  } catch {
    return [];
  }

  const lines = raw.split(/\r?\n/);
  const matchers = [];
  for (const lineRaw of lines) {
    const line = String(lineRaw || '').trim();
    if (!line) continue;
    if (line.startsWith('#')) continue;

    // Negation is not supported in this lightweight matcher.
    if (line.startsWith('!')) continue;

    matchers.push(patternToRegex(line));
  }
  return matchers;
}

function createIgnoreFn(rootDir) {
  const rootPosix = toPosixPath(rootDir);
  const matchers = loadGitignoreMatchers(rootDir);

  return function isIgnored(absPath) {
    const rel = toPosixPath(path.relative(rootDir, absPath));
    if (!rel || rel === '.') return false;

    // Always ignore these.
    if (rel === 'node_modules' || rel.startsWith('node_modules/')) return true;
    if (rel === '.git' || rel.startsWith('.git/')) return true;

    // Apply .gitignore matchers
    for (const re of matchers) {
      if (re.test(rel)) return true;
    }

    // Also ignore any path that escapes root (defensive)
    const absPosix = toPosixPath(absPath);
    if (!absPosix.startsWith(rootPosix)) return true;

    return false;
  };
}

function parseDirList(raw) {
  if (!raw) return [];
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function getDefaultScanDirs() {
  const envDirs = parseDirList(process.env.I18N_SCAN_VIEW_DIRS);
  if (envDirs.length > 0) return envDirs;

  // Generic default: scan the repository root (cwd) recursively.
  return [process.cwd()];
}

function walkFilesSync(dir, out, ignoreFn) {
  if (!fs.existsSync(dir)) return;
  if (ignoreFn && ignoreFn(dir)) return;

  const stat = fs.statSync(dir);
  if (!stat.isDirectory()) return;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name === '.git') continue;
      if (ignoreFn && ignoreFn(full)) continue;
      walkFilesSync(full, out, ignoreFn);
      continue;
    }

    if (ent.isFile() && ent.name.endsWith('.ejs')) {
      if (ignoreFn && ignoreFn(full)) continue;
      try {
        const st = fs.statSync(full);
        out.push({ filePath: full, mtimeMs: st.mtimeMs, size: st.size });
      } catch {
        // ignore
      }
    }
  }
}

function computeSignature(files) {
  return files
    .map((f) => `${f.filePath}:${f.mtimeMs}:${f.size}`)
    .sort()
    .join('|');
}

function extractKeysFromEjsSource(src, { includeTCalls }) {
  const keys = new Set();

  // data-i18n-key="..." or '...'
  const datasetRe = /data-i18n-key\s*=\s*(["'])([^"']+)\1/g;
  for (let m = datasetRe.exec(src); m; m = datasetRe.exec(src)) {
    const key = String(m[2] || '').trim();
    if (key) keys.add(key);
  }

  if (includeTCalls) {
    // t('foo.bar') or t("foo.bar")
    const tCallRe = /\bt\s*\(\s*(["'])([^"']+)\1\s*[\),]/g;
    for (let m = tCallRe.exec(src); m; m = tCallRe.exec(src)) {
      const key = String(m[2] || '').trim();
      if (key) keys.add(key);
    }
  }

  return Array.from(keys);
}

function scanOnce({ viewDirs, includeTCalls }) {
  const dirs = Array.isArray(viewDirs) && viewDirs.length > 0 ? viewDirs : getDefaultScanDirs();

  const rootDir = process.cwd();
  const ignoreFn = createIgnoreFn(rootDir);

  const files = [];
  for (const d of dirs) {
    const abs = path.isAbsolute(d) ? d : path.join(process.cwd(), d);
    walkFilesSync(abs, files, ignoreFn);
  }

  const signature = computeSignature(files);
  const now = Date.now();

  if (cache.keys.length > 0 && cache.signature === signature && now - cache.timestamp < cache.ttlMs) {
    return cache.keys;
  }

  const keys = new Set();
  for (const f of files) {
    try {
      const src = fs.readFileSync(f.filePath, 'utf8');
      const extracted = extractKeysFromEjsSource(src, { includeTCalls });
      for (const k of extracted) keys.add(k);
    } catch {
      // ignore file read errors
    }
  }

  const sorted = Array.from(keys).sort();
  cache.keys = sorted;
  cache.signature = signature;
  cache.timestamp = now;

  return sorted;
}

function getInferredI18nKeys(options = {}) {
  return scanOnce({
    viewDirs: options.viewDirs,
    includeTCalls: options.includeTCalls === true,
  });
}

function clearInferredI18nKeysCache() {
  cache.timestamp = 0;
  cache.signature = '';
  cache.keys = [];
}

module.exports = {
  getInferredI18nKeys,
  clearInferredI18nKeysCache,
};
