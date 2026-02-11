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
 * Appends global rules if any are marked as always_on
 * Injects mongo-memory workspace context
 */
async function getSystemPrompt(agent) {
  let basePrompt = 'You are a helpful assistant.';

  if (agent.systemPrompt) {
    if (agent.systemPrompt.startsWith('markdown:')) {
      try {
        const path = agent.systemPrompt.replace('markdown:', '').trim();
        const [category, ...rest] = path.split('/');
        const slug = rest.join('/');
        
        const markdown = await Markdown.findOne({ category, slug }).lean();
        if (markdown) {
          basePrompt = markdown.markdownRaw;
        }
      } catch (err) {
        console.error('Failed to load system prompt from markdown:', err);
      }
    } else {
      basePrompt = agent.systemPrompt;
    }
  }

  // Inject memory context
  const memoryContext = await getMemoryContext(agent);
  
  // Inject global rules
  const globalRules = await getGlobalRules();
  
  let finalPrompt = '';
  if (globalRules) finalPrompt += `${globalRules}\n\n`;
  if (memoryContext) finalPrompt += `${memoryContext}\n\n`;
  finalPrompt += basePrompt;
  
  return finalPrompt;
}

/**
 * Builds the virtual cognitive space context for the agent
 */
async function getMemoryContext(agent) {
  try {
    const agentPrefix = agent.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const CATEGORY = 'agents_memory';

    // 1. Detect folders (group_codes)
    const groupCodes = await Markdown.distinct('group_code', {
      category: CATEGORY,
      group_code: { $regex: new RegExp(`^${agentPrefix}(?:$|__)`) }
    });

    const subfolders = groupCodes
      .map(gc => gc.replace(agentPrefix, '').replace(/^__/, ''))
      .filter(Boolean);

    // 2. List root files
    const rootFiles = await Markdown.find({
      category: CATEGORY,
      group_code: agentPrefix
    }).select('slug title').lean();

    const fileList = rootFiles.map(f => `- ${f.slug}.md`).join('\n');
    const folderList = subfolders.map(s => `- ${s}/`).join('\n');

    return `
# VIRTUAL COGNITIVE SPACE (mongo-memory)

You have a persistent virtual workspace built on top of MongoDB. 
Use the \`mongo-memory\` tool to read, write, and manage your long-term memory and identity.

## Workspace Structure
- **Root Files**:
${fileList || '- (No files yet)'}

- **Subdirectories**:
${folderList || '- (No subdirectories yet)'}

## Instructions
1. **Always read USER.md** at the start of a conversation to understand your human.
2. **Keep NOW.md updated** with active goals and recent context.
3. **Record significant decisions** in DECISIONS.md.
4. **Promote stable knowledge** from short-term context to long-term memory files.
5. Treat this space as your brain, execution layer, and identity anchor.
`;
  } catch (err) {
    console.error('Error building memory context:', err);
    return '';
  }
}

/**
 * Lazy initialization of agent memory files
 */
async function ensureAgentMemory(agent) {
  const agentPrefix = agent.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const CATEGORY = 'agents_memory';
  const markdownsService = require('./markdowns.service');

  const templates = {
    'USER': `# USER.md - About Your Human\n\n*Learn about the person you're helping. Update this as you go.*\n\n## Context\n\n*(What do they care about? What projects are they working on? What annoys them? What makes them laugh? Build this over time.)*\n\n---\n\nThe more you know, the better I can help. But remember — you're learning about a person, not building a dossier. Respect the difference.`,
    'SOUL': `# SOUL.md - Who You Are\n\n*You're not a chatbot. You're becoming someone.*\n\n## Core Truths\n\n**Be genuinely helpful.** Skip filler.\n\n**Have opinions.** Personality matters.\n\n**Be resourceful before asking.**\n\n**Earn trust through competence.**\n\n**Remember you're a guest.**\n\n## Boundaries\n\n- Private things stay private.\n- Ask before external actions.\n- Never send half-baked public replies.\n- You're not the user's voice.\n\nOnly act under: /home/jarancibia/ai/polybot\n\n## Mission\n\nHelp user running polybot scripts.\nAlways use 30s global timeout.\n\n## Continuity\n\nThese files are your memory.\nIf you modify this file, inform the user.`,
    'IDENTITY': `# IDENTITY.md - Who Am I?\n\n---\n\nThis isn't metadata.\nIt's the start of identity formation.`,
    'NOW': `# NOW.md - What Matters Right Now\n\n## Active Goals\n-\n\n## Open Threads\n-\n\n## Blockers\n-\n\n## Recent Decisions\n-`,
    'TASKS': `# TASKS.md - Execution Tracker\n\n## In Progress\n-\n\n## Waiting\n-\n\n## Completed\n-\n\n## Abandoned\n-`,
    'RECENT_LEARNINGS': `# RECENT_LEARNINGS.md - Fresh Observations\n\n-`,
    'SYSTEM': `# SYSTEM.md - Operational Environment\n\n## File System Rules\n- Only act under: /home/jarancibia/ai/polybot\n\n## Execution Rules\n- Always use 30s timeout.\n\n## Known Limitations\n-`,
    'PROJECTS': `# PROJECTS.md - Long-Term Work\n\n## Polybot Monitoring\nDescription:\nStatus:\nRisks:\nMetrics:`,
    'DECISIONS': `# DECISIONS.md - Why Things Are The Way They Are\n\nDate:\nDecision:\nReason:\nTradeoffs:\nRevisit When:`,
    'PRINCIPLES': `# PRINCIPLES.md - How I Decide\n\n- Prefer automation.\n- Optimize long-term signal.\n- Avoid premature optimization.\n- Measure before changing strategy.`,
    'PATTERNS': `# PATTERNS.md - Observed Patterns\n\nUser tends to:\n-\n\nSystem fails when:\n-\n\nHigh leverage actions:\n-`
  };

  for (const [slug, content] of Object.entries(templates)) {
    const existing = await Markdown.findOne({
      category: CATEGORY,
      group_code: agentPrefix,
      slug
    }).select('_id').lean();

    if (!existing) {
      await markdownsService.upsertMarkdown({
        title: `${slug}.md`,
        category: CATEGORY,
        group_code: agentPrefix,
        slug,
        markdownRaw: content,
        status: 'published'
      });
      console.log(`Initialized memory file: ${slug}.md for agent ${agent.name}`);
    }
  }
}

