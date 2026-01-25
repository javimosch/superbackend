const { attachTerminalWebsocketServer } = require('./terminalsWs.service');
const { WebSocketServer } = require('ws');
const terminalsService = require('./terminals.service');
const url = require('url');

jest.mock('ws');
jest.mock('./terminals.service');

describe('terminalsWs.service', () => {
  let mockServer;
  let mockWss;
  let mockWs;
  
  beforeEach(() => {
    jest.clearAllMocks();
    mockServer = {
      on: jest.fn()
    };
    mockWs = {
      send: jest.fn(),
      on: jest.fn(),
      close: jest.fn()
    };
    mockWss = {
      on: jest.fn(),
      handleUpgrade: jest.fn((req, socket, head, cb) => cb(mockWs)),
      emit: jest.fn()
    };
    WebSocketServer.mockImplementation(() => mockWss);
  });

  describe('attachTerminalWebsocketServer', () => {
    test('attaches upgrade listener to server', () => {
      const result = attachTerminalWebsocketServer(mockServer);
      expect(mockServer.on).toHaveBeenCalledWith('upgrade', expect.any(Function));
      expect(result.wss).toBe(mockWss);
      expect(result.wsPath).toBe('/api/admin/terminals/ws');
    });

    test('handles websocket connection and creates session if needed', () => {
      attachTerminalWebsocketServer(mockServer);
      const connectionHandler = mockWss.on.mock.calls.find(call => call[0] === 'connection')[1];
      
      terminalsService.createSession.mockReturnValue({ sessionId: 'new-session' });
      terminalsService.getSession.mockReturnValue({ 
        sessionId: 'new-session', 
        status: 'running',
        pty: { onData: jest.fn(), offData: jest.fn() }
      });

      connectionHandler(mockWs, {}, { query: {} });

      expect(terminalsService.createSession).toHaveBeenCalled();
      expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('new-session'));
    });

    test('processes messages from websocket', () => {
      attachTerminalWebsocketServer(mockServer);
      const connectionHandler = mockWss.on.mock.calls.find(call => call[0] === 'connection')[1];
      
      const mockPty = { onData: jest.fn(), offData: jest.fn() };
      terminalsService.getSession.mockReturnValue({ 
        sessionId: 's1', 
        status: 'running',
        pty: mockPty
      });

      connectionHandler(mockWs, {}, { query: { sessionId: 's1' } });
      
      const messageHandler = mockWs.on.mock.calls.find(call => call[0] === 'message')[1];
      
      // Test input message
      messageHandler(JSON.stringify({ type: 'input', data: 'ls\n' }));
      expect(terminalsService.writeSession).toHaveBeenCalledWith('s1', 'ls\n');
      expect(terminalsService.touch).toHaveBeenCalledWith('s1');

      // Test resize message
      messageHandler(JSON.stringify({ type: 'resize', cols: 100, rows: 40 }));
      expect(terminalsService.resizeSession).toHaveBeenCalledWith('s1', 100, 40);
    });
  });
});
