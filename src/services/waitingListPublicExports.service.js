const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { 
  getJsonConfigValueBySlug, 
  updateJsonConfigValueBySlug, 
  clearJsonConfigCacheByPattern,
  isJsonConfigCached,
  getJsonConfigCacheInfo
} = require('./jsonConfigs.service');
const { logAudit } = require('./auditLogger');

const PUBLIC_EXPORTS_KEY = 'waiting-list-public-exports';

// Adjective-animal combinations for auto-generated names
const ADJECTIVES = [
  'black', 'white', 'golden', 'silver', 'red', 'blue', 'green', 'purple',
  'silent', 'loud', 'fast', 'slow', 'big', 'small', 'tall', 'short',
  'brave', 'shy', 'wise', 'clever', 'strong', 'gentle', 'wild', 'calm',
  'happy', 'sad', 'angry', 'peaceful', 'bright', 'dark', 'light', 'heavy'
];

const ANIMALS = [
  'bear', 'eagle', 'wolf', 'lion', 'tiger', 'elephant', 'giraffe', 'zebra',
  'monkey', 'dolphin', 'whale', 'shark', 'eagle', 'hawk', 'owl', 'falcon',
  'fox', 'deer', 'rabbit', 'squirrel', 'mouse', 'rat', 'cat', 'dog',
  'horse', 'cow', 'pig', 'sheep', 'goat', 'chicken', 'duck', 'goose'
];

/**
 * Waiting List Public Exports Service
 * Manages public export configurations using JSON Configs system
 */

function generateId() {
  return crypto.randomBytes(16).toString('hex');
}

function generateName() {
  const adjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  return `${adjective}-${animal}`;
}

async function generateUniqueName(existingNames = []) {
  let attempts = 0;
  const maxAttempts = 100;
  
  while (attempts < maxAttempts) {
    const name = generateName();
    if (!existingNames.includes(name)) {
      return name;
    }
    attempts++;
  }
  
  throw new Error('Failed to generate unique name after maximum attempts');
}

function validateExportConfig(config) {
  if (!config || typeof config !== 'object') {
    const err = new Error('Export configuration must be an object');
    err.code = 'VALIDATION';
    throw err;
  }

  if (!config.name || typeof config.name !== 'string') {
    const err = new Error('Name is required and must be a string');
    err.code = 'VALIDATION';
    throw err;
  }

  if (!config.type || typeof config.type !== 'string') {
    const err = new Error('Type is required and must be a string');
    err.code = 'VALIDATION';
    throw err;
  }

  const normalizedConfig = {
    id: config.id || generateId(),
    name: String(config.name).trim(),
    type: String(config.type).trim(),
    password: config.password || null,
    format: config.format || 'csv',
    createdAt: config.createdAt || new Date().toISOString(),
    createdBy: config.createdBy || 'system',
    accessCount: config.accessCount || 0,
    lastAccessed: config.lastAccessed || null,
    updatedAt: new Date().toISOString()
  };

  // Validate format
  if (!['csv', 'json'].includes(normalizedConfig.format)) {
    const err = new Error('Format must be either "csv" or "json"');
    err.code = 'VALIDATION';
    throw err;
  }

  return normalizedConfig;
}

/**
 * Get all public export configurations
 */
async function getPublicExports(options = {}) {
  try {
    const data = await getJsonConfigValueBySlug(PUBLIC_EXPORTS_KEY, {
      bypassCache: options.bypassCache
    });
    
    return {
      exports: Array.isArray(data.exports) ? data.exports : [],
      lastUpdated: data.lastUpdated || null
    };
  } catch (error) {
    if (error.code === 'NOT_FOUND') {
      return { exports: [], lastUpdated: null };
    }
    throw error;
  }
}

/**
 * Create new public export configuration
 */
