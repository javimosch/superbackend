const express = require('express');
const router = express.Router();

const { basicAuth } = require('../middleware/auth');
const rateLimiter = require('../services/rateLimiter.service');

const controller = require('../controllers/experiments.controller');

router.use(express.json({ limit: '1mb' }));
router.use(basicAuth);

router.get(
  '/:code/assignment',
  rateLimiter.limit('experimentsAssignmentLimiter'),
  controller.getAssignment,
);

router.post(
  '/:code/events',
  rateLimiter.limit('experimentsEventsLimiter'),
  controller.postEvents,
);

router.get(
  '/:code/winner',
  rateLimiter.limit('experimentsWinnerLimiter'),
  controller.getWinner,
);

module.exports = router;
