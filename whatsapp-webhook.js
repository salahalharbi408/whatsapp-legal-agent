const express = require('express');
const axios = require('axios');
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
console.log('TWILIO_PHONE_NUMBER:', TWILIO_PHONE_NUMBER);

// ============================================
// HELPER: Send WhatsApp message
// ============================================
async function sendWhatsAppMessage(to, message) {
  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.create`;
    
    const data = new URLSearchParams();
    data.append('From', `whatsapp:${TWILIO_PHONE_NUMBER}`);
    data.append('To', to);
    data.append('Body', message);

    const response = await axios.post(url, data, {
      auth: {
        username: TWILIO_ACCOUNT_SID,
        password: TWILIO_AUTH_TOKEN
      },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    console.log('✅ Message sent:', response.data.sid);
    return response.data.sid;
  } catch (error) {
    console.error('❌ Send error:', error.response?.data || error.message);
  }
}

// ============================================
// HELPER: Call Claude API
// ============================================
async function callClaudeAPI(userMessage) {
  try {
    const response = await axios.post(CLAUDE_API_URL, {
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      system: 'You are a helpful legal assistant. Keep responses concise and friendly. Respond in plain text.',
      messages: [{ role: 'user', content: userMessage }]
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
    console.error('❌ Claude error:', error.response?.data || error.message);
    return 'Sorry, I had an error processing your message.';
  }
}

// ============================================
// HEALTH CHECK
// ============================================
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK' });
});

// ============================================
// WEBHOOK ENDPOINT
// ============================================
app.post('/webhook/whatsapp', async (req, res) => {
  try {
    // Log raw body for debugging
    console.log('\n📨 Webhook received!');
    console.log('Raw body:', req.body);

    // Acknowledge immediately
    res.status(200).send('OK');

    // Extract fields - Twilio sends as form data
    let from = req.body.From;
    const body = req.body.Body;

    console.log('Extracted - From:', from, 'Body:', body);

    if (!from || !body) {
      console.log('❌ Missing fields - From:', from, 'Body:', body);
      return;
    }

    // Remove whatsapp: prefix if present
    if (from.includes('whatsapp:')) {
      from = from.replace('whatsapp:', '');
    }

    console.log(`📱 Message from ${from}: "${body}"`);

    // Send thinking message
    await sendWhatsAppMessage(`whatsapp:${from}`, '⏳ Thinking...');

    // Get Claude response
    const claudeResponse = await callClaudeAPI(body);

    // Send response back
    await sendWhatsAppMessage(`whatsapp:${from}`, claudeResponse);
    console.log('✅ Response sent\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
});

// ============================================
// START
// ============================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n✅ WhatsApp Agent running on port ${PORT}`);
  console.log(`📱 Webhook: https://whatsapp-legal-agent-tyc6.onrender.com/webhook/whatsapp\n`);
});