async function createPublicExport(configData, adminUser) {
  const validatedConfig = validateExportConfig(configData);

  try {
    const result = await updateJsonConfigValueBySlug(PUBLIC_EXPORTS_KEY, (currentData) => {
      const data = currentData || { exports: [] };
      const exports = Array.isArray(data.exports) ? data.exports : [];

      // Check for duplicate name
      const existingExport = exports.find(e => 
        e.name.toLowerCase() === validatedConfig.name.toLowerCase()
      );

      if (existingExport) {
        const err = new Error('An export with this name already exists');
        err.code = 'DUPLICATE_NAME';
        throw err;
      }

      // Add new export
      exports.push(validatedConfig);
      
      return {
        ...data,
        exports,
        lastUpdated: new Date().toISOString()
      };
    }, { invalidateCache: true });

    // Log audit event
    await logAudit({
      action: 'public.waiting_list.export.create',
      entityType: 'WaitingListPublicExport',
      entityId: validatedConfig.id,
      actor: { actorType: 'admin', actorId: adminUser },
      details: {
        exportName: validatedConfig.name,
        exportType: validatedConfig.type,
        hasPassword: !!validatedConfig.password,
        format: validatedConfig.format
      }
    });

    return validatedConfig;
  } catch (error) {
    // If the config doesn't exist, initialize it first
    if (error.code === 'NOT_FOUND') {
      await initializePublicExportsData();
      
      // Retry the operation after initialization
      try {
        return await createPublicExport(configData, adminUser);
      } catch (retryError) {
        if (retryError.code === 'NOT_FOUND') {
          const err = new Error('Failed to initialize public exports data structure');
          err.code = 'INITIALIZATION_FAILED';
          throw err;
        }
        throw retryError;
      }
    }
    throw error;
  }
}

/**
 * Update public export configuration
 */
async function updatePublicExport(exportId, updates, adminUser) {
  if (!exportId) {
    const err = new Error('Export ID is required');
    err.code = 'VALIDATION';
    throw err;
  }

  const result = await updateJsonConfigValueBySlug(PUBLIC_EXPORTS_KEY, (currentData) => {
    const data = currentData || { exports: [] };
    const exports = Array.isArray(data.exports) ? data.exports : [];

    const exportIndex = exports.findIndex(e => e.id === exportId);
    if (exportIndex === -1) {
      const err = new Error('Public export not found');
      err.code = 'NOT_FOUND';
      throw err;
    }

    // Update export with validation
    const updatedExport = validateExportConfig({
      ...exports[exportIndex],
      ...updates,
      id: exportId, // Preserve original ID
      createdAt: exports[exportIndex].createdAt, // Preserve creation time
      createdBy: exports[exportIndex].createdBy, // Preserve creator
      updatedAt: new Date().toISOString()
    });

    exports[exportIndex] = updatedExport;

    return {
      ...data,
      exports,
      lastUpdated: new Date().toISOString()
    };
  }, { invalidateCache: true });

  // Log audit event
  await logAudit({
    action: 'public.waiting_list.export.update',
    entityType: 'WaitingListPublicExport',
    entityId: exportId,
    actor: { actorType: 'admin', actorId: adminUser },
    details: {
      exportName: result.exports.find(e => e.id === exportId)?.name,
      updates: Object.keys(updates)
    }
  });

  return result;
}

/**
 * Delete public export configuration
 */
