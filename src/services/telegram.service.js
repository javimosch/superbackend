const TelegramBot = require('node-telegram-bot-api');
const TelegramBotModel = require('../models/TelegramBot');
const Agent = require('../models/Agent');
const agentService = require('./agent.service');

const activeBots = new Map();

/**
 * Start a telegram bot by its ID
 */
async function startBot(botId) {
  try {
    const botDoc = await TelegramBotModel.findById(botId);
    if (!botDoc) throw new Error('Bot not found');

    if (activeBots.has(botId.toString())) {
      await stopBot(botId);
    }

    const bot = new TelegramBot(botDoc.token, { polling: true });

    bot.on('message', async (msg) => {
      if (!msg.text) return;

      // Security: check if user is allowed
      if (botDoc.allowedUserIds && botDoc.allowedUserIds.length > 0) {
        if (!botDoc.allowedUserIds.includes(msg.from.id.toString())) {
          console.warn(`Unauthorized access attempt from ${msg.from.id} to bot ${botDoc.name}`);
          return;
        }
      }

      console.log(`[TelegramBot: ${botDoc.name}] Received: ${msg.text} from ${msg.from.id}`);

      // Delegate to agent service
      try {
        if (msg.text.toLowerCase() === '/start') {
          await bot.sendMessage(msg.chat.id, 'Hi there! I am your SuperBackend Agent. How can I help you today?');
          return;
        }

        if (!botDoc.defaultAgentId) {
            console.log(`[TelegramBot: ${botDoc.name}] No agent configured, ignoring message from ${msg.from.id}`);
            return;
        }

        const response = await agentService.processMessage(botDoc.defaultAgentId, {
            content: msg.text,
            senderId: msg.from.id.toString(),
            chatId: msg.chat.id.toString(),
            metadata: {
                firstName: msg.from.first_name,
                lastName: msg.from.last_name,
                username: msg.from.username
            }
        });
        
        await bot.sendMessage(msg.chat.id, response);
      } catch (err) {
        console.error('Error processing message:', err);
        await bot.sendMessage(msg.chat.id, 'Sorry, I encountered an error processing your request.');
      }
    });

    bot.on('polling_error', (err) => {
      console.error(`Telegram polling error [${botDoc.name}]:`, err);
    });

    activeBots.set(botId.toString(), bot);
    
    botDoc.status = 'running';
    botDoc.lastError = null;
    await botDoc.save();

    console.log(`Telegram bot [${botDoc.name}] started`);
    return true;
  } catch (err) {
    console.error(`Failed to start Telegram bot [${botId}]:`, err);
    const botDoc = await TelegramBotModel.findById(botId);
    if (botDoc) {
      botDoc.status = 'error';
      botDoc.lastError = err.message;
      await botDoc.save();
    }
    throw err;
  }
}

/**
 * Stop a telegram bot
 */
async function stopBot(botId) {
  const bot = activeBots.get(botId.toString());
  if (bot) {
    await bot.stopPolling();
    activeBots.delete(botId.toString());
  }

  const botDoc = await TelegramBotModel.findById(botId);
  if (botDoc) {
    botDoc.status = 'stopped';
    await botDoc.save();
  }

  console.log(`Telegram bot [${botId}] stopped`);
}

/**
 * Initialize all active bots on startup
 */
async function init() {
  try {
    const activeBotsDocs = await TelegramBotModel.find({ isActive: true });
    for (const botDoc of activeBotsDocs) {
      try {
        await startBot(botDoc._id);
      } catch (err) {
        // Continue with other bots
      }
    }
  } catch (err) {
    console.error('Failed to initialize Telegram bots:', err);
  }
}

module.exports = {
  startBot,
  stopBot,
  init
};
