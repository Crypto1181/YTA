/**
 * YTA - Bachs Payment Gateway Controller (https://docs.bachs.io)
 * Integrates official Bachs Checkout Sessions, Webhooks & multi-currency processing
 */

const User = require('../model/user.model');

const BACHS_API_KEY = process.env.BACHS_API_KEY || '';
const BACHS_BASE_URL = process.env.BACHS_API_URL || 'https://api.bachs.io/v1';

// Supported Bachs Currencies
const SUPPORTED_CURRENCIES = ['USD', 'NGN', 'KES', 'GHS', 'ZMW', 'UGX', 'TZS', 'RWF', 'XOF', 'XAF', 'MWK'];

/**
 * Get Supported Currencies & Bachs Config
 * GET /api/payment/config
 */
exports.getConfig = (req, res) => {
  res.json({
    gateway: 'Bachs',
    defaultCurrency: 'USD',
    supportedCurrencies: SUPPORTED_CURRENCIES,
    documentation: 'https://docs.bachs.io'
  });
};

/**
 * Create Bachs Hosted Checkout Session
 * POST /api/payment/create-checkout
 * Body: { itemId, itemName, itemType, amount, currency, email, name, channelName, returnUrl }
 */
exports.createCheckoutSession = async (req, res) => {
  try {
    if (!BACHS_API_KEY) {
      return res.status(503).json({
        success: false,
        message: 'Payment gateway is not configured (missing BACHS_API_KEY).'
      });
    }

    const { itemId, itemName, itemType, amount, currency, email, name, channelName, returnUrl } = req.body;

    const selectedCurrency = currency && SUPPORTED_CURRENCIES.includes(currency.toUpperCase())
      ? currency.toUpperCase()
      : 'USD';

    const formattedAmount = Number(amount || 49).toFixed(2);

    // Dynamically resolve website URL so redirect works in local dev, Vercel, or custom domains
    let siteBaseUrl = returnUrl 
      || req.headers.origin 
      || (req.headers.referer ? new URL(req.headers.referer).origin : null)
      || process.env.APP_PUBLIC_URL 
      || 'http://localhost:3000';

    siteBaseUrl = siteBaseUrl.replace(/\/+$/, '');

    const success_url = `${siteBaseUrl}/?payment=success&item=${encodeURIComponent(itemName || 'YTA')}&amount=${formattedAmount}&currency=${selectedCurrency}`;
    const cancel_url = `${siteBaseUrl}/?payment=cancelled`;

    const payload = {
      pricing: {
        amount: formattedAmount,
        currency: selectedCurrency
      },
      customer: {
        email: email || 'customer@yta.com',
        name: name || channelName || 'YTA Creator'
      },
      metadata: {
        itemId: itemId || 'prod_' + Date.now(),
        itemName: itemName || 'YTA Product',
        itemType: itemType || 'software',
        channelName: channelName || ''
      },
      success_url,
      cancel_url
    };

    const bachsResponse = await fetch(`${BACHS_BASE_URL}/checkout-sessions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${BACHS_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await bachsResponse.json();

    if (!bachsResponse.ok) {
      console.error('Bachs API Error:', data);
      return res.status(bachsResponse.status).json({
        success: false,
        message: data.detail || 'Failed to initialize Bachs checkout session',
        error: data
      });
    }

    // Persist purchase to user's MongoDB record if user email is known
    if (email) {
      try {
        const purchaseRecord = {
          itemId: itemId || 'prod_' + Date.now(),
          itemName: itemName || 'YTA Masterclass / AI Software',
          itemType: itemType || ((itemName && (itemName.toLowerCase().includes('course') || itemName.toLowerCase().includes('mastery') || itemName.toLowerCase().includes('blueprint'))) ? 'course' : 'software'),
          price: Number(formattedAmount),
          currency: selectedCurrency,
          paymentMethod: 'Bachs Hosted Gateway',
          bacsReference: data.checkout_id,
          purchasedAt: new Date()
        };
        await User.findOneAndUpdate(
          { email: email.toLowerCase().trim() },
          { $push: { purchases: purchaseRecord } },
          { new: true }
        );
      } catch (dbErr) {
        console.warn('Could not persist purchase to user document in Mongo:', dbErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Bachs Checkout Session created successfully',
      checkout_id: data.checkout_id,
      checkout_url: data.checkout_url,
      amount: data.amount,
      currency: data.currency
    });
  } catch (error) {
    console.error('Bachs Checkout creation error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error creating checkout session'
    });
  }
};

/**
 * Verify Bachs Payment Session
 * GET /api/payment/verify-session/:checkoutId
 */
exports.verifySession = async (req, res) => {
  try {
    const { checkoutId } = req.params;

    const response = await fetch(`${BACHS_BASE_URL}/checkout-sessions/${checkoutId}`, {
      headers: {
        'Authorization': `Bearer ${BACHS_API_KEY}`
      }
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ success: false, message: data.detail });
    }

    return res.status(200).json({
      success: true,
      session: data
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Bachs Webhook Endpoint
 * POST /api/payment/webhook
 * Handles events: checkout_session.completed, charge.successful
 */
exports.handleWebhook = async (req, res) => {
  try {
    const signature = req.headers['x-bachs-signature-v2'] || req.headers['x-bachs-signature'];
    const event = req.body;

    console.log(`[Bachs Webhook] Received event: ${event.event_type || event.type || 'unknown'}`, {
      signature: signature ? 'present' : 'none',
      data: event.data ? event.data.id : null
    });

    // Handle completed session
    if (event.event_type === 'checkout_session.completed' || event.type === 'checkout_session.completed') {
      const sessionData = event.data || {};
      const customerEmail = sessionData.customer?.email;
      const metadata = sessionData.metadata || {};

      console.log(`[Bachs Webhook] Payment confirmed for ${customerEmail} - Item: ${metadata.itemName}`);
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('[Bachs Webhook] Error:', error);
    return res.status(400).json({ error: error.message });
  }
};
