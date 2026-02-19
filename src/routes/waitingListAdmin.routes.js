const express = require('express');
const router = express.Router();
const { adminSessionAuth } = require('../middleware/auth');
const waitingListController = require('../controllers/waitingList.controller');
const asyncHandler = require('../utils/asyncHandler');

router.get('/', adminSessionAuth, asyncHandler(waitingListController.adminList));

module.exports = router;
