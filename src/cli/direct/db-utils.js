#!/usr/bin/env node

/**
 * Database utilities: db-stats, db-indexes, db-cleanup, and collection operations
 */

const mongoose = require('mongoose');

const dbStats = {
  async execute(options, context) {
    const db = context.db;
    const collections = await db.listCollections().toArray();
    const stats = {};
    let totalDocs = 0, totalSize = 0;

    for (const coll of collections) {
      const s = await db.collection(coll.name).stats();
      stats[coll.name] = { count: s.count, size: s.size, storageSize: s.storageSize };
      totalDocs += s.count;
      totalSize += s.size;
    }

    return {
      collections: collections.length,
      totalDocuments: totalDocs,
      totalSize,
      totalSizeFormatted: (totalSize / 1024 / 1024).toFixed(2) + ' MB',
      byCollection: stats,
    };
  },
};

const dbIndexes = {
  async execute(options, context) {
    const db = context.db;
    const collectionName = options.key;

    if (!collectionName) {
      const collections = await db.listCollections().toArray();
      const result = [];
      for (const coll of collections) {
        const indexes = await db.collection(coll.name).indexes();
        result.push({
          collection: coll.name,
          indexCount: indexes.length,
          indexes: indexes.map(idx => ({ name: idx.name, key: idx.key, unique: idx.unique || false })),
        });
      }
      return result;
    }

    const indexes = await db.collection(collectionName).indexes();
    return {
      collection: collectionName,
      indexCount: indexes.length,
      indexes: indexes.map(idx => ({ name: idx.name, key: idx.key, unique: idx.unique || false })),
    };
  },
};

const dbCleanup = {
  async execute(options, context) {
    const db = context.db;
    const collectionName = options.key;
    const days = parseInt(options.value) || 30;
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    if (!collectionName) throw new Error('--key (collection name) is required');

    const collection = db.collection(collectionName);
    const result = await collection.deleteMany({ createdAt: { $lt: cutoffDate } });

    return { collection: collectionName, deletedCount: result.deletedCount, olderThan: cutoffDate.toISOString() };
  },
};

const batchDelete = {
  async execute(options, context) {
    const db = context.db;
    const collectionName = options.key;
    const filterKey = options.description || '_id';
    const idsArg = options.value;

    if (!collectionName) throw new Error('--key (collection name) is required');
    if (!idsArg) throw new Error('--value (comma-separated IDs) is required');

    const ids = idsArg.split(',').map(id => id.trim());
    const filter = { [filterKey]: { $in: ids } };
    const result = await db.collection(collectionName).deleteMany(filter);

    return { collection: collectionName, deletedCount: result.deletedCount, requestedCount: ids.length, filter };
  },
};

const batchUpdate = {
  async execute(options, context) {
    const db = context.db;
    const collectionName = options.key;
    const updateJson = options.value;

    if (!collectionName) throw new Error('--key (collection name) is required');
    if (!updateJson) throw new Error('--value (update JSON) is required');

    let update;
    try { update = JSON.parse(updateJson); } catch (e) { throw new Error('--value must be valid JSON'); }

    const result = await db.collection(collectionName).updateMany({}, update);
    return { collection: collectionName, matchedCount: result.matchedCount, modifiedCount: result.modifiedCount, update };
  },
};

const collectionCount = {
  async execute(options, context) {
    const db = context.db;
    const collectionName = options.key;

    if (!collectionName) {
      const collections = await db.listCollections().toArray();
      const counts = {};
      let total = 0;
      for (const coll of collections) {
        const count = await db.collection(coll.name).countDocuments();
        counts[coll.name] = count;
        total += count;
      }
      return { totalDocuments: total, collectionCount: collections.length, byCollection: counts };
    }

    const count = await db.collection(collectionName).countDocuments();
    return { collection: collectionName, count };
  },
};

