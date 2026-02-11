const llmService = require('./llm.service');
const cacheLayer = require('./cacheLayer.service');
const agentTools = require('./agentTools.service');
const Agent = require('../models/Agent');
const Markdown = require('../models/Markdown');

const HISTORY_NAMESPACE = 'agent:history';
const MAX_HISTORY = 20;

/**
 * Get the system prompt for an agent
 * Supports direct string or reference to a markdown document (markdown:category/slug)
 */
async function getSystemPrompt(agent) {
  if (!agent.systemPrompt) return 'You are a helpful assistant.';
  
  if (agent.systemPrompt.startsWith('markdown:')) {
    try {
      const path = agent.systemPrompt.replace('markdown:', '').trim();
      const [category, ...rest] = path.split('/');
      const slug = rest.join('/');
      
      const markdown = await Markdown.findOne({ category, slug }).lean();
      if (markdown) return markdown.markdownRaw;
    } catch (err) {
      console.error('Failed to load system prompt from markdown:', err);
    }
  }
  
  return agent.systemPrompt;
}

/**
 * Process a message through the agent gateway
 */
async function processMessage(agentId, { content, senderId, chatId, metadata = {} }) {
  try {
    const agent = await Agent.findById(agentId);
    if (!agent) throw new Error('Agent not found');

    const systemPrompt = await getSystemPrompt(agent);

    // Load history
    const historyKey = `${agentId}:${chatId}`;
    let history = await cacheLayer.get(historyKey, { namespace: HISTORY_NAMESPACE }) || [];

    // Add user message
    history.push({ role: 'user', content });

    // Trim history
    if (history.length > MAX_HISTORY) {
      history = history.slice(-MAX_HISTORY);
    }

    let iterations = 0;
    const maxIterations = 5;
    let assistantContent = '';

    while (iterations < maxIterations) {
      iterations++;

      // Build messages for LLM
      const messages = [
        { role: 'system', content: systemPrompt },
        ...history
      ];

      // Call LLM
      const response = await llmService.callAdhoc({
        providerKey: agent.providerKey,
        model: agent.model,
        messages
      }, {
        temperature: agent.temperature,
        tools: agentTools.getToolDefinitions()
      });

      const { content: text, toolCalls } = response;

      if (toolCalls && toolCalls.length > 0) {
        // Add assistant tool call to history
        history.push({ 
          role: 'assistant', 
          content: text || null,
          tool_calls: toolCalls 
        });

        // Execute tools
        for (const toolCall of toolCalls) {
          const { name, arguments: argsString } = toolCall.function;
          let args = {};
          try {
            args = JSON.parse(argsString);
          } catch (e) {
            console.error('Failed to parse tool arguments:', argsString);
          }

          const result = await agentTools.executeTool(name, args);

          // Add tool result to history
          history.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: result
          });
        }
        // Continue loop to let LLM process tool results
      } else {
        // No more tool calls, we have the final answer
        assistantContent = text;
        history.push({ role: 'assistant', content: assistantContent });
        break;
      }
    }

    // Save history
    await cacheLayer.set(historyKey, history, { 
      namespace: HISTORY_NAMESPACE,
      ttlSeconds: 3600 // 1 hour
    });

    return assistantContent;
  } catch (err) {
    console.error('Agent processMessage error:', err);
    throw err;
  }
}

module.exports = {
  processMessage
};
