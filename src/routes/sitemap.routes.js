const express = require('express');
const router = express.Router();
const sitemapService = require('../services/sitemap.service');

router.get('/sitemap.xml', async (req, res) => {
  try {
    const protocol = req.get('x-forwarded-proto') || req.protocol || 'https';
    const host = req.get('x-forwarded-host') || req.get('host');
    const baseUrl = process.env.SITE_URL || `${protocol}://${host}${req.baseUrl}`;
    const pagesPrefix = req.app.get('pagesPrefix') || '/';

    const xml = await sitemapService.generateSitemapXml({ baseUrl, pagesPrefix });
    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(xml);
  } catch (err) {
    console.error('[sitemap] Error generating sitemap:', err);
    res.status(500).send('<!-- Error generating sitemap -->');
  }
});

router.get('/robots.txt', (req, res) => {
  try {
    const protocol = req.get('x-forwarded-proto') || req.protocol || 'https';
    const host = req.get('x-forwarded-host') || req.get('host');
    const baseUrl = process.env.SITE_URL || `${protocol}://${host}${req.baseUrl}`;

    const txt = sitemapService.generateRobotsTxt({
      baseUrl,
      disallow: ['/api/', '/admin/'],
    });
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(txt);
  } catch (err) {
    console.error('[sitemap] Error generating robots.txt:', err);
    res.status(500).send('# Error generating robots.txt');
  }
});

module.exports = router;
