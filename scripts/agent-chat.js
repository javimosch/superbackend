require('dotenv').config(process.env.MODE ? { path: `.env.${process.env.MODE}` } : {});
const { ScriptBase } = require('../src/helpers/scriptBase');
const readline = require('readline');
const agentService = require('../src/services/agent.service');
const llmService = require('../src/services/llm.service');
const Agent = require('../src/models/Agent');
const JsonConfig = require('../src/models/JsonConfig');

class AgentChatTUI extends ScriptBase {
  constructor() {
    super({
      name: 'AgentChatTUI',
      autoDisconnect: true,
      timeout: 3600000
    });
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  async question(query) {
    return new Promise((resolve) => this.rl.question(query, resolve));
  }

  async execute(context) {
    console.log('\n--- SuperBackend AI Agent TUI ---\n');

    const agents = await Agent.find().lean();
    if (agents.length === 0) {
      console.log('❌ No agents found. Please create an agent in the admin UI first.');
      return;
    }

    console.log('Available Agents:');
    agents.forEach((a, i) => {
      console.log(`${i + 1}. ${a.name} (${a.model})`);
    });
    console.log(`${agents.length + 1}. Exit`);

    const choice = await this.question('\nSelect an agent (number): ');
    const index = parseInt(choice, 10) - 1;

    if (isNaN(index) || index < 0 || index >= agents.length) {
      if (index === agents.length) {
          console.log('Goodbye!');
          return;
      }
      console.log('Invalid selection.');
      return;
    }

    const selectedAgent = agents[index];
    let chatId = `tui-${Date.now()}`;
    const senderId = 'cli-user';

      console.log(`\n--- Chatting with: ${selectedAgent.name} ---`);
      console.log(`(Commands: '/new' = new, '/sessions' = list, '/compact' = manual summary, '/rename [label]' = rename session, 'exit' = quit)\n`);

    while (true) {
      const input = await this.question(`[${chatId.slice(-8)}] You: `);
      
      const cmd = input.toLowerCase().trim();
      if (['exit', 'quit', '\\q'].includes(cmd)) {
        console.log('\nEnding session...');
        break;
      }

      if (cmd === '/compact') {
        process.stdout.write('✨ Compacting session... ');
        try {
          const result = await agentService.compactSession(selectedAgent._id, chatId);
          if (result.success) {
            console.log(`Done! Created snapshot: ${result.snapshotId}\n`);
          } else {
            console.log(`Failed: ${result.message}\n`);
          }
        } catch (err) {
          console.log(`Error: ${err.message}\n`);
        }
        continue;
      }

      if (cmd === '/new') {
        chatId = `tui-${Date.now()}`;
        console.log(`\n🆕 Started new session: ${chatId}\n`);
        continue;
      }

      if (cmd === '/sessions') {
        const sessionConfigs = await JsonConfig.find({
          alias: { $regex: /^agent-session-tui-/ }
        }).lean();

        console.log('\n--- Recent TUI Sessions ---');
        sessionConfigs.slice(-10).forEach((c, i) => {
          const data = JSON.parse(c.jsonRaw);
          const labelDisplay = data.label ? `[${data.label}] ` : '';
          console.log(`${i + 1}. ${labelDisplay}${data.id} (Tokens: ${data.totalTokens}, Last Snapshot: ${data.lastSnapshotId || 'None'})`);
        });
        
        const sessionChoice = await this.question('\nSelect a session number to switch (or Enter to cancel): ');
        if (sessionChoice.trim()) {
          const sIndex = parseInt(sessionChoice, 10) - 1;
          if (!isNaN(sIndex) && sIndex >= 0 && sIndex < sessionConfigs.length) {
            const selectedSession = JSON.parse(sessionConfigs[sIndex].jsonRaw);
            chatId = selectedSession.id;
            const labelDisplay = selectedSession.label ? ` (${selectedSession.label})` : '';
            console.log(`\n🔄 Switched to session: ${chatId}${labelDisplay}\n`);
          } else {
            console.log('Invalid selection.');
          }
        }
        continue;
      }

      if (cmd.startsWith('/rename')) {
        const newLabel = input.replace('/rename', '').trim();
        if (!newLabel) {
          console.log('❌ Please provide a label: /rename My Session Label\n');
          continue;
        }
        
        process.stdout.write('✨ Renaming session... ');
        try {
          const result = await agentService.renameSession(chatId, newLabel);
          if (result.success) {
            console.log(`Done! Session renamed to: ${result.label}\n`);
          } else {
            console.log(`Failed: ${result.message}\n`);
          }
        } catch (err) {
          console.log(`Error: ${err.message}\n`);
        }
        continue;
      }

      if (cmd === 'clear') {
        console.log('🧹 History cleared locally (starting new session ID)');
        chatId = `tui-${Date.now()}`;
        continue;
      }

      if (!input.trim()) continue;

      process.stdout.write(`${selectedAgent.name}: `);
      
      try {
        const response = await agentService.processMessage(selectedAgent._id, {
          content: input,
          senderId,
          chatId
        });
        
        const { text, usage, chatId: sessionChatId } = response;
        chatId = sessionChatId;
        console.log(text + '\n');

        if (usage) {
          const contextLength = await llmService.getModelContextLength(selectedAgent.model, selectedAgent.providerKey);
          const currentTokens = usage.total_tokens || (usage.prompt_tokens + usage.completion_tokens);
          const percentage = contextLength > 0 ? ((currentTokens / contextLength) * 100).toFixed(1) : 0;
          
          const formatNum = (num) => num >= 1000 ? (num / 1000).toFixed(1) + 'k' : num;
          
          process.stdout.write(`\x1b[90m[tokens: ${formatNum(currentTokens)}/${formatNum(contextLength)} (${percentage}%)]\x1b[0m\n\n`);
        }
      } catch (err) {
        console.log(`\n❌ Error: ${err.message}\n`);
      }
    }
  }

  async cleanup() {
    if (this.rl && !this.rl.closed) {
      this.rl.close();
    }
  }
}

const tui = new AgentChatTUI();
tui.run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
