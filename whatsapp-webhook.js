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

// Current valid Claude model
const CLAUDE_MODEL = 'claude-sonnet-5';
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';

console.log('🚀 Starting - Model:', CLAUDE_MODEL);

async function sendWhatsAppMessage(to, message) {
  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.create`;
    
    const data = new URLSearchParams();
    data.append('From', `whatsapp:${TWILIO_PHONE_NUMBER}`);
    data.append('To', to);
    data.append('Body', message);

    await axios.post(url, data, {
      auth: { username: TWILIO_ACCOUNT_SID, password: TWILIO_AUTH_TOKEN },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    console.log('✅ WhatsApp sent');
  } catch (error) {
    console.error('❌ WhatsApp error:', error.message);
    throw error;
  }
}

async function callClaudeAPI(message) {
  try {
    console.log('📞 Calling Claude...');
    
    const response = await axios.post(CLAUDE_API_URL, {
      model: CLAUDE_MODEL,
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: message
      }]
    }, {
      headers: {
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01'
      }
    });

    console.log('✅ Claude OK');
    return response.data.content[0].text;
  } catch (error) {
    console.error('❌ Claude failed:', error.response?.status, error.response?.data?.error?.message);
    throw error;
  }
}

app.get('/health', (req, res) => res.json({ ok: true }));

app.post('/webhook/whatsapp', async (req, res) => {
  res.status(200).send('OK');

  try {
    let from = req.body.From?.replace('whatsapp:', '');
    const body = req.body.Body;

    if (!from || !body) return;

    const to = `whatsapp:${from}`;
    console.log(`\n📱 ${from}: ${body.substring(0, 50)}`);

    await sendWhatsAppMessage(to, '⏳ Processing...');
    const response = await callClaudeAPI(body);

    if (response.length > 4090) {
      let i = 0;
      while (i < response.length) {
        await sendWhatsAppMessage(to, response.substring(i, i + 4090));
        i += 4090;
      }
    } else {
      await sendWhatsAppMessage(to, response);
    }

    console.log('✅ Complete\n');
  } catch (error) {
    console.error('Error:', error.message);
    try {
      const from = req.body.From?.replace('whatsapp:', '');
      if (from) await sendWhatsAppMessage(`whatsapp:${from}`, 'Error. Try again.');
    } catch (e) {}
  }
});

app.listen(3000, () => console.log('Ready\n'));
