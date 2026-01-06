const express = require('express');
const router = express.Router();
const formsController = require('../controllers/forms.controller');
const asyncHandler = require('../utils/asyncHandler');
const { auditMiddleware } = require('../services/auditLogger');

router.post('/submit/:formId', auditMiddleware('public.form.submit', { entityType: 'FormSubmission' }), asyncHandler(formsController.submit));

module.exports = router;
