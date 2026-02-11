const TelegramBot = require('../models/TelegramBot');
const Agent = require('../models/Agent');
const telegramService = require('../services/telegram.service');

exports.listBots = async (req, res) => {
  try {
    const bots = await TelegramBot.find().populate('defaultAgentId', 'name').lean();
    return res.json({ items: bots });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.createBot = async (req, res) => {
  try {
    const data = { ...req.body };
    if (data.defaultAgentId === '') delete data.defaultAgentId;
    
    const bot = await TelegramBot.create(data);
    if (bot.isActive) {
      await telegramService.startBot(bot._id);
    }
    return res.json(bot);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.updateBot = async (req, res) => {
  try {
    const data = { ...req.body };
    if (data.defaultAgentId === '') data.defaultAgentId = null;

    const bot = await TelegramBot.findByIdAndUpdate(req.params.id, data, { new: true });
    if (bot.isActive) {
      await telegramService.startBot(bot._id);
    } else {
      await telegramService.stopBot(bot._id);
    }
    return res.json(bot);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.deleteBot = async (req, res) => {
  try {
    await telegramService.stopBot(req.params.id);
    await TelegramBot.findByIdAndDelete(req.params.id);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.toggleBot = async (req, res) => {
  try {
    const bot = await TelegramBot.findById(req.params.id);
    bot.isActive = !bot.isActive;
    await bot.save();
    
    if (bot.isActive) {
      await telegramService.startBot(bot._id);
    } else {
      await telegramService.stopBot(bot._id);
    }
    
    return res.json(bot);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
