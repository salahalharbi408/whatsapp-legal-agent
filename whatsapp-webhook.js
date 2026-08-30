const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(express.json());

// ============================================
// CONFIGURATION - You'll set these as env vars
// ============================================
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const GOOGLE_DRIVE_API_KEY = process.env.GOOGLE_DRIVE_API_KEY; // For later
const FIRM_DB_URL = process.env.FIRM_DB_URL; // Your firm database endpoint

const CLAUDE_MODEL = 'claude-opus-4-8';
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';

// ============================================
// HELPER: Send WhatsApp message back to user
// ============================================
async function sendWhatsAppMessage(to, message, mediaUrl = null) {
  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.create`;
    
    const data = new URLSearchParams();
    data.append('From', `whatsapp:${TWILIO_PHONE_NUMBER}`);
    data.append('To', `whatsapp:${to}`);
    data.append('Body', message);
    
    if (mediaUrl) {
      data.append('MediaUrl', mediaUrl);
    }

    const response = await axios.post(url, data, {
      auth: {
        username: TWILIO_ACCOUNT_SID,
        password: TWILIO_AUTH_TOKEN
      },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    console.log('WhatsApp message sent:', response.data.sid);
    return response.data.sid;
  } catch (error) {
    console.error('Error sending WhatsApp message:', error.response?.data || error.message);
    throw error;
  }
}

// ============================================
// HELPER: Download file from Twilio
// ============================================
async function downloadMediaFromTwilio(mediaUrl) {
  try {
    const response = await axios.get(mediaUrl, {
      auth: {
        username: TWILIO_ACCOUNT_SID,
        password: TWILIO_AUTH_TOKEN
      },
      responseType: 'arraybuffer'
    });

    const fileName = `attachment_${Date.now()}`;
    const filePath = path.join('/tmp', fileName);
    fs.writeFileSync(filePath, response.data);
    
    console.log('File downloaded:', filePath);
    return { filePath, fileData: response.data };
  } catch (error) {
    console.error('Error downloading media:', error.message);
    throw error;
  }
}

// ============================================
// HELPER: Call Claude API
// ============================================
async function callClaudeAPI(userMessage, attachmentData = null, userInstruction = null) {
  try {
    const messages = [
      {
        role: 'user',
        content: userMessage
      }
    ];

    // If there's an attachment, add it to the message context
    if (attachmentData) {
      messages[0].content = [
        {
          type: 'text',
          text: userMessage
        },
        {
          type: 'document',
          source: {
            type: 'base64',
            media_type: 'application/pdf', // Adjust based on file type
            data: attachmentData.toString('base64')
          }
        }
      ];
    }

    const systemPrompt = `You are a legal assistant for ${process.env.FIRM_NAME || 'a law firm'}. 
Your role is to:
1. Analyze contracts, amendments, and legal documents
2. Provide legal research and precedent lookup
3. Draft amendments and legal responses
4. Follow user instructions carefully

When the user asks for a Word document response, generate it in markdown format and clearly state "GENERATE_DOCX: true" at the start.
Keep responses concise but thorough.`;

    const response = await axios.post(CLAUDE_API_URL, {
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      messages: messages
    }, {
      headers: {
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01'
      }
    });

    const textContent = response.data.content.find(c => c.type === 'text');
    return textContent.text;
  } catch (error) {
    console.error('Claude API error:', error.response?.data || error.message);
    throw error;
  }
}

// ============================================
// MAIN WEBHOOK ENDPOINT
// ============================================
app.post('/webhook/whatsapp', async (req, res) => {
  try {
    // Acknowledge receipt immediately
    res.status(200).send('OK');

    const from = req.body.Messages?.[0]?.From?.replace('whatsapp:', '');
    const messageBody = req.body.Messages?.[0]?.Body || '';
    const mediaData = req.body.Messages?.[0]?.Media?.[0]; // If file attached

    console.log(`Message from ${from}: ${messageBody}`);

    if (!from) {
      console.error('No sender found in webhook');
      return;
    }

    // Send "thinking..." message
    await sendWhatsAppMessage(from, '⏳ Processing your message...');

    let attachmentData = null;
    let attachmentInfo = '';

    // Download attachment if present
    if (mediaData?.Url) {
      console.log('Attachment detected, downloading...');
      const downloaded = await downloadMediaFromTwilio(mediaData.Url);
      attachmentData = downloaded.fileData;
      attachmentInfo = `\n📎 File attached: ${mediaData.ContentType}`;
    }

    // Call Claude with message + attachment
    const claudeResponse = await callClaudeAPI(
      messageBody + attachmentInfo,
      attachmentData,
      messageBody
    );

    // Check if Claude is requesting a Word document
    let responseMessage = claudeResponse;
    let generateDocx = false;

    if (claudeResponse.includes('GENERATE_DOCX: true')) {
      generateDocx = true;
      responseMessage = claudeResponse.replace('GENERATE_DOCX: true', '').trim();
    }

    // For now, send text response
    // (We'll add Word doc generation in Step 2)
    if (generateDocx) {
      await sendWhatsAppMessage(
        from,
        `📄 Word document generation requested.\n\n${responseMessage}\n\n(Coming in Step 2: Word doc will be generated and sent here)`
      );
    } else {
      await sendWhatsAppMessage(from, responseMessage);
    }

  } catch (error) {
    console.error('Webhook error:', error);
    // Send error message to user
    try {
      const from = req.body.Messages?.[0]?.From?.replace('whatsapp:', '');
      if (from) {
        await sendWhatsAppMessage(from, '❌ Error processing your message. Please try again.');
      }
    } catch (innerError) {
      console.error('Could not send error message:', innerError);
    }
  }
});

// ============================================
// HEALTH CHECK ENDPOINT
// ============================================
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// ============================================
// START SERVER
// ============================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n✅ WhatsApp Agent webhook running on port ${PORT}`);
  console.log(`📱 Webhook URL: http://localhost:${PORT}/webhook/whatsapp`);
  console.log(`❤️  Health check: http://localhost:${PORT}/health\n`);
});
