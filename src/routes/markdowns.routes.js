const express = require('express');
const router = express.Router();

const markdownsController = require('../controllers/markdowns.controller');

// JSON versions (more specific first)
router.get('/:category/:group_code/:slug/json', markdownsController.getByPath);
router.get('/:category/:slug/json', markdownsController.getByPath);

// Raw versions
router.get('/:category/:group_code/:slug', markdownsController.getByPath);
router.get('/:category/:slug', markdownsController.getByPath); // No group_code

router.get('/search', markdownsController.search);

module.exports = router;
