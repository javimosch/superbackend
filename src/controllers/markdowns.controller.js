const { getMarkdownByPath, searchMarkdowns } = require('../services/markdowns.service');

exports.getByPath = async (req, res) => {
  try {
    const { category, group_code, slug } = req.params;
    // Check if JSON is requested via query or if we are on a .json route
    const isJson = req.query?.json === 'true' || req.query?.json === '1' || req.path.endsWith('/json');

    const doc = await getMarkdownByPath(category, group_code, slug);
    
    if (isJson) {
      return res.json({ item: doc });
    }
    
    // Serve raw markdown with correct MIME type
    return res.type('text/markdown').send(doc.markdownRaw);
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

    const results = await searchMarkdowns(query, { category, group_code, limit: Number(limit) });
    return res.json({ results });
  } catch (error) {
    console.error('Error searching markdowns:', error);
    return res.status(500).json({ error: error?.message || 'Failed to search markdowns' });
  }
};
