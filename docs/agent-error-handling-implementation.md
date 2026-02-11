# Agent Error Handling Implementation

## Overview

This document describes the implementation of friendly error handling for AI agents in the saas-backend system, following the principles from `AGENTS_FRIENDLY_TOOLS.md`.

## Problem Statement

Previously, tool errors returned simple strings like:
- `"Error executing command: ${err.message}"`
- `"Error executing query: ${err.message}"`

This caused agents to show raw error messages to users, which is neither friendly nor helpful.

## Solution

Implemented structured error responses that:
1. Provide machine-readable error information for agent decision-making
2. Ensure the LLM provides friendly, conversational responses to users
3. Follow semantic error codes based on Square's system
4. Include suggestions for recovery

## Implementation Details

### 1. Structured Error Response Format

All tool errors now return JSON with this structure:

```json
{
  "error": {
    "code": 105,
    "type": "connection_timeout",
    "message": "Failed to connect to database",
    "recoverable": true,
    "retry_after": 2,
    "suggestions": [
      "Check database connection is active",
      "Ensure MongoDB server is running"
    ],
    "context": {},
    "_raw": "Error stack trace (dev only)"
  }
}
```

### 2. Semantic Error Codes

Based on Square's system:

- **80-89**: User errors (invalid arguments, bad permissions)
- **90-99**: Resource errors (not found, already exists, conflicts)
- **100-109**: Integration errors (API down, timeouts, auth failed)
- **110-119**: Internal software errors (bugs, panics)

### 3. Modified Files

#### `src/services/agentTools.service.js`
- Added `createErrorResponse()` helper function
- Added `ERROR_CODES` constant object
- Updated all tool implementations to return structured errors
- Added context-specific suggestions for different error types
- Updated `executeTool()` to handle tool not found errors

#### `src/services/agent.service.js`
- Added error detection logic for tool results
- Added system message to guide LLM when errors occur
- Enhanced error handling in the message processing loop

#### `src/models/Agent.js`
- Updated default system prompt with error handling instructions
- Added explicit instructions for friendly error responses
- Added guidance on using error suggestions

### 4. Error Handling Flow

1. **Tool execution fails** → Tool returns structured JSON error
2. **Agent service detects error** → Adds system message to conversation history
3. **LLM processes conversation** → Sees error structure + system message
4. **LLM generates response** → Provides friendly, conversational response using error details
5. **User receives response** → Gets helpful explanation without raw error JSON

### 5. Example Error Responses

#### Before (Raw error shown to user):
```
Error executing command: command not found
```

#### After (Friendly response):
```
I had trouble executing that shell command. It seems the command wasn't found in the system. This could happen if:
- The command isn't installed
- It's not in your system's PATH

Let me try a different approach or you might want to check if the command is available.
```

## Test Implementation

Created `test-agent-error-handling.js` to verify:
1. Tool not found errors return structured JSON
2. Shell command errors include recovery suggestions
3. Database query errors provide helpful context
4. Valid tool execution still works correctly

## Key Principles Applied

1. **Structured Error Responses**: Tools return JSON with error codes, types, and suggestions
2. **Friendly User Messages**: LLM must translate structured errors into conversational responses
3. **Actionable Suggestions**: Each error includes specific steps the agent can take
4. **No Raw JSON Display**: Agents must never show raw error JSON to users
5. **Semantic Error Codes**: Use meaningful codes for programmatic decision-making

## Usage Example

```javascript
// Tool execution returns structured error
const result = await agentTools.executeTool('query_database', {
  modelName: 'NonExistentModel',
  query: { test: true }
});

// Result is JSON with error structure
// Agent service detects error and adds system message
// LLM generates friendly response:
// "I couldn't find the 'NonExistentModel' in the database. 
//  Let me try to list available models first to help you."
```

## Benefits

1. **Better User Experience**: Users get helpful explanations instead of cryptic errors
2. **Agent Intelligence**: Agents can make better decisions based on error codes
3. **Debugging**: Developers get structured error information for troubleshooting
4. **Consistency**: All tools follow the same error handling pattern
5. **Recoverability**: Agents can suggest and attempt alternative approaches

## Future Enhancements

1. Add error metrics tracking (error rates, common failures)
2. Implement error recovery strategies in agent logic
3. Add error categorization for analytics
4. Create error handling templates for new tools
5. Add error rate limiting per tool/user

## References

- `AGENTS_FRIENDLY_TOOLS.md`: Design principles for agent-friendly tools
- Square Engineering: "Command Line Observability with Semantic Exit Codes"
- InfoQ: "Patterns for AI Agent Driven CLIs" (August 2025)