const express = require('express');
const router = express.Router();

const controller = require('../controllers/blogPublic.controller');

router.get('/blog-posts', controller.listPublished);
router.get('/blog-posts/:slug', controller.getPublishedBySlug);

module.exports = router;
