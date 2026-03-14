const waitingListService = require('../services/waitingListJson.service');
const { validateEmail, sanitizeString } = require('../utils/validation');

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
    const result = await waitingListService.getWaitingListEntriesAdmin({
      status,
      type,
      email,
      limit: parsedLimit,
      offset: parsedOffset
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

    const { removeWaitingListEntry, getWaitingListEntries } = require('../services/waitingListJson.service');

    // Get all entries to verify IDs exist
    const { entries } = await getWaitingListEntries();
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
