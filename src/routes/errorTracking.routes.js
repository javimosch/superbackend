const express = require('express');
const path = require('path');
const fs = require('fs');

const router = express.Router();

router.get('/browser-sdk', (req, res) => {
  const filePath = path.join(
    __dirname,
    '..',
    '..',
    'sdk',
    'error-tracking',
    'browser',
    'dist',
    'embed.iife.js',
  );

  fs.readFile(filePath, 'utf8', (err, contents) => {
    if (err) {
      res.status(404).type('text/plain').send('Browser SDK not found');
      return;
    }

    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(contents);
  });
});

module.exports = router;
