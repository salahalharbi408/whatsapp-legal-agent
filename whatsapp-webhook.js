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

// Most basic, proven model
const CLAUDE_MODEL = 'claude-3-sonnet-20240229';
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';

console.log('🚀 Starting');

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

    console.log('✅ Sent');
  } catch (error) {
    console.error('❌ Send error:', error.message);
    throw error;
  }
}

async function callClaudeAPI(message) {
  try {
    console.log('📞 Claude API call...');
    console.log('Model:', CLAUDE_MODEL);
    console.log('Key length:', CLAUDE_API_KEY.length);
    
    const payload = {
      model: CLAUDE_MODEL,
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: message
        }
      ]
    };

    console.log('Payload keys:', Object.keys(payload));

    const response = await axios.post(CLAUDE_API_URL, payload, {
      headers: {
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      timeout: 30000
    });

    console.log('✅ Claude responded');
    return response.data.content[0].text;
  } catch (error) {
    console.error('❌ Claude error:');
    console.error('  Status:', error.response?.status);
    console.error('  Message:', error.response?.data?.error?.message);
    console.error('  Full error:', error.response?.data);
    throw error;
  }
}

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.post('/webhook/whatsapp', async (req, res) => {
  res.status(200).send('OK');

  try {
    let from = req.body.From;
    const body = req.body.Body;

    if (!from || !body) return;

    from = from.replace('whatsapp:', '');
    const to = `whatsapp:${from}`;

    console.log(`\n📱 From ${from}: ${body.substring(0, 40)}`);

    await sendWhatsAppMessage(to, '⏳ One moment...');

    const response = await callClaudeAPI(body);

    // Send response
    if (response.length > 4090) {
      let i = 0;
      while (i < response.length) {
        await sendWhatsAppMessage(to, response.substring(i, i + 4090));
        i += 4090;
      }
    } else {
      await sendWhatsAppMessage(to, response);
    }

    console.log('✅ Done\n');

  } catch (error) {
    console.error('Error:', error.message);
    try {
      const from = req.body.From?.replace('whatsapp:', '');
      if (from) {
        await sendWhatsAppMessage(`whatsapp:${from}`, `Error: ${error.message.substring(0, 80)}`);
      }
    } catch (e) {}
  }
});

app.listen(3000, () => console.log('Running\n'));
