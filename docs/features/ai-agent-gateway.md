# AI Agent Gateway & Telegram System

The AI Agent Gateway is a high-level orchestration layer that allows you to create, manage, and deploy intelligent agents across different channels, starting with Telegram. It leverages the existing LLM service, Cache Layer, and Markdown system to provide a robust, stateful, and tool-enabled AI experience.

## Overview

The system consists of three main components:
1.  **AI Agents:** Personality and capability definitions for LLM-powered entities.
2.  **Telegram System:** A multi-bot management service that connects Telegram users to specific AI Agents.
3.  **Agent Tools:** A registry of executable functions that agents can use to interact with the SuperBackend environment (e.g., querying the database).

## Core Concepts

### AI Agents
An Agent is defined by:
*   **System Prompt:** Instructions that define the agent's behavior. This can be a direct string or a reference to a Markdown document using `markdown:category/slug`.
*   **LLM Configuration:** Choice of provider (OpenRouter, OpenAI, etc.) and model.
*   **Tools:** A list of enabled capabilities (e.g., `query_database`).
*   **Memory:** Automatic conversation history management using the `CacheLayer` (1 hour TTL by default).

### Telegram Integration
The Telegram system allows you to run multiple bots simultaneously:
*   **Lifecycle Management:** Bots can be started, stopped, and monitored directly from the Admin UI.
*   **Security:** Access can be restricted to a specific list of Telegram User IDs.
*   **Agent Assignment:** Each bot is linked to a default AI Agent that handles its messages.

### Tool-Enabled Reasoning
Agents can perform multi-step reasoning by calling tools. The gateway handles the execution loop:
1.  LLM requests a tool call (e.g., `query_database`).
2.  The system executes the tool and retrieves the result.
3.  The result is fed back to the LLM to generate the final response.

## Built-in Tools

| Tool Name | Description |
| :--- | :--- |
| `query_database` | Executes a dynamic Mongoose query on any system model (User, Markdown, etc.). |
| `get_system_stats` | Returns document counts for all models in the database. |

## Configuration

### 1. Create an Agent
Navigate to **Automation > AI Agents** in the Admin Dashboard.
*   Define the name and system instructions.
*   Select your LLM provider and model (ensure the provider is configured in the LLM/AI settings).
*   Enable the desired tools.

### 2. Configure a Telegram Bot
Navigate to **Automation > Telegram Bots**.
*   Obtain a token from [@BotFather](https://t.me/botfather).
*   Add the bot to SuperBackend and assign it your Agent.
*   Toggle the bot to **Active**.

## Technical Architecture

*   **Service Layer:** `agent.service.js` (orchestration), `telegram.service.js` (polling & messaging), `agentTools.service.js` (execution).
*   **Persistence:** `Agent` and `TelegramBot` Mongoose models.
*   **State:** `CacheLayer` stores conversation history with the namespace `agent:history`.
*   **Dependencies:** `node-telegram-bot-api`.

## Best Practices
*   **Markdown Prompts:** Use the Markdown system to manage complex system prompts. This allows you to use the "Zen Mode" editor and maintain versioned/organized instructions for your agents.
*   **Security:** Always populate `allowedUserIds` for bots that have access to sensitive tools like `query_database`.
*   **Monitoring:** Check the `AuditEvent` logs (Action: `llm.completion`) to monitor agent interactions and costs.
