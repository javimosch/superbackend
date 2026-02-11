const express = require("express");
const router = express.Router();
const { basicAuth } = require("../middleware/auth");
const adminLlmController = require("../controllers/adminLlm.controller");
const rateLimiter = require("../services/rateLimiter.service");

router.get("/config", basicAuth, adminLlmController.getConfig);
router.get("/providers", basicAuth, adminLlmController.listProviders);
router.post("/config", basicAuth, rateLimiter.limit("llmConfigLimiter"), adminLlmController.saveConfig);
router.get("/openrouter/models", basicAuth, adminLlmController.listOpenRouterModels);
router.post("/prompts/:key/test", basicAuth, rateLimiter.limit("llmConfigLimiter"), adminLlmController.testPrompt);
router.get("/audit", basicAuth, adminLlmController.listAudit);
router.get("/costs", basicAuth, adminLlmController.listCosts);

module.exports = router;
