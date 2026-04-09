const Page = require('../models/Page');
const PageCollection = require('../models/PageCollection');

/**
 * Sitemap & robots.txt generation service.
 * Generates XML sitemap from published global pages.
 */

const DEFAULT_PRIORITY = '0.5';
const DEFAULT_CHANGEFREQ = 'weekly';

function escapeXml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildRoutePath(pagesPrefix, collectionSlug, pageSlug) {
  const parts = [];
  const prefix = String(pagesPrefix || '/').replace(/\/+$/, '');
  if (prefix && prefix !== '/') {
    parts.push(prefix.replace(/^\//, ''));
  }
  if (collectionSlug) {
    parts.push(collectionSlug);
  }
  parts.push(pageSlug);
  return '/' + parts.join('/');
}

async function generateSitemapXml({ baseUrl, pagesPrefix = '/' } = {}) {
  if (!baseUrl) {
    throw new Error('baseUrl is required for sitemap generation');
  }

  const normalizedBase = String(baseUrl).replace(/\/+$/, '');

  // Fetch all published global pages
  const pages = await Page.find({
    status: 'published',
    isGlobal: true,
  })
    .sort({ updatedAt: -1 })
    .lean();

  // Fetch collections for slug resolution
  const collectionIds = [...new Set(pages.filter((p) => p.collectionId).map((p) => String(p.collectionId)))];
  const collections = collectionIds.length > 0
    ? await PageCollection.find({ _id: { $in: collectionIds }, status: 'active' }).lean()
    : [];
  const collectionMap = new Map(collections.map((c) => [String(c._id), c]));

  const urls = [];

  for (const page of pages) {
    // Skip repeat template pages (slug === '_')
    if (page.slug === '_') continue;

    const collection = page.collectionId ? collectionMap.get(String(page.collectionId)) : null;
    const collectionSlug = collection ? collection.slug : null;

    // Skip pages whose collection is no longer active
    if (page.collectionId && !collection) continue;

    const routePath = buildRoutePath(pagesPrefix, collectionSlug, page.slug);
    const loc = `${normalizedBase}${routePath}`;
    const lastmod = page.updatedAt
      ? new Date(page.updatedAt).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];

    const seo = page.seoMeta || {};
    const priority = seo.sitemapPriority || DEFAULT_PRIORITY;
    const changefreq = seo.sitemapChangefreq || DEFAULT_CHANGEFREQ;

    urls.push({ loc, lastmod, changefreq, priority });
  }

  const xmlEntries = urls
    .map(
      (u) =>
        `  <url>\n    <loc>${escapeXml(u.loc)}</loc>\n    <lastmod>${escapeXml(u.lastmod)}</lastmod>\n    <changefreq>${escapeXml(u.changefreq)}</changefreq>\n    <priority>${escapeXml(u.priority)}</priority>\n  </url>`,
    )
    .join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    xmlEntries,
    '</urlset>',
  ].join('\n');
}

function generateRobotsTxt({ baseUrl, sitemapPath = '/sitemap.xml', disallow = [] } = {}) {
  const lines = ['User-agent: *'];

  if (disallow.length > 0) {
    for (const path of disallow) {
      lines.push(`Disallow: ${path}`);
    }
  } else {
    lines.push('Disallow:');
  }

  if (baseUrl) {
    const normalizedBase = String(baseUrl).replace(/\/+$/, '');
    lines.push('', `Sitemap: ${normalizedBase}${sitemapPath}`);
  }

  return lines.join('\n') + '\n';
}

module.exports = {
  generateSitemapXml,
  generateRobotsTxt,
};
