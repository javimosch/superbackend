jest.mock('mongoose');
jest.mock('../models/AgentMessage');
jest.mock('../models/JsonConfig');
jest.mock('./jsonConfigs.service');

const agentHistoryService = require('./agentHistory.service');

describe('agentHistory.service', () => {
  describe('transformOpenAIToolCallsToSchema', () => {
    test('transforms OpenAI format to Schema format', () => {
      const openAIToolCalls = [
        {
          id: 'call_123',
          type: 'function',
          function: {
            name: 'get_weather',
            arguments: '{"location": "NYC"}'
          }
        }
      ];

      const result = agentHistoryService.transformOpenAIToolCallsToSchema(openAIToolCalls);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        name: 'get_weather',
        arguments: { location: 'NYC' },
        toolCallId: 'call_123'
      });
    });

    test('handles already Schema format', () => {
      const schemaToolCalls = [
        {
          name: 'get_weather',
          arguments: { location: 'NYC' },
          toolCallId: 'call_123'
        }
      ];

      const result = agentHistoryService.transformOpenAIToolCallsToSchema(schemaToolCalls);

      expect(result).toEqual(schemaToolCalls);
    });

    test('parses string arguments as JSON', () => {
      const toolCalls = [
        {
          id: 'call_456',
          function: {
            name: 'search',
            arguments: '{"query": "test", "limit": 5}'
          }
        }
      ];

      const result = agentHistoryService.transformOpenAIToolCallsToSchema(toolCalls);

      expect(result[0].arguments).toEqual({ query: 'test', limit: 5 });
    });

    test('keeps string arguments when parsing fails', () => {
      const toolCalls = [
        {
          id: 'call_789',
          function: {
            name: 'search',
            arguments: 'not valid json'
          }
        }
      ];

      const result = agentHistoryService.transformOpenAIToolCallsToSchema(toolCalls);

      expect(result[0].arguments).toBe('not valid json');
    });

    test('handles object arguments without parsing', () => {
      const toolCalls = [
        {
          id: 'call_abc',
          function: {
            name: 'search',
            arguments: { query: 'test' }
          }
        }
      ];

      const result = agentHistoryService.transformOpenAIToolCallsToSchema(toolCalls);

      expect(result[0].arguments).toEqual({ query: 'test' });
    });

    test('returns empty array for non-array input', () => {
      expect(agentHistoryService.transformOpenAIToolCallsToSchema(null)).toEqual([]);
      expect(agentHistoryService.transformOpenAIToolCallsToSchema(undefined)).toEqual([]);
      expect(agentHistoryService.transformOpenAIToolCallsToSchema('string')).toEqual([]);
      expect(agentHistoryService.transformOpenAIToolCallsToSchema({})).toEqual([]);
    });

    test('handles mixed format tool calls', () => {
      const toolCalls = [
        {
          id: 'call_1',
          function: { name: 'func1', arguments: '{}' }
        },
        {
          name: 'func2',
          arguments: {},
          toolCallId: 'call_2'
        }
      ];

      const result = agentHistoryService.transformOpenAIToolCallsToSchema(toolCalls);

      expect(result[0]).toEqual({
        name: 'func1',
        arguments: {},
        toolCallId: 'call_1'
      });
      expect(result[1]).toEqual(toolCalls[1]);
    });

    test('handles empty array', () => {
      const result = agentHistoryService.transformOpenAIToolCallsToSchema([]);
      expect(result).toEqual([]);
    });
  });

  describe('transformSchemaToolCallsToOpenAI', () => {
    test('transforms Schema format to OpenAI format', () => {
      const schemaToolCalls = [
        {
          name: 'get_weather',
          arguments: { location: 'NYC' },
          toolCallId: 'call_123'
        }
      ];

      const result = agentHistoryService.transformSchemaToolCallsToOpenAI(schemaToolCalls);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 'call_123',
        type: 'function',
        function: {
          name: 'get_weather',
          arguments: '{"location":"NYC"}'
        }
      });
    });

    test('handles already OpenAI format', () => {
      const openAIToolCalls = [
        {
          id: 'call_123',
          type: 'function',
          function: {
            name: 'get_weather',
            arguments: '{"location": "NYC"}'
          }
        }
      ];

      const result = agentHistoryService.transformSchemaToolCallsToOpenAI(openAIToolCalls);

      expect(result).toEqual(openAIToolCalls);
    });

    test('stringifies object arguments', () => {
      const toolCalls = [
        {
          name: 'search',
          arguments: { query: 'test', limit: 5 },
          toolCallId: 'call_456'
        }
      ];

      const result = agentHistoryService.transformSchemaToolCallsToOpenAI(toolCalls);

      expect(result[0].function.arguments).toBe('{"query":"test","limit":5}');
    });

    test('converts non-object arguments to string', () => {
      const toolCalls = [
        {
          name: 'echo',
          arguments: 'hello',
          toolCallId: 'call_789'
        }
      ];

      const result = agentHistoryService.transformSchemaToolCallsToOpenAI(toolCalls);

      expect(result[0].function.arguments).toBe('hello');
    });

    test('handles null arguments as "null"', () => {
      const toolCalls = [
        {
          name: 'echo',
          arguments: null,
          toolCallId: 'call_1'
        }
      ];

      const result = agentHistoryService.transformSchemaToolCallsToOpenAI(toolCalls);

      expect(result[0].function.arguments).toBe('null');
    });

    test('handles undefined arguments as empty string', () => {
      const toolCalls = [
        {
          name: 'echo',
          arguments: undefined,
          toolCallId: 'call_2'
        }
      ];

      const result = agentHistoryService.transformSchemaToolCallsToOpenAI(toolCalls);

      expect(result[0].function.arguments).toBe('');
    });

    test('returns undefined for empty array', () => {
      const result = agentHistoryService.transformSchemaToolCallsToOpenAI([]);
      expect(result).toBeUndefined();
    });

    test('returns undefined for non-array input', () => {
      expect(agentHistoryService.transformSchemaToolCallsToOpenAI(null)).toBeUndefined();
      expect(agentHistoryService.transformSchemaToolCallsToOpenAI(undefined)).toBeUndefined();
      expect(agentHistoryService.transformSchemaToolCallsToOpenAI('string')).toBeUndefined();
      expect(agentHistoryService.transformSchemaToolCallsToOpenAI({})).toBeUndefined();
    });

    test('handles mixed format tool calls', () => {
      const toolCalls = [
        {
          name: 'func1',
          arguments: {},
          toolCallId: 'call_1'
        },
        {
          id: 'call_2',
          type: 'function',
          function: { name: 'func2', arguments: '{}' }
        }
      ];

      const result = agentHistoryService.transformSchemaToolCallsToOpenAI(toolCalls);

      expect(result[0]).toEqual({
        id: 'call_1',
        type: 'function',
        function: { name: 'func1', arguments: '{}' }
      });
      expect(result[1]).toEqual(toolCalls[1]);
    });
  });

  describe('getHistoryJsonConfigKey (async)', () => {
    test('returns correct key format', async () => {
      const key = await agentHistoryService.getHistoryJsonConfigKey('agent123', 'chat456');
      expect(key).toBe('agent-history-agent123-chat456');
    });

    test('handles different agent and chat IDs', async () => {
      const key1 = await agentHistoryService.getHistoryJsonConfigKey('abc', 'def');
      const key2 = await agentHistoryService.getHistoryJsonConfigKey('xyz', '123');
      
      expect(key1).toBe('agent-history-abc-def');
      expect(key2).toBe('agent-history-xyz-123');
    });
  });
});
