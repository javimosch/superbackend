const { proposeComponentEdit } = require('../services/uiComponentsAi.service');
const { getBasicAuthActor } = require('../services/audit.service');

function handleError(res, err) {
  const msg = err?.message || 'Operation failed';
  const code = err?.code;
  if (code === 'VALIDATION') return res.status(400).json({ error: msg });
  if (code === 'NOT_FOUND') return res.status(404).json({ error: msg });
  if (code === 'AI_INVALID') return res.status(500).json({ error: msg });
  return res.status(500).json({ error: msg });
}

exports.propose = async (req, res) => {
  try {
    const actor = getBasicAuthActor(req);
    const { code } = req.params;

    const { prompt, providerKey, model, targets, mode } = req.body || {};

    const result = await proposeComponentEdit({
      code,
      prompt,
      providerKey,
      model,
      targets,
      mode,
      actor,
    });

    return res.json(result);
  } catch (err) {
    console.error('[adminUiComponentsAi] propose error', err);
    return handleError(res, err);
  }
};

module.exports._testHelpers = { handleError };
