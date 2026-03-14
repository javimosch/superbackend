#!/usr/bin/env node

/**
 * Additional resources: experiments, rate-limits, demo, blog-automation, execution history
 */

const mongoose = require("mongoose");

const demos = {
  async execute(options) {
    const SuperDemo = mongoose.model("SuperDemo");
    switch (options.command) {
      case "list": {
        const demos = await SuperDemo.find().lean();
        return { items: demos, count: demos.length };
      }
      case "get": {
        if (!options.id) throw new Error("Demo ID is required");
        const demo = await SuperDemo.findById(options.id).lean();
        if (!demo) throw new Error("Demo not found");
        return demo;
      }
      case "create": {
        if (!options.name) throw new Error("--name is required");
        const demo = await SuperDemo.create({
          name: options.name,
          demoId: `demo_${Date.now()}`,
          projectId: options.description || "default",
          status: "draft",
        });
        return demo;
      }
      case "delete": {
        if (!options.id) throw new Error("Demo ID is required");
        const demo = await SuperDemo.findByIdAndDelete(options.id);
        if (!demo) throw new Error("Demo not found");
        return { success: true, id: options.id };
      }
      default:
        throw new Error(`Unknown demos command: ${options.command}`);
    }
  },
};

const experiments = {
  async execute(options) {
    const Experiment = mongoose.model("Experiment");
    switch (options.command) {
      case "list": {
        const experiments = await Experiment.find().lean();
        return { items: experiments, count: experiments.length };
      }
      case "get": {
        if (!options.id) throw new Error("Experiment ID is required");
        const experiment = await Experiment.findById(options.id).lean();
        if (!experiment) throw new Error("Experiment not found");
        return experiment;
      }
      case "create": {
        if (!options.name) throw new Error("--name is required");
        const experiment = await Experiment.create({
          name: options.name,
          description: options.description || "",
          status: "draft",
        });
        return experiment;
      }
      case "delete": {
        if (!options.id) throw new Error("Experiment ID is required");
        const experiment = await Experiment.findByIdAndDelete(options.id);
        if (!experiment) throw new Error("Experiment not found");
        return { success: true, id: options.id };
      }
      default:
        throw new Error(`Unknown experiments command: ${options.command}`);
    }
  },
};

const experimentAssignments = {
  async execute(options) {
    const ExperimentAssignment = mongoose.model("ExperimentAssignment");
    switch (options.command) {
      case "list": {
        const limit = parseInt(options.value) || 50;
        const assignments = await ExperimentAssignment.find()
          .sort({ createdAt: -1 })
          .limit(limit)
          .lean();
        return { items: assignments, count: assignments.length };
      }
      case "get": {
        if (!options.id) throw new Error("Assignment ID is required");
        const assignment = await ExperimentAssignment.findById(
          options.id,
        ).lean();
        if (!assignment) throw new Error("Assignment not found");
        return assignment;
      }
      case "clear": {
        const result = await ExperimentAssignment.deleteMany({});
        return { success: true, deletedCount: result.deletedCount };
      }
      default:
        throw new Error(
          `Unknown experiment-assignments command: ${options.command}`,
        );
    }
  },
};

const rateLimits = {
  async execute(options) {
    const RateLimitCounter = mongoose.model("RateLimitCounter");
    switch (options.command) {
      case "list": {
        const limit = parseInt(options.value) || 50;
        const counters = await RateLimitCounter.find()
          .sort({ createdAt: -1 })
          .limit(limit)
          .lean();
        return { items: counters, count: counters.length };
      }
      case "get": {
        if (!options.key) throw new Error("--key (limit key) is required");
        const counter = await RateLimitCounter.findOne({
          key: options.key,
        }).lean();
        if (!counter) throw new Error("Rate limit counter not found");
        return counter;
      }
      case "delete": {
        if (!options.key) throw new Error("--key (limit key) is required");
        const counter = await RateLimitCounter.findOneAndDelete({
          key: options.key,
        });
        if (!counter) throw new Error("Rate limit counter not found");
        return { success: true, key: options.key };
      }
      case "clear": {
        const result = await RateLimitCounter.deleteMany({});
        return { success: true, deletedCount: result.deletedCount };
      }
      default:
        throw new Error(`Unknown rate-limits command: ${options.command}`);
    }
  },
};

const demoProjects = {
  async execute(options) {
    const SuperDemoProject = mongoose.model("SuperDemoProject");
    switch (options.command) {
      case "list": {
        const projects = await SuperDemoProject.find().lean();
        return { items: projects, count: projects.length };
      }
      case "get": {
        if (!options.id) throw new Error("Demo project ID is required");
        const project = await SuperDemoProject.findById(options.id).lean();
        if (!project) throw new Error("Demo project not found");
        return project;
      }
      case "create": {
        if (!options.name) throw new Error("--name is required");
        const project = await SuperDemoProject.create({
          name: options.name,
          description: options.description || "",
        });
        return project;
      }
      case "delete": {
        if (!options.id) throw new Error("Demo project ID is required");
        const project = await SuperDemoProject.findByIdAndDelete(options.id);
        if (!project) throw new Error("Demo project not found");
        return { success: true, id: options.id };
      }
      default:
        throw new Error(`Unknown demo-projects command: ${options.command}`);
    }
  },
};

