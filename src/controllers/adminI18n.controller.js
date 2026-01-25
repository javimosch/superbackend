const I18nLocale = require('../models/I18nLocale');
const I18nEntry = require('../models/I18nEntry');

const { clearI18nCache } = require('../services/i18n.service');
const { getInferredI18nKeys, getInferredI18nEntries } = require('../services/i18nInferredKeys.service');
const { createAuditEvent, getBasicAuthActor } = require('../services/audit.service');
const { getSettingValue } = require('../services/globalSettings.service');

const llmService = require('../services/llm.service');
const { resolveLlmProviderModel } = require('../services/llmDefaults.service');

async function ensureLocaleExists(code, actor) {
  if (!code) return;
  const normalized = String(code).trim();
  if (!normalized) return;

  const existing = await I18nLocale.findOne({ code: normalized }).lean();
  if (existing) return;

  const locale = await I18nLocale.create({
    code: normalized,
    name: normalized.toUpperCase(),
    enabled: true,
    isDefault: false,
  });

  await createAuditEvent({
    ...(actor || { actorType: 'system', actorId: null }),
    action: 'i18n.locale.auto_create',
    entityType: 'I18nLocale',
    entityId: String(locale._id),
    before: null,
    after: locale.toObject(),
    meta: null,
  });
}

async function setDefaultLocale(code) {
  await I18nLocale.updateMany({ isDefault: true }, { $set: { isDefault: false } });
  await I18nLocale.updateOne({ code }, { $set: { isDefault: true } });
  await I18nLocale.updateOne({ code }, { $set: { enabled: true } });
}

async function ensureDefaultLocalesExist(actor) {
  const defaults = ['en', 'fr', 'es'];
  const existing = await I18nLocale.find({ code: { $in: defaults } }).select('code').lean();
  const existingSet = new Set(existing.map((l) => l.code));

  const toCreate = defaults
    .filter((code) => !existingSet.has(code))
    .map((code) => ({
      code,
      name: code.toUpperCase(),
      enabled: true,
      isDefault: false,
    }));

  if (toCreate.length > 0) {
    const created = await I18nLocale.insertMany(toCreate);
    for (const locale of created) {
      await createAuditEvent({
        ...(actor || { actorType: 'system', actorId: null }),
        action: 'i18n.locale.auto_create',
        entityType: 'I18nLocale',
        entityId: String(locale._id),
        before: null,
        after: locale.toObject(),
        meta: { reason: 'bootstrap_defaults' },
      });
    }
  }

  const hasDefault = await I18nLocale.findOne({ isDefault: true }).lean();
  if (!hasDefault) {
    await setDefaultLocale('en');
  }
}

exports.listLocales = async (req, res) => {
  try {
    const actor = getBasicAuthActor(req);
    const entryLocales = await I18nEntry.distinct('locale');
    for (const code of entryLocales) {
      await ensureLocaleExists(code, actor);
    }

    const anyLocale = await I18nLocale.findOne({}).select('_id').lean();
    if (!anyLocale) {
      await ensureDefaultLocalesExist(actor);
    }

    const locales = await I18nLocale.find().sort({ code: 1 }).lean();

    const counts = await I18nEntry.aggregate([
      { $group: { _id: '$locale', entryCount: { $sum: 1 } } },
    ]);
    const countByLocale = new Map(counts.map((c) => [c._id, c.entryCount]));

    const enriched = locales.map((l) => ({
      ...l,
      entryCount: countByLocale.get(l.code) || 0,
    }));

    res.json({ locales: enriched });
  } catch (error) {
    console.error('Error listing locales:', error);
    res.status(500).json({ error: 'Failed to list locales' });
  }
};

exports.createLocale = async (req, res) => {
  try {
    const { code, name, enabled, isDefault } = req.body;
    if (!code || !name) {
      return res.status(400).json({ error: 'code and name are required' });
    }

    const existing = await I18nLocale.findOne({ code }).lean();
    if (existing) {
      return res.status(409).json({ error: 'Locale already exists' });
    }

    const locale = await I18nLocale.create({
      code,
      name,
      enabled: enabled !== undefined ? Boolean(enabled) : true,
      isDefault: Boolean(isDefault),
    });

    if (locale.isDefault) {
      await setDefaultLocale(code);
    }

    await createAuditEvent({
      ...getBasicAuthActor(req),
      action: 'i18n.locale.create',
      entityType: 'I18nLocale',
      entityId: String(locale._id),
      before: null,
      after: locale.toObject(),
      meta: null,
    });

    res.status(201).json({ locale: locale.toObject() });
  } catch (error) {
    console.error('Error creating locale:', error);
    res.status(500).json({ error: 'Failed to create locale' });
  }
};