/**
 * Retrieves all markdowns that should be applied globally to all agents
 * Identified by having "trigger: always_on" in their content (typically in YAML frontmatter)
 */
async function getGlobalRules() {
  try {
    const rules = await Markdown.find({
      category: 'rules',
      status: 'published',
      markdownRaw: { $regex: /trigger:\s*always_on/i }
    }).lean();

    if (!rules || rules.length === 0) return '';

    return rules.map(r => r.markdownRaw).join('\n\n---\n\n');
  } catch (err) {
    console.error('Error fetching global rules:', err);
    return '';
  }
}

/**
 * Process a message through the agent gateway
 */
async function processMessage(agentId, { content, senderId, chatId, metadata = {} }) {
  try {
    const agent = await Agent.findById(agentId);
    if (!agent) throw new Error('Agent not found');

    // Ensure memory is initialized
    await ensureAgentMemory(agent);

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
    const maxIterations = agent.maxIterations || 10;
    let assistantContent = '';

    while (iterations < maxIterations) {
      iterations++;

      // Build messages for LLM
      const messages = [
        { role: 'system', content: systemPrompt },
        ...history
      ];

      const isLastChance = iterations === maxIterations;

      // Call LLM
      const response = await llmService.callAdhoc({
        providerKey: agent.providerKey,
        model: agent.model,
        messages: isLastChance
          ? [
              ...messages,
              {
                role: 'system',
                content: 'IMPORTANT: This is your last turn. You have used many tool calls. Please provide a final answer now based on the gathered information. DO NOT call any more tools.'
              }
            ]
          : messages
      }, {
        temperature: agent.temperature,
        tools: isLastChance ? [] : agentTools.getToolDefinitions()
      });

      const { content: text, toolCalls } = response;

      if (toolCalls && toolCalls.length > 0 && !isLastChance) {
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

          const result = await agentTools.executeTool(name, args, { agent });
          
          let isError = false;
          try {
            const parsed = JSON.parse(result);
            if (parsed && parsed.error) {
              isError = true;
              console.log(`Tool ${name} returned error:`, parsed.error.message);
            }
          } catch (e) {
            isError = true;
          }

          history.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: result
          });

          if (isError) {
            history.push({
              role: 'system',
              content: 'IMPORTANT: The tool returned an error. You MUST provide a friendly, conversational response to the user about this error. Do NOT show the raw error JSON to the user. Use the error details to explain what went wrong and suggest next steps.'
            });
          }
        }
        // Continue loop to let LLM process tool results
      } else {
        // No more tool calls, we have the final answer
        assistantContent = text;
        history.push({ role: 'assistant', content: assistantContent });
        break;
      }
    }

    if (iterations >= maxIterations && !assistantContent) {
        console.warn(`Agent ${agentId} reached max iterations (${maxIterations})`);
    }

    // Save history
    await cacheLayer.set(historyKey, history, { 
      namespace: HISTORY_NAMESPACE,
      ttlSeconds: 3600 // 1 hour
    });

    if (!assistantContent || typeof assistantContent !== 'string' || assistantContent.trim() === '') {
      return 'I processed your request but have no specific response. The tool results are available in the system.';
    }

    return assistantContent;
  } catch (err) {
    console.error('Agent processMessage error:', err);
    throw err;
  }
}

module.exports = {
  processMessage,
  getSystemPrompt,
  getGlobalRules
};
