#!/usr/bin/env node

/**
 * Additional resources not covered in other modules
 */

const mongoose = require('mongoose');

const agentMessages = {
  async execute(options) {
    const AgentMessage = mongoose.model('AgentMessage');
    switch (options.command) {
      case 'list': {
        const limit = parseInt(options.value) || 50;
        const messages = await AgentMessage.find().sort({ createdAt: -1 }).limit(limit).lean();
        return { items: messages, count: messages.length };
      }
      case 'get': {
        if (!options.id) throw new Error('Message ID is required');
        const message = await AgentMessage.findById(options.id).lean();
        if (!message) throw new Error('Message not found');
        return message;
      }
      case 'delete': {
        if (!options.id) throw new Error('Message ID is required');
        const message = await AgentMessage.findByIdAndDelete(options.id);
        if (!message) throw new Error('Message not found');
        return { success: true, id: options.id };
      }
      case 'clear': {
        const result = await AgentMessage.deleteMany({});
        return { success: true, deletedCount: result.deletedCount };
      }
      default:
        throw new Error(`Unknown agent-messages command: ${options.command}`);
    }
  },
};

const actionEvents = {
  async execute(options) {
    const ActionEvent = mongoose.model('ActionEvent');
    switch (options.command) {
      case 'list': {
        const limit = parseInt(options.value) || 50;
        const events = await ActionEvent.find().sort({ createdAt: -1 }).limit(limit).lean();
        return { items: events, count: events.length };
      }
      case 'get': {
        if (!options.id) throw new Error('Action event ID is required');
        const event = await ActionEvent.findById(options.id).lean();
        if (!event) throw new Error('Action event not found');
        return event;
      }
      case 'clear': {
        const result = await ActionEvent.deleteMany({});
        return { success: true, deletedCount: result.deletedCount };
      }
      default:
        throw new Error(`Unknown action-events command: ${options.command}`);
    }
  },
};

const experimentEvents = {
  async execute(options) {
    const ExperimentEvent = mongoose.model('ExperimentEvent');
    switch (options.command) {
      case 'list': {
        const limit = parseInt(options.value) || 50;
        const events = await ExperimentEvent.find().sort({ createdAt: -1 }).limit(limit).lean();
        return { items: events, count: events.length };
      }
      case 'clear': {
        const result = await ExperimentEvent.deleteMany({});
        return { success: true, deletedCount: result.deletedCount };
      }
      default:
        throw new Error(`Unknown experiment-events command: ${options.command}`);
    }
  },
};

const experimentMetricBuckets = {
  async execute(options) {
    const ExperimentMetricBucket = mongoose.model('ExperimentMetricBucket');
    switch (options.command) {
      case 'list': {
        const limit = parseInt(options.value) || 50;
        const buckets = await ExperimentMetricBucket.find().sort({ createdAt: -1 }).limit(limit).lean();
        return { items: buckets, count: buckets.length };
      }
      case 'clear': {
        const result = await ExperimentMetricBucket.deleteMany({});
        return { success: true, deletedCount: result.deletedCount };
      }
      default:
        throw new Error(`Unknown experiment-metric-buckets command: ${options.command}`);
    }
  },
};

const fileEntries = {
  async execute(options) {
    const FileEntry = mongoose.model('FileEntry');
    switch (options.command) {
      case 'list': {
        const limit = parseInt(options.value) || 50;
        const files = await FileEntry.find().sort({ createdAt: -1 }).limit(limit).lean();
        return { items: files, count: files.length };
      }
      case 'get': {
        if (!options.id) throw new Error('File entry ID is required');
        const file = await FileEntry.findById(options.id).lean();
        if (!file) throw new Error('File entry not found');
        return file;
      }
      case 'delete': {
        if (!options.id) throw new Error('File entry ID is required');
        const file = await FileEntry.findByIdAndDelete(options.id);
        if (!file) throw new Error('File entry not found');
        return { success: true, id: options.id };
      }
      case 'clear': {
        const result = await FileEntry.deleteMany({});
        return { success: true, deletedCount: result.deletedCount };
      }
      default:
        throw new Error(`Unknown file-entries command: ${options.command}`);
    }
  },
};

