const fs = require('fs');
const path = require('path');
const SupportTicket = require('../model/support.model');

const FALLBACK_FILE = path.join(__dirname, '../.support_tickets.json');

function saveToFallbackFile(ticket) {
  try {
    let list = [];
    if (fs.existsSync(FALLBACK_FILE)) {
      list = JSON.parse(fs.readFileSync(FALLBACK_FILE, 'utf8') || '[]');
    }
    list.push(ticket);
    fs.writeFileSync(FALLBACK_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch (err) {
    console.warn('Fallback support file save error:', err.message);
  }
}

exports.submitSupportMessage = async (req, res) => {
  try {
    const { name, email, topic, message } = req.body;

    if (!email || !message) {
      return res.status(400).json({
        success: false,
        message: 'Email address and message details are required.'
      });
    }

    const ticketId = 'YTA-' + Math.floor(100000 + Math.random() * 900000);
    const targetEmail = 'dallardyta@gmail.com';

    const ticketData = {
      ticketId,
      name: name || 'Creator',
      email: email.trim().toLowerCase(),
      targetEmail,
      topic: topic || 'General Support Inquiry',
      message: message.trim(),
      status: 'open',
      createdAt: new Date().toISOString()
    };

    // Save fallback file
    saveToFallbackFile(ticketData);

    // Save to MongoDB if connected
    try {
      const ticketDoc = new SupportTicket({
        ticketId,
        name: ticketData.name,
        email: ticketData.email,
        targetEmail,
        topic: ticketData.topic,
        message: ticketData.message,
        status: 'open'
      });
      await ticketDoc.save();
    } catch (dbErr) {
      console.warn('Could not save support ticket to MongoDB directly, preserved in local queue:', dbErr.message);
    }

    console.log(`📩 [SUPPORT TICKET] #${ticketId} received from ${ticketData.email} (${ticketData.name}) for ${targetEmail}`);

    return res.status(201).json({
      success: true,
      ticketId,
      targetEmail,
      message: `Message submitted successfully to ${targetEmail}. We will review and reply to ${email} promptly!`
    });
  } catch (error) {
    console.error('Support submission error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to submit support message. Please contact dallardyta@gmail.com directly.'
    });
  }
};
