#!/usr/bin/env node

/**
 * Advanced database utilities for data analysis and manipulation
 */

const mongoose = require("mongoose");

const collectionStats = {
  async execute(options, context) {
    const db = context.db;
    const collectionName = options.key;

    if (!collectionName) throw new Error("--key (collection name) is required");

    const collection = db.collection(collectionName);
    const stats = await collection.stats();
    const indexes = await collection.indexes();

    return {
      collection: collectionName,
      count: stats.count,
      size: stats.size,
      storageSize: stats.storageSize,
      totalIndexSize: stats.totalIndexSize,
      avgObjSize: stats.avgObjSize,
      indexes: indexes.length,
      capped: stats.capped,
      max: stats.max,
    };
  },
};

const topCollections = {
  async execute(options, context) {
    if (options.command && options.command !== "execute") return;
    const db = context.db;
    const limit = parseInt(options.value) || 10;
    const collections = await db.listCollections().toArray();
    const stats = [];

    for (const coll of collections) {
      const count = await db.collection(coll.name).countDocuments();
      stats.push({ name: coll.name, count });
    }

    return {
      topCollections: stats.slice(0, limit),
      totalCollections: collections.length,
    };
  },
};

const emptyCollections = {
  async execute(options, context) {
    if (options.command && options.command !== "execute") return;
    const db = context.db;
    const collections = await db.listCollections().toArray();
    const empty = [];

    for (const coll of collections) {
      const count = await db.collection(coll.name).countDocuments();
      if (count === 0) empty.push(coll.name);
    }

    return {
      emptyCollections: empty,
      totalEmpty: empty.length,
      totalCollections: collections.length,
    };
  },
};

const findLargeDocuments = {
  async execute(options, context) {
    const db = context.db;
    const collectionName = options.key;
    const threshold = parseInt(options.value) || 1024 * 1024; // 1MB default

    if (!collectionName) throw new Error("--key (collection name) is required");

    const collection = db.collection(collectionName);
    const docs = await collection.find({}).toArray();
    const large = [];

    for (const doc of docs) {
      const size = Buffer.byteLength(JSON.stringify(doc), "utf8");
      if (size > threshold) {
        large.push({
          _id: doc._id,
          size,
          sizeFormatted: (size / 1024).toFixed(2) + " KB",
        });
      }
    }

    large.sort((a, b) => b.size - a.size);
    return {
      collection: collectionName,
      threshold,
      largeDocuments: large.slice(0, 50),
    };
  },
};

const analyzeFieldTypes = {
  async execute(options, context) {
    const db = context.db;
    const collectionName = options.key;
    const fieldName = options.value;

    if (!collectionName) throw new Error("--key (collection name) is required");
    if (!fieldName) throw new Error("--value (field name) is required");

    const collection = db.collection(collectionName);
    const docs = await collection
      .find({ [fieldName]: { $exists: true } })
      .toArray();

    const types = {};
    for (const doc of docs) {
      const val = doc[fieldName];
      const type =
        val === null ? "null" : Array.isArray(val) ? "array" : typeof val;
      types[type] = (types[type] || 0) + 1;
    }

    return {
      collection: collectionName,
      fieldName,
      totalDocs: docs.length,
      typeDistribution: types,
    };
  },
};

const findNullFields = {
  async execute(options, context) {
    const db = context.db;
    const collectionName = options.key;
    const fieldName = options.value;

    if (!collectionName) throw new Error("--key (collection name) is required");
    if (!fieldName) throw new Error("--value (field name) is required");

    const collection = db.collection(collectionName);
    const count = await collection.countDocuments({
      $or: [{ [fieldName]: null }, { [fieldName]: { $exists: false } }],
    });
    const total = await collection.countDocuments({});

    return {
      collection: collectionName,
      fieldName,
      nullCount: count,
      totalCount: total,
      percentage: ((count / total) * 100).toFixed(2) + "%",
    };
  },
};

const fillNullFields = {
  async execute(options, context) {
    const db = context.db;
    const collectionName = options.key;
    const fieldName = options.value;
    const fillValue = options.description;

    if (!collectionName) throw new Error("--key (collection name) is required");
    if (!fieldName) throw new Error("--value (field name) is required");
    if (fillValue === undefined)
      throw new Error("--description (fill value) is required");

    let parsedValue;
    try {
      parsedValue = JSON.parse(fillValue);
    } catch (e) {
      parsedValue = fillValue;
    }

    const collection = db.collection(collectionName);
    const result = await collection.updateMany(
      { [fieldName]: null },
      { $set: { [fieldName]: parsedValue } },
    );

    return {
      collection: collectionName,
      fieldName,
      updatedCount: result.modifiedCount,
      fillValue: parsedValue,
    };
  },
};

