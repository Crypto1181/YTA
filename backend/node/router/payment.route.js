const express = require('express');
const router = express.Router();
const paymentController = require('../controller/payment.controller');

// Payment gateway configuration
router.get('/config', paymentController.getConfig);

// Create Bachs hosted checkout session
router.post('/create-checkout', paymentController.createCheckoutSession);

// Verify checkout session
router.get('/verify-session/:checkoutId', paymentController.verifySession);

// Bachs Webhook notification
router.post('/webhook', paymentController.handleWebhook);

module.exports = router;
