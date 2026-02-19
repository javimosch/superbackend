const express = require('express');
const router = express.Router();
const pagesService = require('../services/pages.service');
const { adminSessionAuth } = require('../middleware/auth');

router.get('*', async (req, res, next) => {
  try {
    const pagesPrefix = req.app.get('pagesPrefix') || '/';
    const adminPath = req.app.get('adminPath') || '/admin';
    const routePath = req.path;

    const draft = req.query?.draft === '1' || req.query?.draft === 'true';
    const statuses = draft ? ['published', 'draft'] : ['published'];

    if (draft) {
      let nextCalled = false;
      adminSessionAuth(req, res, () => {
        nextCalled = true;
      });

      // If adminSessionAuth did not call next(), it likely ended the response.
      if (!nextCalled) {
        return;
      }
    }

    const firstSegment = routePath.replace(/^\//, '').split('/')[0];
    if (pagesService.isReservedSegment(firstSegment, adminPath)) {
      return next();
    }

    const page = await pagesService.findPageByRoutePath(routePath, {
      pagesPrefix,
      tenantId: null,
      includeGlobal: true,
      statuses,
    });

    if (!page) {
      return next();
    }

    const viewsRoot = req.app.get('views') || undefined;
    const html = await pagesService.renderPage(page, { viewsRoot, req, res });
    
    if (!html || html.trim() === '') {
      throw new Error('Page rendered as empty content');
    }
    
    res.send(html);
  } catch (err) {
    if (err.code === 'NOT_FOUND') {
      return next();
    }
    console.error(`[pages] render error for path ${req.path}:`, err);
    
    // Render a friendly error page if possible, otherwise send a simple message
    try {
      const errorHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Page Rendering Error</title>
            <script src="https://cdn.tailwindcss.com"></script>
          </head>
          <body class="bg-gray-50 flex items-center justify-center min-h-screen p-4 font-sans">
            <div class="max-w-2xl w-full bg-white shadow-xl rounded-xl p-8 border-t-8 border-red-500">
              <div class="flex items-center gap-4 mb-6">
                <div class="bg-red-100 p-3 rounded-full">
                  <svg class="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
                  </svg>
                </div>
                <h1 class="text-3xl font-extrabold text-gray-900">Rendering Error</h1>
              </div>
              
              <p class="text-lg text-gray-700 mb-6">
                We encountered a technical issue while trying to display this page. 
                This usually happens when a template or a content block is missing or contains an error.
              </p>
              
              <div class="bg-red-50 border-l-4 border-red-400 p-4 mb-8">
                <div class="flex">
                  <div class="flex-shrink-0">
                    <svg class="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
                    </svg>
                  </div>
                  <div class="ml-3">
                    <h3 class="text-sm font-medium text-red-800">Error Details</h3>
                    <div class="mt-2 text-sm text-red-700">
                      <p class="font-mono break-all">${err.message}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div class="flex flex-col sm:flex-row gap-4">
                <a href="/" class="inline-flex items-center justify-center px-5 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 transition">
                  Go to Homepage
                </a>
                <button onclick="window.location.reload()" class="inline-flex items-center justify-center px-5 py-3 border border-gray-300 text-base font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 transition">
                  Try Again
                </button>
              </div>
              
              <div class="mt-10 pt-6 border-t border-gray-100">
                <p class="text-sm text-gray-500">
                  If you are the administrator, please check the server logs for more information.
                </p>
              </div>
            </div>
          </body>
        </html>
      `;
      res.status(500).send(errorHtml);
    } catch (e) {
      res.status(500).send('Error rendering page and error page');
    }
  }
});

module.exports = router;