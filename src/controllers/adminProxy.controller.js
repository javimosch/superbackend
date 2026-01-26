const ProxyEntry = require('../models/ProxyEntry');
const { listDiscoveries } = require('../services/proxy.service');

function handleServiceError(res, error) {
  const msg = error?.message || 'Operation failed';
  const code = error?.code;

  if (code === 'VALIDATION') return res.status(400).json({ error: msg });
  if (code === 'NOT_FOUND') return res.status(404).json({ error: msg });
  if (code === 'CONFLICT') return res.status(409).json({ error: msg });

  return res.status(500).json({ error: msg });
}

exports.list = async (req, res) => {
  try {
    const [entries, discoveries] = await Promise.all([
      ProxyEntry.find({}).sort({ updatedAt: -1 }).lean(),
      listDiscoveries(),
    ]);

    return res.json({ items: entries || [], discoveries: discoveries || [] });
  } catch (error) {
    console.error('Error listing proxy entries:', error);
    return handleServiceError(res, error);
  }
};

exports.get = async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    const item = await ProxyEntry.findById(id).lean();
    if (!item) return res.status(404).json({ error: 'Not found' });
    return res.json({ item });
  } catch (error) {
    console.error('Error getting proxy entry:', error);
    return handleServiceError(res, error);
  }
};

exports.create = async (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};

    const matchValue = String(body.match?.value || '').trim();
    if (!matchValue) return res.status(400).json({ error: 'match.value is required' });

    const doc = await ProxyEntry.create({
      name: String(body.name || ''),
      enabled: Boolean(body.enabled),
      match: {
        type: String(body.match?.type || 'contains'),
        value: matchValue,
        applyTo: String(body.match?.applyTo || 'host'),
        flags: String(body.match?.flags || 'i'),
      },
      policy: body.policy || undefined,
      rateLimit: body.rateLimit || undefined,
      cache: body.cache || undefined,
      headers: body.headers || undefined,
      transform: body.transform || undefined,
    });

    return res.status(201).json({ item: doc.toObject() });
  } catch (error) {
    console.error('Error creating proxy entry:', error);
    return handleServiceError(res, error);
  }
};

exports.update = async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    const updates = req.body && typeof req.body === 'object' ? req.body : {};

    const doc = await ProxyEntry.findById(id);
    if (!doc) return res.status(404).json({ error: 'Not found' });

    if (updates.name !== undefined) doc.name = String(updates.name || '');
    if (updates.enabled !== undefined) doc.enabled = Boolean(updates.enabled);

    if (updates.match && typeof updates.match === 'object') {
      if (updates.match.type !== undefined) doc.match.type = String(updates.match.type || 'contains');
      if (updates.match.value !== undefined) doc.match.value = String(updates.match.value || '').trim();
      if (updates.match.applyTo !== undefined) doc.match.applyTo = String(updates.match.applyTo || 'host');
      if (updates.match.flags !== undefined) doc.match.flags = String(updates.match.flags || 'i');
    }

    if (updates.policy !== undefined) doc.policy = updates.policy;
    if (updates.rateLimit !== undefined) doc.rateLimit = updates.rateLimit;
    if (updates.cache !== undefined) doc.cache = updates.cache;
    if (updates.headers !== undefined) doc.headers = updates.headers;
    if (updates.transform !== undefined) doc.transform = updates.transform;

    await doc.save();
    return res.json({ item: doc.toObject() });
  } catch (error) {
    console.error('Error updating proxy entry:', error);
    return handleServiceError(res, error);
  }
};

exports.delete = async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    const doc = await ProxyEntry.findByIdAndDelete(id).lean();
    if (!doc) return res.status(404).json({ error: 'Not found' });
    return res.json({ ok: true });
  } catch (error) {
    console.error('Error deleting proxy entry:', error);
    return handleServiceError(res, error);
  }
};
