#!/usr/bin/env node

require('dotenv').config(process.env.MODE ? { path: `.env.${process.env.MODE}` } : {});
const Agent = require('../models/Agent');

async function listAgents() {
  try {
    const agents = await Agent.find().lean();
    
    if (agents.length === 0) {
      console.log('❌ No agents found. Please create an agent in the admin UI first.');
      return;
    }

    console.log('\n🤖 Available Agents:\n');
    agents.forEach((agent, index) => {
      console.log(`${index + 1}. ${agent.name} (${agent.model})`);
      if (agent.systemPrompt) {
        const prompt = agent.systemPrompt.substring(0, 100);
        console.log(`   "${prompt}${agent.systemPrompt.length > 100 ? '...' : ''}"`);
      }
      if (agent.tools && agent.tools.length > 0) {
        console.log(`   Tools: ${agent.tools.join(', ')}`);
      }
      console.log('');
    });
    
    console.log(`Total: ${agents.length} agent(s)`);
    console.log('\n💡 To start chatting: npx @intranefr/superbackend agent-chat');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Handle direct execution
if (require.main === module) {
  listAgents();
}

module.exports = { listAgents };
