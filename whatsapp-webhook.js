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

// Updated model name - using proven stable model
const CLAUDE_MODEL = 'claude-3-5-sonnet-20241022';
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';

console.log('🚀 WhatsApp Agent Starting');
console.log('Model:', CLAUDE_MODEL);

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

    console.log('✅ Message sent');
    return true;
  } catch (error) {
    console.error('❌ Send failed:', error.response?.data || error.message);
    throw error;
  }
}

async function callClaudeAPI(userMessage) {
  try {
    console.log('📞 Calling Claude...');
    
    const response = await axios.post(CLAUDE_API_URL, {
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: userMessage
      }]
    }, {
      headers: {
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      }
    });

    const textContent = response.data.content.find(c => c.type === 'text');
    console.log('✅ Claude response received');
    return textContent.text;
  } catch (error) {
    console.error('❌ Claude error:', error.response?.status, error.response?.data?.error?.message || error.message);
    throw error;
  }
}

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK' });
});

app.post('/webhook/whatsapp', async (req, res) => {
  res.status(200).send('OK');

  try {
    let from = req.body.From;
    const body = req.body.Body;

    if (!from || !body) return;

    if (from.includes('whatsapp:')) {
      from = from.replace('whatsapp:', '');
    }

    const toNumber = `whatsapp:${from}`;

    console.log(`\n📱 Message from ${from}: "${body.substring(0, 50)}..."`);

    await sendWhatsAppMessage(toNumber, '⏳ Processing...');

    const response = await callClaudeAPI(body);

    // Check if document requested
    const wantDoc = body.toLowerCase().includes('document') || 
                    body.toLowerCase().includes('word');
    
    if (wantDoc && response.length > 4090) {
      // Split long document
      let offset = 0;
      while (offset < response.length) {
        const chunk = response.substring(offset, offset + 4090);
        await sendWhatsAppMessage(toNumber, chunk);
        offset += 4090;
      }
      await sendWhatsAppMessage(toNumber, '✅ Document complete!');
    } else {
      // Send regular response
      if (response.length > 4090) {
        let offset = 0;
        while (offset < response.length) {
          const chunk = response.substring(offset, offset + 4090);
          await sendWhatsAppMessage(toNumber, chunk);
          offset += 4090;
        }
      } else {
        await sendWhatsAppMessage(toNumber, response);
      }
    }

    console.log('✅ Complete\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    try {
      const from = req.body.From?.replace('whatsapp:', '');
      if (from) {
        await sendWhatsAppMessage(`whatsapp:${from}`, '❌ Error. Try again.');
      }
    } catch (e) {}
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Running on port ${PORT}\n`);
});
