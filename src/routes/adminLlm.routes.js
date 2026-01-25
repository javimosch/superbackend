const express = require("express");
const router = express.Router();
const { basicAuth } = require("../middleware/auth");
const adminLlmController = require("../controllers/adminLlm.controller");

router.get("/config", basicAuth, adminLlmController.getConfig);
router.post("/config", basicAuth, adminLlmController.saveConfig);
router.get("/openrouter/models", basicAuth, adminLlmController.listOpenRouterModels);
router.post("/prompts/:key/test", basicAuth, adminLlmController.testPrompt);
router.get("/audit", basicAuth, adminLlmController.listAudit);
router.get("/costs", basicAuth, adminLlmController.listCosts);

module.exports = router;