const i18nLocales = {
  async execute(options) {
    const I18nLocale = mongoose.model('I18nLocale');
    switch (options.command) {
      case 'list': {
        const locales = await I18nLocale.find().lean();
        return { items: locales, count: locales.length };
      }
      case 'get': {
        if (!options.id) throw new Error('Locale ID is required');
        const locale = await I18nLocale.findById(options.id).lean();
        if (!locale) throw new Error('Locale not found');
        return locale;
      }
      case 'create': {
        if (!options.name) throw new Error('--name (locale code) is required');
        const locale = await I18nLocale.create({
          code: options.name,
          name: options.description || options.name,
          enabled: true,
        });
        return locale;
      }
      case 'delete': {
        if (!options.id) throw new Error('Locale ID is required');
        const locale = await I18nLocale.findByIdAndDelete(options.id);
        if (!locale) throw new Error('Locale not found');
        return { success: true, id: options.id };
      }
      default:
        throw new Error(`Unknown i18n-locales command: ${options.command}`);
    }
  },
};

const proxyEntries = {
  async execute(options) {
    const ProxyEntry = mongoose.model('ProxyEntry');
    switch (options.command) {
      case 'list': {
        const entries = await ProxyEntry.find().lean();
        return { items: entries, count: entries.length };
      }
      case 'get': {
        if (!options.id) throw new Error('Proxy entry ID is required');
        const entry = await ProxyEntry.findById(options.id).lean();
        if (!entry) throw new Error('Proxy entry not found');
        return entry;
      }
      case 'delete': {
        if (!options.id) throw new Error('Proxy entry ID is required');
        const entry = await ProxyEntry.findByIdAndDelete(options.id);
        if (!entry) throw new Error('Proxy entry not found');
        return { success: true, id: options.id };
      }
      default:
        throw new Error(`Unknown proxy-entries command: ${options.command}`);
    }
  },
};

const rateLimitMetricBuckets = {
  async execute(options) {
    const RateLimitMetricBucket = mongoose.model('RateLimitMetricBucket');
    switch (options.command) {
      case 'list': {
        const limit = parseInt(options.value) || 50;
        const buckets = await RateLimitMetricBucket.find().sort({ createdAt: -1 }).limit(limit).lean();
        return { items: buckets, count: buckets.length };
      }
      case 'clear': {
        const result = await RateLimitMetricBucket.deleteMany({});
        return { success: true, deletedCount: result.deletedCount };
      }
      default:
        throw new Error(`Unknown rate-limit-metric-buckets command: ${options.command}`);
    }
  },
};

const rbacGrants = {
  async execute(options) {
    const RbacGrant = mongoose.model('RbacGrant');
    switch (options.command) {
      case 'list': {
        const grants = await RbacGrant.find().lean();
        return { items: grants, count: grants.length };
      }
      case 'clear': {
        const result = await RbacGrant.deleteMany({});
        return { success: true, deletedCount: result.deletedCount };
      }
      default:
        throw new Error(`Unknown rbac-grants command: ${options.command}`);
    }
  },
};

const rbacGroupRoles = {
  async execute(options) {
    const RbacGroupRole = mongoose.model('RbacGroupRole');
    switch (options.command) {
      case 'list': {
        const groupRoles = await RbacGroupRole.find().populate('groupId roleId').lean();
        return { items: groupRoles, count: groupRoles.length };
      }
      case 'delete': {
        if (!options.id) throw new Error('Group role ID is required');
        const groupRole = await RbacGroupRole.findByIdAndDelete(options.id);
        if (!groupRole) throw new Error('Group role not found');
        return { success: true, id: options.id };
      }
      default:
        throw new Error(`Unknown rbac-group-roles command: ${options.command}`);
    }
  },
};

const rbacUserRoles = {
  async execute(options) {
    const RbacUserRole = mongoose.model('RbacUserRole');
    switch (options.command) {
      case 'list': {
        const userRoles = await RbacUserRole.find().populate('userId roleId').lean();
        return { items: userRoles, count: userRoles.length };
      }
      case 'delete': {
        if (!options.id) throw new Error('User role ID is required');
        const userRole = await RbacUserRole.findByIdAndDelete(options.id);
        if (!userRole) throw new Error('User role not found');
        return { success: true, id: options.id };
      }
      default:
        throw new Error(`Unknown rbac-user-roles command: ${options.command}`);
    }
  },
};

