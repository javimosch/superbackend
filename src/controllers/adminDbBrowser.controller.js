const dbBrowser = require('../services/dbBrowser.service');

exports.listConnections = async (req, res) => {
  try {
    const items = await dbBrowser.listConnections();
    res.json({ items });
  } catch (err) {
    const safe = dbBrowser.toSafeJsonError(err);
    res.status(safe.status).json(safe.body);
  }
};

exports.getConnection = async (req, res) => {
  try {
    const item = await dbBrowser.getConnection(req.params.id);
    res.json({ item });
  } catch (err) {
    const safe = dbBrowser.toSafeJsonError(err);
    res.status(safe.status).json(safe.body);
  }
};

exports.createConnection = async (req, res) => {
  try {
    const item = await dbBrowser.createConnection(req.body || {});
    res.status(201).json({ item });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(400).json({ error: 'Connection name must be unique' });
    }
    const safe = dbBrowser.toSafeJsonError(err);
    res.status(safe.status).json(safe.body);
  }
};

exports.updateConnection = async (req, res) => {
  try {
    const item = await dbBrowser.updateConnection(req.params.id, req.body || {});
    res.json({ item });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(400).json({ error: 'Connection name must be unique' });
    }
    const safe = dbBrowser.toSafeJsonError(err);
    res.status(safe.status).json(safe.body);
  }
};

exports.deleteConnection = async (req, res) => {
  try {
    const out = await dbBrowser.deleteConnection(req.params.id);
    res.json(out);
  } catch (err) {
    const safe = dbBrowser.toSafeJsonError(err);
    res.status(safe.status).json(safe.body);
  }
};

exports.testConnection = async (req, res) => {
  try {
    const out = await dbBrowser.testConnection(req.params.id);
    res.json(out);
  } catch (err) {
    const safe = dbBrowser.toSafeJsonError(err);
    res.status(safe.status).json(safe.body);
  }
};

exports.listDatabases = async (req, res) => {
  try {
    const items = await dbBrowser.listDatabases(req.params.id);
    res.json({ items });
  } catch (err) {
    const safe = dbBrowser.toSafeJsonError(err);
    res.status(safe.status).json(safe.body);
  }
};

exports.listNamespaces = async (req, res) => {
  try {
    const items = await dbBrowser.listNamespaces(req.params.id, req.params.database);
    res.json({ items });
  } catch (err) {
    const safe = dbBrowser.toSafeJsonError(err);
    res.status(safe.status).json(safe.body);
  }
};

exports.getSchema = async (req, res) => {
  try {
    const schema = await dbBrowser.getSchema(req.params.id, req.params.database, req.params.namespace);
    res.json({ schema });
  } catch (err) {
    const safe = dbBrowser.toSafeJsonError(err);
    res.status(safe.status).json(safe.body);
  }
};

exports.listRecords = async (req, res) => {
  try {
    const out = await dbBrowser.listRecords(req.params.id, req.params.database, req.params.namespace, {
      page: req.query.page,
      pageSize: req.query.pageSize,
      filterField: req.query.filterField,
      filterValue: req.query.filterValue,
      sortField: req.query.sortField,
      sortOrder: req.query.sortOrder,
    });
    res.json(out);
  } catch (err) {
    const safe = dbBrowser.toSafeJsonError(err);
    res.status(safe.status).json(safe.body);
  }
};

exports.getRecord = async (req, res) => {
  try {
    const item = await dbBrowser.getRecord(req.params.id, req.params.database, req.params.namespace, req.params.recordId);
    res.json({ item });
  } catch (err) {
    const safe = dbBrowser.toSafeJsonError(err);
    res.status(safe.status).json(safe.body);
  }
};
