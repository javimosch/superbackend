const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const JsonConfig = require('../models/JsonConfig');
const GlobalSetting = require('../models/GlobalSetting');

const { parseJsonOrThrow } = require('./jsonConfigs.service');
const globalSettingsService = require('./globalSettings.service');

const SEO_CONFIG_SLUG = 'seo-config';
const DEFAULT_OG_PNG_OUTPUT_PATH = 'public/og/og-default.png';
const DEFAULT_OG_PNG_WIDTH = 1200;
const DEFAULT_OG_PNG_HEIGHT = 630;

const OG_SVG_SETTING_KEY = 'seoconfig.og.svg';

async function ensureSeoJsonConfigExists() {
  const existing = await JsonConfig.findOne({ slug: SEO_CONFIG_SLUG });
  if (existing) return existing;

  const defaultConfig = {
    siteName: '',
    baseUrl: '',
    defaultOgImagePath: '/og/og-default.png',
    defaultTwitterCard: 'summary_large_image',
    defaultRobots: 'index,follow',
    pages: {},
  };

  return JsonConfig.create({
    title: 'SEO Config',
    slug: SEO_CONFIG_SLUG,
    publicEnabled: false,
    cacheTtlSeconds: 0,
    jsonRaw: JSON.stringify(defaultConfig, null, 2),
    jsonHash: null,
  });
}

async function getSeoJsonConfig() {
  const doc = await ensureSeoJsonConfigExists();
  return doc.toObject ? doc.toObject() : doc;
}

async function updateSeoJsonConfig(patch) {
  const doc = await ensureSeoJsonConfigExists();

  if (patch && Object.prototype.hasOwnProperty.call(patch, 'publicEnabled')) {
    doc.publicEnabled = Boolean(patch.publicEnabled);
  }

  if (patch && Object.prototype.hasOwnProperty.call(patch, 'cacheTtlSeconds')) {
    const ttl = Number(patch.cacheTtlSeconds || 0);
    doc.cacheTtlSeconds = Number.isNaN(ttl) ? 0 : Math.max(0, ttl);
  }

  if (patch && Object.prototype.hasOwnProperty.call(patch, 'jsonRaw')) {
    if (patch.jsonRaw === null || patch.jsonRaw === undefined) {
      const err = new Error('jsonRaw is required');
      err.code = 'VALIDATION';
      throw err;
    }

    parseJsonOrThrow(patch.jsonRaw);
    doc.jsonRaw = String(patch.jsonRaw);
  }

  await doc.save();
  return doc.toObject();
}

async function getOgSvgSettingRaw() {
  const svg = await globalSettingsService.getSettingValue(OG_SVG_SETTING_KEY, '');
  return typeof svg === 'string' ? svg : String(svg || '');
}

async function setOgSvgSettingRaw(svgRaw) {
  const value = String(svgRaw || '');

  const existing = await GlobalSetting.findOne({ key: OG_SVG_SETTING_KEY });
  if (!existing) {
    await GlobalSetting.create({
      key: OG_SVG_SETTING_KEY,
      value,
      type: 'html',
      description: 'Default OG image SVG (for SEO Config)',
      templateVariables: [],
      public: false,
    });
    globalSettingsService.clearSettingsCache();
    return { created: true };
  }

  existing.value = value;
  if (!existing.type) existing.type = 'html';
  await existing.save();
  globalSettingsService.clearSettingsCache();
  return { created: false };
}

function ensurePublicOutputPathOrThrow(outputPath) {
  const raw = String(outputPath || '').trim();
  if (!raw) {
    const err = new Error('outputPath is required');
    err.code = 'VALIDATION';
    throw err;
  }

  const normalized = raw.replace(/\\/g, '/');
  if (!normalized.startsWith('public/')) {
    const err = new Error('outputPath must be under public/');
    err.code = 'VALIDATION';
    throw err;
  }

  const resolved = path.resolve(process.cwd(), normalized);
  const publicRoot = path.resolve(process.cwd(), 'public');
  if (!resolved.startsWith(publicRoot + path.sep) && resolved !== publicRoot) {
    const err = new Error('Invalid outputPath');
    err.code = 'VALIDATION';
    throw err;
  }

  return { normalized, resolved, publicRoot };
}