exports.updateLocale = async (req, res) => {
  try {
    const { code } = req.params;
    const { name, enabled, isDefault } = req.body;

    const locale = await I18nLocale.findOne({ code });
    if (!locale) {
      return res.status(404).json({ error: 'Locale not found' });
    }

    const before = locale.toObject();

    if (name !== undefined) locale.name = name;
    if (enabled !== undefined) locale.enabled = Boolean(enabled);
    if (isDefault === true) {
      await setDefaultLocale(code);
      locale.isDefault = true;
    }

    await locale.save();

    await createAuditEvent({
      ...getBasicAuthActor(req),
      action: 'i18n.locale.update',
      entityType: 'I18nLocale',
      entityId: String(locale._id),
      before,
      after: locale.toObject(),
      meta: null,
    });

    res.json({ locale: locale.toObject() });
  } catch (error) {
    console.error('Error updating locale:', error);
    res.status(500).json({ error: 'Failed to update locale' });
  }
};

exports.listEntries = async (req, res) => {
  try {
    const { locale, search, missing, includeInferred } = req.query;
    if (!locale) {
      return res.status(400).json({ error: 'locale is required' });
    }

    const wantsInferred = includeInferred === 'true' || includeInferred === '1';

    const query = { locale };
    if (search) {
      query.key = { $regex: search, $options: 'i' };
    }

    const entries = await I18nEntry.find(query)
      .sort({ key: 1 })
      .limit(2000)
      .lean();

    const existingKeys = new Set(entries.map((e) => e.key));

    const inferredKeys = wantsInferred ? getInferredI18nKeys() : [];
    const inferredEntriesMap = wantsInferred ? getInferredI18nEntries() : {};
    const filteredInferredKeys = search
      ? inferredKeys.filter((k) => String(k).toLowerCase().includes(String(search).toLowerCase()))
      : inferredKeys;

    if (missing === 'true') {
      const allDbKeys = await I18nEntry.distinct('key');
      const keySet = new Set(allDbKeys);
      for (const k of filteredInferredKeys) keySet.add(k);

      const allKeys = Array.from(keySet).sort();
      const missingKeys = allKeys.filter((k) => !existingKeys.has(k));

      const missingEntries = missingKeys.map((k) => ({
        ...(wantsInferred && inferredEntriesMap[k] ? inferredEntriesMap[k] : null),
        _id: null,
        key: k,
        locale,
        value: wantsInferred && inferredEntriesMap[k]?.value ? inferredEntriesMap[k].value : '',
        valueFormat: wantsInferred && inferredEntriesMap[k]?.valueFormat ? inferredEntriesMap[k].valueFormat : 'text',
        source: wantsInferred && filteredInferredKeys.includes(k) ? 'inferred' : 'admin',
        seeded: false,
        edited: false,
      }));

      return res.json({ entries: [...entries, ...missingEntries] });
    }

    if (!wantsInferred) {
      return res.json({ entries });
    }

    const inferredMissingEntries = filteredInferredKeys
      .filter((k) => !existingKeys.has(k))
      .map((k) => ({
        _id: null,
        key: k,
        locale,
        value: inferredEntriesMap[k]?.value ? inferredEntriesMap[k].value : '',
        valueFormat: inferredEntriesMap[k]?.valueFormat ? inferredEntriesMap[k].valueFormat : 'text',
        source: 'inferred',
        seeded: false,
        edited: false,
      }));

    const merged = [...entries, ...inferredMissingEntries]
      .sort((a, b) => String(a.key).localeCompare(String(b.key)));

    res.json({ entries: merged });
  } catch (error) {
    console.error('Error listing entries:', error);
    res.status(500).json({ error: 'Failed to list entries' });
  }
};

exports.createEntry = async (req, res) => {
  try {
    const { key, locale, value, valueFormat } = req.body;
    if (!key || !locale) {
      return res.status(400).json({ error: 'key and locale are required' });
    }

    const existing = await I18nEntry.findOne({ key, locale }).lean();
    if (existing) {
      return res.status(409).json({ error: 'Entry already exists' });
    }

    const actor = getBasicAuthActor(req);

    await ensureLocaleExists(locale, actor);

    const entry = await I18nEntry.create({
      key,
      locale,
      value: value || '',
      valueFormat: valueFormat === 'html' ? 'html' : 'text',
      source: 'admin',
      seeded: false,
      edited: true,
      editedAt: new Date(),
      editedBy: actor.actorId,
    });

    clearI18nCache();

    await createAuditEvent({
      ...actor,
      action: 'i18n.entry.create',
      entityType: 'I18nEntry',
      entityId: String(entry._id),
      before: null,
      after: entry.toObject(),
      meta: null,
    });

    res.status(201).json({ entry: entry.toObject() });
  } catch (error) {
    console.error('Error creating entry:', error);
    res.status(500).json({ error: 'Failed to create entry' });
  }
};

