# WhatsApp Legal Agent

AI-powered WhatsApp bot for legal document analysis and contract review, powered by Claude API.

## Features

- 📱 Receive WhatsApp messages with attachments
- 🤖 Claude AI analyzes contracts and legal documents
- 📄 Generate Word documents on demand
- 🔍 Legal research and precedent lookup
- ⚡ Real-time responses

## Setup

1. Add your `CLAUDE_API_KEY` to environment variables
2. Deploy to Render or your hosting platform
3. Connect webhook URL to Twilio WhatsApp sandbox

## Environment Variables

```
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=+14155238886
CLAUDE_API_KEY=sk-ant-your-key-here
FIRM_NAME=Your Law Firm
PORT=3000
NODE_ENV=production
```

## Running Locally

```bash
npm install
npm start
```

## Deployment

Deploy to Render:
1. Connect GitHub repository
2. Add environment variables
3. Deploy

Webhook URL: `https://your-app.onrender.com/webhook/whatsapp`

## Next Steps

- [ ] Add Word document generation
- [ ] Connect Google Drive integration
- [ ] Add firm database context
- [ ] Build legal research workflows
