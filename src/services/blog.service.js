const BlogPost = require('../models/BlogPost');

function slugify(input) {
  const s = String(input || '')
    .trim()
    .toLowerCase();
  return s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function extractExcerptFromMarkdown(markdown) {
  const text = String(markdown || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^\)]*\)/g, ' ')
    .replace(/\[[^\]]*\]\([^\)]*\)/g, ' ')
    .replace(/[#>*_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > 180 ? `${text.slice(0, 177)}...` : text;
}

async function generateUniqueBlogSlug(title, { excludeId } = {}) {
  const base = slugify(title);
  let candidate = base || 'post';
  let n = 2;

  // Slug uniqueness is only enforced among non-archived posts via partial unique index.
  // We still do a pre-check to avoid duplicate key errors.
  while (true) {
    const query = {
      slug: candidate,
      status: { $in: ['draft', 'scheduled', 'published'] },
    };
    if (excludeId) query._id = { $ne: excludeId };

    const existing = await BlogPost.findOne(query).select('_id').lean();
    if (!existing) return candidate;

    candidate = `${base || 'post'}-${n}`;
    n += 1;
  }
}

function normalizeStringArray(value, { maxItems = 25, maxItemLength = 50 } = {}) {
  const arr = Array.isArray(value)
    ? value
    : value === undefined || value === null
      ? []
      : [value];

  const cleaned = [];
  const seen = new Set();
  for (const item of arr) {
    const s = String(item || '').trim();
    if (!s) continue;
    const capped = s.length > maxItemLength ? s.slice(0, maxItemLength) : s;
    const key = capped.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(capped);
    if (cleaned.length >= maxItems) break;
  }
  return cleaned;
}

function normalizeTags(value) {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) {
    return normalizeStringArray(value, { maxItems: 25, maxItemLength: 40 });
  }

  // accept comma-separated string
  const s = String(value || '');
  const parts = s
    .split(',')
    .map((t) => String(t || '').trim())
    .filter(Boolean);
  return normalizeStringArray(parts, { maxItems: 25, maxItemLength: 40 });
}

function parsePagination({ page, limit, maxLimit = 100, defaultLimit = 20 } = {}) {
  const p = Math.max(1, Number(page || 1) || 1);
  const l = Math.min(maxLimit, Math.max(1, Number(limit || defaultLimit) || defaultLimit));
  const skip = (p - 1) * l;
  return { page: p, limit: l, skip };
}

module.exports = {
  slugify,
  extractExcerptFromMarkdown,
  generateUniqueBlogSlug,
  normalizeTags,
  parsePagination,
};