exports.updateEntry = async (req, res) => {
  try {
    const { id } = req.params;
    const { value, valueFormat } = req.body;

    const entry = await I18nEntry.findById(id);
    if (!entry) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    const before = entry.toObject();
    const actor = getBasicAuthActor(req);

    if (value !== undefined) entry.value = value;
    if (valueFormat !== undefined) entry.valueFormat = valueFormat === 'html' ? 'html' : 'text';

    entry.edited = true;
    entry.editedAt = new Date();
    entry.editedBy = actor.actorId;
    entry.source = 'admin';

    await entry.save();
    clearI18nCache();

    await createAuditEvent({
      ...actor,
      action: 'i18n.entry.update',
      entityType: 'I18nEntry',
      entityId: String(entry._id),
      before,
      after: entry.toObject(),
      meta: null,
    });

    res.json({ entry: entry.toObject() });
  } catch (error) {
    console.error('Error updating entry:', error);
    res.status(500).json({ error: 'Failed to update entry' });
  }
};

exports.deleteEntry = async (req, res) => {
  try {
    const { id } = req.params;
    const entry = await I18nEntry.findById(id);
    if (!entry) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    const before = entry.toObject();
    await I18nEntry.deleteOne({ _id: id });
    clearI18nCache();

    await createAuditEvent({
      ...getBasicAuthActor(req),
      action: 'i18n.entry.delete',
      entityType: 'I18nEntry',
      entityId: String(id),
      before,
      after: null,
      meta: null,
    });

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting entry:', error);
    res.status(500).json({ error: 'Failed to delete entry' });
  }
};

async function getLegacyOpenRouterApiKey() {
  return getSettingValue('i18n.ai.openrouter.apiKey', await getSettingValue('ai.openrouter.apiKey', null));
}

function buildAiPrompt({ glossary, fromLocale, toLocale, key, fromValue }) {
  const glossaryStr = glossary ? String(glossary) : '';

  const parts = [
    `Translate the following string from ${fromLocale} to ${toLocale}.`,
    'Return only the translated string, without quotes.',
    'The output may contain HTML and templating placeholders like {name}; keep placeholders unchanged.',
    `Key: ${key}`,
    `Text: ${fromValue}`,
  ];

  if (glossaryStr.trim()) {
    parts.unshift(`Glossary (optional):\n${glossaryStr}`);
  }

  return parts.join('\n');
}

exports.aiPreview = async (req, res) => {
  try {
    const {
      fromLocale,
      toLocale,
      keys,
      missingOnly,
      model,
    } = req.body;

    if (!fromLocale || !toLocale) {
      return res.status(400).json({ error: 'fromLocale and toLocale are required' });
    }

    await ensureLocaleExists(toLocale, getBasicAuthActor(req));

    const selectedKeys = Array.isArray(keys) ? keys.filter(Boolean) : [];

    let targetKeys = selectedKeys;
    if (targetKeys.length === 0) {
      targetKeys = await I18nEntry.distinct('key');
    }

    if (missingOnly === true) {
      const existingTo = await I18nEntry.find({ locale: toLocale, key: { $in: targetKeys } })
        .select('key')
        .lean();
      const haveTo = new Set(existingTo.map((e) => e.key));
      targetKeys = targetKeys.filter((k) => !haveTo.has(k));
    }

    const fromEntries = await I18nEntry.find({ locale: fromLocale, key: { $in: targetKeys } })
      .select('key value valueFormat')
      .lean();

    const fromMap = new Map(fromEntries.map((e) => [e.key, e]));

    const resolved = await resolveLlmProviderModel({
      systemKey: 'i18n.translate.preview',
      providerKey: req.body?.providerKey,
      model,
    });

    const aiModel = resolved.model || (await getSettingValue('i18n.ai.model', 'google/gemini-2.5-flash-lite'));
    const glossary = await getSettingValue('i18n.ai.glossary', '');

    const legacyApiKey = await getLegacyOpenRouterApiKey();
    const runtimeOptions = (resolved.providerKey === 'openrouter' && legacyApiKey)
      ? { apiKey: legacyApiKey, baseUrl: 'https://openrouter.ai/api/v1' }
      : {};

    const results = [];
    for (const key of targetKeys) {
      const from = fromMap.get(key);
      if (!from) {
        continue;
      }

      const prompt = buildAiPrompt({ glossary, fromLocale, toLocale, key, fromValue: from.value });
      const resp = await llmService.callAdhoc(
        {
          providerKey: resolved.providerKey,
          model: aiModel,
          messages: [{ role: 'user', content: prompt }],
          promptKeyForAudit: 'i18n.translate.preview',
        },
        runtimeOptions,
      );

      const translated = String(resp.content || '').trim();

      results.push({
        key,
        fromLocale,
        toLocale,
        fromValue: from.value,
        proposedValue: translated,
        valueFormat: from.valueFormat || 'text',
        providerKey: resolved.providerKey,
        model: aiModel,
      });
    }

    res.json({ results });
  } catch (error) {
    console.error('Error generating AI preview:', error);
    res.status(500).json({ error: error.message || 'Failed to generate AI preview' });
  }
};

