const express = require('express');
const router = express.Router();

const { authenticate } = require('../middleware/auth');
const { requireRight } = require('../middleware/rbac');
const controller = require('../controllers/adminExperiments.controller');

const getOrgId = (req) => req.headers['x-org-id'] || req.query?.orgId || req.body?.organizationId || req.body?.orgId;

router.use(express.json({ limit: '1mb' }));

router.use((req, res, next) => {
  const auth = String(req.headers?.authorization || '');
  if (auth.toLowerCase().startsWith('bearer ')) {
    return authenticate(req, res, next);
  }
  return next();
});

router.get('/', requireRight('experiments:admin', { getOrgId }), controller.list);
router.post('/', requireRight('experiments:admin', { getOrgId }), controller.create);

router.get('/:id', requireRight('experiments:admin', { getOrgId }), controller.get);
router.put('/:id', requireRight('experiments:admin', { getOrgId }), controller.update);
router.delete('/:id', requireRight('experiments:admin', { getOrgId }), controller.remove);

router.get('/:id/metrics', requireRight('experiments:admin', { getOrgId }), controller.getMetrics);

module.exports = router;
