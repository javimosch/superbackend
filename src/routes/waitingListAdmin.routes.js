const express = require('express');
const router = express.Router();
const { adminSessionAuth } = require('../middleware/auth');
const waitingListController = require('../controllers/waitingList.controller');
const asyncHandler = require('../utils/asyncHandler');

router.get('/', adminSessionAuth, asyncHandler(waitingListController.adminList));
router.get('/types', adminSessionAuth, asyncHandler(waitingListController.getTypes));
router.get('/export-csv', adminSessionAuth, asyncHandler(waitingListController.exportCsv));
router.post('/bulk-remove', adminSessionAuth, asyncHandler(waitingListController.bulkRemove));

// Public exports management
router.get('/public-exports', adminSessionAuth, asyncHandler(waitingListController.getPublicExports));
router.post('/public-exports', adminSessionAuth, asyncHandler(waitingListController.createPublicExport));
router.put('/public-exports/:id', adminSessionAuth, asyncHandler(waitingListController.updatePublicExport));
router.delete('/public-exports/:id', adminSessionAuth, asyncHandler(waitingListController.deletePublicExport));

module.exports = router;
