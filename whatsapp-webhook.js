const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// ============================================
// CONFIGURATION
// ============================================
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;

const CLAUDE_MODEL = 'claude-opus-4-8';
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';

console.log('✅ Server starting...');
console.log('TWILIO_ACCOUNT_SID:', TWILIO_ACCOUNT_SID ? 'SET' : 'MISSING');
console.log('TWILIO_AUTH_TOKEN:', TWILIO_AUTH_TOKEN ? 'SET' : 'MISSING');
console.log('TWILIO_PHONE_NUMBER:', TWILIO_PHONE_NUMBER);
console.log('CLAUDE_API_KEY:', CLAUDE_API_KEY ? 'SET' : 'MISSING');

// ============================================
// HELPER: Send WhatsApp message back to user
// ============================================
async function sendWhatsAppMessage(to, message) {
  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.create`;
    
    const data = new URLSearchParams();
    data.append('From', `whatsapp:${TWILIO_PHONE_NUMBER}`);
    data.append('To', `whatsapp:${to}`);
    data.append('Body', message);

    const response = await axios.post(url, data, {
      auth: {
        username: TWILIO_ACCOUNT_SID,
        password: TWILIO_AUTH_TOKEN
      },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    console.log('✅ WhatsApp message sent:', response.data.sid);
    return response.data.sid;
  } catch (error) {
    console.error('❌ Error sending WhatsApp message:', error.response?.data || error.message);
    throw error;
  }
}

// ============================================
// HELPER: Call Claude API
// ============================================
async function callClaudeAPI(userMessage) {
  try {
    console.log('📞 Calling Claude API with message:', userMessage.substring(0, 50) + '...');

    const response = await axios.post(CLAUDE_API_URL, {
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      system: 'You are a helpful legal assistant. Keep responses concise and friendly.',
      messages: [
        {
          role: 'user',
          content: userMessage
        }
      ]
    }, {
      headers: {
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01'
      }
    });

    const textContent = response.data.content.find(c => c.type === 'text');
    console.log('✅ Claude responded');
    return textContent.text;
  } catch (error) {
    console.error('❌ Claude API error:', error.response?.data || error.message);
    throw error;
  }
}

// ============================================
// HEALTH CHECK ENDPOINT
// ============================================
app.get('/health', (req, res) => {
  console.log('💚 Health check ping');
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// ============================================
// MAIN WEBHOOK ENDPOINT
// ============================================
app.post('/webhook/whatsapp', async (req, res) => {
  try {
    console.log('\n📨 Webhook received!');
    console.log('Body:', JSON.stringify(req.body, null, 2));

    // Acknowledge immediately so Twilio knows we got it
    res.status(200).send('OK');

    // Extract message data - Twilio sends form data
    const from = req.body.From?.replace('whatsapp:', '') || req.body.from;
    const messageBody = req.body.Body || req.body.body || '';

    console.log(`📱 Message from ${from}: ${messageBody}`);

    if (!from || !messageBody) {
      console.log('⚠️  Missing from or body:', { from, messageBody });
      return;
    }

    // Send thinking message
    await sendWhatsAppMessage(from, '⏳ Processing your message...');

    // Call Claude
    const claudeResponse = await callClaudeAPI(messageBody);

    // Send response
    await sendWhatsAppMessage(from, claudeResponse);
    console.log('✅ Response sent successfully\n');

  } catch (error) {
    console.error('❌ Webhook error:', error.message);
    try {
      const from = req.body.From?.replace('whatsapp:', '') || req.body.from;
      if (from) {
        await sendWhatsAppMessage(from, '❌ Error processing your message. Please try again.');
      }
    } catch (innerError) {
      console.error('❌ Could not send error message:', innerError.message);
    }
  }
});

// ============================================
// CATCH-ALL LOGGING
// ============================================
app.use((req, res) => {
  console.log(`⚠️  Unknown route: ${req.method} ${req.path}`);
  res.status(404).json({ error: 'Not found' });
});

// ============================================
// START SERVER
// ============================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n✅ WhatsApp Agent webhook running on port ${PORT}`);
  console.log(`📱 Webhook URL: https://whatsapp-legal-agent-tyc6.onrender.com/webhook/whatsapp`);
  console.log(`❤️  Health check: https://whatsapp-legal-agent-tyc6.onrender.com/health\n`);
});
