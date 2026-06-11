jest.mock('ws', () => {
  const mockWss = {
    handleUpgrade: jest.fn(),
    emit: jest.fn(),
    on: jest.fn(),
  };
  const WebSocketServer = jest.fn(() => mockWss);
  return { WebSocketServer };
});

const http = require('http');
const experimentsWsService = require('./experimentsWs.service');

function makeMockWs() {
  return {
    readyState: 1,
    OPEN: 1,
    send: jest.fn(),
    on: jest.fn(),
    _sbExperimentSubs: new Set(),
  };
}

describe('experimentsWs.service', () => {
  describe('broadcastWinnerChanged', () => {
    it('should not throw when no subscribers exist', () => {
      expect(() => {
        experimentsWsService.broadcastWinnerChanged({
          experimentCode: 'exp1',
          winnerVariantKey: 'variant-a',
          decidedAt: '2024-01-01T00:00:00Z',
        });
      }).not.toThrow();
    });

    it('should not throw with empty experiment code', () => {
      expect(() => {
        experimentsWsService.broadcastWinnerChanged({
          experimentCode: '',
          winnerVariantKey: null,
          decidedAt: null,
        });
      }).not.toThrow();
    });

    it('should not throw with null experiment code', () => {
      expect(() => {
        experimentsWsService.broadcastWinnerChanged({
          experimentCode: null,
          winnerVariantKey: 'variant-b',
          decidedAt: new Date().toISOString(),
        });
      }).not.toThrow();
    });

    it('should send message to open WebSocket connections', () => {
      const server = http.createServer();
      const { wss } = experimentsWsService.attachExperimentsWebsocketServer(server);

      const connectionHandler = wss.on.mock.calls.find((c) => c[0] === 'connection')[1];
      const mockWs = makeMockWs();
      connectionHandler(mockWs, {}, { query: {} });

      const messageHandler = mockWs.on.mock.calls.find((c) => c[0] === 'message')[1];
      messageHandler(JSON.stringify({ type: 'subscribe', experimentCode: 'exp-test' }));

      experimentsWsService.broadcastWinnerChanged({
        experimentCode: 'exp-test',
        winnerVariantKey: 'winner-a',
        decidedAt: '2024-01-01T00:00:00Z',
      });

      expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify({
        type: 'winner',
        experimentCode: 'exp-test',
        winnerVariantKey: 'winner-a',
        decidedAt: '2024-01-01T00:00:00.000Z',
      }));
    });
  });

  describe('attachExperimentsWebsocketServer', () => {
    it('should return wss and wsPath', () => {
      const server = http.createServer();
      const result = experimentsWsService.attachExperimentsWebsocketServer(server);
      expect(result).toHaveProperty('wss');
      expect(result).toHaveProperty('wsPath', '/api/experiments/ws');
    });

    it('should register upgrade handler on the server', () => {
      const server = http.createServer();
      jest.spyOn(server, 'on');
      experimentsWsService.attachExperimentsWebsocketServer(server);
      expect(server.on).toHaveBeenCalledWith('upgrade', expect.any(Function));
    });

    it('should skip upgrade when pathname does not match wsPath', () => {
      const server = http.createServer();
      const { wss } = experimentsWsService.attachExperimentsWebsocketServer(server);

      const upgradeHandler = server.listeners('upgrade')[0];
      const req = { url: '/api/other' };
      upgradeHandler(req, {}, Buffer.alloc(0));
      expect(wss.handleUpgrade).not.toHaveBeenCalled();
    });

    it('should handle upgrade when pathname matches wsPath', () => {
      const server = http.createServer();
      const { wss } = experimentsWsService.attachExperimentsWebsocketServer(server);

      const upgradeHandler = server.listeners('upgrade')[0];
      const req = { url: '/api/experiments/ws' };
      upgradeHandler(req, {}, Buffer.alloc(0));

      expect(wss.handleUpgrade).toHaveBeenCalled();
    });

    it('should send hello on connection', () => {
      const server = http.createServer();
      const { wss } = experimentsWsService.attachExperimentsWebsocketServer(server);

      const connectionHandler = wss.on.mock.calls.find((c) => c[0] === 'connection')[1];
      const mockWs = makeMockWs();
      connectionHandler(mockWs, {}, { query: {} });

      expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify({ type: 'hello' }));
    });

    it('should handle subscribe message and respond with subscribed', () => {
      const server = http.createServer();
      const { wss } = experimentsWsService.attachExperimentsWebsocketServer(server);

      const connectionHandler = wss.on.mock.calls.find((c) => c[0] === 'connection')[1];
      const mockWs = makeMockWs();
      connectionHandler(mockWs, {}, { query: {} });

      const messageHandler = mockWs.on.mock.calls.find((c) => c[0] === 'message')[1];
      messageHandler(JSON.stringify({ type: 'subscribe', experimentCode: 'exp-1' }));

      expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify({
        type: 'subscribed',
        experimentCode: 'exp-1',
      }));
    });

    it('should handle subscribe without experiment code', () => {
      const server = http.createServer();
      const { wss } = experimentsWsService.attachExperimentsWebsocketServer(server);

      const connectionHandler = wss.on.mock.calls.find((c) => c[0] === 'connection')[1];
      const mockWs = makeMockWs();
      connectionHandler(mockWs, {}, { query: {} });

      const sendCountBefore = mockWs.send.mock.calls.length;
      const messageHandler = mockWs.on.mock.calls.find((c) => c[0] === 'message')[1];

      messageHandler(JSON.stringify({ type: 'subscribe', experimentCode: '' }));
      expect(mockWs.send.mock.calls.length).toBe(sendCountBefore);
    });

    it('should handle unsubscribe message and respond with unsubscribed', () => {
      const server = http.createServer();
      const { wss } = experimentsWsService.attachExperimentsWebsocketServer(server);

      const connectionHandler = wss.on.mock.calls.find((c) => c[0] === 'connection')[1];
      const mockWs = makeMockWs();
      connectionHandler(mockWs, {}, { query: {} });

      const messageHandler = mockWs.on.mock.calls.find((c) => c[0] === 'message')[1];
      messageHandler(JSON.stringify({ type: 'subscribe', experimentCode: 'exp-1' }));
      messageHandler(JSON.stringify({ type: 'unsubscribe', experimentCode: 'exp-1' }));

      expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify({
        type: 'unsubscribed',
        experimentCode: 'exp-1',
      }));
    });

    it('should auto-subscribe when experimentCode is in query params', () => {
      const server = http.createServer();
      const { wss } = experimentsWsService.attachExperimentsWebsocketServer(server);

      const connectionHandler = wss.on.mock.calls.find((c) => c[0] === 'connection')[1];
      const mockWs = makeMockWs();
      connectionHandler(mockWs, {}, { query: { experimentCode: 'auto-exp' } });

      expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify({ type: 'hello' }));
      expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify({
        type: 'subscribed',
        experimentCode: 'auto-exp',
      }));
    });

    it('should handle close event and clean up subscriptions', () => {
      const server = http.createServer();
      const { wss } = experimentsWsService.attachExperimentsWebsocketServer(server);

      const connectionHandler = wss.on.mock.calls.find((c) => c[0] === 'connection')[1];
      const mockWs = makeMockWs();
      connectionHandler(mockWs, {}, { query: {} });

      const messageHandler = mockWs.on.mock.calls.find((c) => c[0] === 'message')[1];
      messageHandler(JSON.stringify({ type: 'subscribe', experimentCode: 'exp-cleanup' }));

      const closeHandler = mockWs.on.mock.calls.find((c) => c[0] === 'close')[1];
      closeHandler();

      expect(() => {
        experimentsWsService.broadcastWinnerChanged({
          experimentCode: 'exp-cleanup',
          winnerVariantKey: null,
          decidedAt: null,
        });
      }).not.toThrow();
    });

    it('should handle invalid JSON in message handler', () => {
      const server = http.createServer();
      const { wss } = experimentsWsService.attachExperimentsWebsocketServer(server);

      const connectionHandler = wss.on.mock.calls.find((c) => c[0] === 'connection')[1];
      const mockWs = makeMockWs();
      connectionHandler(mockWs, {}, { query: {} });

      const messageHandler = mockWs.on.mock.calls.find((c) => c[0] === 'message')[1];

      expect(() => {
        messageHandler(null);
        messageHandler(undefined);
        messageHandler('not json');
        messageHandler('{broken');
      }).not.toThrow();
    });
  });
});
