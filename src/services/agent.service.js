const crypto = require('crypto');
const jsonConfigsService = require('./jsonConfigs.service');
const llmService = require('./llm.service');
const agentTools = require('./agentTools.service');
const Agent = require('../models/Agent');
const Markdown = require('../models/Markdown');
const agentHistoryService = require('./agentHistory.service');
const MAX_HISTORY = 20;
const COMPACTION_THRESHOLD = 0.5;

async function getOrCreateSession(agentId, chatId) {
  const slug = `agent-session-${chatId}`;
  try {
    return await jsonConfigsService.getJsonConfig(slug);
  } catch (err) {
    if (err.code === 'NOT_FOUND') {
      const sessionData = {
        id: chatId,
        agentId,
        status: 'active',
        lastSnapshotId: null,
        totalTokens: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await jsonConfigsService.createJsonConfig({
        title: `Agent Session: ${chatId}`,
        alias: slug,
        jsonRaw: JSON.stringify(sessionData)
      });
      return sessionData;
    }
    throw err;
  }
}

async function updateSessionMetadata(chatId, patch) {
  const slug = `agent-session-${chatId}`;
  const config = await Markdown.model('JsonConfig').findOne({ 
    $or: [{ slug }, { alias: slug }] 
  });
  
  if (!config) return;
  const current = JSON.parse(config.jsonRaw);
  const updated = { ...current, ...patch, updatedAt: new Date().toISOString() };
  await jsonConfigsService.updateJsonConfig(config._id, {
    jsonRaw: JSON.stringify(updated)
  });
  return updated;
}

async function generateSnapshot(agent, chatId, history) {
  const sessionUuid = chatId;
  const timestamp = new Date().toISOString();
  const CATEGORY = 'agents_memory';
  const agentPrefix = agent.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const snapshotGroupCode = `${agentPrefix}__snapshots__${sessionUuid}`;
  const markdownsService = require('./markdowns.service');
  const systemPrompt = `You are a memory compaction system. 
Analyze the following conversation history and extract a structured snapshot.
Return ONLY a markdown document in this exact format:

# SNAPSHOT - ${timestamp}
Session: ${sessionUuid}
Active Goals:
- (list current active goals)

Current Tasks:
- (list current tasks from history)

Decisions:
- (list significant decisions made)

Observations / Learnings:
- (list new patterns or facts learned about the user/system)

Constraints:
- (list any new constraints identified)`;

  const response = await llmService.callAdhoc({
    providerKey: agent.providerKey,
    model: agent.model,
    messages: [
      { role: 'system', content: systemPrompt },
      ...history
    ]
  });

  const snapshotContent = response.content;
  const slug = `snapshot-${Date.now()}`;

  await markdownsService.upsertMarkdown({
    title: `Snapshot ${timestamp}`,
    category: CATEGORY,
    group_code: snapshotGroupCode,
    slug,
    markdownRaw: snapshotContent,
    status: 'published'
  });

  const indexSlug = 'index';
  const indexGroupCode = `${agentPrefix}__snapshots`;
  const existingIndex = await Markdown.findOne({
    category: CATEGORY,
    group_code: indexGroupCode,
    slug: indexSlug
  }).lean();

  const indexEntry = `- [${timestamp}] Snapshot: ${slug} (Session: ${sessionUuid})`;
  const newIndexContent = existingIndex 
    ? `${existingIndex.markdownRaw}\n${indexEntry}`
    : `# Session Snapshots Index\n\n${indexEntry}`;

  await markdownsService.upsertMarkdown({
    title: 'Snapshots Index',
    category: CATEGORY,
    group_code: indexGroupCode,
    slug: indexSlug,
    markdownRaw: newIndexContent,
    status: 'published'
  });

  return { slug, content: snapshotContent };
}

async function getSystemPrompt(agent, chatId) {
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

  const memoryContext = await getMemoryContext(agent, chatId);
  const globalRules = await getGlobalRules();
  
  let finalPrompt = '';
  if (globalRules) finalPrompt += `${globalRules}\n\n`;
  if (memoryContext) finalPrompt += `${memoryContext}\n\n`;
  finalPrompt += basePrompt;
  
  return finalPrompt;
}

async function getMemoryContext(agent, chatId) {
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

    // 3. Load latest session snapshot if exists
    let sessionSnapshotInfo = '';
    if (chatId) {
        const snapshotGroupCode = `${agentPrefix}__snapshots__${chatId}`;
        const latestSnapshot = await Markdown.findOne({
            category: CATEGORY,
            group_code: snapshotGroupCode
        }).sort({ createdAt: -1 }).lean();

        if (latestSnapshot) {
            sessionSnapshotInfo = `
## Current Session Snapshot
You are continuing a session. Here is the latest state summary:
\`\`\`md
${latestSnapshot.markdownRaw}
\`\`\`
`;
        }
    }

    return `
# VIRTUAL COGNITIVE SPACE (mongo-memory)

You have a persistent virtual workspace built on top of MongoDB. 
Use the \`mongo-memory\` tool to read, write, and manage your long-term memory and identity.

## Shared Workspace Structure
- **Root Files**:
${fileList || '- (No files yet)'}

- **Subdirectories**:
${folderList || '- (No subdirectories yet)'}
${sessionSnapshotInfo}
## Instructions
1. **Always read USER.md** at the start of a conversation to understand your human.
2. **Keep NOW.md updated** with active goals and recent context.
3. **Record significant decisions** in DECISIONS.md.
4. **Promote stable knowledge** from short-term context to long-term memory files.
5. Treat this space as your brain, execution layer, and identity anchor.
6. **Context Management**: If your conversation gets too long, you might be compacted. Refer to the "Current Session Snapshot" to maintain continuity.
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
    'TASKS': `# TASKS.md - Execution Tracker\n\n## Task List\nUse this format for all tasks:\n\n- [ ] [PRIORITY:HIGH] Task description here\n- [ ] [PRIORITY:MEDIUM] Another task with medium priority\n- [ ] [PRIORITY:LOW] Low priority task\n- [X] [PRIORITY:HIGH] Completed task with priority\n\n## Instructions\n1. **Mark tasks with checkboxes**: Use \`- [ ]\` for incomplete, \`- [X]\` for completed\n2. **Add priority tags**: Always include \`[PRIORITY:HIGH]\`, \`[PRIORITY:MEDIUM]\`, or \`[PRIORITY:LOW]\`\n3. **Use single list**: Keep all tasks in one list, don't split by status\n4. **Update immediately**: Mark tasks as done when completed\n5. **Add new tasks**: When starting work, add a new checkbox with appropriate priority\n\n## Example\n- [ ] [PRIORITY:HIGH] Fix authentication bug in user service\n- [ ] [PRIORITY:MEDIUM] Add unit tests for new feature\n- [X] [PRIORITY:HIGH] Review pull request #42\n- [ ] [PRIORITY:LOW] Update documentation for legacy endpoint\n\n## Priority Guidelines\n- **HIGH**: Blocks other work, critical bugs, production issues\n- **MEDIUM**: Important features, improvements, non-critical bugs\n- **LOW**: Nice-to-have, technical debt, future improvements`,
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

async function renameSession(chatId, newLabel) {
  if (!newLabel || !newLabel.trim()) return { success: false, message: 'Label cannot be empty' };
  
  const slug = `agent-session-${chatId}`;
  const config = await Markdown.model('JsonConfig').findOne({ $or: [{ slug }, { alias: slug }] });
  
  if (!config) return { success: false, message: 'Session not found' };
  
  const current = JSON.parse(config.jsonRaw);
  current.label = newLabel.trim();
  
  await jsonConfigsService.updateJsonConfig(config._id, { jsonRaw: JSON.stringify(current) });
  
  return { success: true, label: newLabel.trim() };
}

async function compactSession(agentId, chatId) {
  const agent = await Agent.findById(agentId);
  if (!agent) throw new Error('Agent not found');

  const historyKey = `${agentId}:${chatId}`;
  let history = await agentHistoryService.getHistory(agentId, chatId, MAX_HISTORY);

  const sessionMetadata = await getOrCreateSession(agentId, chatId);
  
  if (history.length === 0) {
    const agentPrefix = agent.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const snapshotGroupCode = `${agentPrefix}__snapshots__${chatId}`;
    const existingSnapshot = await Markdown.findOne({
      category: 'agents_memory',
      group_code: snapshotGroupCode
    }).sort({ createdAt: -1 }).lean();

    if (existingSnapshot) {
      console.log(`[agent.service] Manual compaction triggered for session ${chatId} (using existing snapshot)`);
      history = [{ role: 'system', content: existingSnapshot.markdownRaw }];
    } else if (sessionMetadata.lastSnapshotId) {
      return { success: false, message: 'This session was previously compacted. No additional history to compact.' };
    } else if (sessionMetadata.totalTokens > 0) {
      return { success: false, message: 'Session history has expired from cache. Use /new to start a fresh session.' };
    } else {
      return { success: false, message: 'History is empty and no existing snapshot found for this session' };
    }
  } else {
    console.log(`[agent.service] Manual compaction triggered for session ${chatId}`);
  }

  const snapshot = await generateSnapshot(agent, chatId, history);
  
  await updateSessionMetadata(chatId, { 
    lastSnapshotId: snapshot.slug,
    totalTokens: 0
  });

  history = [{
    role: 'assistant',
    content: `Conversation summary at T=${new Date().toISOString()}`
  }];

    await agentHistoryService.deleteHistory(agentId, chatId);
    await agentHistoryService.appendMessages(agentId, chatId, history);

  return { success: true, snapshotId: snapshot.slug };
}

/**
 * Process a message through the agent gateway
 */
async function processMessage(agentId, { content, senderId, chatId: inputChatId, metadata = {} }, options = {}) {
  try {
    const { abortSignal } = options;
    const agent = await Agent.findById(agentId);
    if (!agent) throw new Error('Agent not found');

    const chatId = inputChatId || crypto.randomUUID();
    
    await ensureAgentMemory(agent);
    await getOrCreateSession(agentId, chatId);

    const contextLength = await llmService.getModelContextLength(agent.model, agent.providerKey);
    const systemPrompt = await getSystemPrompt(agent, chatId);

    const historyKey = `${agentId}:${chatId}`;
    let history = await agentHistoryService.getHistory(agentId, chatId, MAX_HISTORY);
    const newMessages = [];

    const userMsg = { role: 'user', content };
    history.push(userMsg);
    newMessages.push(userMsg);

    if (history.length > MAX_HISTORY) {
      history = history.slice(-MAX_HISTORY);
    }

    let iterations = 0;
    const maxIterations = agent.maxIterations || 10;
    let assistantContent = '';
    let lastUsage = null;

    while (iterations < maxIterations) {
      if (abortSignal && abortSignal.aborted) {
        throw new Error('Operation aborted');
      }
      iterations++;

      const messages = [
        { role: 'system', content: systemPrompt },
        ...history
      ];

      const isLastChance = iterations === maxIterations;

      const tools = isLastChance ? [] : agentTools.getToolDefinitions();
      
      let runtimeOptions = {
        temperature: agent.temperature,
        tools
      };

      const response = await llmService.callAdhoc({
        providerKey: agent.providerKey,
        model: agent.model,
        messages: isLastChance
          ? [
              ...messages,
              {
                role: 'system',
                content: 'IMPORTANT: This is your last turn. Provide a final answer now. DO NOT call any more tools.'
              }
            ]
          : messages
      }, runtimeOptions);

      const { content: text, toolCalls, usage } = response;
      if (usage) lastUsage = usage;

      if (toolCalls && toolCalls.length > 0 && !isLastChance) {
        const assistantMsg = { 
          role: 'assistant', 
          content: text || null,
          tool_calls: toolCalls
        };
        history.push(assistantMsg);
        newMessages.push(assistantMsg);

        for (const toolCall of toolCalls) {
          if (abortSignal && abortSignal.aborted) {
            throw new Error('Operation aborted during tool execution');
          }
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
            if (parsed && parsed.error) isError = true;
          } catch (e) {
            isError = true;
          }

          const toolMsg = {
            role: 'tool',
            tool_call_id: toolCall.id,
            content: result
          };
          history.push(toolMsg);
          newMessages.push(toolMsg);

          if (isError) {
            const sysMsg = {
              role: 'system',
              content: 'IMPORTANT: The tool returned an error. Provide a friendly conversational response about this error.'
            };
            history.push(sysMsg);
            newMessages.push(sysMsg);
          }
        }
      } else {
        assistantContent = text;
        const finalMsg = { role: 'assistant', content: assistantContent };
        history.push(finalMsg);
        newMessages.push(finalMsg);
        break;
      }
    }

    if (lastUsage) {
      const currentTokens = lastUsage.total_tokens || (lastUsage.prompt_tokens + lastUsage.completion_tokens);
      await updateSessionMetadata(chatId, { totalTokens: currentTokens });

      if (currentTokens / contextLength > COMPACTION_THRESHOLD) {
        await compactSession(agentId, chatId);
      }
    }

  await agentHistoryService.appendMessages(agentId, chatId, newMessages);

    const finalResponse = {
      text: assistantContent || 'I processed your request but have no specific response.',
      usage: lastUsage,
      chatId
    };

    return finalResponse;
  } catch (err) {
    if (err.message !== 'Operation aborted' && !err.message.includes('aborted')) {
      console.error('Agent processMessage error:', err);
    }
    throw err;
  }
}

module.exports = {
  processMessage,
  getSystemPrompt,
  getGlobalRules,
  compactSession,
  renameSession
};
