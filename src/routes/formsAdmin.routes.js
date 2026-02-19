const express = require('express');
const router = express.Router();
const { adminSessionAuth } = require('../middleware/auth');
const formsController = require('../controllers/forms.controller');
const asyncHandler = require('../utils/asyncHandler');

router.get('/', adminSessionAuth, asyncHandler(formsController.adminList));
router.delete('/:id', adminSessionAuth, asyncHandler(formsController.deleteSubmission));
router.get('/definitions', adminSessionAuth, asyncHandler(formsController.getForms));
router.post('/definitions', adminSessionAuth, asyncHandler(formsController.saveForm));
router.delete('/definitions/:id', adminSessionAuth, asyncHandler(formsController.deleteForm));

module.exports = router;
