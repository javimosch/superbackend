const cacheLayer = require('./cacheLayer.service');
const jsonConfigsService = require('./jsonConfigs.service');
const JsonConfig = require('../models/JsonConfig');

const HISTORY_NAMESPACE = 'agent:history';
const HISTORY_JSON_CONFIG_PREFIX = 'agent-history-';

async function getHistoryJsonConfigKey(agentId, chatId) {
  return `${HISTORY_JSON_CONFIG_PREFIX}${agentId}-${chatId}`;
}

async function saveHistoryToBothStorages(agentId, chatId, history) {
  const historyKey = `${agentId}:${chatId}`;
  
  try {
    await cacheLayer.set(historyKey, history, { 
      namespace: HISTORY_NAMESPACE,
      ttlSeconds: 3600
    });
    
    const jsonConfigKey = await getHistoryJsonConfigKey(agentId, chatId);
    const normalizedKey = jsonConfigKey.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    
    const existingDoc = await JsonConfig.findOne({
      $or: [
        { slug: normalizedKey },
        { alias: normalizedKey }
      ]
    }).lean();
    
    const historyData = {
      agentId,
      chatId,
      history,
      lastUpdated: new Date().toISOString(),
      size: history.length
    };
    
    if (existingDoc) {
      await jsonConfigsService.updateJsonConfig(existingDoc._id, {
        jsonRaw: JSON.stringify(historyData)
      });
    } else {
      await jsonConfigsService.createJsonConfig({
        title: `Agent History: ${chatId}`,
        alias: jsonConfigKey,
        jsonRaw: JSON.stringify(historyData)
      });
    }
    
    return { success: true };
  } catch (err) {
    console.error('Error saving history to both storages:', err);
    throw err;
  }
}

async function loadHistoryFromBothStorages(agentId, chatId) {
  const historyKey = `${agentId}:${chatId}`;
  
  try {
    const cachedHistory = await cacheLayer.get(historyKey, { namespace: HISTORY_NAMESPACE });
    if (cachedHistory && Array.isArray(cachedHistory)) {
      console.log(`[agent.service] Loaded history from cache for ${chatId}`);
      return cachedHistory;
    }
    
    const jsonConfigKey = await getHistoryJsonConfigKey(agentId, chatId);
    const normalizedKey = jsonConfigKey.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const historyData = await jsonConfigsService.getJsonConfig(normalizedKey).catch(() => null);
    
    if (historyData) {
      if (historyData.history && Array.isArray(historyData.history)) {
        console.log(`[agent.service] Loaded history from JSON Config for ${chatId}`);
        
        await cacheLayer.set(historyKey, historyData.history, { 
          namespace: HISTORY_NAMESPACE,
          ttlSeconds: 3600
        });
        
        return historyData.history;
      }
    }
    
    console.log(`[agent.service] No history found for ${chatId} in cache or JSON Config`);
    return [];
  } catch (err) {
    console.error('Error loading history from both storages:', err);
    return [];
  }
}

async function migrateCacheOnlyHistories() {
  console.log('[agent.service] Starting migration of cache-only histories to JSON Config...');
  
  let migrated = 0;
  let failed = 0;
  
  try {
    const allCacheKeys = await cacheLayer.getAllKeys(HISTORY_NAMESPACE);
    const cacheKeys = allCacheKeys.filter(key => key.includes(':'));
    
    console.log(`[agent.service] Found ${cacheKeys.length} cache entries to potentially migrate`);
    
    for (const cacheKey of cacheKeys) {
      try {
        const match = cacheKey.match(/^(.+):(.+)$/);
        if (!match) {
          console.warn(`[agent.service] Invalid cache key format: ${cacheKey}`);
          failed++;
          continue;
        }
        
        const [, agentId, chatId] = match;
        
        const history = await cacheLayer.get(cacheKey, { namespace: HISTORY_NAMESPACE });
        if (!history || !Array.isArray(history)) {
          console.warn(`[agent.service] No valid history found in cache for ${chatId}`);
          failed++;
          continue;
        }
        
        const jsonConfigKey = await getHistoryJsonConfigKey(agentId, chatId);
        const normalizedKey = jsonConfigKey.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        const existingConfig = await jsonConfigsService.getJsonConfig(normalizedKey).catch(() => null);
        
        if (existingConfig) {
          console.log(`[agent.service] JSON Config already exists for ${chatId}, skipping`);
          migrated++;
          continue;
        }
        
        const historyData = {
          agentId,
          chatId,
          history,
          lastUpdated: new Date().toISOString(),
          size: history.length,
          migrated: true
        };
        
        await jsonConfigsService.createJsonConfig({
          title: `Agent History: ${chatId}`,
          alias: jsonConfigKey,
          jsonRaw: JSON.stringify(historyData)
        });
        
        console.log(`[agent.service] Successfully migrated history for ${chatId}`);
        migrated++;
      } catch (err) {
        console.error(`[agent.service] Failed to migrate cache entry ${cacheKey}:`, err);
        failed++;
      }
    }
    
    console.log(`[agent.service] Migration complete: ${migrated} migrated, ${failed} failed`);
    return { migrated, failed };
  } catch (err) {
    console.error('[agent.service] Migration failed:', err);
    return { migrated: 0, failed: failed };
  }
}

module.exports = {
  getHistoryJsonConfigKey,
  saveHistoryToBothStorages,
  loadHistoryFromBothStorages,
  migrateCacheOnlyHistories
};