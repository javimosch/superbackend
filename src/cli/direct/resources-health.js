#!/usr/bin/env node

/**
 * Health & Metrics: health-incidents, health-attempts, error-aggregates, metric-buckets
 */

const mongoose = require("mongoose");

const healthIncidents = {
  async execute(options) {
    const HealthIncident = mongoose.model("HealthIncident");
    switch (options.command) {
      case "list": {
        const incidents = await HealthIncident.find()
          .sort({ createdAt: -1 })
          .lean();
        return { items: incidents, count: incidents.length };
      }
      case "clear": {
        const result = await HealthIncident.deleteMany({});
        return { success: true, deletedCount: result.deletedCount };
      }
      default:
        throw new Error(`Unknown health-incidents command: ${options.command}`);
    }
  },
};

const healthAttempts = {
  async execute(options) {
    const HealthAutoHealAttempt = mongoose.model("HealthAutoHealAttempt");
    switch (options.command) {
      case "list": {
        const attempts = await HealthAutoHealAttempt.find()
          .sort({ createdAt: -1 })
          .lean();
        return { items: attempts, count: attempts.length };
      }
      case "clear": {
        const result = await HealthAutoHealAttempt.deleteMany({});
        return { success: true, deletedCount: result.deletedCount };
      }
      default:
        throw new Error(`Unknown health-attempts command: ${options.command}`);
    }
  },
};

const errorAggregates = {
  async execute(options) {
    const ErrorAggregate = mongoose.model("ErrorAggregate");
    switch (options.command) {
      case "list": {
        const aggregates = await ErrorAggregate.find()
          .sort({ count: -1 })
          .lean();
        return { items: aggregates, count: aggregates.length };
      }
      case "clear": {
        const result = await ErrorAggregate.deleteMany({});
        return { success: true, deletedCount: result.deletedCount };
      }
      default:
        throw new Error(`Unknown error-aggregates command: ${options.command}`);
    }
  },
};

const metricBuckets = {
  async execute(options) {
    const RateLimitMetricBucket = mongoose.model("RateLimitMetricBucket");
    switch (options.command) {
      case "list": {
        const limit = parseInt(options.value) || 50;
        const buckets = await RateLimitMetricBucket.find()
          .sort({ createdAt: -1 })
          .limit(limit)
          .lean();
        return { items: buckets, count: buckets.length };
      }
      case "clear": {
        const result = await RateLimitMetricBucket.deleteMany({});
        return { success: true, deletedCount: result.deletedCount };
      }
      default:
        throw new Error(`Unknown metric-buckets command: ${options.command}`);
    }
  },
};

const virtualEjsFiles = {
  async execute(options) {
    const VirtualEjsFile = mongoose.model("VirtualEjsFile");
    switch (options.command) {
      case "list": {
        const files = await VirtualEjsFile.find().lean();
        return { items: files, count: files.length };
      }
      case "get": {
        if (!options.id) throw new Error("Virtual file ID is required");
        const file = await VirtualEjsFile.findById(options.id).lean();
        if (!file) throw new Error("Virtual file not found");
        return file;
      }
      case "delete": {
        if (!options.id) throw new Error("Virtual file ID is required");
        const file = await VirtualEjsFile.findByIdAndDelete(options.id);
        if (!file) throw new Error("Virtual file not found");
        return { success: true, id: options.id };
      }
      case "clear": {
        const result = await VirtualEjsFile.deleteMany({});
        return { success: true, deletedCount: result.deletedCount };
      }
      default:
        throw new Error(
          `Unknown virtual-ejs-files command: ${options.command}`,
        );
    }
  },
};

const virtualEjsGroups = {
  async execute(options) {
    const VirtualEjsGroup = mongoose.model("VirtualEjsGroup");
    switch (options.command) {
      case "list": {
        const groups = await VirtualEjsGroup.find().lean();
        return { items: groups, count: groups.length };
      }
      case "delete": {
        if (!options.id) throw new Error("Virtual group ID is required");
        const group = await VirtualEjsGroup.findByIdAndDelete(options.id);
        if (!group) throw new Error("Virtual group not found");
        return { success: true, id: options.id };
      }
      default:
        throw new Error(
          `Unknown virtual-ejs-groups command: ${options.command}`,
        );
    }
  },
};

module.exports = {
  healthIncidents,
  healthAttempts,
  errorAggregates,
  metricBuckets,
  virtualEjsFiles,
  virtualEjsGroups,
};
