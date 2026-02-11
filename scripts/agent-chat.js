require('dotenv').config(process.env.MODE ? { path: `.env.${process.env.MODE}` } : {});
const { ScriptBase } = require('../src/helpers/scriptBase');
const agentService = require('../src/services/agent.service');
const llmService = require('../src/services/llm.service');
const Agent = require('../src/models/Agent');
const JsonConfig = require('../src/models/JsonConfig');
const term = require('terminal-kit').terminal;

class AgentChatTUI extends ScriptBase {
  constructor() {
    super({
      name: 'AgentChatTUI',
      autoDisconnect: true,
      timeout: 3600000
    });
    this.chatId = `tui-${Date.now()}`;
    this.escCount = 0;
    this.escTimer = null;
    this.abortController = null;
    this.isProcessing = false;
  }

  getRelativeTime(date) {
    const now = new Date();
    const diff = now - new Date(date);
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return new Date(date).toLocaleDateString();
  }

  async execute(context) {
    term.clear();
    term.bold.cyan('--- SuperBackend AI Agent TUI ---\n\n');

    const agents = await Agent.find().lean();
    if (agents.length === 0) {
      term.red('❌ No agents found. Please create an agent in the admin UI first.\n');
      return;
    }

    term.white('Available Agents:\n');
    agents.forEach((a, i) => {
      term.white(`${i + 1}. `).cyan(`${a.name} `).gray(`(${a.model})\n`);
    });
    term.white(`${agents.length + 1}. `).red('Exit\n');

    term.white('\nSelect an agent (number): ');
    const choice = await term.inputField().promise;
    const index = parseInt(choice, 10) - 1;

    if (isNaN(index) || index < 0 || index >= agents.length) {
      if (index === agents.length) {
        term.green('\nGoodbye!\n');
        return;
      }
      term.red('\nInvalid selection.\n');
      return;
    }

    const selectedAgent = agents[index];
    this.selectedAgent = selectedAgent;
    const senderId = 'cli-user';

    term.clear();
    term.bold.cyan(`\n--- Chatting with: ${selectedAgent.name} ---\n`);
    term.gray(`(Commands: '/new', '/sessions', '/compact', '/rename [label]', 'exit')\n\n`);

    term.on('key', (name) => {
      if (name === 'ESCAPE') {
        if (!this.isProcessing) return;
        
        this.escCount++;
        if (this.escCount === 1) {
          term.saveCursor();
          term.moveTo(1, term.height);
          term.bgRed.white(' Press ESC again to stop operation ');
          term.restoreCursor();
          
          this.escTimer = setTimeout(() => {
            this.escCount = 0;
            term.saveCursor();
            term.moveTo(1, term.height);
            term.eraseLine();
            term.restoreCursor();
          }, 2000);
        } else if (this.escCount >= 2) {
          if (this.abortController) {
            this.abortController.abort();
            term.saveCursor();
            term.moveTo(1, term.height);
            term.eraseLine();
            term.bgYellow.black(' 🛑 Aborting... ');
            setTimeout(() => {
                term.moveTo(1, term.height);
                term.eraseLine();
                term.restoreCursor();
            }, 1000);
          }
          this.escCount = 0;
          if (this.escTimer) clearTimeout(this.escTimer);
        }
      } else if (name === 'CTRL_C') {
        term.grabInput(false);
        process.exit();
      }
    });

    term.grabInput(true);

    while (true) {
      term.white(`[${this.chatId.slice(-8)}] You: `);
      const input = await term.inputField().promise;
      term('\n');
      
      const cmd = input.toLowerCase().trim();
      if (['exit', 'quit', '\\q'].includes(cmd)) {
        term.green('\nEnding session...\n');
        break;
      }

      if (cmd === '/compact') {
        term.yellow('✨ Compacting session... ');
        try {
          const result = await agentService.compactSession(selectedAgent._id, this.chatId);
          if (result.success) {
            term.green(`Done! Created snapshot: ${result.snapshotId}\n\n`);
          } else {
            term.red(`Failed: ${result.message}\n\n`);
          }
        } catch (err) {
          term.red(`Error: ${err.message}\n\n`);
        }
        continue;
      }

      if (cmd === '/new') {
        this.chatId = `tui-${Date.now()}`;
        term.bold.green(`\n🆕 Started new session: ${this.chatId}\n\n`);
        continue;
      }

      if (cmd === '/sessions') {
        const sessionConfigs = await JsonConfig.find({
          alias: { $regex: /^agent-session-tui-/ }
        })
        .sort({ updatedAt: -1 })
        .limit(10)
        .lean();

        term.bold.white('\n--- Recent TUI Sessions ---\n');
        if (sessionConfigs.length === 0) {
          term.gray('No recent sessions found.\n');
        } else {
          sessionConfigs.forEach((c, i) => {
            const data = JSON.parse(c.jsonRaw);
            const labelDisplay = data.label ? `^c[${data.label}] ` : '';
            const timeAgo = this.getRelativeTime(c.updatedAt);
            term.white(`${i + 1}. `).cyan(`${labelDisplay}`).bold(`${data.id} `).gray(`(${timeAgo})\n`);
            term.gray(`   Tokens: ${data.totalTokens || 0} | Snapshot: ${data.lastSnapshotId || 'None'}\n`);
          });
        }
        
        term.white('\nSelect session number (or Enter to cancel): ');
        const sessionChoice = await term.inputField().promise;
        if (sessionChoice.trim()) {
          const sIndex = parseInt(sessionChoice, 10) - 1;
          if (!isNaN(sIndex) && sIndex >= 0 && sIndex < sessionConfigs.length) {
            const selectedSession = JSON.parse(sessionConfigs[sIndex].jsonRaw);
            this.chatId = selectedSession.id;
            const labelDisplay = selectedSession.label ? ` (${selectedSession.label})` : '';
            term.bold.green(`\n🔄 Switched to session: ${this.chatId}${labelDisplay}\n\n`);
          } else {
            term.red('\nInvalid selection.\n');
          }
        } else {
            term('\n');
        }
        continue;
      }

      if (cmd.startsWith('/rename')) {
        const newLabel = input.replace('/rename', '').trim();
        if (!newLabel) {
          term.red('❌ Please provide a label: /rename My Session Label\n\n');
          continue;
        }
        
        term.yellow('✨ Renaming session... ');
        try {
          const result = await agentService.renameSession(this.chatId, newLabel);
          if (result.success) {
            term.green(`Done! Session renamed to: ${result.label}\n\n`);
          } else {
            term.red(`Failed: ${result.message}\n\n`);
          }
        } catch (err) {
          term.red(`Error: ${err.message}\n\n`);
        }
        continue;
      }

      if (!input.trim()) continue;

      term.bold.cyan(`${selectedAgent.name}: `);
      
      this.isProcessing = true;
      this.abortController = new AbortController();
      
      try {
        const response = await agentService.processMessage(selectedAgent._id, {
          content: input,
          senderId,
          chatId: this.chatId
        }, {
          abortSignal: this.abortController.signal
        });
        
        const { text, usage, chatId: sessionChatId } = response;
        this.chatId = sessionChatId;
        term.white(text + '\n');

        if (usage) {
          const contextLength = await llmService.getModelContextLength(selectedAgent.model, selectedAgent.providerKey);
          const currentTokens = usage.total_tokens || (usage.prompt_tokens + usage.completion_tokens);
          const percentage = contextLength > 0 ? ((currentTokens / contextLength) * 100).toFixed(1) : 0;
          const formatNum = (num) => num >= 1000 ? (num / 1000).toFixed(1) + 'k' : num;
          term.gray(`[tokens: ${formatNum(currentTokens)}/${formatNum(contextLength)} (${percentage}%)]\n\n`);
        }
      } catch (err) {
        if (err.message === 'Operation aborted' || err.message.includes('aborted')) {
          term.yellow('\n⚠️ Operation cancelled by user.\n\n');
        } else {
          term.red(`\n❌ Error: ${err.message}\n\n`);
        }
      } finally {
        this.isProcessing = false;
        this.abortController = null;
        this.escCount = 0;
      }
    }
  }

  async cleanup() {
    term.grabInput(false);
    await new Promise(r => setTimeout(r, 100));
  }
}

const tui = new AgentChatTUI();
tui.run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
