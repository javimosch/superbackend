const express = require('express');
const router = express.Router();

const { proxyRequest } = require('../services/proxy.service');

function extractTargetUrl(req) {
  const originalUrl = String(req.originalUrl || '');
  const baseUrl = String(req.baseUrl || '');

  const prefix = `${baseUrl}/`;
  let remainder = originalUrl;
  if (prefix && remainder.startsWith(prefix)) {
    remainder = remainder.slice(prefix.length);
  }

  // remove any leading slash
  remainder = remainder.replace(/^\//, '');

  // remainder begins with the encoded/decoded target URL
  return remainder;
}

router.all('/*', async (req, res) => {
  try {
    const targetUrl = extractTargetUrl(req);
    req.proxyTargetUrl = targetUrl;

    const result = await proxyRequest(req);

    res.status(result.status);
    const headers = result.headers && typeof result.headers === 'object' ? result.headers : {};
    for (const [k, v] of Object.entries(headers)) {
      if (v === undefined || v === null) continue;
      try {
        res.setHeader(k, v);
      } catch {
      }
    }

    return res.send(result.body);
  } catch (e) {
    return res.status(500).json({ error: 'Proxy failed' });
  }
});

module.exports = router;
