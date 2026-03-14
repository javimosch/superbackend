#!/usr/bin/env node

/**
 * System resources: crons, errors, scripts, workflows, health-checks
 */

const mongoose = require("mongoose");

const crons = {
  async execute(options) {
    const CronJob = mongoose.model("CronJob");
    switch (options.command) {
      case "list": {
        const crons = await CronJob.find().lean();
        return { items: crons, count: crons.length };
      }
      case "get": {
        if (!options.id) throw new Error("Cron ID is required");
        const cron = await CronJob.findById(options.id).lean();
        if (!cron) throw new Error("Cron not found");
        return cron;
      }
      case "create": {
        if (!options.name) throw new Error("--name is required");
        if (!options.description)
          throw new Error("--description (cron expression) is required");
        const cron = await CronJob.create({
          name: options.name,
          description: options.description,
          enabled: true,
        });
        return cron;
      }
      case "delete": {
        if (!options.id) throw new Error("Cron ID is required");
        const cron = await CronJob.findByIdAndDelete(options.id);
        if (!cron) throw new Error("Cron not found");
        return { success: true, id: options.id };
      }
      case "enable": {
        if (!options.id) throw new Error("Cron ID is required");
        const cron = await CronJob.findByIdAndUpdate(
          options.id,
          { enabled: true },
          { new: true },
        );
        if (!cron) throw new Error("Cron not found");
        return cron;
      }
      case "disable": {
        if (!options.id) throw new Error("Cron ID is required");
        const cron = await CronJob.findByIdAndUpdate(
          options.id,
          { enabled: false },
          { new: true },
        );
        if (!cron) throw new Error("Cron not found");
        return cron;
      }
      default:
        throw new Error(`Unknown crons command: ${options.command}`);
    }
  },
};

const errors = {
  async execute(options) {
    const ErrorAggregate = mongoose.model("ErrorAggregate");
    switch (options.command) {
      case "list": {
        const limit = parseInt(options.value) || 50;
        const errors = await ErrorAggregate.find()
          .sort({ count: -1 })
          .limit(limit)
          .lean();
        return { items: errors, count: errors.length };
      }
      case "get": {
        if (!options.id) throw new Error("Error ID is required");
        const error = await ErrorAggregate.findById(options.id).lean();
        if (!error) throw new Error("Error not found");
        return error;
      }
      case "delete": {
        if (!options.id) throw new Error("Error ID is required");
        const error = await ErrorAggregate.findByIdAndDelete(options.id);
        if (!error) throw new Error("Error not found");
        return { success: true, id: options.id };
      }
      case "clear": {
        await ErrorAggregate.deleteMany({});
        return { success: true, message: "All errors cleared" };
      }
      default:
        throw new Error(`Unknown errors command: ${options.command}`);
    }
  },
};

const scripts = {
  async execute(options) {
    const ScriptDefinition = mongoose.model("ScriptDefinition");
    switch (options.command) {
      case "list": {
        const scripts = await ScriptDefinition.find().lean();
        return { items: scripts, count: scripts.length };
      }
      case "get": {
        if (!options.id) throw new Error("Script ID is required");
        const script = await ScriptDefinition.findById(options.id).lean();
        if (!script) throw new Error("Script not found");
        return script;
      }
      case "create": {
        if (!options.name) throw new Error("--name is required");
        if (!options.description)
          throw new Error("--description (script code) is required");
        const script = await ScriptDefinition.create({
          name: options.name,
          description: options.description,
          enabled: true,
        });
        return script;
      }
      case "delete": {
        if (!options.id) throw new Error("Script ID is required");
        const script = await ScriptDefinition.findByIdAndDelete(options.id);
        if (!script) throw new Error("Script not found");
        return { success: true, id: options.id };
      }
      default:
        throw new Error(`Unknown scripts command: ${options.command}`);
    }
  },
};

const workflows = {
  async execute(options) {
    const Workflow = mongoose.model("Workflow");
    switch (options.command) {
      case "list": {
        const workflows = await Workflow.find().lean();
        return { items: workflows, count: workflows.length };
      }
      case "get": {
        if (!options.id) throw new Error("Workflow ID is required");
        const workflow = await Workflow.findById(options.id).lean();
        if (!workflow) throw new Error("Workflow not found");
        return workflow;
      }
      case "create": {
        if (!options.name) throw new Error("--name is required");
        const workflow = await Workflow.create({
          name: options.name,
          description: options.description || "",
          enabled: true,
        });
        return workflow;
      }
      case "delete": {
        if (!options.id) throw new Error("Workflow ID is required");
        const workflow = await Workflow.findByIdAndDelete(options.id);
        if (!workflow) throw new Error("Workflow not found");
        return { success: true, id: options.id };
      }
      case "enable": {
        if (!options.id) throw new Error("Workflow ID is required");
        const workflow = await Workflow.findByIdAndUpdate(
          options.id,
          { enabled: true },
          { new: true },
        );
        if (!workflow) throw new Error("Workflow not found");
        return workflow;
      }
      case "disable": {
        if (!options.id) throw new Error("Workflow ID is required");
        const workflow = await Workflow.findByIdAndUpdate(
          options.id,
          { enabled: false },
          { new: true },
        );
        if (!workflow) throw new Error("Workflow not found");
        return workflow;
      }
      default:
        throw new Error(`Unknown workflows command: ${options.command}`);
    }
  },
};

const healthChecks = {
  async execute(options) {
    const HealthCheck = mongoose.model("HealthCheck");
    switch (options.command) {
      case "list": {
        const checks = await HealthCheck.find().lean();
        return { items: checks, count: checks.length };
      }
      case "get": {
        if (!options.id) throw new Error("Health check ID is required");
        const check = await HealthCheck.findById(options.id).lean();
        if (!check) throw new Error("Health check not found");
        return check;
      }
      case "create": {
        if (!options.name) throw new Error("--name is required");
        const check = await HealthCheck.create({
          name: options.name,
          description: options.description || "",
          enabled: true,
        });
        return check;
      }
      case "delete": {
        if (!options.id) throw new Error("Health check ID is required");
        const check = await HealthCheck.findByIdAndDelete(options.id);
        if (!check) throw new Error("Health check not found");
        return { success: true, id: options.id };
      }
      default:
        throw new Error(`Unknown health-checks command: ${options.command}`);
    }
  },
};

module.exports = { crons, errors, scripts, workflows, healthChecks };
