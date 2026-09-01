# Telegram Legal Agent

AI-powered Telegram bot for legal document analysis and contract review, powered by Claude API.

## Features

- 💬 Receive messages on Telegram
- 🤖 Claude AI analyzes contracts and legal documents
- 📄 Generate legal documents and advice
- 🔍 Legal research and precedent lookup
- ⚡ Real-time responses

## Quick Setup

1. Create bot with @BotFather on Telegram - copy the TOKEN
2. Get Claude API key from https://console.anthropic.com/account/keys
3. Deploy to Render with these env variables:
   - TELEGRAM_BOT_TOKEN=your_token
   - CLAUDE_API_KEY=your_key
4. Register webhook in browser: https://api.telegram.org/botTOKEN/setWebhook?url=https://your-render-url/webhook
5. Send a message to your bot - it works!

## Environment Variables

TELEGRAM_BOT_TOKEN - Your Telegram bot token from BotFather
CLAUDE_API_KEY - Your Claude API key
PORT - 3000
NODE_ENV - production

## How It Works

Message → Telegram → Webhook → Claude API → Response back to Telegram

## Support

Check Render logs if something fails
