const jsonConfigsService = require('./jsonConfigs.service');
const JsonConfig = require('../models/JsonConfig');

const HISTORY_JSON_CONFIG_PREFIX = 'agent-history-';

async function getHistoryJsonConfigKey(agentId, chatId) {
  return `${HISTORY_JSON_CONFIG_PREFIX}${agentId}-${chatId}`;
}

async function saveHistory(agentId, chatId, history) {
  try {
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
    console.error('Error saving history:', err);
    throw err;
  }
}

async function loadHistory(agentId, chatId) {
  try {
    const jsonConfigKey = await getHistoryJsonConfigKey(agentId, chatId);
    const normalizedKey = jsonConfigKey.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const historyData = await jsonConfigsService.getJsonConfig(normalizedKey).catch(() => null);
    
    if (historyData) {
      if (historyData.history && Array.isArray(historyData.history)) {
        console.log(`[agent.service] Loaded history from JSON Config for ${chatId}`);
        return historyData.history;
      }
    }
    
    console.log(`[agent.service] No history found for ${chatId} in JSON Config`);
    return [];
  } catch (err) {
    console.error('Error loading history:', err);
    return [];
  }
}

async function migrateCacheOnlyHistories() {
  console.log('[agent.service] Migration function is deprecated - cache-layer is no longer used for history');
  return { migrated: 0, failed: 0, deprecated: true };
}

module.exports = {
  getHistoryJsonConfigKey,
  saveHistory,
  loadHistory,
  migrateCacheOnlyHistories
};