#!/usr/bin/env node

/**
 * Migration utilities: migration-status, add-timestamps, data-digest
 */

const mongoose = require("mongoose");

const migrationStatus = {
  async execute(options, context) {
    if (options.command && options.command !== "execute") return;
    const db = context.db;
    const collections = await db.listCollections().toArray();
    const status = {};

    for (const coll of collections) {
      const count = await db.collection(coll.name).countDocuments();
      const sample = await db.collection(coll.name).findOne();
      status[coll.name] = {
        count,
        hasCreatedAt: sample?.createdAt ? true : false,
        hasUpdatedAt: sample?.updatedAt ? true : false,
      };
    }

    return { totalCollections: collections.length, status };
  },
};

const addTimestamps = {
  async execute(options, context) {
    const db = context.db;
    const collectionName = options.key;
    const dryRun = options.value === "dry";

    if (!collectionName) throw new Error("--key (collection name) is required");

    const collection = db.collection(collectionName);
    const docs = await collection
      .find({
        $or: [
          { createdAt: { $exists: false } },
          { updatedAt: { $exists: false } },
        ],
      })
      .toArray();

    if (dryRun) {
      return {
        collection: collectionName,
        dryRun: true,
        docsToUpdate: docs.length,
        samples: docs.slice(0, 5).map((d) => ({ _id: d._id })),
      };
    }

    let updatedCount = 0;
    const now = new Date();

    for (const doc of docs) {
      await collection.updateOne(
        { _id: doc._id },
        {
          $set: {
            createdAt: doc.createdAt || now,
            updatedAt: doc.updatedAt || now,
          },
        },
      );
      updatedCount++;
    }

    return { collection: collectionName, updatedCount, totalDocs: docs.length };
  },
};

const dataDigest = {
  async execute(options, context) {
    if (options.command && options.command !== "execute") return;
    const db = context.db;
    const collections = await db.listCollections().toArray();

    const digest = {
      timestamp: new Date().toISOString(),
      totalCollections: collections.length,
      totalDocuments: 0,
      totalSize: 0,
      collections: [],
    };

    for (const coll of collections) {
      const stats = await db.collection(coll.name).stats();
      digest.totalDocuments += stats.count;
      digest.totalSize += stats.size;
      digest.collections.push({
        name: coll.name,
        count: stats.count,
        size: stats.size,
        storageSize: stats.storageSize,
      });
    }

    return digest;
  },
};

module.exports = { migrationStatus, addTimestamps, dataDigest };
