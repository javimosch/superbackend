const express = require('express');
const router = express.Router();
const { basicAuth } = require('../middleware/auth');
const formsController = require('../controllers/forms.controller');
const asyncHandler = require('../utils/asyncHandler');

router.get('/', basicAuth, asyncHandler(formsController.adminList));
router.get('/definitions', basicAuth, asyncHandler(formsController.getForms));
router.post('/definitions', basicAuth, asyncHandler(formsController.saveForm));
router.delete('/definitions/:id', basicAuth, asyncHandler(formsController.deleteForm));

module.exports = router;
