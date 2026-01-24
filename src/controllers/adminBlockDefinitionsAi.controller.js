const {
  generateBlockDefinition,
  proposeBlockDefinitionEdit,
} = require('../services/blockDefinitionsAi.service');

const { getBasicAuthActor } = require('../services/audit.service');

function handleError(res, err) {
  const code = err && err.code;
  if (code === 'VALIDATION') return res.status(400).json({ error: err.message });
  if (code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
  if (code === 'AI_INVALID') return res.status(500).json({ error: err.message });
  return res.status(500).json({ error: err.message || 'Operation failed' });
}

exports.generate = async (req, res) => {
  try {
    const actor = getBasicAuthActor(req);
    const { prompt, providerKey, model } = req.body || {};

    const result = await generateBlockDefinition({
      prompt,
      providerKey,
      model,
      actor,
    });

    return res.json(result);
  } catch (err) {
    console.error('[adminBlockDefinitionsAi] generate error', err);
    return handleError(res, err);
  }
};

exports.propose = async (req, res) => {
  try {
    const actor = getBasicAuthActor(req);
    const { code } = req.params;
    const { prompt, providerKey, model } = req.body || {};

    const result = await proposeBlockDefinitionEdit({
      code,
      prompt,
      providerKey,
      model,
      actor,
    });

    return res.json(result);
  } catch (err) {
    console.error('[adminBlockDefinitionsAi] propose error', err);
    return handleError(res, err);
  }
};
