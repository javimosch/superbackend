const express = require('express');
const router = express.Router();
const { adminSessionAuth } = require('../middleware/auth');
const redirectsService = require('../services/pageRedirects.service');

router.use(adminSessionAuth);

router.get('/', async (req, res) => {
  try {
    const { limit, offset, search } = req.query;
    const result = await redirectsService.listRedirects({
      limit: parseInt(limit, 10) || 100,
      offset: parseInt(offset, 10) || 0,
      search: search || undefined,
    });
    res.json(result);
  } catch (err) {
    console.error('[adminPageRedirects] list error:', err);
    res.status(500).json({ error: 'Failed to list redirects' });
  }
});

router.post('/', async (req, res) => {
  try {
    const item = await redirectsService.createRedirect(req.body);
    res.status(201).json({ item });
  } catch (err) {
    if (err.code === 'VALIDATION') return res.status(400).json({ error: err.message });
    console.error('[adminPageRedirects] create error:', err);
    res.status(500).json({ error: 'Failed to create redirect' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const item = await redirectsService.updateRedirect(req.params.id, req.body);
    res.json({ item });
  } catch (err) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    if (err.code === 'VALIDATION') return res.status(400).json({ error: err.message });
    console.error('[adminPageRedirects] update error:', err);
    res.status(500).json({ error: 'Failed to update redirect' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await redirectsService.deleteRedirect(req.params.id);
    res.json({ success: true });
  } catch (err) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    console.error('[adminPageRedirects] delete error:', err);
    res.status(500).json({ error: 'Failed to delete redirect' });
  }
});

module.exports = router;
