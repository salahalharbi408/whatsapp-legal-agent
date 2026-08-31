const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;

const CLAUDE_MODEL = 'claude-opus-4-8';
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';

async function sendWhatsAppMessage(to, message) {
  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.create`;
    
    const data = new URLSearchParams();
    data.append('From', `whatsapp:${TWILIO_PHONE_NUMBER}`);
    data.append('To', to);
    data.append('Body', message);

    await axios.post(url, data, {
      auth: {
        username: TWILIO_ACCOUNT_SID,
        password: TWILIO_AUTH_TOKEN
      },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    console.log('✅ Sent to', to);
  } catch (error) {
    console.error('❌ Send failed:', error.message);
  }
}

async function callClaudeAPI(userMessage) {
  try {
    console.log('🤖 Calling Claude...');
    
    const response = await axios.post(CLAUDE_API_URL, {
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      system: 'You are a helpful legal assistant. Keep responses concise and friendly.',
      messages: [{ role: 'user', content: userMessage }]
    }, {
      headers: {
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      }
    });

    const textContent = response.data.content.find(c => c.type === 'text');
    console.log('✅ Claude responded');
    return textContent.text;
  } catch (error) {
    console.error('❌ Claude failed:', error.response?.status, error.response?.data || error.message);
    return 'I had an error. Please try again.';
  }
}

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK' });
});

app.post('/webhook/whatsapp', async (req, res) => {
  try {
    res.status(200).send('OK');

    let from = req.body.From;
    const body = req.body.Body;

    console.log('\n📨 Received:', { from, body });

    if (!from || !body) {
      console.log('⚠️ Missing data');
      return;
    }

    if (from.includes('whatsapp:')) {
      from = from.replace('whatsapp:', '');
    }

    console.log(`📱 From: ${from}, Message: "${body}"`);

    await sendWhatsAppMessage(`whatsapp:${from}`, '⏳ Processing...');

    const claudeResponse = await callClaudeAPI(body);

    await sendWhatsAppMessage(`whatsapp:${from}`, claudeResponse);

  } catch (error) {
    console.error('❌ Webhook error:', error.message);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ WhatsApp Agent running on port ${PORT}\n`);
});
