const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const ejs = require('ejs');

const VirtualEjsFile = require('../models/VirtualEjsFile');
const VirtualEjsFileVersion = require('../models/VirtualEjsFileVersion');
const VirtualEjsGroupChange = require('../models/VirtualEjsGroupChange');

const llmService = require('./llm.service');
const { resolveLlmProviderModel } = require('./llmDefaults.service');
const { createAuditEvent } = require('./audit.service');

const CACHE_TTL_MS = 5 * 60 * 1000;

const templateCache = new Map();
let purgeTimerStarted = false;

function ensurePurgeTimer() {
  if (purgeTimerStarted) return;
  purgeTimerStarted = true;

  const timer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of templateCache.entries()) {
      if (!v || v.expiresAt <= now) {
        templateCache.delete(k);
      }
    }
  }, 60 * 1000);

  if (typeof timer.unref === 'function') {
    timer.unref();
  }
}

function sha1(text) {
  return crypto.createHash('sha1').update(String(text || ''), 'utf8').digest('hex');
}

function normalizeRelPath(p) {
  const raw = String(p || '').trim();
  if (!raw) {
    const err = new Error('path is required');
    err.code = 'VALIDATION';
    throw err;
  }

  const posix = raw.replace(/\\/g, '/').replace(/^\/+/, '');
  const normalized = path.posix.normalize(posix);
  if (normalized.startsWith('..')) {
    const err = new Error('Invalid path');
    err.code = 'VALIDATION';
    throw err;
  }
  if (!normalized.endsWith('.ejs')) {
    const err = new Error('path must end with .ejs');
    err.code = 'VALIDATION';
    throw err;
  }
  return normalized;
}

function normalizeViewPath(viewPath) {
  const raw = String(viewPath || '').trim();
  if (!raw) {
    const err = new Error('viewPath is required');
    err.code = 'VALIDATION';
    throw err;
  }
  const p = raw.endsWith('.ejs') ? raw : `${raw}.ejs`;
  return normalizeRelPath(p);
}

function getDefaultViewsRoot() {
  return path.join(process.cwd(), 'src', 'views');
}

function resolveAbsPath(viewsRoot, relPath) {
  const root = path.resolve(String(viewsRoot || getDefaultViewsRoot()));
  const abs = path.resolve(root, relPath);
  if (!abs.startsWith(root + path.sep) && abs !== root) {
    const err = new Error('Invalid view path');
    err.code = 'VALIDATION';
    throw err;
  }
  return abs;
}

async function readFsView(viewsRoot, relPath) {
  const abs = resolveAbsPath(viewsRoot, relPath);
  const stat = await fs.promises.stat(abs);
  if (!stat.isFile()) {
    const err = new Error('View not found on filesystem');
    err.code = 'NOT_FOUND';
    throw err;
  }
  if (stat.size > 500_000) {
    const err = new Error('View file too large');
    err.code = 'VALIDATION';
    throw err;
  }
  return fs.promises.readFile(abs, 'utf8');
}

function cacheKeyFor(relPath, versionKey) {
  return `${relPath}::${versionKey || ''}`;
}

function getCachedTemplate(relPath, versionKey) {
  ensurePurgeTimer();
  const key = cacheKeyFor(relPath, versionKey);
  const v = templateCache.get(key);
  if (!v) return null;
  if (v.expiresAt <= Date.now()) {
    templateCache.delete(key);
    return null;
  }
  return v;
}

