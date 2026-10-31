const express = require('express');
const router = express.Router();
const supportController = require('../controller/support.controller');

// POST /api/support - Submit support inquiry to dallardyta@gmail.com
router.post('/', supportController.submitSupportMessage);

module.exports = router;
