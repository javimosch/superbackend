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