const demoSteps = {
  async execute(options) {
    const SuperDemoStep = mongoose.model("SuperDemoStep");
    switch (options.command) {
      case "list": {
        const limit = parseInt(options.value) || 50;
        const steps = await SuperDemoStep.find()
          .sort({ createdAt: -1 })
          .limit(limit)
          .lean();
        return { items: steps, count: steps.length };
      }
      case "get": {
        if (!options.id) throw new Error("Demo step ID is required");
        const step = await SuperDemoStep.findById(options.id).lean();
        if (!step) throw new Error("Demo step not found");
        return step;
      }
      case "delete": {
        if (!options.id) throw new Error("Demo step ID is required");
        const step = await SuperDemoStep.findByIdAndDelete(options.id);
        if (!step) throw new Error("Demo step not found");
        return { success: true, id: options.id };
      }
      case "clear": {
        const result = await SuperDemoStep.deleteMany({});
        return { success: true, deletedCount: result.deletedCount };
      }
      default:
        throw new Error(`Unknown demo-steps command: ${options.command}`);
    }
  },
};

const blogAutomationLocks = {
  async execute(options) {
    const BlogAutomationLock = mongoose.model("BlogAutomationLock");
    switch (options.command) {
      case "list": {
        const locks = await BlogAutomationLock.find().lean();
        return { items: locks, count: locks.length };
      }
      case "clear": {
        const result = await BlogAutomationLock.deleteMany({});
        return { success: true, deletedCount: result.deletedCount };
      }
      default:
        throw new Error(
          `Unknown blog-automation-locks command: ${options.command}`,
        );
    }
  },
};

const blogAutomationRuns = {
  async execute(options) {
    const BlogAutomationRun = mongoose.model("BlogAutomationRun");
    switch (options.command) {
      case "list": {
        const limit = parseInt(options.value) || 50;
        const runs = await BlogAutomationRun.find()
          .sort({ createdAt: -1 })
          .limit(limit)
          .lean();
        return { items: runs, count: runs.length };
      }
      case "get": {
        if (!options.id) throw new Error("Automation run ID is required");
        const run = await BlogAutomationRun.findById(options.id).lean();
        if (!run) throw new Error("Automation run not found");
        return run;
      }
      case "clear": {
        const result = await BlogAutomationRun.deleteMany({});
        return { success: true, deletedCount: result.deletedCount };
      }
      default:
        throw new Error(
          `Unknown blog-automation-runs command: ${options.command}`,
        );
    }
  },
};

const cronExecutions = {
  async execute(options) {
    const CronExecution = mongoose.model("CronExecution");
    switch (options.command) {
      case "list": {
        const limit = parseInt(options.value) || 50;
        const executions = await CronExecution.find()
          .sort({ createdAt: -1 })
          .limit(limit)
          .lean();
        return { items: executions, count: executions.length };
      }
      case "clear": {
        const days = parseInt(options.value) || 7;
        const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const result = await CronExecution.deleteMany({
          createdAt: { $lt: cutoffDate },
        });
        return {
          success: true,
          deletedCount: result.deletedCount,
          olderThan: cutoffDate.toISOString(),
        };
      }
      default:
        throw new Error(`Unknown cron-executions command: ${options.command}`);
    }
  },
};

const workflowExecutions = {
  async execute(options) {
    const WorkflowExecution = mongoose.model("WorkflowExecution");
    switch (options.command) {
      case "list": {
        const limit = parseInt(options.value) || 50;
        const executions = await WorkflowExecution.find()
          .sort({ createdAt: -1 })
          .limit(limit)
          .lean();
        return { items: executions, count: executions.length };
      }
      case "get": {
        if (!options.id) throw new Error("Workflow execution ID is required");
        const execution = await WorkflowExecution.findById(options.id).lean();
        if (!execution) throw new Error("Workflow execution not found");
        return execution;
      }
      case "clear": {
        const result = await WorkflowExecution.deleteMany({});
        return { success: true, deletedCount: result.deletedCount };
      }
      default:
        throw new Error(
          `Unknown workflow-executions command: ${options.command}`,
        );
    }
  },
};

const scriptRuns = {
  async execute(options) {
    const ScriptRun = mongoose.model("ScriptRun");
    switch (options.command) {
      case "list": {
        const limit = parseInt(options.value) || 50;
        const runs = await ScriptRun.find()
          .sort({ createdAt: -1 })
          .limit(limit)
          .lean();
        return { items: runs, count: runs.length };
      }
      case "get": {
        if (!options.id) throw new Error("Script run ID is required");
        const run = await ScriptRun.findById(options.id).lean();
        if (!run) throw new Error("Script run not found");
        return run;
      }
      case "clear": {
        const result = await ScriptRun.deleteMany({});
        return { success: true, deletedCount: result.deletedCount };
      }
      default:
        throw new Error(`Unknown script-runs command: ${options.command}`);
    }
  },
};

module.exports = {
  experiments,
  experimentAssignments,
  rateLimits,
  demoProjects,
  demoSteps,
  blogAutomationLocks,
  blogAutomationRuns,
  cronExecutions,
  workflowExecutions,
  scriptRuns,
};
