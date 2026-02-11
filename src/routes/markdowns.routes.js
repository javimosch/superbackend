const express = require('express');
const router = express.Router();

const markdownsController = require('../controllers/markdowns.controller');

router.get('/:category/:group_code/:slug', markdownsController.getByPath);
router.get('/:category/:slug', markdownsController.getByPath); // No group_code
router.get('/search', markdownsController.search);

module.exports = router;
