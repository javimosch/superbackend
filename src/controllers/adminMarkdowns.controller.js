const {
  ERROR_CODES,
  listMarkdowns,
  getMarkdownById,
  createMarkdown,
  updateMarkdown,
  deleteMarkdown,
  getFolderContents,
  getUniqueGroupCodes,
  validatePathUniqueness,
} = require('../services/markdowns.service');

function handleServiceError(res, error) {
  const msg = error?.message || 'Operation failed';
  const code = error?.code;

  if (code === 'VALIDATION' || code === 'INVALID_MARKDOWN' || code === 'INVALID_GROUP_CODE') {
    return res.status(400).json({ error: msg });
  }
  if (code === 'NOT_FOUND') {
    return res.status(404).json({ error: msg });
  }
  if (code === 'PATH_NOT_UNIQUE') {
    return res.status(409).json({ error: msg });
  }

  return res.status(500).json({ error: msg });
}

function parseJsonMaybe(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch (_) {
    return null;
  }
}

exports.list = async (req, res) => {
  try {
    const filters = {
      category: req.query.category,
      group_code: req.query.group_code,
      status: req.query.status,
      ownerUserId: req.query.ownerUserId,
      orgId: req.query.orgId,
      search: req.query.search,
    };
    
    const pagination = {
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 50,
      sort: parseJsonMaybe(req.query.sort) || { updatedAt: -1 },
    };
    
    const result = await listMarkdowns(filters, pagination, { isAdmin: true });
    return res.json(result);
  } catch (error) {
    console.error('Error listing markdowns:', error);
    return handleServiceError(res, error);
  }
};

exports.get = async (req, res) => {
  try {
    const item = await getMarkdownById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Markdown not found' });
    return res.json({ item });
  } catch (error) {
    console.error('Error fetching markdown:', error);
    return handleServiceError(res, error);
  }
};

exports.create = async (req, res) => {
  try {
    const item = await createMarkdown(req.body || {});
    return res.status(201).json({ item });
  } catch (error) {
    console.error('Error creating markdown:', error);
    return handleServiceError(res, error);
  }
};

exports.update = async (req, res) => {
  try {
    const item = await updateMarkdown(req.params.id, req.body || {});
    return res.json({ item });
  } catch (error) {
    console.error('Error updating markdown:', error);
    return handleServiceError(res, error);
  }
};

exports.remove = async (req, res) => {
  try {
    const result = await deleteMarkdown(req.params.id);
    return res.json(result);
  } catch (error) {
    console.error('Error deleting markdown:', error);
    return handleServiceError(res, error);
  }
};

exports.getFolderContents = async (req, res) => {
  try {
    const { category } = req.params;
    const { group_code } = req.params;
    
    const pagination = {
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 100,
      sort: parseJsonMaybe(req.query.sort) || { title: 1 },
    };
    
    const result = await getFolderContents(category, group_code, pagination, { isAdmin: true });
    return res.json(result);
  } catch (error) {
    console.error('Error getting folder contents:', error);
    return handleServiceError(res, error);
  }
};

exports.validatePath = async (req, res) => {
  try {
    const { category, group_code, slug, excludeId } = req.body;
    
    if (!category || !slug) {
      return res.status(400).json({ error: 'category and slug are required' });
    }
    
    const isUnique = await validatePathUniqueness(category, group_code, slug, excludeId);
    return res.json({ unique: isUnique });
  } catch (error) {
    console.error('Error validating path:', error);
    return handleServiceError(res, error);
  }
};

exports.getGroupCodes = async (req, res) => {
  try {
    const { category } = req.params;
    
    if (!category) {
      return res.status(400).json({ error: 'category is required' });
    }
    
    const groupCodes = await getUniqueGroupCodes(category, { isAdmin: true });
    return res.json(groupCodes);
  } catch (error) {
    console.error('Error getting group codes:', error);
    return handleServiceError(res, error);
  }
};
