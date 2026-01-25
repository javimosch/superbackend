const {
  generateContextBlock,
  proposeContextBlockEdit,
} = require('../services/pagesContextBlocksAi.service');

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
    const { prompt, blockType, providerKey, model } = req.body || {};

    const result = await generateContextBlock({
      prompt,
      blockType,
      providerKey,
      model,
      actor,
    });

    return res.json(result);
  } catch (err) {
    console.error('[adminPagesContextBlocksAi] generate error', err);
    return handleError(res, err);
  }
};

exports.propose = async (req, res) => {
  try {
    const actor = getBasicAuthActor(req);
    const { prompt, currentBlock, providerKey, model } = req.body || {};

    const result = await proposeContextBlockEdit({
      prompt,
      currentBlock,
      providerKey,
      model,
      actor,
    });

    return res.json(result);
  } catch (err) {
    console.error('[adminPagesContextBlocksAi] propose error', err);
    return handleError(res, err);
  }
};
