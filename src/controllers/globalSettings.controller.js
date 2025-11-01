const GlobalSetting = require('../models/GlobalSetting');

// GET /api/admin/settings - Get all global settings
exports.getAllSettings = async (req, res) => {
  try {
    const settings = await GlobalSetting.find().sort({ key: 1 }).lean();
    res.json(settings);
  } catch (error) {
    console.error('Error fetching global settings:', error);
    res.status(500).json({ error: 'Failed to fetch global settings' });
  }
};

// GET /api/admin/settings/:key - Get specific setting
exports.getSetting = async (req, res) => {
  try {
    const { key } = req.params;
    
    const setting = await GlobalSetting.findOne({ key }).lean();
    
    if (!setting) {
      return res.status(404).json({ 
        error: `Setting with key '${key}' not found.` 
      });
    }
    
    res.json(setting);
  } catch (error) {
    console.error('Error fetching setting:', error);
    res.status(500).json({ error: 'Failed to fetch setting' });
  }
};

// PUT /api/admin/settings/:key - Update setting
exports.updateSetting = async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;
    
    if (value === undefined) {
      return res.status(400).json({ error: 'Value is required' });
    }
    
    const setting = await GlobalSetting.findOne({ key });
    
    if (!setting) {
      return res.status(404).json({ 
        error: `Setting with key '${key}' not found.` 
      });
    }
    
    // Validate value based on type
    if (setting.type === 'boolean') {
      if (value !== 'true' && value !== 'false') {
        return res.status(400).json({ 
          error: 'Boolean setting must be "true" or "false"' 
        });
      }
    } else if (setting.type === 'number') {
      if (isNaN(Number(value))) {
        return res.status(400).json({ 
          error: 'Number setting must be a valid number' 
        });
      }
    } else if (setting.type === 'json') {
      try {
        JSON.parse(value);
      } catch (e) {
        return res.status(400).json({ 
          error: 'JSON setting must be valid JSON' 
        });
      }
    }
    
    setting.value = value;
    await setting.save();
    
    // Clear cache if you implement one
    // cache.del(`setting:${key}`);
    
    res.json(setting);
  } catch (error) {
    console.error('Error updating setting:', error);
    res.status(500).json({ error: 'Failed to update setting' });
  }
};

// POST /api/admin/settings - Create new setting
exports.createSetting = async (req, res) => {
  try {
    const { key, value, type, description, templateVariables, public: isPublic } = req.body;
    
    if (!key || !value || !type || !description) {
      return res.status(400).json({ 
        error: 'key, value, type, and description are required' 
      });
    }
    
    // Check if setting already exists
    const existingSetting = await GlobalSetting.findOne({ key });
    if (existingSetting) {
      return res.status(409).json({ 
        error: `Setting with key '${key}' already exists.` 
      });
    }
    
    const setting = await GlobalSetting.create({
      key,
      value,
      type,
      description,
      templateVariables: templateVariables || [],
      public: isPublic || false
    });
    
    res.status(201).json(setting);
  } catch (error) {
    console.error('Error creating setting:', error);
    res.status(500).json({ error: 'Failed to create setting' });
  }
};

// DELETE /api/admin/settings/:key - Delete setting
exports.deleteSetting = async (req, res) => {
  try {
    const { key } = req.params;
    
    const setting = await GlobalSetting.findOneAndDelete({ key });
    
    if (!setting) {
      return res.status(404).json({ 
        error: `Setting with key '${key}' not found.` 
      });
    }
    
    // Clear cache if you implement one
    // cache.del(`setting:${key}`);
    
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting setting:', error);
    res.status(500).json({ error: 'Failed to delete setting' });
  }
};

// Helper function to get setting value (for internal use)
exports.getSettingValue = async (key, defaultValue = null) => {
  try {
    const setting = await GlobalSetting.findOne({ key }).lean();
    return setting ? setting.value : defaultValue;
  } catch (error) {
    console.error(`Error getting setting ${key}:`, error);
    return defaultValue;
  }
};

// GET /api/settings/public - Get public settings (no auth required)
exports.getPublicSettings = async (req, res) => {
  try {
    const settings = await GlobalSetting.find({ public: true })
      .select('key value type description')
      .sort({ key: 1 })
      .lean();
    
    res.json(settings);
  } catch (error) {
    console.error('Error fetching public settings:', error);
    res.status(500).json({ error: 'Failed to fetch public settings' });
  }
};
