const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;

// Most basic model - works on all tiers
const CLAUDE_MODEL = 'claude-3-haiku-20240307';
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

console.log('🚀 Telegram Legal Agent');
console.log('Model:', CLAUDE_MODEL);

async function sendTelegramMessage(chatId, message) {
  try {
    await axios.post(`${TELEGRAM_API}/sendMessage`, {
      chat_id: chatId,
      text: message
    });
  } catch (error) {
    console.error('Send failed:', error.message);
    throw error;
  }
}

async function callClaudeAPI(message) {
  try {
    const response = await axios.post(CLAUDE_API_URL, {
      model: CLAUDE_MODEL,
      max_tokens: 1024,
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

    return response.data.content[0].text;
  } catch (error) {
    throw error;
  }
}

app.get('/health', (req, res) => res.json({ ok: true }));

app.post('/webhook', async (req, res) => {
  res.status(200).json({ ok: true });

  try {
    const message = req.body.message;
    if (!message || !message.text) return;

    const chatId = message.chat.id;
    const userMessage = message.text;

    console.log(`📱 ${chatId}: ${userMessage}`);

    await sendTelegramMessage(chatId, 'Processing...');
    const response = await callClaudeAPI(userMessage);

    const maxLength = 4096;
    if (response.length > maxLength) {
      let i = 0;
      while (i < response.length) {
        await sendTelegramMessage(chatId, response.substring(i, i + maxLength));
        i += maxLength;
      }
    } else {
      await sendTelegramMessage(chatId, response);
    }

    console.log('✅ Done\n');
  } catch (error) {
    console.error('Error:', error.message);
    try {
      const chatId = req.body.message?.chat?.id;
      if (chatId) {
        await sendTelegramMessage(chatId, 'Error processing message.');
      }
    } catch (e) {}
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Ready on ${PORT}`));
