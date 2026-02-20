const crypto = require('crypto');
const { 
  getJsonConfigValueBySlug, 
  updateJsonConfigValueBySlug, 
  clearJsonConfigCacheByPattern,
  isJsonConfigCached,
  getJsonConfigCacheInfo
} = require('./jsonConfigs.service');

const WAITING_LIST_ENTRIES_KEY = 'waiting-list-entries';
const WAITING_LIST_STATS_KEY = 'waiting-list-stats';

/**
 * Waiting List JSON Service
 * Manages waiting list data using JSON Configs system with enhanced caching
 */

function generateId() {
  return crypto.randomBytes(16).toString('hex');
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function validateEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    const err = new Error('Entry must be an object');
    err.code = 'VALIDATION';
    throw err;
  }

  if (!entry.email || typeof entry.email !== 'string') {
    const err = new Error('Email is required');
    err.code = 'VALIDATION';
    throw err;
  }

  const normalizedEmail = normalizeEmail(entry.email);
  if (!normalizedEmail.includes('@')) {
    const err = new Error('Invalid email format');
    err.code = 'VALIDATION';
    throw err;
  }

  if (!entry.type || typeof entry.type !== 'string') {
    const err = new Error('Type is required');
    err.code = 'VALIDATION';
    throw err;
  }

  return {
    id: entry.id || generateId(),
    email: normalizedEmail,
    type: String(entry.type).trim(),
    status: entry.status || 'active',
    referralSource: entry.referralSource || 'website',
    createdAt: entry.createdAt || new Date().toISOString(),
    updatedAt: entry.updatedAt || new Date().toISOString()
  };
}

/**
 * Get waiting list entries with caching
 */
async function getWaitingListEntries(options = {}) {
  try {
    const data = await getJsonConfigValueBySlug(WAITING_LIST_ENTRIES_KEY, {
      bypassCache: options.bypassCache
    });
    
    return {
      entries: Array.isArray(data.entries) ? data.entries : [],
      lastUpdated: data.lastUpdated || null
    };
  } catch (error) {
    if (error.code === 'NOT_FOUND') {
      return { entries: [], lastUpdated: null };
    }
    throw error;
  }
}

/**
 * Add new waiting list entry with automatic cache invalidation
 */