async function deletePublicExport(exportId, adminUser) {
  if (!exportId) {
    const err = new Error('Export ID is required');
    err.code = 'VALIDATION';
    throw err;
  }

  // Get the export info before deletion for audit logging
  const { exports } = await getPublicExports();
  const exportToDelete = exports.find(e => e.id === exportId);
  
  if (!exportToDelete) {
    const err = new Error('Public export not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const deletedExportName = exportToDelete.name;

  const result = await updateJsonConfigValueBySlug(PUBLIC_EXPORTS_KEY, (currentData) => {
    const data = currentData || { exports: [] };
    const exports = Array.isArray(data.exports) ? data.exports : [];

    const exportIndex = exports.findIndex(e => e.id === exportId);
    if (exportIndex === -1) {
      const err = new Error('Public export not found');
      err.code = 'NOT_FOUND';
      throw err;
    }

    const deletedExport = exports[exportIndex];
    
    // Remove export
    exports.splice(exportIndex, 1);

    return {
      ...data,
      exports,
      lastUpdated: new Date().toISOString()
    };
  }, { invalidateCache: true });

  // Log audit event
  await logAudit({
    action: 'public.waiting_list.export.delete',
    entityType: 'WaitingListPublicExport',
    entityId: exportId,
    actor: { actorType: 'admin', actorId: adminUser },
    details: {
      exportName: deletedExportName
    }
  });

  return result;
}

/**
 * Get public export by name
 */
async function getPublicExportByName(name, options = {}) {
  const { exports } = await getPublicExports(options);
  return exports.find(e => e.name === name);
}

/**
 * Validate password for protected export
 */
async function validateExportPassword(exportConfig, password) {
  if (!exportConfig.password) {
    return true; // No password required
  }

  if (!password) {
    return false; // Password required but not provided
  }

  try {
    return await bcrypt.compare(password, exportConfig.password);
  } catch (error) {
    console.error('Password validation error:', error);
    return false;
  }
}

/**
 * Hash password for storage
 */
async function hashPassword(password) {
  if (!password) {
    return null;
  }

  try {
    return await bcrypt.hash(password, 10);
  } catch (error) {
    console.error('Password hashing error:', error);
    throw new Error('Failed to hash password');
  }
}

/**
 * Record access and update last accessed
 */
async function recordExportAccess(exportName, req, authMethod = 'none') {
  const result = await updateJsonConfigValueBySlug(PUBLIC_EXPORTS_KEY, (currentData) => {
    const data = currentData || { exports: [] };
    const exports = Array.isArray(data.exports) ? data.exports : [];

    const exportIndex = exports.findIndex(e => e.name === exportName);
    if (exportIndex === -1) {
      // Export not found, don't update
      return data;
    }

    // Increment access count and update last accessed
    exports[exportIndex].accessCount = (exports[exportIndex].accessCount || 0) + 1;
    exports[exportIndex].lastAccessed = new Date().toISOString();

    return {
      ...data,
      exports,
      lastUpdated: new Date().toISOString()
    };
  }, { invalidateCache: true });

  // Log audit event
  await logAudit({
    action: 'public.waiting_list.export.access',
    entityType: 'WaitingListPublicExport',
    req,
    details: {
      exportName,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      authMethod
    }
  });

  return result;
}

/**
 * Initialize public exports data structure if it doesn't exist
 */
async function initializePublicExportsData() {
  try {
    await getJsonConfigValueBySlug(PUBLIC_EXPORTS_KEY, { bypassCache: true });
  } catch (error) {
    if (error.code === 'NOT_FOUND') {
      // Create initial data structure
      const { createJsonConfig } = require('./jsonConfigs.service');
      await createJsonConfig({
        title: 'Waiting List Public Exports',
        alias: PUBLIC_EXPORTS_KEY,
        jsonRaw: JSON.stringify({
          exports: [],
          lastUpdated: new Date().toISOString()
        }),
        publicEnabled: false,
        cacheTtlSeconds: 0 // No caching - required for real-time persistence
      });
    } else {
      throw error;
    }
  }
}

/**
 * Get available names (for admin UI suggestions)
 */
async function getAvailableNames() {
  const { exports } = await getPublicExports();
  const existingNames = exports.map(e => e.name);
  
  // Generate some unique name suggestions
  const suggestions = [];
  let attempts = 0;
  const maxSuggestions = 10;
  
  while (suggestions.length < maxSuggestions && attempts < 100) {
    const name = generateName();
    if (!existingNames.includes(name) && !suggestions.includes(name)) {
      suggestions.push(name);
    }
    attempts++;
  }
  
  return {
    existing: existingNames,
    suggestions
  };
}

module.exports = {
  // Core operations
  getPublicExports,
  createPublicExport,
  updatePublicExport,
  deletePublicExport,
  getPublicExportByName,
  
  // Security
  validateExportPassword,
  hashPassword,
  
  // Analytics
  recordExportAccess,
  getAvailableNames,
  
  // Utilities
  initializePublicExportsData,
  validateExportConfig,
  generateUniqueName,
  generateName,
  
  // Constants
  PUBLIC_EXPORTS_KEY
};
