const waitingListService = require('../services/waitingListJson.service');
const waitingListPublicExportsService = require('../services/waitingListPublicExports.service');
const { validateEmail, sanitizeString } = require('../utils/validation');
const basicAuth = require('basic-auth');

// Subscribe to waiting list
exports.subscribe = async (req, res) => {
  try {
    const { email, type, referralSource } = req.body;

    // Validate and sanitize email
    if (!email) {
      return res.status(400).json({ 
        error: 'Email address is required',
        field: 'email'
      });
    }

    const sanitizedEmail = sanitizeString(email);
    if (!validateEmail(sanitizedEmail)) {
      return res.status(400).json({ 
        error: 'Please enter a valid email address',
        field: 'email'
      });
    }

    // Validate type (generic)
    const sanitizedType = sanitizeString(type);
    if (!sanitizedType || typeof sanitizedType !== 'string' || !sanitizedType.trim()) {
      return res.status(400).json({ 
        error: 'Please select your interest type',
        field: 'type'
      });
    }

    // Check if email already exists and create new entry using JSON Configs service
    try {
      const waitingListEntry = await waitingListService.addWaitingListEntry({
        email: sanitizedEmail.toLowerCase(),
        type: sanitizedType.trim(),
        referralSource: sanitizeString(referralSource) || 'website'
      });

      // Return success response without sensitive data
      const response = { ...waitingListEntry };
      delete response.email; // Don't return email in response for privacy

      res.status(201).json({
        message: 'Successfully joined the waiting list!',
        data: response
      });
    } catch (serviceError) {
      // Handle validation and duplicate errors from service
      if (serviceError.code === 'VALIDATION') {
        return res.status(400).json({ 
          error: serviceError.message,
          field: 'general'
        });
      }
      
      if (serviceError.code === 'DUPLICATE_EMAIL' || serviceError.code === 'DUPLICATE' || serviceError.message.includes('already exists')) {
        return res.status(409).json({ 
          error: 'This email is already on our waiting list',
          field: 'email'
        });
      }

      if (serviceError.code === 'INITIALIZATION_FAILED') {
        return res.status(500).json({ 
          error: 'Service temporarily unavailable - please try again',
          field: 'general'
        });
      }
      
      throw serviceError; // Re-throw for general error handling
    }
  } catch (error) {
    console.error('Waiting list subscription error:', error);
    
    // Handle specific errors
    if (error.code === 11000) {
      return res.status(409).json({ 
        error: 'This email is already on our waiting list',
        field: 'email'
      });
    }
    
    if (error.name === 'ValidationError') {
      const field = Object.keys(error.errors)[0];
      return res.status(400).json({ 
        error: error.errors[field].message,
        field: field
      });
    }
    
    res.status(500).json({ 
      error: 'Something went wrong. Please try again later.',
      field: 'general'
    });
  }
};

// Get waiting list stats (public)
exports.getStats = async (req, res) => {
  try {
    // Use JSON Configs service for cached statistics
    const stats = await waitingListService.getWaitingListStats();
    
    res.json(stats);
  } catch (error) {
    console.error('Waiting list stats error:', error);
    res.status(500).json({ 
      error: 'Unable to load statistics',
      field: 'general'
    });
  }
};

// Admin list waiting list entries (includes email)
exports.adminList = async (req, res) => {
  try {
    const {
      status,
      type,
      email,
      limit = 50,
      offset = 0,
    } = req.query;

    const parsedLimit = Math.min(500, Math.max(1, parseInt(limit, 10) || 50));
    const parsedOffset = Math.max(0, parseInt(offset, 10) || 0);

    // Use JSON Configs service for admin data with filtering and pagination
    // Always bypass cache for admin list to ensure fresh data
    const result = await waitingListService.getWaitingListEntriesAdmin({
      status,
      type,
      email,
      limit: parsedLimit,
      offset: parsedOffset,
      bypassCache: true
    });

    return res.json(result);
  } catch (error) {
    console.error('Waiting list admin list error:', error);
    return res.status(500).json({ error: 'Failed to list entries' });
  }
};

// Get available types (for admin UI filters)
exports.getTypes = async (req, res) => {
  try {
    const result = await waitingListService.getAvailableTypes();
    res.json(result);
  } catch (error) {
    console.error('Waiting list get types error:', error);
    return res.status(500).json({ error: 'Failed to get types' });
  }
};