async function addWaitingListEntry(entryData) {
  const validatedEntry = validateEntry(entryData);

  try {
    const result = await updateJsonConfigValueBySlug(WAITING_LIST_ENTRIES_KEY, (currentData) => {
      const data = currentData || { entries: [] };
      const entries = Array.isArray(data.entries) ? data.entries : [];

      // Check for duplicate email
      const existingEntry = entries.find(e => 
        normalizeEmail(e.email) === normalizeEmail(validatedEntry.email)
      );

      if (existingEntry) {
        const err = new Error('This email is already on our waiting list');
        err.code = 'DUPLICATE_EMAIL';
        throw err;
      }

      // Add new entry
      entries.push(validatedEntry);
      
      return {
        ...data,
        entries,
        lastUpdated: new Date().toISOString()
      };
    }, { invalidateCache: true });

    // Clear stats cache since data changed
    clearWaitingListCache();

    return validatedEntry;
  } catch (error) {
    // If the config doesn't exist, initialize it first
    if (error.code === 'NOT_FOUND') {
      await initializeWaitingListData();
      
      // Retry the operation after initialization (only once)
      try {
        return await addWaitingListEntry(entryData);
      } catch (retryError) {
        // If we still get NOT_FOUND, something went wrong with initialization
        if (retryError.code === 'NOT_FOUND') {
          const err = new Error('Failed to initialize waiting list data structure');
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
 * Update waiting list entry
 */
async function updateWaitingListEntry(entryId, updates) {
  if (!entryId) {
    const err = new Error('Entry ID is required');
    err.code = 'VALIDATION';
    throw err;
  }

  const result = await updateJsonConfigValueBySlug(WAITING_LIST_ENTRIES_KEY, (currentData) => {
    const data = currentData || { entries: [] };
    const entries = Array.isArray(data.entries) ? data.entries : [];

    const entryIndex = entries.findIndex(e => e.id === entryId);
    if (entryIndex === -1) {
      const err = new Error('Waiting list entry not found');
      err.code = 'NOT_FOUND';
      throw err;
    }

    // Update entry with validation
    const updatedEntry = validateEntry({
      ...entries[entryIndex],
      ...updates,
      id: entryId, // Preserve original ID
      updatedAt: new Date().toISOString()
    });

    entries[entryIndex] = updatedEntry;

    return {
      ...data,
      entries,
      lastUpdated: new Date().toISOString()
    };
  }, { invalidateCache: true });

  // Clear stats cache since data changed
  clearWaitingListCache();

  return result;
}

/**
 * Remove waiting list entry
 */
async function removeWaitingListEntry(entryId) {
  if (!entryId) {
    const err = new Error('Entry ID is required');
    err.code = 'VALIDATION';
    throw err;
  }

  const result = await updateJsonConfigValueBySlug(WAITING_LIST_ENTRIES_KEY, (currentData) => {
    const data = currentData || { entries: [] };
    const entries = Array.isArray(data.entries) ? data.entries : [];

    const entryIndex = entries.findIndex(e => e.id === entryId);
    if (entryIndex === -1) {
      const err = new Error('Waiting list entry not found');
      err.code = 'NOT_FOUND';
      throw err;
    }

    // Remove entry
    entries.splice(entryIndex, 1);

    return {
      ...data,
      entries,
      lastUpdated: new Date().toISOString()
    };
  }, { invalidateCache: true });

  // Clear stats cache since data changed
  clearWaitingListCache();

  return result;
}

/**
 * Get waiting list statistics with 5-minute TTL
 */
async function getWaitingListStats(options = {}) {
  const ttlSeconds = options.ttlSeconds || 300; // 5 minutes default

  try {
    // Try to get cached stats first
    if (!options.bypassCache && isJsonConfigCached(WAITING_LIST_STATS_KEY)) {
      const cacheInfo = getJsonConfigCacheInfo(WAITING_LIST_STATS_KEY);
      if (cacheInfo.exists && cacheInfo.ttlRemaining > 0) {
        return await getJsonConfigValueBySlug(WAITING_LIST_STATS_KEY);
      }
    }

    // Generate fresh stats
    const { entries } = await getWaitingListEntries();
    
    const activeEntries = entries.filter(e => e.status === 'active');
    const totalSubscribers = activeEntries.length;

    // Type aggregation
    const typeAgg = activeEntries.reduce((acc, entry) => {
      const type = String(entry.type || 'unknown').trim();
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});

    // Backward compatibility fields
    const buyerCount = (typeAgg.buyer || 0) + (typeAgg.both || 0);
    const sellerCount = (typeAgg.seller || 0) + (typeAgg.both || 0);

    // Mock growth data (same as original)
    const growthThisWeek = Math.floor(totalSubscribers * 0.05);

    const stats = {
      totalSubscribers,
      buyerCount,
      sellerCount,
      typeCounts: typeAgg,
      growthThisWeek,
      lastUpdated: new Date().toISOString()
    };

    // Cache the stats
    await updateJsonConfigValueBySlug(WAITING_LIST_STATS_KEY, () => stats, { 
      invalidateCache: false 
    });

    return stats;
  } catch (error) {
    if (error.code === 'NOT_FOUND') {
      // Return default stats if no data exists
      return {
        totalSubscribers: 0,
        buyerCount: 0,
        sellerCount: 0,
        typeCounts: {},
        growthThisWeek: 0,
        lastUpdated: new Date().toISOString()
      };
    }
    throw error;
  }
}

/**
 * Get paginated waiting list entries for admin
 */
async function getWaitingListEntriesAdmin(filters = {}) {
  const { status, type, email, limit = 50, offset = 0 } = filters;
  
  const { entries } = await getWaitingListEntries();
  
  // Apply filters
  let filteredEntries = entries;
  
  if (status) {
    filteredEntries = filteredEntries.filter(e => e.status === status);
  }
  
  if (type) {
    filteredEntries = filteredEntries.filter(e => e.type === type);
  }
  
  if (email) {
    const searchEmail = normalizeEmail(email);
    filteredEntries = filteredEntries.filter(e => 
      normalizeEmail(e.email) === searchEmail
    );
  }
  
  // Sort by creation date (newest first)
  filteredEntries.sort((a, b) => 
    new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
  );
  
  // Apply pagination
  const parsedLimit = Math.min(500, Math.max(1, parseInt(limit, 10) || 50));
  const parsedOffset = Math.max(0, parseInt(offset, 10) || 0);
  
  const paginatedEntries = filteredEntries.slice(parsedOffset, parsedOffset + parsedLimit);
  
  return {
    entries: paginatedEntries,
    pagination: {
      total: filteredEntries.length,
      limit: parsedLimit,
      offset: parsedOffset
    }
  };
}

/**
 * Clear all waiting list related caches
 */
function clearWaitingListCache() {
  return clearJsonConfigCacheByPattern('waiting-list-*');
}

/**
 * Get waiting list cache information
 */
function getWaitingListCacheInfo() {
  return {
    entries: getJsonConfigCacheInfo(WAITING_LIST_ENTRIES_KEY),
    stats: getJsonConfigCacheInfo(WAITING_LIST_STATS_KEY)
  };
}

/**
 * Initialize waiting list data structure if it doesn't exist
 */
async function initializeWaitingListData() {
  try {
    await getJsonConfigValueBySlug(WAITING_LIST_ENTRIES_KEY, { bypassCache: true });
  } catch (error) {
    if (error.code === 'NOT_FOUND') {
      // Create initial data structure
      const { createJsonConfig } = require('./jsonConfigs.service');
      await createJsonConfig({
        title: 'Waiting List Entries',
        alias: WAITING_LIST_ENTRIES_KEY,
        jsonRaw: JSON.stringify({
          entries: [],
          lastUpdated: new Date().toISOString()
        }),
        publicEnabled: false,
        cacheTtlSeconds: 300
      });
    } else {
      throw error;
    }
  }
}

module.exports = {
  // Core operations
  getWaitingListEntries,
  addWaitingListEntry,
  updateWaitingListEntry,
  removeWaitingListEntry,
  getWaitingListStats,
  getWaitingListEntriesAdmin,
  
  // Cache management
  clearWaitingListCache,
  getWaitingListCacheInfo,
  
  // Utilities
  initializeWaitingListData,
  validateEntry,
  normalizeEmail,
  generateId,
  
  // Constants
  WAITING_LIST_ENTRIES_KEY,
  WAITING_LIST_STATS_KEY
};
