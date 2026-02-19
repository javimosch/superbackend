const express = require('express');
const router = express.Router();

const { adminSessionAuth } = require('../middleware/auth');
const controller = require('../controllers/blogAdmin.controller');

router.use(adminSessionAuth);
router.use(express.json({ limit: '2mb' }));

router.get('/blog-posts', controller.list);
router.get('/blog-posts/suggestions', controller.suggestions);
router.post('/blog-posts', controller.create);
router.get('/blog-posts/:id', controller.get);
router.put('/blog-posts/:id', controller.update);
router.put('/blog-posts/:id/publish', controller.publish);
router.put('/blog-posts/:id/unpublish', controller.unpublish);
router.put('/blog-posts/:id/schedule', controller.schedule);
router.put('/blog-posts/:id/archive', controller.archive);
router.delete('/blog-posts/:id', controller.remove);

module.exports = router;