const removeField = {
  async execute(options, context) {
    const db = context.db;
    const collectionName = options.key;
    const fieldName = options.value;

    if (!collectionName) throw new Error("--key (collection name) is required");
    if (!fieldName) throw new Error("--value (field name) is required");

    const collection = db.collection(collectionName);
    const result = await collection.updateMany(
      {},
      { $unset: { [fieldName]: "" } },
    );

    return {
      collection: collectionName,
      fieldName,
      updatedCount: result.modifiedCount,
    };
  },
};

const renameField = {
  async execute(options, context) {
    const db = context.db;
    const collectionName = options.key;
    const parts = (options.value || "").split(":");
    const oldName = parts[0];
    const newName = parts[1];

    if (!collectionName) throw new Error("--key (collection name) is required");
    if (!oldName || !newName)
      throw new Error('--value must be "oldName:newName"');

    const collection = db.collection(collectionName);
    const result = await collection.updateMany(
      {},
      { $rename: { [oldName]: newName } },
    );

    return {
      collection: collectionName,
      oldName,
      newName,
      updatedCount: result.modifiedCount,
    };
  },
};

const convertFieldTypes = {
  async execute(options, context) {
    const db = context.db;
    const collectionName = options.key;
    const fieldName = options.value;
    const targetType = options.description;

    if (!collectionName) throw new Error("--key (collection name) is required");
    if (!fieldName) throw new Error("--value (field name) is required");
    if (!targetType) throw new Error("--description (target type) is required");

    const collection = db.collection(collectionName);
    const docs = await collection
      .find({ [fieldName]: { $exists: true } })
      .toArray();
    let convertedCount = 0;

    for (const doc of docs) {
      const val = doc[fieldName];
      let newVal = val;

      try {
        if (targetType === "string") newVal = String(val);
        else if (targetType === "number") newVal = Number(val);
        else if (targetType === "boolean") newVal = Boolean(val);
        else if (targetType === "date") newVal = new Date(val);
        else if (targetType === "array")
          newVal = Array.isArray(val) ? val : [val];

        if (newVal !== val) {
          await collection.updateOne(
            { _id: doc._id },
            { $set: { [fieldName]: newVal } },
          );
          convertedCount++;
        }
      } catch (e) {
        // Skip conversion errors
      }
    }

    return {
      collection: collectionName,
      fieldName,
      targetType,
      convertedCount,
    };
  },
};

const sampleDocuments = {
  async execute(options, context) {
    const db = context.db;
    const collectionName = options.key;
    const sampleSize = parseInt(options.value) || 10;

    if (!collectionName) throw new Error("--key (collection name) is required");

    const collection = db.collection(collectionName);
    const sample = await collection
      .aggregate([{ $sample: { size: sampleSize } }])
      .toArray();

    return { collection: collectionName, sampleSize: sample.length, sample };
  },
};

const distinctValues = {
  async execute(options, context) {
    const db = context.db;
    const collectionName = options.key;
    const fieldName = options.value;

    if (!collectionName) throw new Error("--key (collection name) is required");
    if (!fieldName) throw new Error("--value (field name) is required");

    const collection = db.collection(collectionName);
    const distinct = await collection.distinct(fieldName);

    return {
      collection: collectionName,
      fieldName,
      distinctCount: distinct.length,
      distinctValues: distinct.slice(0, 100),
    };
  },
};

const fieldCardinality = {
  async execute(options, context) {
    const db = context.db;
    const collectionName = options.key;
    const fieldName = options.value;

    if (!collectionName) throw new Error("--key (collection name) is required");
    if (!fieldName) throw new Error("--value (field name) is required");

    const collection = db.collection(collectionName);
    const total = await collection.countDocuments({});
    const distinct = await collection.distinct(fieldName);

    return {
      collection: collectionName,
      fieldName,
      totalDocuments: total,
      distinctValues: distinct.length,
      cardinality:
        total > 0 ? ((distinct.length / total) * 100).toFixed(2) + "%" : "0%",
    };
  },
};

module.exports = {
  collectionStats,
  topCollections,
  emptyCollections,
  findLargeDocuments,
  analyzeFieldTypes,
  findNullFields,
  fillNullFields,
  removeField,
  renameField,
  convertFieldTypes,
  sampleDocuments,
  distinctValues,
  fieldCardinality,
};