function setCachedTemplate(relPath, versionKey, template, meta = {}) {
  ensurePurgeTimer();
  const key = cacheKeyFor(relPath, versionKey);
  templateCache.set(key, {
    template,
    meta,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

function invalidateCacheForPath(relPath) {
  const prefix = `${relPath}::`;
  for (const key of templateCache.keys()) {
    if (key.startsWith(prefix)) {
      templateCache.delete(key);
    }
  }
}

function clearCache() {
  templateCache.clear();
}

async function resolveTemplateSource({ viewsRoot, relPath, allowDb = true }) {
  const normalized = normalizeRelPath(relPath);

  let fileDoc = null;
  if (allowDb) {
    fileDoc = await VirtualEjsFile.findOne({ path: normalized }).lean();
  }

  if (fileDoc && fileDoc.enabled === true && typeof fileDoc.content === 'string' && fileDoc.content.trim() !== '') {
    console.log(`[ejsVirtual] Resolved ${normalized} from DB (${fileDoc.content.length} chars)`);
    return {
      relPath: normalized,
      source: 'db',
      content: fileDoc.content,
      updatedAt: fileDoc.updatedAt,
    };
  }

  const fsContent = await readFsView(viewsRoot, normalized);
  console.log(`[ejsVirtual] Resolved ${normalized} from FS (${fsContent?.length || 0} chars)`);
  return {
    relPath: normalized,
    source: 'fs',
    content: fsContent,
    updatedAt: null,
  };
}

async function recordIntegratedUsage(relPath, actor = null) {
  const normalized = normalizeRelPath(relPath);

  await VirtualEjsFile.updateOne(
    { path: normalized },
    {
      $set: { integrated: true, lastRenderedAt: new Date() },
      $inc: { renderCount: 1 },
      $setOnInsert: { inferred: true },
    },
    { upsert: true },
  );

  if (actor) {
    await createAuditEvent({
      ...actor,
      action: 'ejsVirtual.render',
      entityType: 'VirtualEjsFile',
      entityId: normalized,
      before: null,
      after: { path: normalized },
      meta: null,
    });
  }
}

function parseDiffBlocks(content) {
  const blocks = [];
  const regex = /<<<<<<< SEARCH\n([\s\S]*?)\n=======\n([\s\S]*?)\n>>>>>>> REPLACE/g;
  let match;

  while ((match = regex.exec(String(content || ''))) !== null) {
    blocks.push({ search: match[1], replace: match[2] });
  }

  return blocks;
}

function applyDiffs(originalText, diffBlocks) {
  let result = String(originalText || '');
  const appliedRanges = [];

  for (const block of diffBlocks) {
    const index = result.indexOf(block.search);
    if (index === -1) {
      const err = new Error('Could not find SEARCH block in file');
      err.code = 'DIFF_MATCH_FAILED';
      throw err;
    }

    const overlaps = appliedRanges.some(([start, end]) =>
      (index >= start && index < end) ||
      (index + block.search.length > start && index + block.search.length <= end),
    );

    if (overlaps) {
      const err = new Error('Overlapping diff blocks detected');
      err.code = 'DIFF_OVERLAP';
      throw err;
    }

    result = result.substring(0, index) + block.replace + result.substring(index + block.search.length);

    appliedRanges.push([index, index + block.replace.length]);
  }

  return result;
}

function parseMultiFilePatch(text) {
  const raw = String(text || '');
  const lines = raw.split(/\r?\n/);
  const files = [];

  let current = null;
  for (const line of lines) {
    const m = line.match(/^FILE:\s*(.+)$/);
    if (m) {
      if (current) files.push(current);
      current = { path: m[1].trim(), content: '' };
      continue;
    }
    if (!current) continue;
    current.content += (current.content ? '\n' : '') + line;
  }
  if (current) files.push(current);

  return files;
}

async function resolveLlmDefaults({ providerKey, model }) {
  return resolveLlmProviderModel({
    systemKey: 'ejsVirtual.vibe.apply',
    providerKey,
    model,
  });
}

async function vibeEdit({ prompt, paths, providerKey, model, viewsRoot, actor }) {
  const instruction = String(prompt || '').trim();
  if (!instruction) {
    const err = new Error('prompt is required');
    err.code = 'VALIDATION';
    throw err;
  }

  const targetPaths = Array.isArray(paths) ? paths : [];
  if (targetPaths.length === 0) {
    const err = new Error('paths is required');
    err.code = 'VALIDATION';
    throw err;
  }

  const normalizedPaths = targetPaths.map((p) => normalizeRelPath(p));
  const llmDefaults = await resolveLlmDefaults({ providerKey, model });

  const fileContexts = [];
  for (const relPath of normalizedPaths) {
    const src = await resolveTemplateSource({ viewsRoot, relPath, allowDb: true });
    fileContexts.push({ relPath, content: src.content });
  }

  const systemPrompt = [
    'You are a code editor assistant modifying EJS files.',
    'You may edit multiple files.',
    'Return ONLY changes using multi-file SEARCH/REPLACE patches.',
    '',
    'Format:',
    'FILE: <relative/path.ejs>',
    '<<<<<<< SEARCH',
    '[exact text to find - must match character-by-character including whitespace]',
    '=======',
    '[replacement text]',
    '>>>>>>> REPLACE',
    '',
    'Rules:',
    '- You can include multiple FILE sections.',
    '- SEARCH must match exactly (whitespace matters).',
    '- Include enough context (5-10 lines) for unique matching.',
    '- Preserve EJS tags and bindings.',
    '- Do not include any text outside FILE sections and SEARCH/REPLACE blocks.',
  ].join('\n');

  const userContext = fileContexts
    .map((f) => `FILE: ${f.relPath}\n\nCurrent content:\n\n${f.content}`)
    .join('\n\n-----\n\n');

  const result = await llmService.callAdhoc(
    {
      providerKey: llmDefaults.providerKey,
      model: llmDefaults.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Instruction:\n${instruction}` },
        { role: 'user', content: userContext },
      ],
      promptKeyForAudit: 'ejsVirtual.vibe',
    },
    { temperature: 0.3 },
  );

  const raw = String(result.content || '');
  const filePatches = parseMultiFilePatch(raw);

  if (filePatches.length === 0) {
    const err = new Error('LLM returned no FILE patches');
    err.code = 'AI_INVALID';
    throw err;
  }

  const patchByPath = new Map();
  for (const fp of filePatches) {
    const p = normalizeRelPath(fp.path);
    patchByPath.set(p, fp.content);
  }

  const updates = [];
  for (const relPath of normalizedPaths) {
    const patchText = patchByPath.get(relPath);
    if (!patchText) continue;

    const current = await resolveTemplateSource({ viewsRoot, relPath, allowDb: true });
    const blocks = parseDiffBlocks(patchText);
    if (blocks.length === 0) {
      const err = new Error(`No diff blocks found for ${relPath}`);
      err.code = 'AI_INVALID';
      throw err;
    }

    const nextContent = applyDiffs(current.content, blocks);
    updates.push({ relPath, before: current.content, after: nextContent });
  }

  if (updates.length === 0) {
    const err = new Error('No applicable patches matched requested paths');
    err.code = 'AI_INVALID';
    throw err;
  }

  const groupCount = await VirtualEjsGroupChange.countDocuments({});
  const group = await VirtualEjsGroupChange.create({
    title: `Grouped changes ${groupCount + 1}`,
    summary: instruction.substring(0, 120),
    filePaths: updates.map((u) => u.relPath),
    versionIds: [],
    createdBy: actor?.actorId || null,
  });

  const versionIds = [];

  for (const u of updates) {
    const fileDoc = await VirtualEjsFile.findOne({ path: u.relPath });
    const beforeDoc = fileDoc ? fileDoc.toObject() : null;

    const nextDoc = await VirtualEjsFile.findOneAndUpdate(
      { path: u.relPath },
      {
        $set: {
          path: u.relPath,
          enabled: true,
          content: u.after,
          source: 'llm',
          inferred: true,
          lastSeenAt: new Date(),
        },
        $setOnInsert: {
          integrated: false,
          renderCount: 0,
          lastRenderedAt: null,
        },
      },
      { upsert: true, new: true },
    );

    const version = await VirtualEjsFileVersion.create({
      fileId: nextDoc._id,
      path: u.relPath,
      content: u.after,
      source: 'llm',
      description: instruction.substring(0, 200),
      groupId: group._id,
    });

    versionIds.push(version._id);

    await createAuditEvent({
      ...(actor || { actorType: 'system', actorId: null }),
      action: 'ejsVirtual.vibe.apply',
      entityType: 'VirtualEjsFile',
      entityId: u.relPath,
      before: beforeDoc,
      after: nextDoc.toObject(),
      meta: {
        groupId: String(group._id),
        providerKey: llmDefaults.providerKey,
        model: llmDefaults.model,
      },
    });

    invalidateCacheForPath(u.relPath);
  }

  await VirtualEjsGroupChange.updateOne({ _id: group._id }, { $set: { versionIds } });

  return {
    group: await VirtualEjsGroupChange.findById(group._id).lean(),
    updates: updates.map((u) => ({ path: u.relPath })),
    providerKey: llmDefaults.providerKey,
    model: llmDefaults.model,
  };
}

function extractIncludePaths(ejsSource) {
  const src = String(ejsSource || '');
  const results = new Set();

  // Matches: <%- include('x') %>, <%= include("x") %>, etc.
  const regex = /include\(\s*['"]([^'"]+)['"]\s*(?:,\s*[^)]*)?\)/g;
  let match;
  while ((match = regex.exec(src)) !== null) {
    const p = String(match[1] || '').trim();
    if (p) results.add(p);
  }
  return Array.from(results);
}

function resolveIncludeRelPath({ viewsRoot, parentAbsPath, includePath }) {
  const baseRoot = path.resolve(String(viewsRoot || getDefaultViewsRoot()));
  let incRaw = String(includePath || '').trim();
  if (!incRaw) return null;

  // If the incoming include already embeds the views root somewhere (e.g. duplicated path),
  // trim to the portion starting at the views root so we don't end up concatenating it twice.
  const idx = incRaw.indexOf(baseRoot);
  if (idx > 0) {
    incRaw = incRaw.slice(idx);
  }

  const incWithExt = incRaw.endsWith('.ejs') ? incRaw : `${incRaw}.ejs`;

  let includeAbs;
  if (path.isAbsolute(incWithExt)) {
    includeAbs = incWithExt;
  } else if (incWithExt.startsWith('/')) {
    includeAbs = resolveAbsPath(baseRoot, incWithExt.replace(/^\//, ''));
  } else {
    includeAbs = path.resolve(path.dirname(parentAbsPath), incWithExt);
  }

  const normalizedAbs = path.resolve(includeAbs);
  // Use path.sep to ensure we match the full directory name
  if (!normalizedAbs.startsWith(baseRoot + path.sep) && normalizedAbs !== baseRoot) {
    const err = new Error(`Include path escapes views root: ${normalizedAbs} (root: ${baseRoot})`);
    err.code = 'VALIDATION';
    throw err;
  }

  const rel = path.relative(baseRoot, includeAbs).replace(/\\/g, '/');
  return normalizeRelPath(rel);
}

async function preloadTemplatesForRender({ viewsRoot, entryRelPath }) {
  const templatesByRelPath = new Map();
  const absByRelPath = new Map();
  const seen = new Set();

  // 1. Pre-populate with all enabled DB overrides.
  // This ensures dynamic includes (like blocks) that exist in DB are available.
  try {
    const dbFiles = await VirtualEjsFile.find({ enabled: true }).lean();
    if (dbFiles && dbFiles.length > 0) {
      console.log(`[ejsVirtual] Preloading ${dbFiles.length} enabled DB templates: ${dbFiles.map(f => `${f.path} (${f.content?.length || 0} chars)`).join(', ')}`);
      for (const f of dbFiles) {
        templatesByRelPath.set(f.path, {
          relPath: f.path,
          source: 'db',
          content: f.content,
          updatedAt: f.updatedAt,
        });
        absByRelPath.set(f.path, resolveAbsPath(viewsRoot, f.path));
      }
    }
  } catch (err) {
    console.error('[ejsVirtual] Failed to preload DB templates:', err);
  }

  const queue = [entryRelPath];
  // Also crawl static includes of DB-overridden files
  for (const p of templatesByRelPath.keys()) {
    queue.push(p);
  }

  while (queue.length > 0) {
    const relPath = queue.shift();
    if (!relPath || seen.has(relPath)) continue;
    seen.add(relPath);

    let src = templatesByRelPath.get(relPath);
    if (!src) {
      try {
        src = await resolveTemplateSource({ viewsRoot, relPath, allowDb: true });
        templatesByRelPath.set(relPath, src);
      } catch (err) {
        // If not found, we still want to keep going, it might be on FS or missing
        console.warn(`[ejsVirtual] Failed to resolve template source for ${relPath}:`, err.message);
        continue;
      }
    }

    const abs = absByRelPath.get(relPath) || resolveAbsPath(viewsRoot, relPath);
    absByRelPath.set(relPath, abs);

    const includes = extractIncludePaths(src.content);
    for (const inc of includes) {
      try {
        const incRel = resolveIncludeRelPath({ viewsRoot, parentAbsPath: abs, includePath: inc });
        if (incRel) queue.push(incRel);
      } catch (err) {
        console.warn(`[ejsVirtual] Failed to resolve include path "${inc}" in ${relPath}:`, err.message);
      }
    }
  }

  return { templatesByRelPath, absByRelPath };
}

async function renderToString(res, viewPath, data = {}, options = {}) {
  const relPath = normalizeViewPath(viewPath);
  const viewsRoot = path.resolve(options.viewsRoot || (res && res.app ? res.app.get('views') : null) || getDefaultViewsRoot());

  console.log(`[ejsVirtual] Rendering ${relPath} (viewsRoot: ${viewsRoot})`);

  const { templatesByRelPath, absByRelPath } = await preloadTemplatesForRender({
    viewsRoot,
    entryRelPath: relPath,
  });

  if (templatesByRelPath.size === 0) {
    console.warn(`[ejsVirtual] No templates preloaded for ${relPath}`);
  }

  const entry = templatesByRelPath.get(relPath);
  if (!entry) {
    const err = new Error(`Template not found: ${relPath}`);
    err.code = 'NOT_FOUND';
    throw err;
  }

  console.log(`[ejsVirtual] Entry template ${relPath} source: ${entry.source}`);

  const entryAbs = absByRelPath.get(relPath) || resolveAbsPath(viewsRoot, relPath);

  const versionKey = entry.source === 'db'
    ? sha1(`${entry.relPath}:${String(entry.updatedAt || '')}`)
    : 'fs';

  const cached = getCachedTemplate(entry.relPath, versionKey);
  const entryTemplate = cached ? cached.template : entry.content;
  
  if (!entryTemplate || entryTemplate.trim() === '') {
    console.warn(`[ejsVirtual] Entry template ${relPath} is empty! Source: ${entry.source}`);
  } else {
    console.log(`[ejsVirtual] Entry template ${relPath} content start: ${entryTemplate.substring(0, 50).replace(/\n/g, '\\n')}...`);
  }

  if (!cached) {
    setCachedTemplate(entry.relPath, versionKey, entry.content, {});
  }

  // Also cache included templates (best-effort)
  for (const [p, src] of templatesByRelPath.entries()) {
    const k = src.source === 'db' ? sha1(`${src.relPath}:${String(src.updatedAt || '')}`) : 'fs';
    if (!getCachedTemplate(p, k)) {
      setCachedTemplate(p, k, src.content, {});
    }
  }

  function includer(originalPath, parsedPath) {
    const includePath = parsedPath || originalPath;
    const parentAbs = (this && this.filename) ? this.filename : entryAbs;

    const incRel = resolveIncludeRelPath({
      viewsRoot,
      parentAbsPath: parentAbs,
      includePath,
    });

    const incAbs = incRel ? absByRelPath.get(incRel) || resolveAbsPath(viewsRoot, incRel) : parentAbs;
    const src = incRel ? templatesByRelPath.get(incRel) : null;
    
    if (!incRel || !src) {
      // If not in preloaded map, it might be on FS.
      // Check if it exists on FS to avoid ENOENT crash
      try {
        if (incAbs && fs.existsSync(incAbs) && fs.statSync(incAbs).isFile()) {
          console.log(`[ejsVirtual] Include ${incRel || includePath} found on FS (fallback)`);
          return { filename: incAbs };
        }
      } catch (e) {
        // ignore errors
      }
      
      // If it doesn't exist anywhere, return a comment instead of crashing
      console.warn(`[ejsVirtual] Include not found: ${incRel || includePath} (parent: ${parentAbs})`);
      return { template: `<!-- Include not found: ${incRel || includePath} -->` };
    }

    if (src.content === undefined || src.content === null || src.content.trim() === '') {
      console.warn(`[ejsVirtual] Including ${incRel} from ${src.source} but content is empty`);
    }

    console.log(`[ejsVirtual] Including ${incRel} from ${src.source}`);
    return {
      filename: incAbs,
      template: src.content,
    };
  }

  await recordIntegratedUsage(relPath, null);

  const rendered = ejs.render(entryTemplate, { ...(data || {}), ...(res?.locals || {}) }, {
    filename: entryAbs,
    async: false,
    includer,
  });

  if (!rendered || rendered.trim() === '') {
    console.warn(`[ejsVirtual] Rendered content for ${relPath} is empty!`);
  } else {
    console.log(`[ejsVirtual] Rendered content for ${relPath} length: ${rendered.length} chars`);
  }

  return rendered;
}

async function render(res, viewPath, data = {}, options = {}) {
  const html = await renderToString(res, viewPath, data, options);
  res.send(html);
}

module.exports = {
  normalizeRelPath,
  normalizeViewPath,
  resolveTemplateSource,
  readFsView,
  invalidateCacheForPath,
  clearCache,
  vibeEdit,
  renderToString,
  render,
};