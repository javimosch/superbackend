const express = require('express');
const router = express.Router();
const waitingListController = require('../controllers/waitingList.controller');
const asyncHandler = require('../utils/asyncHandler');
const { auditMiddleware } = require('../services/auditLogger');
const rateLimiter = require('../services/rateLimiter.service');
const basicAuth = require('basic-auth');

// POST /api/waiting-list/subscribe - Subscribe to waiting list
// Rate limited by IP to prevent spam/abuse (1 request per minute)
router.post('/subscribe', 
  rateLimiter.limit('waitingListSubscribeLimiter'),
  auditMiddleware('public.waiting_list.subscribe', { entityType: 'WaitingList' }), 
  asyncHandler(waitingListController.subscribe)
);

// GET /api/waiting-list/stats - Get waiting list statistics (public)
// Light rate limiting to prevent abuse (60 requests per minute)
router.get('/stats', 
  rateLimiter.limit('waitingListStatsLimiter'),
  asyncHandler(waitingListController.getStats)
);

// GET /api/waiting-list/share/export - Public export endpoint
// Rate limited to prevent abuse (10 requests per minute)
router.get('/share/export', 
  rateLimiter.limit('waitingListPublicExportLimiter'),
  asyncHandler(waitingListController.publicExport)
);

module.exports = router;