function writeTempFile(prefix, ext, contents) {
  const filePath = path.join(os.tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`);
  fs.writeFileSync(filePath, contents, 'utf8');
  return filePath;
}

function execFilePromise(cmd, args, opts) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, opts || {}, (err, stdout, stderr) => {
      if (err) {
        err.stdout = stdout;
        err.stderr = stderr;
        reject(err);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function tryChromeScreenshot({ htmlFilePath, tmpOutPath, width, height }) {
  const candidates = [
    { cmd: 'google-chrome', args: ['--headless=new'] },
    { cmd: 'chromium', args: ['--headless'] },
    { cmd: 'chromium-browser', args: ['--headless'] },
  ];

  for (const c of candidates) {
    try {
      await execFilePromise(
        c.cmd,
        [
          ...c.args,
          '--disable-gpu',
          '--hide-scrollbars',
          `--window-size=${width},${height}`,
          `--screenshot=${tmpOutPath}`,
          `file://${htmlFilePath}`,
        ],
        { timeout: 30000 },
      );

      return { ok: true, tool: c.cmd };
    } catch (e) {
      if (e && (e.code === 'ENOENT' || e.errno === -2)) {
        continue;
      }
      continue;
    }
  }

  return { ok: false };
}

async function tryRsvgConvert({ svgPath, outPath, width, height }) {
  try {
    await execFilePromise('rsvg-convert', ['-w', String(width), '-h', String(height), svgPath, '-o', outPath], {
      timeout: 30000,
    });
    return { ok: true, tool: 'rsvg-convert' };
  } catch (e) {
    if (e && (e.code === 'ENOENT' || e.errno === -2)) return { ok: false };
    return { ok: false };
  }
}

async function tryImageMagick({ svgPath, outPath, width, height }) {
  const candidates = [
    { cmd: 'magick', args: ['-background', 'none', '-density', '192', svgPath, '-resize', `${width}x${height}!`, outPath] },
    { cmd: 'convert', args: ['-background', 'none', '-density', '192', svgPath, '-resize', `${width}x${height}!`, outPath] },
  ];

  for (const c of candidates) {
    try {
      await execFilePromise(c.cmd, c.args, { timeout: 30000 });
      return { ok: true, tool: c.cmd };
    } catch (e) {
      if (e && (e.code === 'ENOENT' || e.errno === -2)) {
        continue;
      }
      continue;
    }
  }

  return { ok: false };
}

async function tryInkscape({ svgPath, outPath, width, height }) {
  try {
    await execFilePromise(
      'inkscape',
      [svgPath, '--export-type=png', `--export-filename=${outPath}`, '-w', String(width), '-h', String(height)],
      { timeout: 30000 },
    );
    return { ok: true, tool: 'inkscape' };
  } catch (e) {
    if (e && (e.code === 'ENOENT' || e.errno === -2)) return { ok: false };
    return { ok: false };
  }
}