const collectionSchema = {
  async execute(options, context) {
    const db = context.db;
    const collectionName = options.key;

    if (!collectionName) throw new Error('--key (collection name) is required');

    const collection = db.collection(collectionName);
    const sample = await collection.findOne();
    const indexes = await collection.indexes();

    if (!sample) {
      return { collection: collectionName, message: 'Collection is empty', indexes: indexes.map(idx => ({ name: idx.name, key: idx.key })) };
    }

    const schema = {};
    for (const [key, value] of Object.entries(sample)) {
      schema[key] = {
        type: value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value,
        example: value === null ? null : (typeof value === 'string' && value.length > 50 ? value.slice(0, 50) + '...' : value),
      };
    }

    return {
      collection: collectionName,
      sampleSize: 1,
      schema,
      indexes: indexes.map(idx => ({ name: idx.name, key: idx.key, unique: idx.unique || false })),
    };
  },
};

const exportCollection = {
  async execute(options, context) {
    const db = context.db;
    const collectionName = options.key;
    const limit = parseInt(options.value) || 1000;
    const outputFile = options.description || `${collectionName}-export.json`;

    if (!collectionName) throw new Error('--key (collection name) is required');

    const fs = require('fs');
    const collection = db.collection(collectionName);
    const documents = await collection.find({}).limit(limit).toArray();
    fs.writeFileSync(outputFile, JSON.stringify(documents, null, 2));

    return { collection: collectionName, exportedCount: documents.length, outputFile, limit };
  },
};

