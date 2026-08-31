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

console.log('🚀 Starting WhatsApp Agent');
console.log('TWILIO_ACCOUNT_SID:', TWILIO_ACCOUNT_SID ? '✅ SET' : '❌ MISSING');
console.log('CLAUDE_API_KEY:', CLAUDE_API_KEY ? '✅ SET' : '❌ MISSING');
console.log('TWILIO_PHONE_NUMBER:', TWILIO_PHONE_NUMBER);

async function sendWhatsAppMessage(to, message) {
  try {
    console.log(`📤 Sending to ${to}: "${message.substring(0, 50)}..."`);
    
    const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.create`;
    
    const data = new URLSearchParams();
    data.append('From', `whatsapp:${TWILIO_PHONE_NUMBER}`);
    data.append('To', to);
    data.append('Body', message);

    const response = await axios.post(url, data, {
      auth: { username: TWILIO_ACCOUNT_SID, password: TWILIO_AUTH_TOKEN },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    console.log(`✅ Message sent: ${response.data.sid}`);
    return response.data.sid;
  } catch (error) {
    console.error('❌ SEND ERROR:', error.response?.status, error.response?.data?.message || error.message);
    throw error;
  }
}

async function callClaudeAPI(userMessage) {
  try {
    console.log('🤖 Calling Claude API...');
    
    const payload = {
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      system: 'You are a professional legal assistant for Saudi Arabia. Provide detailed, accurate legal documents and advice.',
      messages: [{ role: 'user', content: userMessage }]
    };

    console.log('📡 Request to Claude:', CLAUDE_MODEL);
    
    const response = await axios.post(CLAUDE_API_URL, payload, {
      headers: {
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      timeout: 30000
    });

    const textContent = response.data.content.find(c => c.type === 'text');
    console.log(`✅ Claude responded: ${textContent.text.substring(0, 50)}...`);
    return textContent.text;
  } catch (error) {
    console.error('❌ CLAUDE ERROR:', error.response?.status, error.response?.data || error.message);
    throw new Error(`Claude API failed: ${error.response?.data?.error?.message || error.message}`);
  }
}

app.get('/health', (req, res) => {
  console.log('💚 Health check');
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.post('/webhook/whatsapp', async (req, res) => {
  console.log('\n' + '='.repeat(60));
  console.log('📨 WEBHOOK RECEIVED');
  console.log('='.repeat(60));
  
  res.status(200).send('OK');

  try {
    let from = req.body.From;
    const body = req.body.Body;

    console.log(`From: ${from}`);
    console.log(`Message: "${body}"`);

    if (!from || !body) {
      console.error('❌ Missing From or Body in request');
      return;
    }

    if (from.includes('whatsapp:')) {
      from = from.replace('whatsapp:', '');
    }

    const toNumber = `whatsapp:${from}`;
    console.log(`🎯 Target: ${toNumber}`);

    // Send thinking
    await sendWhatsAppMessage(toNumber, '⏳ Processing your request...');

    // Call Claude
    const claudeResponse = await callClaudeAPI(body);
    console.log(`📄 Response length: ${claudeResponse.length} chars`);

    // Check if document requested
    const wantDoc = body.toLowerCase().includes('document') || 
                    body.toLowerCase().includes('word') || 
                    body.toLowerCase().includes('docx');
    
    if (wantDoc) {
      console.log('📋 Document mode: splitting long response');
      
      const maxLength = 4090;
      if (claudeResponse.length > maxLength) {
        let offset = 0;
        while (offset < claudeResponse.length) {
          const chunk = claudeResponse.substring(offset, offset + maxLength);
          await sendWhatsAppMessage(toNumber, chunk);
          offset += maxLength;
        }
        await sendWhatsAppMessage(toNumber, '✅ Document complete! (Will auto-save to Drive in Step 3)');
      } else {
        await sendWhatsAppMessage(toNumber, claudeResponse);
        await sendWhatsAppMessage(toNumber, '✅ Document generated! (Will auto-save to Drive in Step 3)');
      }
    } else {
      console.log('💬 Text mode: sending response');
      
      const maxLength = 4090;
      if (claudeResponse.length > maxLength) {
        let offset = 0;
        while (offset < claudeResponse.length) {
          const chunk = claudeResponse.substring(offset, offset + maxLength);
          await sendWhatsAppMessage(toNumber, chunk);
          offset += maxLength;
        }
      } else {
        await sendWhatsAppMessage(toNumber, claudeResponse);
      }
    }

    console.log('✅ WEBHOOK COMPLETE');
    console.log('='.repeat(60) + '\n');

  } catch (error) {
    console.error('❌ WEBHOOK ERROR:', error.message);
    console.error('Stack:', error.stack);
    
    try {
      const from = req.body.From?.replace('whatsapp:', '');
      if (from) {
        await sendWhatsAppMessage(`whatsapp:${from}`, `❌ Error: ${error.message.substring(0, 100)}`);
      }
    } catch (e) {
      console.error('Could not send error message:', e.message);
    }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n✅ Server running on port ${PORT}`);
  console.log(`📱 Webhook: /webhook/whatsapp`);
  console.log(`❤️  Health: /health\n`);
});
