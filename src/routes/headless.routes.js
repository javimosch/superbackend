const express = require('express');
const router = express.Router();

const headlessCrudController = require('../controllers/headlessCrud.controller');
const { headlessApiTokenAuth, requireHeadlessPermission } = require('../middleware/headlessApiTokenAuth');

router.use(headlessApiTokenAuth());

router.get('/:modelCode', requireHeadlessPermission(), headlessCrudController.list);
router.post('/:modelCode', requireHeadlessPermission(), headlessCrudController.create);
router.get('/:modelCode/:id', requireHeadlessPermission(), headlessCrudController.get);
router.put('/:modelCode/:id', requireHeadlessPermission(), headlessCrudController.update);
router.delete('/:modelCode/:id', requireHeadlessPermission(), headlessCrudController.remove);

module.exports = router;