const findDuplicates = {
  async execute(options, context) {
    const db = context.db;
    const collectionName = options.key;
    const field = options.description || 'email';

    if (!collectionName) throw new Error('--key (collection name) is required');

    const collection = db.collection(collectionName);
    const duplicates = await collection.aggregate([
      { $group: { _id: `$${field}`, count: { $sum: 1 }, ids: { $push: '$_id' } } },
      { $match: { count: { $gt: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 100 },
    ]).toArray();

    return { collection: collectionName, field, duplicateCount: duplicates.length, duplicates };
  },
};

const removeDuplicates = {
  async execute(options, context) {
    const db = context.db;
    const collectionName = options.key;
    const field = options.description || 'email';

    if (!collectionName) throw new Error('--key (collection name) is required');

    const collection = db.collection(collectionName);
    const duplicates = await collection.aggregate([
      { $group: { _id: `$${field}`, count: { $sum: 1 }, ids: { $push: '$_id' } } },
      { $match: { count: { $gt: 1 } } },
    ]).toArray();

    let removedCount = 0;
    for (const dup of duplicates) {
      const idsToDelete = dup.ids.slice(1);
      const result = await collection.deleteMany({ _id: { $in: idsToDelete } });
      removedCount += result.deletedCount;
    }

    return { collection: collectionName, field, groupsProcessed: duplicates.length, removedCount };
  },
};

const validateRefs = {
  async execute(options, context) {
    const db = context.db;
    const collectionName = options.key;
    const refField = options.description || 'userId';
    const refCollection = options.value || 'users';

    if (!collectionName) throw new Error('--key (collection name) is required');

    const collection = db.collection(collectionName);
    const refCollectionObj = db.collection(refCollection);
    const docs = await collection.find({ [refField]: { $exists: true, $ne: null } }).toArray();
    const invalidRefs = [];

    for (const doc of docs) {
      const refId = doc[refField];
      const exists = await refCollectionObj.findOne({ _id: refId });
      if (!exists) invalidRefs.push({ docId: doc._id, [refField]: refId });
    }

    return { collection: collectionName, refField, refCollection, totalDocs: docs.length, invalidRefs: invalidRefs.length, samples: invalidRefs.slice(0, 20) };
  },
};

const repairRefs = {
  async execute(options, context) {
    const db = context.db;
    const collectionName = options.key;
    const refField = options.description || 'userId';
    const refCollection = options.value || 'users';
    const action = options.name || 'nullify';

    if (!collectionName) throw new Error('--key (collection name) is required');

    const collection = db.collection(collectionName);
    const refCollectionObj = db.collection(refCollection);
    const docs = await collection.find({ [refField]: { $exists: true, $ne: null } }).toArray();
    let repairedCount = 0;

    for (const doc of docs) {
      const refId = doc[refField];
      const exists = await refCollectionObj.findOne({ _id: refId });
      if (!exists) {
        if (action === 'delete') {
          await collection.deleteOne({ _id: doc._id });
        } else {
          await collection.updateOne({ _id: doc._id }, { $set: { [refField]: null } });
        }
        repairedCount++;
      }
    }

    return { collection: collectionName, refField, refCollection, action, repairedCount };
  },
};

const addIndex = {
  async execute(options, context) {
    const db = context.db;
    const collectionName = options.key;
    const fields = options.value;

    if (!collectionName) throw new Error('--key (collection name) is required');
    if (!fields) throw new Error('--value (comma-separated fields) is required');

    const collection = db.collection(collectionName);
    const indexSpec = {};
    fields.split(',').forEach(f => { indexSpec[f.trim()] = 1; });
    const indexName = await collection.createIndex(indexSpec);

    return { collection: collectionName, indexName, indexSpec };
  },
};

const dropIndex = {
  async execute(options, context) {
    const db = context.db;
    const collectionName = options.key;
    const indexName = options.value;

    if (!collectionName) throw new Error('--key (collection name) is required');
    if (!indexName) throw new Error('--value (index name) is required');

    const collection = db.collection(collectionName);
    await collection.dropIndex(indexName);
    return { collection: collectionName, indexName, success: true };
  },
};

const reindex = {
  async execute(options, context) {
    const db = context.db;
    const collectionName = options.key;

    if (!collectionName) throw new Error('--key (collection name) is required');

    const collection = db.collection(collectionName);
    const result = await collection.reIndex();
    return { collection: collectionName, nIndexesWas: result.nIndexesWas, nIndexes: result.nIndexes, ok: result.ok };
  },
};

const compact = {
  async execute(options, context) {
    const db = context.db;
    const collectionName = options.key;

    if (!collectionName) throw new Error('--key (collection name) is required');

    const result = await db.command({ compact: collectionName });
    return { collection: collectionName, bytesFreed: result.bytesFreed, ok: result.ok };
  },
};

const validateCollection = {
  async execute(options, context) {
    const db = context.db;
    const collectionName = options.key;

    if (!collectionName) throw new Error('--key (collection name) is required');

    const result = await db.command({ validate: collectionName });
    return { collection: collectionName, valid: result.valid, errors: result.errors || [], warnings: result.warnings || [], ok: result.ok };
  },
};

const renameCollection = {
  async execute(options, context) {
    const db = context.db;
    const collectionName = options.key;
    const newName = options.value;

    if (!collectionName) throw new Error('--key (collection name) is required');
    if (!newName) throw new Error('--value (new name) is required');

    const collection = db.collection(collectionName);
    await collection.rename(newName);
    return { oldName: collectionName, newName, success: true };
  },
};

const listCollections = {
  async execute(options, context) {
    const db = context.db;
    const collections = await db.listCollections().toArray();
    const details = [];

    for (const coll of collections) {
      const stats = await db.collection(coll.name).stats();
      details.push({ name: coll.name, type: coll.type, count: stats.count, size: stats.size, storageSize: stats.storageSize, indexes: stats.nindexes });
    }

    return { totalCollections: collections.length, collections: details };
  },
};

const createCollection = {
  async execute(options, context) {
    const db = context.db;
    const collectionName = options.key;
    const capped = options.description === 'capped';
    const size = parseInt(options.value) || 1048576;

    if (!collectionName) throw new Error('--key (collection name) is required');

    const opts = capped ? { capped: true, size } : {};
    await db.createCollection(collectionName, opts);
    return { name: collectionName, capped, size: opts.size, success: true };
  },
};

const dropCollection = {
  async execute(options, context) {
    const db = context.db;
    const collectionName = options.key;

    if (!collectionName) throw new Error('--key (collection name) is required');

    await db.collection(collectionName).drop();
    return { name: collectionName, success: true };
  },
};

module.exports = {
  dbStats, dbIndexes, dbCleanup, batchDelete, batchUpdate, collectionCount, collectionSchema, exportCollection,
  findDuplicates, removeDuplicates, validateRefs, repairRefs, addIndex, dropIndex, reindex, compact,
  validateCollection, renameCollection, listCollections, createCollection, dropCollection,
};
