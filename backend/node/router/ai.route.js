const express = require('express');
const router = express.Router();
const aiController = require('../controller/ai.controller');

// AI Routes
router.post('/analyze-channel', aiController.analyzeChannel);
router.post('/niche-intelligence', aiController.getNicheDetails);

module.exports = router;
