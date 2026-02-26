jest.mock('../services/uiComponentsCrypto.service', () => ({
  generateProjectApiKeyPlaintext: jest.fn(() => 'plain_project_key'),
  hashKey: jest.fn((v) => `hash:${v}`),
  verifyKey: jest.fn((plain, hash) => hash === `hash:${plain}`),
}));

const mockState = {
  projects: [],
  demos: [],
  stepsByDemoId: new Map(),
};

const mockChain = (items) => ({
  sort: jest.fn().mockReturnValue({
    lean: jest.fn().mockResolvedValue(items),
  }),
  lean: jest.fn().mockResolvedValue(items),
});

jest.mock('../models/SuperDemoProject', () => ({
  create: jest.fn(async (doc) => {
    const stored = { ...doc };
    mockState.projects.push(stored);
    return {
      ...stored,
      save: jest.fn(async function save() {
        const i = mockState.projects.findIndex((p) => p.projectId === this.projectId);
        if (i >= 0) mockState.projects[i] = { ...mockState.projects[i], ...this };
      }),
      toObject: jest.fn(function toObject() { return { ...this }; }),
    };
  }),
  findOne: jest.fn((query) => {
    const found = mockState.projects.find((p) => Object.keys(query).every((k) => p[k] === query[k])) || null;
    if (!found) return { lean: jest.fn().mockResolvedValue(null) };
    return {
      ...found,
      save: jest.fn(async function save() {
        const i = mockState.projects.findIndex((p) => p.projectId === this.projectId);
        if (i >= 0) mockState.projects[i] = { ...mockState.projects[i], ...this };
      }),
      toObject: jest.fn(function toObject() { return { ...this }; }),
      lean: jest.fn().mockResolvedValue(found),
    };
  }),
}));

jest.mock('../models/SuperDemo', () => ({
  create: jest.fn(async (doc) => {
    const stored = { ...doc };
    mockState.demos.push(stored);
    return {
      ...stored,
      save: jest.fn(async function save() {
        const i = mockState.demos.findIndex((d) => d.demoId === this.demoId);
        if (i >= 0) mockState.demos[i] = { ...mockState.demos[i], ...this };
      }),
      toObject: jest.fn(function toObject() { return { ...this }; }),
    };
  }),
  findOne: jest.fn((query) => {
    const found = mockState.demos.find((d) => Object.keys(query).every((k) => d[k] === query[k])) || null;
    if (!found) return { lean: jest.fn().mockResolvedValue(null) };
    return {
      ...found,
      save: jest.fn(async function save() {
        const i = mockState.demos.findIndex((d) => d.demoId === this.demoId);
        if (i >= 0) mockState.demos[i] = { ...mockState.demos[i], ...this };
      }),
      toObject: jest.fn(function toObject() { return { ...this }; }),
      lean: jest.fn().mockResolvedValue(found),
    };
  }),
  find: jest.fn((query) => {
    const rows = mockState.demos.filter((d) => Object.keys(query).every((k) => d[k] === query[k]));
    return mockChain(rows);
  }),
}));

jest.mock('../models/SuperDemoStep', () => ({
  deleteMany: jest.fn(async ({ demoId }) => {
    mockState.stepsByDemoId.set(demoId, []);
  }),
  insertMany: jest.fn(async (docs) => {
    const demoId = docs[0]?.demoId;
    if (demoId) mockState.stepsByDemoId.set(demoId, docs.map((d) => ({ ...d })));
    return docs;
  }),
  find: jest.fn((query) => mockChain([...(mockState.stepsByDemoId.get(query.demoId) || [])])),
}));

const adminController = require('./adminSuperDemos.controller');
const publicController = require('./superDemosPublic.controller');

const resFactory = () => ({
  _status: 200,
  _json: null,
  status(code) { this._status = code; return this; },
  json(payload) { this._json = payload; return this; },
});

describe('SuperDemos flow smoke', () => {
  beforeEach(() => {
    mockState.projects = [];
    mockState.demos = [];
    mockState.stepsByDemoId = new Map();
  });

  test('create private project -> demo -> steps -> publish -> public definition', async () => {
    const pRes = resFactory();
    await adminController.createProject({ body: { name: 'P', isPublic: false, projectId: 'sdp_flow1234' } }, pRes);
    expect(pRes._status).toBe(201);
    expect(pRes._json.apiKey).toBe('plain_project_key');

    const dRes = resFactory();
    await adminController.createDemo({ params: { projectId: 'sdp_flow1234' }, body: { name: 'D' } }, dRes);
    expect(dRes._status).toBe(201);
    const demoId = dRes._json.item.demoId;

    const sRes = resFactory();
    await adminController.replaceSteps({
      params: { demoId },
      body: { steps: [{ selector: '#hero', message: 'hello' }, { selector: '#cta', message: 'go' }] },
    }, sRes);
    expect(sRes._status).toBe(200);
    expect(sRes._json.items).toHaveLength(2);

    const pubRes = resFactory();
    await adminController.publishDemo({ params: { demoId } }, pubRes);
    expect(pubRes._status).toBe(200);
    expect(pubRes._json.item.status).toBe('published');

    const defRes = resFactory();
    await publicController.getPublishedDemoDefinition({ params: { demoId }, headers: { 'x-project-key': 'plain_project_key' } }, defRes);
    expect(defRes._status).toBe(200);
    expect(defRes._json.demo.demoId).toBe(demoId);
    expect(defRes._json.steps).toHaveLength(2);
  });
});
