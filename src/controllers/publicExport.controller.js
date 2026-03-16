const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const waitingListPublicExportsService = require('../services/waitingListPublicExports.service');
const waitingListService = require('../services/waitingListJson.service');
const { logAudit } = require('../services/auditLogger');

/**
 * GET /share/export/:name - Public export access page
 */
router.get('/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const { format = 'csv', error } = req.query;

    // Validate format
    if (!['csv', 'json'].includes(format)) {
      return res.status(400).send('Invalid format. Must be csv or json.');
    }

    // Find export configuration
    const exportConfig = await waitingListPublicExportsService.getPublicExportByName(name);
    if (!exportConfig) {
      return res.status(404).send('Export not found');
    }

    // If no password protection, redirect to immediate download
    if (!exportConfig.password) {
      const downloadUrl = `/api/waiting-list/share/export?type=${encodeURIComponent(name)}&format=${format}`;
      return res.redirect(downloadUrl);
    }

    // Show password entry page
    const templatePath = path.join(__dirname, '..', '..', 'views', 'public-export-password.ejs');
    fs.readFile(templatePath, 'utf8', (err, template) => {
      if (err) {
        console.error('Error reading template:', err);
        return res.status(500).send('Error loading page');
      }

      try {
        let html = template
          .replace(/<%= exportName %>/g, exportConfig.name)
          .replace(/<%= exportType %>/g, exportConfig.type)
          .replace(/<%= format %>/g, format)
          .replace(/<%= format\.toUpperCase\(\) %>/g, format.toUpperCase())
          .replace(/<%= format === 'csv' \? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800' %>/g, 
            format === 'csv' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800')
          .replace(/<%= error %>/g, error || '');

        // Handle error conditional
        if (error) {
          html = html.replace(/<% if \(error\) \{ %>/g, '').replace(/<% } %>/g, '');
        } else {
          // Remove the entire error div when no error
          html = html.replace(/<% if \(error\) \{ %>[\s\S]*?<% } %>/g, '');
        }

        res.send(html);
      } catch (renderErr) {
        console.error('Error rendering template:', renderErr);
        res.status(500).send('Error rendering page');
      }
    });

  } catch (error) {
    console.error('Public export page error:', error);
    res.status(500).send('Internal server error');
  }
});

/**
 * POST /share/export/:name/auth - Password validation
 */
router.post('/:name/auth', async (req, res) => {
  try {
    const { name } = req.params;
    const { password, format = 'csv' } = req.body;

    // Validate required fields
    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
    }

    if (!['csv', 'json'].includes(format)) {
      return res.status(400).json({ error: 'Invalid format' });
    }

    // Find export configuration
    const exportConfig = await waitingListPublicExportsService.getPublicExportByName(name);
    if (!exportConfig) {
      return res.status(404).json({ error: 'Export not found' });
    }

    // Validate password
    const isValidPassword = await waitingListPublicExportsService.validateExportPassword(exportConfig, password);
    if (!isValidPassword) {
      // Log failed attempt
      await logAudit({
        action: 'public.waiting_list.export.auth_failed',
        entityType: 'WaitingListPublicExport',
        req,
        details: {
          exportName: name,
          ip: req.ip,
          userAgent: req.headers['user-agent'],
          authMethod: 'web_form'
        }
      });

      return res.status(401).json({ error: 'Invalid password' });
    }

    // Set session for authenticated access
    req.session.exportAuth = req.session.exportAuth || {};
    req.session.exportAuth[name] = {
      authenticated: true,
      timestamp: Date.now(),
      format: format
    };

    // Log successful authentication
    await logAudit({
      action: 'public.waiting_list.export.auth_success',
      entityType: 'WaitingListPublicExport',
      req,
      details: {
        exportName: name,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        authMethod: 'web_form'
      }
    });

    // Return download URL
    const downloadUrl = `/api/waiting-list/share/export?type=${encodeURIComponent(name)}&format=${format}`;
    res.json({ downloadUrl });

  } catch (error) {
    console.error('Password validation error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

module.exports = router;
