const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const YouTubeUploaderBot = require('./bot');

// Initialize bot
const bot = new YouTubeUploaderBot();

// Create Express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'YouTube Telegram Bot',
    environment: config.server.nodeEnv
  });
});

// Auth callback endpoint for Google OAuth
app.get('/auth/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    
    if (!code || !state) {
      return res.status(400).send('Missing code or state parameter');
    }
    
    // This endpoint is just for receiving the callback
    // The actual handling is done in the bot when user sends the code
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>YouTube Authorization</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          }
          .container {
            background: white;
            padding: 40px;
            border-radius: 10px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
            text-align: center;
            max-width: 500px;
          }
          .success {
            color: #4CAF50;
            font-size: 24px;
            margin-bottom: 20px;
          }
          .code {
            background: #f5f5f5;
            padding: 15px;
            border-radius: 5px;
            margin: 20px 0;
            font-family: monospace;
            word-break: break-all;
          }
          .instructions {
            margin: 20px 0;
            line-height: 1.6;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="success">✅ Authorization Successful!</div>
          <div class="instructions">
            <p>Your authorization code has been received.</p>
            <p><strong>Copy the code below and send it to the Telegram bot:</strong></p>
          </div>
          <div class="code">${code}</div>
          <div class="instructions">
            <p>1. Go back to Telegram</p>
            <p>2. Paste this code in the chat</p>
            <p>3. Your YouTube account will be connected</p>
          </div>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Auth callback error:', error);
    res.status(500).send('Internal server error');
  }
});

// Webhook endpoint for Telegram
if (config.telegram.webhook.enabled) {
  app.post(config.telegram.webhook.path, (req, res) => {
    bot.bot.handleUpdate(req.body, res);
  });
}

// Static files (for auth callback page)
app.use(express.static(path.join(__dirname, 'public')));

// Start server
const PORT = config.server.port;
app.listen(PORT, config.server.host, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 Environment: ${config.server.nodeEnv}`);
  console.log(`🤖 Bot mode: ${config.telegram.webhook.enabled ? 'Webhook' : 'Polling'}`);
  
  // Launch bot
  bot.launch();
});

// Graceful shutdown
process.once('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully...');
  bot.stop();
  process.exit(0);
});

process.once('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...');
  bot.stop();
  process.exit(0);
});

module.exports = app;