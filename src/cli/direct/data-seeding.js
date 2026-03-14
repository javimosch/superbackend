#!/usr/bin/env node

/**
 * Data seeding and import/export utilities
 */

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const seedUsers = {
  async execute(options) {
    const User = mongoose.model('User');
    const count = parseInt(options.value) || 10;
    const role = options.description || 'user';

    const users = [];
    for (let i = 0; i < count; i++) {
      users.push({
        email: `testuser${i}@example.com`,
        password: 'password123',
        role,
        name: `Test User ${i}`,
      });
    }

    await User.insertMany(users);
    return { seeded: count, role, message: `${count} users created with password "password123"` };
  },
};

const seedSettings = {
  async execute(options) {
    const GlobalSetting = mongoose.model('GlobalSetting');

    const settings = [
      { key: 'SITE_NAME', value: 'My Site', description: 'Site name' },
      { key: 'SITE_DESCRIPTION', value: 'A sample site', description: 'Site description' },
      { key: 'CONTACT_EMAIL', value: 'contact@example.com', description: 'Contact email' },
      { key: 'MAX_UPLOAD_SIZE', value: 10485760, description: 'Max upload size in bytes' },
      { key: 'ALLOWED_DOMAINS', value: ['localhost', 'example.com'], description: 'Allowed domains' },
    ];

    let created = 0;
    for (const setting of settings) {
      const existing = await GlobalSetting.findOne({ key: setting.key });
      if (!existing) {
        await GlobalSetting.create(setting);
        created++;
      }
    }

    return { seeded: created, total: settings.length, message: `${created} settings created` };
  },
};

const seedAgents = {
  async execute(options) {
    const Agent = mongoose.model('Agent');

    const agents = [
      { name: 'General Assistant', model: 'gpt-4o-mini', systemPrompt: 'You are a helpful assistant.', tools: [] },
      { name: 'Code Helper', model: 'gpt-4o', systemPrompt: 'You are a coding assistant. Help users write and debug code.', tools: [] },
      { name: 'Content Writer', model: 'gpt-4o-mini', systemPrompt: 'You are a content writing assistant. Help create engaging content.', tools: [] },
    ];

    let created = 0;
    for (const agent of agents) {
      const existing = await Agent.findOne({ name: agent.name });
      if (!existing) {
        await Agent.create(agent);
        created++;
      }
    }

    return { seeded: created, total: agents.length };
  },
};

const clearAllData = {
  async execute(options, context) {
    const db = context.db;
    const confirm = options.yes;

    if (!confirm) {
      throw new Error('Use --yes to confirm clearing all data. This is IRREVERSIBLE!');
    }

    const collections = await db.listCollections().toArray();
    let deletedCount = 0;

    for (const coll of collections) {
      const result = await db.collection(coll.name).deleteMany({});
      deletedCount += result.deletedCount;
    }

    return { deletedCount, collectionsCleared: collections.length };
  },
};

const importJson = {
  async execute(options, context) {
    const db = context.db;
    const collectionName = options.key;
    const inputFile = options.value;

    if (!collectionName) throw new Error('--key (collection name) is required');
    if (!inputFile) throw new Error('--value (input file path) is required');

    const filePath = path.isAbsolute(inputFile) ? inputFile : path.resolve(process.cwd(), inputFile);

    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const documents = JSON.parse(content);

    if (!Array.isArray(documents)) {
      throw new Error('JSON file must contain an array of documents');
    }

    const collection = db.collection(collectionName);

    // Remove _id fields to avoid conflicts
    const cleanDocs = documents.map(doc => {
      const { _id, ...rest } = doc;
      return rest;
    });

    const result = await collection.insertMany(cleanDocs);

    return {
      collection: collectionName,
      importedCount: result.insertedCount,
      sourceFile: inputFile,
    };
  },
};

const exportJson = {
  async execute(options, context) {
    const db = context.db;
    const collectionName = options.key;
    const outputFile = options.value || `${collectionName}-export.json`;
    const query = options.description ? JSON.parse(options.description) : {};

    if (!collectionName) throw new Error('--key (collection name) is required');

    const collection = db.collection(collectionName);
    const documents = await collection.find(query).toArray();

    fs.writeFileSync(outputFile, JSON.stringify(documents, null, 2));

    return {
      collection: collectionName,
      exportedCount: documents.length,
      outputFile,
      query,
    };
  },
};

