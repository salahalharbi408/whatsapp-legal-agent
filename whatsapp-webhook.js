const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { Document, Packer, Paragraph, HeadingLevel } = require('docx');
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

async function sendWhatsAppMessage(to, message, mediaUrl = null) {
  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.create`;
    
    const data = new URLSearchParams();
    data.append('From', `whatsapp:${TWILIO_PHONE_NUMBER}`);
    data.append('To', to);
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

    console.log('✅ Sent to', to);
    return response.data.sid;
  } catch (error) {
    console.error('❌ Send failed:', error.response?.status, error.response?.data || error.message);
    throw error;
  }
}

async function callClaudeAPI(userMessage) {
  try {
    console.log('🤖 Calling Claude...');
    
    const response = await axios.post(CLAUDE_API_URL, {
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      system: 'You are a helpful legal assistant for Saudi law and business agreements. Generate professional, detailed legal documents when requested. Keep responses concise and friendly.',
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
    throw new Error('Claude API error: ' + (error.response?.data?.error?.message || error.message));
  }
}

async function generateWordDocument(title, content) {
  try {
    console.log('📝 Generating Word document...');
    
    // Split content into paragraphs
    const paragraphs = content.split('\n').filter(p => p.trim()).map(text => 
      new Paragraph({
        text: text,
        spacing: { line: 360, after: 200 }
      })
    );

    const doc = new Document({
      sections: [{
        children: [
          new Paragraph({
            text: title,
            heading: HeadingLevel.HEADING_1,
            spacing: { after: 400 }
          }),
          ...paragraphs
        ]
      }]
    });

    const fileName = `document_${Date.now()}.docx`;
    const filePath = path.join('/tmp', fileName);

    const buffer = await Packer.toBuffer(doc);
    fs.writeFileSync(filePath, buffer);
    
    console.log('✅ Word document generated:', filePath);
    return filePath;
  } catch (error) {
    console.error('❌ Document generation failed:', error.message);
    throw error;
  }
}

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK' });
});

app.post('/webhook/whatsapp', async (req, res) => {
  try {
    // Acknowledge immediately
    res.status(200).send('OK');

    let from = req.body.From;
    const body = req.body.Body;

    console.log('\n📨 Received:', { from, body });

    if (!from || !body) {
      console.log('⚠️  Missing data');
      return;
    }

    if (from.includes('whatsapp:')) {
      from = from.replace('whatsapp:', '');
    }

    console.log(`📱 From: ${from}, Message: "${body.substring(0, 50)}..."`);

    // Send thinking message
    await sendWhatsAppMessage(`whatsapp:${from}`, '⏳ Processing your request...');

    // Call Claude
    const claudeResponse = await callClaudeAPI(body);

    // Check if user asked for Word document
    const wantDocument = body.toLowerCase().includes('word') || 
                         body.toLowerCase().includes('docx') || 
                         body.toLowerCase().includes('document');

    if (wantDocument) {
      console.log('📄 User requested Word document');
      
      try {
        // Extract title from message
        const titleMatch = body.match(/^(.{1,100}?)[\.\,\n]/);
        const docTitle = titleMatch ? titleMatch[1] : 'Legal Document';
        
        // Generate Word document
        const docPath = await generateWordDocument(docTitle, claudeResponse);
        const fileSize = fs.statSync(docPath).size;
        
        console.log(`📦 Document size: ${fileSize} bytes`);

        // For now, send a message with instructions since we can't directly upload to WhatsApp
        // In production, you'd upload to Google Drive and send a link
        await sendWhatsAppMessage(
          `whatsapp:${from}`, 
          `✅ Document generated!\n\nYour Word document is ready (${Math.round(fileSize/1024)}KB).\n\nFor Step 3, we'll connect Google Drive to auto-upload documents. Reply with "next" to continue setup.`
        );

        // Store file path for potential later upload
        console.log('📄 Document ready:', docPath);
      } catch (docError) {
        console.error('❌ Document generation failed:', docError.message);
        await sendWhatsAppMessage(
          `whatsapp:${from}`, 
          `Document generation in progress. Please try again in a moment.`
        );
      }
    } else {
      // Send text response
      await sendWhatsAppMessage(`whatsapp:${from}`, claudeResponse);
    }

    console.log('✅ Response processed\n');

  } catch (error) {
    console.error('❌ Webhook error:', error.message);
    try {
      const from = req.body.From?.replace('whatsapp:', '');
      if (from) {
        await sendWhatsAppMessage(`whatsapp:${from}`, 'Sorry, I encountered an error. Please try again.');
      }
    } catch (innerError) {
      console.error('❌ Error sending fallback message:', innerError.message);
    }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ WhatsApp Agent running on port ${PORT}\n`);
});
