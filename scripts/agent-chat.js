require('dotenv').config(process.env.MODE ? { path: `.env.${process.env.MODE}` } : {});
process.env.TUI_MODE = 'true';
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
          this.drawStatusBar(' Press ESC again to stop operation ', 'bgRed');
          
          this.escTimer = setTimeout(() => {
            this.escCount = 0;
            this.drawStatusBar();
          }, 2000);
        } else if (this.escCount >= 2) {
          if (this.abortController) {
            this.abortController.abort();
            this.drawStatusBar(' 🛑 Aborting... ', 'bgYellow', 'black');
            setTimeout(() => this.drawStatusBar(), 1000);
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
    this.drawStatusBar();

    while (true) {
      term.bold.cyan(`\n[${this.chatId.slice(-8)}] You: `);
      const input = await term.inputField().promise;
      term('\n');
      
      const cmd = input.toLowerCase().trim();
      if (['exit', 'quit', '\\q'].includes(cmd)) {
        term.bold.green('\n👋 Ending session...\n');
        break;
      }

      if (cmd === '/compact') {
        term.bold.yellow('✨ Compacting session... ');
        try {
          const result = await agentService.compactSession(selectedAgent._id, this.chatId);
          if (result.success) {
            term.bold.green(`Done! Created snapshot: ${result.snapshotId}\n`);
          } else {
            term.bold.red(`Failed: ${result.message}\n`);
          }
        } catch (err) {
          term.bold.red(`Error: ${err.message}\n`);
        }
        continue;
      }

      if (cmd === '/new') {
        this.chatId = `tui-${Date.now()}`;
        this.drawStatusBar();
        term.bold.green(`\n🆕 Started new session: ${this.chatId}\n`);
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
        
        term.bold.white('\nSelect session number (or Enter to cancel): ');
        const sessionChoice = await term.inputField().promise;
        if (sessionChoice.trim()) {
          const sIndex = parseInt(sessionChoice, 10) - 1;
          if (!isNaN(sIndex) && sIndex >= 0 && sIndex < sessionConfigs.length) {
            const selectedSession = JSON.parse(sessionConfigs[sIndex].jsonRaw);
            this.chatId = selectedSession.id;
            this.drawStatusBar();
            const labelDisplay = selectedSession.label ? ` (${selectedSession.label})` : '';
            term.bold.green(`\n🔄 Switched to session: ${this.chatId}${labelDisplay}\n`);
          } else {
            term.bold.red('\nInvalid selection.\n');
          }
        } else {
            term('\n');
        }
        continue;
      }

      if (cmd.startsWith('/rename')) {
        const newLabel = input.replace('/rename', '').trim();
        if (!newLabel) {
          term.bold.red('❌ Please provide a label: /rename My Session Label\n');
          continue;
        }
        
        term.bold.yellow('✨ Renaming session... ');
        try {
          const result = await agentService.renameSession(this.chatId, newLabel);
          if (result.success) {
            term.bold.green(`Done! Session renamed to: ${result.label}\n`);
          } else {
            term.bold.red(`Failed: ${result.message}\n`);
          }
        } catch (err) {
          term.bold.red(`Error: ${err.message}\n`);
        }
        continue;
      }

      if (!input.trim()) continue;

      term.bold.magenta(`${selectedAgent.name}: `);
      const thinkingSpinner = await term.spinner('dots');
      
      this.isProcessing = true;
      this.abortController = new AbortController();
      
      try {
        const response = await agentService.processMessage(selectedAgent._id, {
          content: input,
          senderId,
          chatId: this.chatId
        }, {
          abortSignal: this.abortController.signal,
          onProgress: (p) => {
            term.saveCursor();
            term.column(1).eraseLine();
            term.bold.magenta(`${selectedAgent.name}: `);
            
            if (p.status === 'initializing') {
                term.gray(p.message);
            } else if (p.status === 'thinking') {
                term.bold.magenta(`loop ${p.iteration}/${p.maxIterations}...`);
            } else if (p.status === 'executing_tools') {
                term.bold.yellow(`preparing tools...`);
            } else if (p.status === 'executing_tool') {
                term.bold.yellow(`executing ${p.tool}...`);
            } else {
                term.bold.magenta('thinking...');
            }
            term.restoreCursor();
          }
        });
        
        const { text, usage, chatId: sessionChatId } = response;
        this.chatId = sessionChatId;
        
        if (thinkingSpinner) thinkingSpinner.animate(false);
        
        if (this.abortController.signal.aborted) {
            throw new Error('Operation aborted');
        }

        await new Promise(r => setTimeout(r, 400));
        
        term.column(1).eraseLine();
        term.bold.magenta(`${selectedAgent.name}: `).white(text + '\n');

        if (usage) {
          const contextLength = await llmService.getModelContextLength(selectedAgent.model, selectedAgent.providerKey);
          const currentTokens = usage.total_tokens || (usage.prompt_tokens + usage.completion_tokens);
          this.drawStatusBar(null, null, null, { tokens: currentTokens, max: contextLength });
        }
      } catch (err) {
        if (thinkingSpinner) thinkingSpinner.animate(false);
        term.column(1).eraseLine();
        if (err.message === 'Operation aborted' || err.message.includes('aborted')) {
          term.bold.yellow('⚠️ Operation cancelled by user.\n');
        } else {
          term.bold.red(`❌ Error: ${err.message}\n`);
        }
      } finally {
        this.isProcessing = false;
        this.abortController = null;
        this.escCount = 0;
      }
    }
  }

  drawStatusBar(message = null, bgColor = 'bgBlue', textColor = 'white', meta = {}) {
    term.saveCursor();
    term.moveTo(1, term.height);
    term.eraseLine();
    
    if (message) {
      term[bgColor][textColor](` ${message} `);
    } else {
      const id = this.chatId.slice(-8);
      const agent = this.selectedAgent ? this.selectedAgent.name : 'No Agent';
      const model = this.selectedAgent ? this.selectedAgent.model : 'No Model';
      
      term.bgCyan.black(` 🆔 ${id} `);
      term.bgBlue.white(` 🤖 ${agent} `);
      term.bgBlack.gray(` 🧠 ${model} `);
      
      if (meta.tokens) {
        const formatNum = (num) => num >= 1000 ? (num / 1000).toFixed(1) + 'k' : num;
        const formattedTokens = formatNum(meta.tokens);
        const formattedMax = formatNum(meta.max);
        const perc = meta.max > 0 ? ((meta.tokens / meta.max) * 100).toFixed(1) : 0;
        const color = perc > 80 ? 'bgRed' : perc > 50 ? 'bgYellow' : 'bgGreen';
        term[color].black(` 📊 ${formattedTokens}/${formattedMax} (${perc}%) `);
      }
    }
    
    term.restoreCursor();
  }

  async cleanup() {
    term.grabInput(false);
    term.moveTo(1, term.height).eraseLine();
    await new Promise(r => setTimeout(r, 100));
  }
}

const tui = new AgentChatTUI();
tui.run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