// Export waiting list entries as CSV (server-side, respects filters)
exports.exportCsv = async (req, res) => {
  try {
    const {
      status,
      type,
      email,
    } = req.query;

    // Get ALL filtered entries (no pagination)
    const result = await waitingListService.getWaitingListEntriesAdmin({
      status,
      type,
      email,
      limit: 100000, // Large limit to get all entries
      offset: 0
    });

    const entries = result.entries || [];

    // Set CSV headers
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="waiting-list-${new Date().toISOString().split('T')[0]}.csv"`);

    // CSV header row
    const csvRows = [
      ['Email', 'Type', 'Status', 'Referral Source', 'Created At', 'Updated At']
    ];

    // Data rows
    entries.forEach(entry => {
      csvRows.push([
        entry.email || '',
        entry.type || '',
        entry.status || '',
        entry.referralSource || '',
        entry.createdAt ? new Date(entry.createdAt).toISOString() : '',
        entry.updatedAt ? new Date(entry.updatedAt).toISOString() : ''
      ]);
    });

    // Convert to CSV string with proper escaping
    const csvContent = csvRows.map(row => 
      row.map(cell => {
        const str = String(cell || '');
        // Escape quotes and wrap in quotes if contains comma, quote, or newline
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      }).join(',')
    ).join('\n');

    res.send(csvContent);
  } catch (error) {
    console.error('Waiting list export CSV error:', error);
    return res.status(500).json({ error: 'Failed to export CSV' });
  }
};

// Bulk remove waiting list entries
exports.bulkRemove = async (req, res) => {
  try {
    const { entryIds } = req.body;

    if (!Array.isArray(entryIds) || entryIds.length === 0) {
      return res.status(400).json({ error: 'entryIds must be a non-empty array' });
    }

    const { removeWaitingListEntry, getWaitingListEntries, clearWaitingListCache } = require('../services/waitingListJson.service');

    // Get all entries to verify IDs exist (bypass cache)
    const { entries } = await getWaitingListEntries({ bypassCache: true });
    const validIds = new Set(entries.map(e => e.id));
    
    const removed = [];
    const notFound = [];

    // Remove each entry
    for (const entryId of entryIds) {
      if (!validIds.has(entryId)) {
        notFound.push(entryId);
        continue;
      }

      try {
        await removeWaitingListEntry(entryId);
        removed.push(entryId);
      } catch (error) {
        console.error(`Failed to remove entry ${entryId}:`, error.message);
        notFound.push(entryId);
      }
    }

    // Force clear cache after all removals
    await clearWaitingListCache();

    console.log(`[BulkRemove] Removed ${removed.length} entries, ${notFound.length} not found`);

    res.json({
      message: `Successfully removed ${removed.length} entr${removed.length === 1 ? 'y' : 'ies'}`,
      removed: {
        count: removed.length,
        ids: removed
      },
      notFound: {
        count: notFound.length,
        ids: notFound
      }
    });
  } catch (error) {
    console.error('Waiting list bulk remove error:', error);
    return res.status(500).json({ error: 'Failed to bulk remove entries' });
  }
};

// Public export endpoint
exports.publicExport = async (req, res) => {
  try {
    const { type, format = 'csv', password: queryPassword } = req.query;

    // Validate required parameters
    if (!type) {
      return res.status(400).json({ 
        error: 'Type parameter is required',
        field: 'type'
      });
    }

    // Validate format
    if (!['csv', 'json'].includes(format)) {
      return res.status(400).json({ 
        error: 'Format must be either "csv" or "json"',
        field: 'format'
      });
    }

    // Find export configuration by type
    const exportConfig = await waitingListPublicExportsService.getPublicExportByName(type);
    if (!exportConfig) {
      return res.status(404).json({ 
        error: 'Export configuration not found',
        field: 'type'
      });
    }

    // Check password protection (support multiple authentication methods)
    let providedPassword = null;
    let authMethod = 'none';

    if (exportConfig.password) {
      // First check session authentication (web form)
      if (req.session && req.session.exportAuth && req.session.exportAuth[type] && 
          req.session.exportAuth[type].authenticated && 
          req.session.exportAuth[type].format === format) {
        // Session is valid (5 minute expiry)
        const sessionAge = Date.now() - req.session.exportAuth[type].timestamp;
        if (sessionAge < 5 * 60 * 1000) { // 5 minutes
          authMethod = 'session';
        } else {
          // Session expired, remove it
          delete req.session.exportAuth[type];
        }
      }

      // If no valid session, check query parameter
      if (authMethod === 'none' && queryPassword) {
        providedPassword = queryPassword;
        authMethod = 'query';
      } else if (authMethod === 'none') {
        // Fall back to Basic Auth
        const auth = basicAuth(req);
        if (auth && auth.pass) {
          providedPassword = auth.pass;
          authMethod = 'basic';
        }
      }

      // Validate password if we have one
      if (authMethod !== 'session') {
        if (!providedPassword || !await waitingListPublicExportsService.validateExportPassword(exportConfig, providedPassword)) {
          // For Basic Auth, send proper challenge
          if (authMethod === 'none' || authMethod === 'basic') {
            res.setHeader('WWW-Authenticate', 'Basic realm="Waiting List Export"');
          }
          return res.status(401).json({ 
            error: 'Authentication required',
            field: 'password',
            authMethod: authMethod === 'query' ? 'query' : 'basic'
          });
        }
      }
    }

    // Get filtered waiting list entries
    const { entries } = await waitingListService.getWaitingListEntriesAdmin({
      type: exportConfig.type,
      status: 'active',
      limit: 100000, // Large limit to get all entries
      offset: 0
    });

    // Record access for analytics
    await waitingListPublicExportsService.recordExportAccess(exportConfig.name, req, authMethod);

    // Export in requested format
    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="waiting-list-${exportConfig.type}-${new Date().toISOString().split('T')[0]}.json"`);
      
      const exportData = {
        export: {
          name: exportConfig.name,
          type: exportConfig.type,
          exportedAt: new Date().toISOString(),
          totalEntries: entries.length,
          authMethod
        },
        entries: entries.map(entry => ({
          email: entry.email,
          type: entry.type,
          status: entry.status,
          referralSource: entry.referralSource,
          createdAt: entry.createdAt,
          updatedAt: entry.updatedAt
        }))
      };
      
      return res.json(exportData);
    } else {
      // CSV format
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="waiting-list-${exportConfig.type}-${new Date().toISOString().split('T')[0]}.csv"`);

      // CSV header row
      const csvRows = [
        ['Email', 'Type', 'Status', 'Referral Source', 'Created At', 'Updated At']
      ];

      // Data rows
      entries.forEach(entry => {
        csvRows.push([
          entry.email || '',
          entry.type || '',
          entry.status || '',
          entry.referralSource || '',
          entry.createdAt ? new Date(entry.createdAt).toISOString() : '',
          entry.updatedAt ? new Date(entry.updatedAt).toISOString() : ''
        ]);
      });

      // Convert to CSV string with proper escaping
      const csvContent = csvRows.map(row => 
        row.map(cell => {
          const str = String(cell || '');
          // Escape quotes and wrap in quotes if contains comma, quote, or newline
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        }).join(',')
      ).join('\n');

      return res.send(csvContent);
    }
  } catch (error) {
    console.error('Public export error:', error);
    return res.status(500).json({ error: 'Failed to export data' });
  }
};

// Admin: Get all public exports
exports.getPublicExports = async (req, res) => {
  try {
    const result = await waitingListPublicExportsService.getPublicExports();
    res.json(result);
  } catch (error) {
    console.error('Get public exports error:', error);
    return res.status(500).json({ error: 'Failed to get public exports' });
  }
};

// Admin: Create public export
exports.createPublicExport = async (req, res) => {
  try {
    const { name, type, password, format = 'csv' } = req.body;

    // Validate required fields
    if (!name) {
      return res.status(400).json({ 
        error: 'Name is required',
        field: 'name'
      });
    }

    if (!type) {
      return res.status(400).json({ 
        error: 'Type is required',
        field: 'type'
      });
    }

    // Hash password if provided
    let hashedPassword = null;
    if (password) {
      hashedPassword = await waitingListPublicExportsService.hashPassword(password);
    }

    const exportConfig = await waitingListPublicExportsService.createPublicExport({
      name: name.trim(),
      type: type.trim(),
      password: hashedPassword,
      format
    }, req.user?.username || 'admin');

    // Don't return password hash in response
    const response = { ...exportConfig };
    delete response.password;
    response.hasPassword = !!password;

    res.status(201).json({
      message: 'Public export created successfully',
      data: response
    });
  } catch (error) {
    console.error('Create public export error:', error);
    
    if (error.code === 'VALIDATION') {
      return res.status(400).json({ 
        error: error.message,
        field: 'general'
      });
    }
    
    if (error.code === 'DUPLICATE_NAME') {
      return res.status(409).json({ 
        error: error.message,
        field: 'name'
      });
    }

    return res.status(500).json({ error: 'Failed to create public export' });
  }
};

// Admin: Update public export
exports.updatePublicExport = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, type, password, format } = req.body;

    const updates = {};
    if (name !== undefined) updates.name = name.trim();
    if (type !== undefined) updates.type = type.trim();
    if (format !== undefined) updates.format = format;
    if (password !== undefined) {
      updates.password = password ? await waitingListPublicExportsService.hashPassword(password) : null;
    }

    const result = await waitingListPublicExportsService.updatePublicExport(id, updates, req.user?.username || 'admin');
    
    // Don't return password hash in response
    const updatedExport = result.exports.find(e => e.id === id);
    const response = { ...updatedExport };
    delete response.password;
    response.hasPassword = !!updatedExport.password;

    res.json({
      message: 'Public export updated successfully',
      data: response
    });
  } catch (error) {
    console.error('Update public export error:', error);
    
    if (error.code === 'VALIDATION') {
      return res.status(400).json({ 
        error: error.message,
        field: 'general'
      });
    }
    
    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({ 
        error: 'Public export not found',
        field: 'id'
      });
    }

    return res.status(500).json({ error: 'Failed to update public export' });
  }
};

// Admin: Delete public export
exports.deletePublicExport = async (req, res) => {
  try {
    const { id } = req.params;

    await waitingListPublicExportsService.deletePublicExport(id, req.user?.username || 'admin');

    res.json({
      message: 'Public export deleted successfully'
    });
  } catch (error) {
    console.error('Delete public export error:', error);
    
    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({ 
        error: 'Public export not found',
        field: 'id'
      });
    }

    return res.status(500).json({ error: 'Failed to delete public export' });
  }
};
