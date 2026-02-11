const Agent = require('../models/Agent');

exports.listAgents = async (req, res) => {
  try {
    const agents = await Agent.find().lean();
    return res.json({ items: agents });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.createAgent = async (req, res) => {
  try {
    const agent = await Agent.create(req.body);
    return res.json(agent);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.updateAgent = async (req, res) => {
  try {
    const agent = await Agent.findByIdAndUpdate(req.params.id, req.body, { new: true });
    return res.json(agent);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.deleteAgent = async (req, res) => {
  try {
    await Agent.findByIdAndDelete(req.params.id);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
