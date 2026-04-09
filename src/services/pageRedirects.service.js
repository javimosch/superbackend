const PageRedirect = require('../models/PageRedirect');

/** In-memory cache of active redirects for fast lookup */
let redirectCache = null;
let redirectCacheTs = 0;
const CACHE_TTL_MS = 60_000; // 1 minute

async function loadRedirects() {
  const now = Date.now();
  if (redirectCache && (now - redirectCacheTs) < CACHE_TTL_MS) {
    return redirectCache;
  }

  const docs = await PageRedirect.find({ enabled: true }).lean();
  const map = new Map();
  for (const doc of docs) {
    const from = String(doc.from || '').trim().toLowerCase();
    if (from) {
      map.set(from, { to: doc.to, type: doc.type || 301 });
    }
  }
  redirectCache = map;
  redirectCacheTs = now;
  return map;
}

function clearCache() {
  redirectCache = null;
  redirectCacheTs = 0;
}

async function checkRedirect(requestPath) {
  const map = await loadRedirects();
  const normalized = String(requestPath || '').trim().toLowerCase().replace(/\/+$/, '') || '/';
  return map.get(normalized) || null;
}

async function listRedirects({ limit = 100, offset = 0, search } = {}) {
  const filter = {};
  if (search) {
    filter.$or = [
      { from: { $regex: search, $options: 'i' } },
      { to: { $regex: search, $options: 'i' } },
      { note: { $regex: search, $options: 'i' } },
    ];
  }

  const [items, total] = await Promise.all([
    PageRedirect.find(filter).sort({ createdAt: -1 }).skip(offset).limit(limit).lean(),
    PageRedirect.countDocuments(filter),
  ]);

  return { items, total, limit, offset };
}

async function createRedirect({ from, to, type = 301, enabled = true, note = '' }) {
  const fromNorm = String(from || '').trim();
  const toNorm = String(to || '').trim();

  if (!fromNorm) throw Object.assign(new Error('from path is required'), { code: 'VALIDATION' });
  if (!toNorm) throw Object.assign(new Error('to path is required'), { code: 'VALIDATION' });
  if (fromNorm === toNorm) throw Object.assign(new Error('from and to must be different'), { code: 'VALIDATION' });

  const doc = await PageRedirect.create({
    from: fromNorm,
    to: toNorm,
    type: [301, 302].includes(Number(type)) ? Number(type) : 301,
    enabled: Boolean(enabled),
    note: String(note || ''),
  });

  clearCache();
  return doc.toObject();
}

async function updateRedirect(id, updates) {
  const doc = await PageRedirect.findById(id);
  if (!doc) throw Object.assign(new Error('Redirect not found'), { code: 'NOT_FOUND' });

  if (updates.from !== undefined) doc.from = String(updates.from).trim();
  if (updates.to !== undefined) doc.to = String(updates.to).trim();
  if (updates.type !== undefined) doc.type = [301, 302].includes(Number(updates.type)) ? Number(updates.type) : doc.type;
  if (updates.enabled !== undefined) doc.enabled = Boolean(updates.enabled);
  if (updates.note !== undefined) doc.note = String(updates.note || '');

  await doc.save();
  clearCache();
  return doc.toObject();
}

async function deleteRedirect(id) {
  const doc = await PageRedirect.findById(id);
  if (!doc) throw Object.assign(new Error('Redirect not found'), { code: 'NOT_FOUND' });

  await PageRedirect.deleteOne({ _id: id });
  clearCache();
  return { success: true };
}

module.exports = {
  checkRedirect,
  listRedirects,
  createRedirect,
  updateRedirect,
  deleteRedirect,
  clearCache,
};
