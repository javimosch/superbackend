const express = require('express');
const router = express.Router();
const waitingListController = require('../controllers/waitingList.controller');
const asyncHandler = require('../utils/asyncHandler');
const { auditMiddleware } = require('../services/auditLogger');

// POST /api/waiting-list/subscribe - Subscribe to waiting list
router.post('/subscribe', auditMiddleware('public.waiting_list.subscribe', { entityType: 'WaitingList' }), asyncHandler(waitingListController.subscribe));

// GET /api/waiting-list/stats - Get waiting list statistics (public)
router.get('/stats', asyncHandler(waitingListController.getStats));

module.exports = router;