const uiComponentProjects = {
  async execute(options) {
    const UiComponentProject = mongoose.model('UiComponentProject');
    switch (options.command) {
      case 'list': {
        const projects = await UiComponentProject.find().lean();
        return { items: projects, count: projects.length };
      }
      case 'get': {
        if (!options.id) throw new Error('UI component project ID is required');
        const project = await UiComponentProject.findById(options.id).lean();
        if (!project) throw new Error('UI component project not found');
        return project;
      }
      case 'delete': {
        if (!options.id) throw new Error('UI component project ID is required');
        const project = await UiComponentProject.findByIdAndDelete(options.id);
        if (!project) throw new Error('UI component project not found');
        return { success: true, id: options.id };
      }
      default:
        throw new Error(`Unknown ui-component-projects command: ${options.command}`);
    }
  },
};

const uiComponentProjectComponents = {
  async execute(options) {
    const UiComponentProjectComponent = mongoose.model('UiComponentProjectComponent');
    switch (options.command) {
      case 'list': {
        const components = await UiComponentProjectComponent.find().lean();
        return { items: components, count: components.length };
      }
      case 'delete': {
        if (!options.id) throw new Error('Component ID is required');
        const component = await UiComponentProjectComponent.findByIdAndDelete(options.id);
        if (!component) throw new Error('Component not found');
        return { success: true, id: options.id };
      }
      default:
        throw new Error(`Unknown ui-component-project-components command: ${options.command}`);
    }
  },
};

const virtualEjsFileVersions = {
  async execute(options) {
    const VirtualEjsFileVersion = mongoose.model('VirtualEjsFileVersion');
    switch (options.command) {
      case 'list': {
        const limit = parseInt(options.value) || 50;
        const versions = await VirtualEjsFileVersion.find().sort({ createdAt: -1 }).limit(limit).lean();
        return { items: versions, count: versions.length };
      }
      case 'clear': {
        const result = await VirtualEjsFileVersion.deleteMany({});
        return { success: true, deletedCount: result.deletedCount };
      }
      default:
        throw new Error(`Unknown virtual-ejs-file-versions command: ${options.command}`);
    }
  },
};

const virtualEjsGroupChanges = {
  async execute(options) {
    const VirtualEjsGroupChange = mongoose.model('VirtualEjsGroupChange');
    switch (options.command) {
      case 'list': {
        const changes = await VirtualEjsGroupChange.find().lean();
        return { items: changes, count: changes.length };
      }
      case 'clear': {
        const result = await VirtualEjsGroupChange.deleteMany({});
        return { success: true, deletedCount: result.deletedCount };
      }
      default:
        throw new Error(`Unknown virtual-ejs-group-changes command: ${options.command}`);
    }
  },
};

const healthCheckRuns = {
  async execute(options) {
    const HealthCheckRun = mongoose.model('HealthCheckRun');
    switch (options.command) {
      case 'list': {
        const limit = parseInt(options.value) || 50;
        const runs = await HealthCheckRun.find().sort({ createdAt: -1 }).limit(limit).lean();
        return { items: runs, count: runs.length };
      }
      case 'clear': {
        const result = await HealthCheckRun.deleteMany({});
        return { success: true, deletedCount: result.deletedCount };
      }
      default:
        throw new Error(`Unknown health-check-runs command: ${options.command}`);
    }
  },
};

const consoleEntries = {
  async execute(options) {
    const ConsoleEntry = mongoose.model('ConsoleEntry');
    switch (options.command) {
      case 'list': {
        const limit = parseInt(options.value) || 50;
        const entries = await ConsoleEntry.find().sort({ createdAt: -1 }).limit(limit).lean();
        return { items: entries, count: entries.length };
      }
      case 'clear': {
        const result = await ConsoleEntry.deleteMany({});
        return { success: true, deletedCount: result.deletedCount };
      }
      default:
        throw new Error(`Unknown console-entries command: ${options.command}`);
    }
  },
};

module.exports = {
  agentMessages, actionEvents, experimentEvents, experimentMetricBuckets,
  fileEntries, i18nLocales, proxyEntries, rateLimitMetricBuckets,
  rbacGrants, rbacGroupRoles, rbacUserRoles,
  uiComponentProjects, uiComponentProjectComponents,
  virtualEjsFileVersions, virtualEjsGroupChanges,
  healthCheckRuns, consoleEntries,
};
