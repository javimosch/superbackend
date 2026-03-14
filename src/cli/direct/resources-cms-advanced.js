#!/usr/bin/env node

/**
 * CMS Advanced: page-collections, block-definitions, context-blocks, ui-components, headless-*
 */

const mongoose = require('mongoose');

const pageCollections = {
  async execute(options) {
    const PageCollection = mongoose.model('PageCollection');
    switch (options.command) {
      case 'list': {
        const collections = await PageCollection.find().lean();
        return { items: collections, count: collections.length };
      }
      case 'get': {
        if (!options.id) throw new Error('Page collection ID is required');
        const collection = await PageCollection.findById(options.id).lean();
        if (!collection) throw new Error('Page collection not found');
        return collection;
      }
      case 'create': {
        if (!options.name) throw new Error('--name is required');
        const collection = await PageCollection.create({ name: options.name, description: options.description || '' });
        return collection;
      }
      case 'delete': {
        if (!options.id) throw new Error('Page collection ID is required');
        const collection = await PageCollection.findByIdAndDelete(options.id);
        if (!collection) throw new Error('Page collection not found');
        return { success: true, id: options.id };
      }
      default:
        throw new Error(`Unknown page-collections command: ${options.command}`);
    }
  },
};

const blockDefinitions = {
  async execute(options) {
    const BlockDefinition = mongoose.model('BlockDefinition');
    switch (options.command) {
      case 'list': {
        const blocks = await BlockDefinition.find().lean();
        return { items: blocks, count: blocks.length };
      }
      case 'get': {
        if (!options.id) throw new Error('Block definition ID is required');
        const block = await BlockDefinition.findById(options.id).lean();
        if (!block) throw new Error('Block definition not found');
        return block;
      }
      case 'delete': {
        if (!options.id) throw new Error('Block definition ID is required');
        const block = await BlockDefinition.findByIdAndDelete(options.id);
        if (!block) throw new Error('Block definition not found');
        return { success: true, id: options.id };
      }
      default:
        throw new Error(`Unknown block-definitions command: ${options.command}`);
    }
  },
};

const contextBlocks = {
  async execute(options) {
    const ContextBlockDefinition = mongoose.model('ContextBlockDefinition');
    switch (options.command) {
      case 'list': {
        const blocks = await ContextBlockDefinition.find().lean();
        return { items: blocks, count: blocks.length };
      }
      case 'get': {
        if (!options.id) throw new Error('Context block ID is required');
        const block = await ContextBlockDefinition.findById(options.id).lean();
        if (!block) throw new Error('Context block not found');
        return block;
      }
      case 'delete': {
        if (!options.id) throw new Error('Context block ID is required');
        const block = await ContextBlockDefinition.findByIdAndDelete(options.id);
        if (!block) throw new Error('Context block not found');
        return { success: true, id: options.id };
      }
      default:
        throw new Error(`Unknown context-blocks command: ${options.command}`);
    }
  },
};

const uiComponents = {
  async execute(options) {
    const UiComponent = mongoose.model('UiComponent');
    switch (options.command) {
      case 'list': {
        const components = await UiComponent.find().lean();
        return { items: components, count: components.length };
      }
      case 'get': {
        if (!options.id) throw new Error('UI component ID is required');
        const component = await UiComponent.findById(options.id).lean();
        if (!component) throw new Error('UI component not found');
        return component;
      }
      case 'delete': {
        if (!options.id) throw new Error('UI component ID is required');
        const component = await UiComponent.findByIdAndDelete(options.id);
        if (!component) throw new Error('UI component not found');
        return { success: true, id: options.id };
      }
      default:
        throw new Error(`Unknown ui-components command: ${options.command}`);
    }
  },
};

const headlessModels = {
  async execute(options) {
    const HeadlessModelDefinition = mongoose.model('HeadlessModelDefinition');
    switch (options.command) {
      case 'list': {
        const models = await HeadlessModelDefinition.find().lean();
        return { items: models, count: models.length };
      }
      case 'get': {
        if (!options.id) throw new Error('Headless model ID is required');
        const model = await HeadlessModelDefinition.findById(options.id).lean();
        if (!model) throw new Error('Headless model not found');
        return model;
      }
      case 'create': {
        if (!options.name) throw new Error('--name is required');
        const model = await HeadlessModelDefinition.create({ name: options.name, description: options.description || '' });
        return model;
      }
      case 'delete': {
        if (!options.id) throw new Error('Headless model ID is required');
        const model = await HeadlessModelDefinition.findByIdAndDelete(options.id);
        if (!model) throw new Error('Headless model not found');
        return { success: true, id: options.id };
      }
      default:
        throw new Error(`Unknown headless-models command: ${options.command}`);
    }
  },
};

const headlessTokens = {
  async execute(options) {
    const HeadlessApiToken = mongoose.model('HeadlessApiToken');
    switch (options.command) {
      case 'list': {
        const tokens = await HeadlessApiToken.find().lean();
        return { items: tokens, count: tokens.length };
      }
      case 'delete': {
        if (!options.id) throw new Error('Token ID is required');
        const token = await HeadlessApiToken.findByIdAndDelete(options.id);
        if (!token) throw new Error('Token not found');
        return { success: true, id: options.id };
      }
      case 'clear': {
        const result = await HeadlessApiToken.deleteMany({});
        return { success: true, deletedCount: result.deletedCount };
      }
      default:
        throw new Error(`Unknown headless-tokens command: ${options.command}`);
    }
  },
};

module.exports = { pageCollections, blockDefinitions, contextBlocks, uiComponents, headlessModels, headlessTokens };