const exportAllCollections = {
  async execute(options, context) {
    const db = context.db;
    const outputDir = options.value || './db-export';

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const collections = await db.listCollections().toArray();
    const exported = [];

    for (const coll of collections) {
      const documents = await db.collection(coll.name).find().toArray();
      const outputFile = path.join(outputDir, `${coll.name}.json`);
      fs.writeFileSync(outputFile, JSON.stringify(documents, null, 2));
      exported.push({ name: coll.name, count: documents.length, file: outputFile });
    }

    return {
      outputDir,
      exportedCollections: exported,
      totalCollections: collections.length,
    };
  },
};

const countByField = {
  async execute(options, context) {
    const db = context.db;
    const collectionName = options.key;
    const fieldName = options.value;

    if (!collectionName) throw new Error('--key (collection name) is required');
    if (!fieldName) throw new Error('--value (field name) is required');

    const collection = db.collection(collectionName);
    const result = await collection.aggregate([
      { $group: { _id: `$${fieldName}`, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]).toArray();

    return { collection: collectionName, fieldName, distribution: result };
  },
};

const findOrphanedDocuments = {
  async execute(options, context) {
    const db = context.db;
    const collectionName = options.key;
    const refField = options.value;
    const refCollection = options.description;

    if (!collectionName) throw new Error('--key (collection name) is required');
    if (!refField) throw new Error('--value (reference field) is required');
    if (!refCollection) throw new Error('--description (referenced collection) is required');

    const collection = db.collection(collectionName);
    const refCollectionObj = db.collection(refCollection);

    const docs = await collection.find({ [refField]: { $exists: true, $ne: null } }).toArray();
    const orphaned = [];

    for (const doc of docs) {
      const refId = doc[refField];
      const exists = await refCollectionObj.findOne({ _id: refId });
      if (!exists) {
        orphaned.push({ _id: doc._id, [refField]: refId });
      }
    }

    return {
      collection: collectionName,
      refField,
      refCollection,
      orphanedCount: orphaned.length,
      orphaned: orphaned.slice(0, 50),
    };
  },
};

const deleteOrphanedDocuments = {
  async execute(options, context) {
    const db = context.db;
    const collectionName = options.key;
    const refField = options.value;
    const refCollection = options.description;

    if (!collectionName) throw new Error('--key (collection name) is required');
    if (!refField) throw new Error('--value (reference field) is required');
    if (!refCollection) throw new Error('--description (referenced collection) is required');

    const collection = db.collection(collectionName);
    const refCollectionObj = db.collection(refCollection);

    const docs = await collection.find({ [refField]: { $exists: true, $ne: null } }).toArray();
    let deletedCount = 0;

    for (const doc of docs) {
      const refId = doc[refField];
      const exists = await refCollectionObj.findOne({ _id: refId });
      if (!exists) {
        await collection.deleteOne({ _id: doc._id });
        deletedCount++;
      }
    }

    return { collection: collectionName, refField, deletedCount };
  },
};

const generateTestData = {
  async execute(options, context) {
    const db = context.db;
    const collectionName = options.key;
    const count = parseInt(options.value) || 100;

    if (!collectionName) throw new Error('--key (collection name) is required');

    const collection = db.collection(collectionName);
    const documents = [];

    for (let i = 0; i < count; i++) {
      documents.push({
        name: `Test Item ${i}`,
        value: Math.random() * 1000,
        status: ['active', 'inactive', 'pending'][Math.floor(Math.random() * 3)],
        createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
        updatedAt: new Date(),
      });
    }

    const result = await collection.insertMany(documents);

    return { collection: collectionName, insertedCount: result.insertedCount, count };
  },
};

module.exports = {
  seedUsers, seedSettings, seedAgents, clearAllData,
  importJson, exportJson, exportAllCollections,
  countByField, findOrphanedDocuments, deleteOrphanedDocuments,
  generateTestData,
};
