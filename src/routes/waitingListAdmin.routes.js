const express = require('express');
const router = express.Router();
const { adminSessionAuth } = require('../middleware/auth');
const waitingListController = require('../controllers/waitingList.controller');
const asyncHandler = require('../utils/asyncHandler');

router.get('/', adminSessionAuth, asyncHandler(waitingListController.adminList));
router.get('/types', adminSessionAuth, asyncHandler(waitingListController.getTypes));
router.get('/export-csv', adminSessionAuth, asyncHandler(waitingListController.exportCsv));
router.post('/bulk-remove', adminSessionAuth, asyncHandler(waitingListController.bulkRemove));

module.exports = router;