exports.aiApply = async (req, res) => {
  try {
    const { toLocale, items } = req.body;
    if (!toLocale) {
      return res.status(400).json({ error: 'toLocale is required' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items is required' });
    }

    const actor = getBasicAuthActor(req);

    await ensureLocaleExists(toLocale, actor);

    const applied = [];
    for (const item of items) {
      if (!item?.key) continue;

      const existing = await I18nEntry.findOne({ key: item.key, locale: toLocale });
      if (!existing) {
        const entry = await I18nEntry.create({
          key: item.key,
          locale: toLocale,
          value: item.value || '',
          valueFormat: item.valueFormat === 'html' ? 'html' : 'text',
          source: 'ai',
          seeded: false,
          edited: true,
          editedAt: new Date(),
          editedBy: actor.actorId,
          lastAiProvider: item.providerKey || 'openrouter',
          lastAiModel: item.model || null,
        });

        applied.push(entry.toObject());

        await createAuditEvent({
          ...actor,
          action: 'i18n.ai.apply.create',
          entityType: 'I18nEntry',
          entityId: String(entry._id),
          before: null,
          after: entry.toObject(),
          meta: { toLocale },
        });

        continue;
      }

      const before = existing.toObject();
      existing.value = item.value || '';
      existing.valueFormat = item.valueFormat === 'html' ? 'html' : 'text';
      existing.source = 'ai';
      existing.edited = true;
      existing.editedAt = new Date();
      existing.editedBy = actor.actorId;
      existing.lastAiProvider = item.providerKey || 'openrouter';
      existing.lastAiModel = item.model || null;
      await existing.save();

      applied.push(existing.toObject());

      await createAuditEvent({
        ...actor,
        action: 'i18n.ai.apply.update',
        entityType: 'I18nEntry',
        entityId: String(existing._id),
        before,
        after: existing.toObject(),
        meta: { toLocale },
      });
    }

    clearI18nCache();

    res.json({ appliedCount: applied.length, applied });
  } catch (error) {
    console.error('Error applying AI results:', error);
    res.status(500).json({ error: error.message || 'Failed to apply AI results' });
  }
};

exports.aiTranslateText = async (req, res) => {
  try {
    const { fromLocale, toLocale, text, model } = req.body;
    if (!fromLocale || !toLocale) {
      return res.status(400).json({ error: 'fromLocale and toLocale are required' });
    }
    if (typeof text !== 'string' || text.trim() === '') {
      return res.status(400).json({ error: 'text is required' });
    }

    await ensureLocaleExists(toLocale, getBasicAuthActor(req));

    const resolved = await resolveLlmProviderModel({
      systemKey: 'i18n.translate.text',
      providerKey: req.body?.providerKey,
      model,
    });

    const aiModel = resolved.model || (await getSettingValue('i18n.ai.model', 'google/gemini-2.5-flash-lite'));
    const glossary = await getSettingValue('i18n.ai.glossary', '');

    const legacyApiKey = await getLegacyOpenRouterApiKey();
    const runtimeOptions = (resolved.providerKey === 'openrouter' && legacyApiKey)
      ? { apiKey: legacyApiKey, baseUrl: 'https://openrouter.ai/api/v1' }
      : {};
    const prompt = buildAiPrompt({
      glossary,
      fromLocale,
      toLocale,
      key: '(admin.text)',
      fromValue: text,
    });

    const resp = await llmService.callAdhoc(
      {
        providerKey: resolved.providerKey,
        model: aiModel,
        messages: [{ role: 'user', content: prompt }],
        promptKeyForAudit: 'i18n.translate.text',
      },
      runtimeOptions,
    );

    const translatedText = String(resp.content || '').trim();
    res.json({ translatedText, model: aiModel, providerKey: resolved.providerKey });
  } catch (error) {
    console.error('Error translating text with AI:', error);
    res.status(500).json({ error: error.message || 'Failed to translate text' });
  }
};
