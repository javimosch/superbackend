#!/usr/bin/env node

/**
 * Agent utilities: agent-stats, agent-sessions, clear-agent-sessions
 */

const mongoose = require('mongoose');

const agentStats = {
  async execute(options) {
    const Agent = mongoose.model('Agent');
    const AgentMessage = mongoose.model('AgentMessage');

    const agents = await Agent.find().lean();
    const stats = [];

    for (const agent of agents) {
      const messageCount = await AgentMessage.countDocuments({ agentId: agent._id });
      stats.push({ agentId: agent._id, name: agent.name, model: agent.model, messageCount });
    }

    return { totalAgents: agents.length, agents: stats };
  },
};

const agentSessions = {
  async execute(options) {
    const JsonConfig = mongoose.model('JsonConfig');

    const limit = parseInt(options.value) || 50;
    const sessions = await JsonConfig.find({ alias: { $regex: /^agent-session-/ } }).sort({ updatedAt: -1 }).limit(limit).lean();

    return {
      total: sessions.length,
      sessions: sessions.map(s => ({
        alias: s.alias,
        id: JSON.parse(s.jsonRaw).id,
        label: JSON.parse(s.jsonRaw).label,
        updatedAt: s.updatedAt,
      })),
    };
  },
};

const clearAgentSessions = {
  async execute(options) {
    const JsonConfig = mongoose.model('JsonConfig');

    const days = parseInt(options.value) || 7;
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const result = await JsonConfig.deleteMany({
      alias: { $regex: /^agent-session-/ },
      updatedAt: { $lt: cutoffDate },
    });

    return { deletedCount: result.deletedCount, olderThan: cutoffDate.toISOString() };
  },
};

module.exports = { agentStats, agentSessions, clearAgentSessions };
