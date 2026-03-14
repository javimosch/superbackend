#!/usr/bin/env node

/**
 * Core resource handlers: agents, settings, users, json-configs
 */

const mongoose = require('mongoose');

const agents = {
  async execute(options) {
    const Agent = mongoose.model('Agent');
    switch (options.command) {
      case 'list': {
        const agents = await Agent.find().lean();
        return { items: agents, count: agents.length };
      }
      case 'get': {
        if (!options.id) throw new Error('Agent ID is required');
        const agent = await Agent.findById(options.id).lean();
        if (!agent) throw new Error('Agent not found');
        return agent;
      }
      case 'create': {
        if (!options.name) throw new Error('--name is required');
        if (!options.model) throw new Error('--model is required');
        const agent = await Agent.create({
          name: options.name,
          model: options.model,
          systemPrompt: options.description || '',
        });
        return agent;
      }
      case 'update': {
        if (!options.id) throw new Error('Agent ID is required');
        const updateData = {};
        if (options.name) updateData.name = options.name;
        if (options.model) updateData.model = options.model;
        if (options.description) updateData.systemPrompt = options.description;
        const agent = await Agent.findByIdAndUpdate(options.id, updateData, { new: true });
        if (!agent) throw new Error('Agent not found');
        return agent;
      }
      case 'delete': {
        if (!options.id) throw new Error('Agent ID is required');
        const agent = await Agent.findByIdAndDelete(options.id);
        if (!agent) throw new Error('Agent not found');
        return { success: true, id: options.id };
      }
      default:
        throw new Error(`Unknown agents command: ${options.command}`);
    }
  },
};

const settings = {
  async execute(options) {
    const GlobalSetting = mongoose.model('GlobalSetting');
    switch (options.command) {
      case 'list': {
        const settings = await GlobalSetting.find().lean();
        return { items: settings, count: settings.length };
      }
      case 'get': {
        if (!options.key) throw new Error('--key is required');
        const setting = await GlobalSetting.findOne({ key: options.key }).lean();
        if (!setting) throw new Error('Setting not found');
        return setting;
      }
      case 'create': {
        if (!options.key) throw new Error('--key is required');
        if (options.value === undefined) throw new Error('--value is required');
        let parsedValue = options.value;
        try { parsedValue = JSON.parse(options.value); } catch (e) {}
        const setting = await GlobalSetting.create({
          key: options.key,
          value: parsedValue,
          description: options.description || '',
        });
        return setting;
      }
      case 'update': {
        if (!options.key) throw new Error('--key is required');
        const updateData = {};
        if (options.value !== undefined) {
          try { updateData.value = JSON.parse(options.value); } catch (e) { updateData.value = options.value; }
        }
        if (options.description) updateData.description = options.description;
        const setting = await GlobalSetting.findOneAndUpdate({ key: options.key }, updateData, { new: true });
        if (!setting) throw new Error('Setting not found');
        return setting;
      }
      case 'delete': {
        if (!options.key) throw new Error('--key is required');
        const setting = await GlobalSetting.findOneAndDelete({ key: options.key });
        if (!setting) throw new Error('Setting not found');
        return { success: true, key: options.key };
      }
      default:
        throw new Error(`Unknown settings command: ${options.command}`);
    }
  },
};

const users = {
  async execute(options) {
    const User = mongoose.model('User');
    switch (options.command) {
      case 'list': {
        const users = await User.find().select('-password').lean();
        return { items: users, count: users.length };
      }
      case 'get': {
        if (!options.id) throw new Error('User ID is required');
        const user = await User.findById(options.id).select('-password').lean();
        if (!user) throw new Error('User not found');
        return user;
      }
      case 'create': {
        if (!options.email) throw new Error('--email is required');
        if (!options.password) throw new Error('--password is required');
        const user = await User.create({
          email: options.email,
          password: options.password,
          role: options.role || 'user',
        });
        return { _id: user._id, email: user.email, role: user.role };
      }
      case 'update': {
        if (!options.id) throw new Error('User ID is required');
        const updateData = {};
        if (options.email) updateData.email = options.email;
        if (options.password) updateData.password = options.password;
        if (options.role) updateData.role = options.role;
        const user = await User.findByIdAndUpdate(options.id, updateData, { new: true });
        if (!user) throw new Error('User not found');
        return { _id: user._id, email: user.email, role: user.role };
      }
      case 'delete': {
        if (!options.id) throw new Error('User ID is required');
        const user = await User.findByIdAndDelete(options.id);
        if (!user) throw new Error('User not found');
        return { success: true, id: options.id };
      }
      case 'disable': {
        if (!options.id) throw new Error('User ID is required');
        const user = await User.findByIdAndUpdate(options.id, { disabled: true }, { new: true });
        if (!user) throw new Error('User not found');
        return { success: true, id: options.id, disabled: true };
      }
      case 'enable': {
        if (!options.id) throw new Error('User ID is required');
        const user = await User.findByIdAndUpdate(options.id, { disabled: false }, { new: true });
        if (!user) throw new Error('User not found');
        return { success: true, id: options.id, disabled: false };
      }
      default:
        throw new Error(`Unknown users command: ${options.command}`);
    }
  },
};

const jsonConfigs = {
  async execute(options) {
    const JsonConfig = mongoose.model('JsonConfig');
    switch (options.command) {
      case 'list': {
        const configs = await JsonConfig.find().lean();
        return { items: configs, count: configs.length };
      }
      case 'get': {
        if (!options.alias) throw new Error('--alias is required');
        const config = await JsonConfig.findOne({ alias: options.alias }).lean();
        if (!config) throw new Error('Config not found');
        return config;
      }
      case 'create': {
        if (!options.alias) throw new Error('--alias is required');
        if (!options.json) throw new Error('--json is required');
        let parsedJson;
        try { parsedJson = JSON.parse(options.json); } catch (e) { throw new Error('--json must be valid JSON'); }
        const config = await JsonConfig.create({ alias: options.alias, jsonRaw: options.json });
        return config;
      }
      case 'update': {
        if (!options.alias) throw new Error('--alias is required');
        if (!options.json) throw new Error('--json is required');
        try { JSON.parse(options.json); } catch (e) { throw new Error('--json must be valid JSON'); }
        const config = await JsonConfig.findOneAndUpdate({ alias: options.alias }, { jsonRaw: options.json }, { new: true });
        if (!config) throw new Error('Config not found');
        return config;
      }
      case 'delete': {
        if (!options.alias) throw new Error('--alias is required');
        const config = await JsonConfig.findOneAndDelete({ alias: options.alias });
        if (!config) throw new Error('Config not found');
        return { success: true, alias: options.alias };
      }
      default:
        throw new Error(`Unknown json-configs command: ${options.command}`);
    }
  },
};

module.exports = { agents, settings, users, jsonConfigs };
