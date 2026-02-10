const GlobalSetting = require('../models/GlobalSetting');
const { decryptString } = require('../utils/encryption');

const settingsCache = new Map();
const CACHE_TTL = 60000;

async function getSettingValue(key, defaultValue = null) {
  const cached = settingsCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.value;
  }

  try {
    const setting = await GlobalSetting.findOne({ key }).lean();
    if (!setting) {
      settingsCache.set(key, { value: defaultValue, timestamp: Date.now() });
      return defaultValue;
    }

    let value;
    if (setting.type === 'encrypted') {
      try {
        const payload = JSON.parse(setting.value);
        value = decryptString(payload);
      } catch (e) {
        console.error(`Error decrypting setting ${key}:`, e);
        value = defaultValue;
      }
    } else {
      value = setting.value;
    }

    settingsCache.set(key, { value, timestamp: Date.now() });
    return value;
  } catch (error) {
    console.error(`Error fetching setting ${key}:`, error);
    settingsCache.set(key, { value: defaultValue, timestamp: Date.now() });
    return defaultValue;
  }
}

async function deleteSetting(key) {
  try {
    const setting = await GlobalSetting.findOneAndDelete({ key });
    
    // Clear cache for this key
    settingsCache.delete(key);
    
    return setting;
  } catch (error) {
    console.error(`Error deleting setting ${key}:`, error);
    throw error;
  }
}

function clearSettingsCache() {
  settingsCache.clear();
}

module.exports = {
  getSettingValue,
  deleteSetting,
  clearSettingsCache,
};
