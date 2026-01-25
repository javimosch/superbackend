const express = require('express');
const router = express.Router();

const controller = require('../controllers/blogInternal.controller');
const { requireInternalCronToken } = require('../middleware/internalCronAuth');

router.use(express.json({ limit: '1mb' }));
router.use(requireInternalCronToken);

router.post('/blog/automation/run', controller.runAutomation);
router.post('/blog/publish-scheduled/run', controller.publishScheduled);

module.exports = router;
