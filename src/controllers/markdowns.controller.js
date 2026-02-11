const { getMarkdownByPath, searchMarkdowns } = require('../services/markdowns.service');

exports.getByPath = async (req, res) => {
  try {
    const { category, group_code, slug } = req.params;
    const raw = req.query?.raw === 'true' || req.query?.raw === '1';

    const content = await getMarkdownByPath(category, group_code, slug);
    
    if (raw) {
      return res.type('text/plain').send(content);
    }
    
    return res.json({ content });
  } catch (error) {
    const code = error?.code;
    if (code === 'NOT_FOUND') {
      return res.status(404).json({ error: 'Markdown not found' });
    }

    console.error('Error fetching markdown:', error);
    return res.status(500).json({ error: error?.message || 'Failed to fetch markdown' });
  }
};

exports.search = async (req, res) => {
  try {
    const { q: query, category, group_code, limit = 50 } = req.query;
    
    if (!query) {
      return res.status(400).json({ error: 'Search query (q) is required' });
    }

    const results = await searchMarkdowns(query, { category, group_code, limit });
    return res.json({ results });
  } catch (error) {
    console.error('Error searching markdowns:', error);
    return res.status(500).json({ error: error?.message || 'Failed to search markdowns' });
  }
};
