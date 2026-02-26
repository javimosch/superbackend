const { attachSuperDemosWebsocketServer } = require('./superDemosWs.service');
const { WebSocketServer } = require('ws');

jest.mock('ws');
jest.mock('./superDemosAuthoringSessions.service', () => ({
  validateToken: jest.fn(),
  getSession: jest.fn(),
  attachClient: jest.fn(),
  detachClient: jest.fn(),
}));

jest.mock('../models/SuperDemoProject', () => ({
  findOne: jest.fn(),
}));

const sessions = require('./superDemosAuthoringSessions.service');
const SuperDemoProject = require('../models/SuperDemoProject');

function createMockWs() {
  const handlers = {};
  return {
    OPEN: 1,
    readyState: 1,
    send: jest.fn(),
    close: jest.fn(),
    on: jest.fn((event, cb) => {
      handlers[event] = cb;
    }),
    _handlers: handlers,
  };
}

describe('superDemosWs.service', () => {
  let server;
  let mockWss;

  beforeEach(() => {
    jest.clearAllMocks();
    server = { on: jest.fn() };
    mockWss = {
      on: jest.fn(),
      handleUpgrade: jest.fn((req, socket, head, cb) => {
        cb(createMockWs());
      }),
      emit: jest.fn(),
    };
    WebSocketServer.mockImplementation(() => mockWss);
    sessions.validateToken.mockReturnValue(true);
    sessions.getSession.mockReturnValue({
      sessionId: 'sd_sess_1',
      projectId: null,
      expiresAtMs: Date.now() + 10000,
      adminWs: null,
      sdkWs: null,
    });
  });

  test('attaches upgrade listener and upgrades valid path', async () => {
    attachSuperDemosWebsocketServer(server);
    const upgradeHandler = server.on.mock.calls.find((c) => c[0] === 'upgrade')[1];

    const socket = { destroy: jest.fn() };
    await upgradeHandler({ url: '/api/superdemos/ws?sessionId=sd_sess_1&role=admin&token=t' }, socket, Buffer.alloc(0));

    expect(mockWss.handleUpgrade).toHaveBeenCalled();
    expect(socket.destroy).not.toHaveBeenCalled();
  });

  test('rejects upgrade when token is invalid', async () => {
    attachSuperDemosWebsocketServer(server);
    const upgradeHandler = server.on.mock.calls.find((c) => c[0] === 'upgrade')[1];
    sessions.validateToken.mockReturnValue(false);

    const socket = { destroy: jest.fn() };
    await upgradeHandler({ url: '/api/superdemos/ws?sessionId=sd_sess_1&role=sdk&token=bad' }, socket, Buffer.alloc(0));

    expect(socket.destroy).toHaveBeenCalled();
    expect(mockWss.handleUpgrade).not.toHaveBeenCalled();
  });

  test('relays valid JSON message from admin to sdk peer', () => {
    const adminWs = createMockWs();
    const sdkWs = createMockWs();
    const sessionState = {
      sessionId: 'sd_sess_1',
      projectId: null,
      expiresAtMs: Date.now() + 10000,
      adminWs,
      sdkWs,
    };

    attachSuperDemosWebsocketServer(server);
    const connectionHandler = mockWss.on.mock.calls.find((c) => c[0] === 'connection')[1];

    sessions.attachClient.mockReturnValue(sessionState);
    sessions.getSession.mockReturnValue(sessionState);

    connectionHandler(adminWs, {}, { query: { sessionId: 'sd_sess_1', role: 'admin', token: 't' } });
    expect(adminWs._handlers.message).toBeDefined();

    adminWs._handlers.message(JSON.stringify({ type: 'select', selector: '#id' }));

    expect(sdkWs.send).toHaveBeenCalledWith(expect.stringContaining('"type":"select"'));
  });

  test('enforces sdk origin allowlist when project has allowedOrigins', async () => {
    attachSuperDemosWebsocketServer(server);
    const upgradeHandler = server.on.mock.calls.find((c) => c[0] === 'upgrade')[1];

    sessions.getSession.mockReturnValue({
      sessionId: 'sd_sess_1',
      projectId: 'sdp_1',
      expiresAtMs: Date.now() + 10000,
      adminWs: null,
      sdkWs: null,
    });

    SuperDemoProject.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        projectId: 'sdp_1',
        isActive: true,
        allowedOrigins: ['https://allowed.example'],
      }),
    });

    const socket = { destroy: jest.fn() };
    await upgradeHandler(
      {
        url: '/api/superdemos/ws?sessionId=sd_sess_1&role=sdk&token=t',
        headers: { origin: 'https://blocked.example' },
      },
      socket,
      Buffer.alloc(0),
    );

    expect(socket.destroy).toHaveBeenCalled();
    expect(mockWss.handleUpgrade).not.toHaveBeenCalled();
  });
});
