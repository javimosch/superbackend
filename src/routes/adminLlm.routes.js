const express = require("express");
const router = express.Router();
const { adminSessionAuth } = require("../middleware/auth");
const adminLlmController = require("../controllers/adminLlm.controller");
const rateLimiter = require("../services/rateLimiter.service");

router.get("/config", adminSessionAuth, adminLlmController.getConfig);
router.get("/providers", adminSessionAuth, adminLlmController.listProviders);
router.post("/config", adminSessionAuth, rateLimiter.limit("llmConfigLimiter"), adminLlmController.saveConfig);
router.get("/openrouter/models", adminSessionAuth, adminLlmController.listOpenRouterModels);
router.post("/prompts/:key/test", adminSessionAuth, rateLimiter.limit("llmConfigLimiter"), adminLlmController.testPrompt);
router.get("/audit", adminSessionAuth, adminLlmController.listAudit);
router.get("/costs", adminSessionAuth, adminLlmController.listCosts);

module.exports = router;