async function generateOgPng({ svgRaw, outputPath, width, height }) {
  const w = Number(width || DEFAULT_OG_PNG_WIDTH);
  const h = Number(height || DEFAULT_OG_PNG_HEIGHT);

  const safeWidth = Number.isFinite(w) && w > 0 ? Math.floor(w) : DEFAULT_OG_PNG_WIDTH;
  const safeHeight = Number.isFinite(h) && h > 0 ? Math.floor(h) : DEFAULT_OG_PNG_HEIGHT;

  const { normalized, resolved } = ensurePublicOutputPathOrThrow(outputPath || DEFAULT_OG_PNG_OUTPUT_PATH);

  const svg = String(svgRaw || '').trim();
  if (!svg) {
    const err = new Error('SVG is empty');
    err.code = 'VALIDATION';
    throw err;
  }

  fs.mkdirSync(path.dirname(resolved), { recursive: true });

  const tmpSvg = writeTempFile('seo-og', 'svg', svg);
  const tmpHtml = writeTempFile(
    'seo-og',
    'html',
    `<!doctype html><html><head><meta charset="utf-8" />
<meta name="viewport" content="width=${safeWidth}, height=${safeHeight}, initial-scale=1" />
<style>
html, body { margin: 0; padding: 0; width: ${safeWidth}px; height: ${safeHeight}px; overflow: hidden; background: transparent; }
img { display: block; width: ${safeWidth}px; height: ${safeHeight}px; }
</style></head><body><img src="file://${tmpSvg}" alt="og" /></body></html>`,
  );

  const tmpPng = path.join(os.tmpdir(), `seo-og-${Date.now()}-${Math.random().toString(16).slice(2)}.png`);

  try {
    const chromeRes = await tryChromeScreenshot({ htmlFilePath: tmpHtml, tmpOutPath: tmpPng, width: safeWidth, height: safeHeight });
    if (chromeRes.ok) {
      fs.renameSync(tmpPng, resolved);
      return {
        outputPath: normalized,
        publicUrlPath: `/${normalized.replace(/^public\//, '')}`,
        width: safeWidth,
        height: safeHeight,
        tool: chromeRes.tool,
      };
    }

    const rsvgRes = await tryRsvgConvert({ svgPath: tmpSvg, outPath: resolved, width: safeWidth, height: safeHeight });
    if (rsvgRes.ok) {
      return {
        outputPath: normalized,
        publicUrlPath: `/${normalized.replace(/^public\//, '')}`,
        width: safeWidth,
        height: safeHeight,
        tool: rsvgRes.tool,
      };
    }

    const magickRes = await tryImageMagick({ svgPath: tmpSvg, outPath: resolved, width: safeWidth, height: safeHeight });
    if (magickRes.ok) {
      return {
        outputPath: normalized,
        publicUrlPath: `/${normalized.replace(/^public\//, '')}`,
        width: safeWidth,
        height: safeHeight,
        tool: magickRes.tool,
      };
    }

    const inkRes = await tryInkscape({ svgPath: tmpSvg, outPath: resolved, width: safeWidth, height: safeHeight });
    if (inkRes.ok) {
      return {
        outputPath: normalized,
        publicUrlPath: `/${normalized.replace(/^public\//, '')}`,
        width: safeWidth,
        height: safeHeight,
        tool: inkRes.tool,
      };
    }

    const err = new Error(
      'No SVG->PNG converter found. Install one of: Chrome/Chromium (google-chrome/chromium), ImageMagick (magick/convert), librsvg (rsvg-convert), or Inkscape.',
    );
    err.code = 'NO_CONVERTER';
    throw err;
  } finally {
    try { fs.unlinkSync(tmpSvg); } catch {}
    try { fs.unlinkSync(tmpHtml); } catch {}
    try { fs.unlinkSync(tmpPng); } catch {}
  }
}

async function getSeoconfigOpenRouterApiKey() {
  const scoped = await globalSettingsService.getSettingValue('seoconfig.ai.openrouter.apiKey', null);
  if (scoped) return scoped;
  return globalSettingsService.getSettingValue('ai.openrouter.apiKey', null);
}

async function getSeoconfigOpenRouterModel() {
  const scoped = await globalSettingsService.getSettingValue('seoconfig.ai.openrouter.model', null);
  if (scoped) return scoped;
  const fallback = await globalSettingsService.getSettingValue('ai.openrouter.model', null);
  if (fallback) return fallback;
  return 'google/gemini-2.5-flash-lite';
}

module.exports = {
  SEO_CONFIG_SLUG,
  OG_SVG_SETTING_KEY,
  DEFAULT_OG_PNG_OUTPUT_PATH,
  DEFAULT_OG_PNG_WIDTH,
  DEFAULT_OG_PNG_HEIGHT,
  ensureSeoJsonConfigExists,
  getSeoJsonConfig,
  updateSeoJsonConfig,
  getOgSvgSettingRaw,
  setOgSvgSettingRaw,
  generateOgPng,
  getSeoconfigOpenRouterApiKey,
  getSeoconfigOpenRouterModel,
};
