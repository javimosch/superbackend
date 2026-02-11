require('dotenv').config(process.env.MODE ? { path: `.env.${process.env.MODE}` } : {});
const { ScriptBase } = require('../src/helpers/scriptBase');
const readline = require('readline');
const agentService = require('../src/services/agent.service');
const Agent = require('../src/models/Agent');

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
    const chatId = `tui-${Date.now()}`;
    const senderId = 'cli-user';

    console.log(`\n--- Chatting with: ${selectedAgent.name} ---`);
    console.log(`(Type 'exit' or 'quit' to stop, 'clear' to reset history)\n`);

    while (true) {
      const input = await this.question('You: ');
      
      if (['exit', 'quit', '\\q'].includes(input.toLowerCase().trim())) {
        console.log('\nEnding session...');
        break;
      }

      if (input.toLowerCase().trim() === 'clear') {
        console.log('🧹 History cleared locally (using new session ID)');
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
        
        console.log(response + '\n');
      } catch (err) {
        console.log(`\n❌ Error: ${err.message}\n`);
      }
    }
  }

  async cleanup() {
    this.rl.close();
  }
}

const tui = new AgentChatTUI();
tui.run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
