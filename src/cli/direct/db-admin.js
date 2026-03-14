#!/usr/bin/env node

/**
 * Database administration: db-info, db-users, slow-queries, profiling
 */

const mongoose = require('mongoose');

const dbInfo = {
  async execute(options, context) {
    const db = context.db;
    const info = await db.admin().serverInfo();
    const stats = await db.admin().serverStatus();

    return {
      version: info.version,
      gitVersion: info.gitVersion,
      uptime: stats.uptime,
      uptimeMillis: stats.uptimeMillis,
      localTime: stats.localTime,
      connections: { current: stats.connections.current, available: stats.connections.available },
      memory: stats.mem,
      assertions: stats.assertions,
    };
  },
};

const dbUsers = {
  async execute(options, context) {
    const db = context.db;
    const users = await db.admin().getUsers();
    return { users: users.users };
  },
};

const slowQueries = {
  async execute(options, context) {
    const db = context.db;
    const profileMs = parseInt(options.value) || 100;

    const result = await db.collection('system.profile').find({ millis: { $gt: profileMs } }).sort({ ts: -1 }).limit(50).toArray();
    return { profileMs, slowQueries: result.length, samples: result.slice(0, 10) };
  },
};

const enableProfiling = {
  async execute(options, context) {
    const db = context.db;
    const level = parseInt(options.value) || 1;
    await db.setProfilingLevel(level);
    return { level, message: `Profiling enabled at level ${level}` };
  },
};

const disableProfiling = {
  async execute(options, context) {
    const db = context.db;
    await db.setProfilingLevel(0);
    return { level: 0, message: 'Profiling disabled' };
  },
};

module.exports = { dbInfo, dbUsers, slowQueries, enableProfiling, disableProfiling };
