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

// Send WhatsApp message
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

    console.log('✅ Sent to', to);
  } catch (error) {
    console.error('❌ Send failed:', error.message);
    throw error;
  }
}

// Call Claude
async function callClaudeAPI(userMessage) {
  try {
    console.log('🤖 Calling Claude...');
    
    const response = await axios.post(CLAUDE_API_URL, {
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      system: 'You are a professional legal assistant for Saudi Arabia. Provide detailed, accurate legal documents and advice. Be concise and professional.',
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
    console.error('❌ Claude error:', error.message);
    throw error;
  }
}

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK' });
});

// Main webhook
app.post('/webhook/whatsapp', async (req, res) => {
  try {
    // Acknowledge immediately
    res.status(200).send('OK');

    let from = req.body.From;
    const body = req.body.Body;

    if (!from || !body) return;

    if (from.includes('whatsapp:')) {
      from = from.replace('whatsapp:', '');
    }

    console.log(`\n📱 Message from ${from}:`);
    console.log(`   "${body.substring(0, 80)}..."`);

    // Send thinking message
    await sendWhatsAppMessage(`whatsapp:${from}`, '⏳ Processing...');

    // Call Claude
    let claudeResponse = await callClaudeAPI(body);

    // Check if document was requested
    const documentRequested = body.toLowerCase().includes('word') || 
                              body.toLowerCase().includes('docx') || 
                              body.toLowerCase().includes('document');

    if (documentRequested) {
      console.log('📄 Document requested');
      
      // Split response into chunks if too long (WhatsApp has message limits)
      const maxLength = 4090;
      if (claudeResponse.length > maxLength) {
        // Send first part
        await sendWhatsAppMessage(`whatsapp:${from}`, claudeResponse.substring(0, maxLength));
        
        // Send remaining parts
        let remaining = claudeResponse.substring(maxLength);
        while (remaining.length > 0) {
          await sendWhatsAppMessage(`whatsapp:${from}`, remaining.substring(0, maxLength));
          remaining = remaining.substring(maxLength);
        }

        // Send final note
        await sendWhatsAppMessage(
          `whatsapp:${from}`, 
          `✅ Document complete!\n\n(In Step 3, documents will auto-save to Google Drive with shareable links)`
        );
      } else {
        // Send complete document
        await sendWhatsAppMessage(`whatsapp:${from}`, claudeResponse);
        await sendWhatsAppMessage(
          `whatsapp:${from}`, 
          `✅ Document generated!\n\n(In Step 3, this will auto-save to Google Drive)`
        );
      }
    } else {
      // Regular text response
      // Split if too long
      const maxLength = 4090;
      if (claudeResponse.length > maxLength) {
        await sendWhatsAppMessage(`whatsapp:${from}`, claudeResponse.substring(0, maxLength));
        let remaining = claudeResponse.substring(maxLength);
        while (remaining.length > 0) {
          await sendWhatsAppMessage(`whatsapp:${from}`, remaining.substring(0, maxLength));
          remaining = remaining.substring(maxLength);
        }
      } else {
        await sendWhatsAppMessage(`whatsapp:${from}`, claudeResponse);
      }
    }

    console.log('✅ Response sent\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    try {
      const from = req.body.From?.replace('whatsapp:', '');
      if (from) {
        await sendWhatsAppMessage(`whatsapp:${from}`, '❌ Error processing request. Please try again.');
      }
    } catch (e) {
      console.error('Could not send error message');
    }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n✅ WhatsApp Legal Agent running on port ${PORT}`);
  console.log(`📱 Ready to receive messages\n`);
});
