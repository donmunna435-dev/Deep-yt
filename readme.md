# YouTube Telegram Uploader Bot

A Telegram bot that allows you to upload videos to YouTube directly from Telegram.

## Features

- 📤 Upload videos to YouTube from Telegram
- 🔗 Support for Google Drive links and direct URLs
- 🔐 Secure OAuth 2.0 authentication
- 🎬 Multiple video format support (MP4, MKV, AVI, MOV, WMV)
- 🔒 Privacy settings (Private, Unlisted, Public)
- 📝 Custom titles, descriptions, and tags
- 📊 Real-time upload progress

## Prerequisites

1. **Telegram Bot Token** - Get from [@BotFather](https://t.me/BotFather)
2. **Google API Credentials** - Get from [Google Cloud Console](https://console.cloud.google.com)
3. **Node.js** v16 or higher
4. **npm** or **yarn**

## Quick Deployment

### Option 1: Deploy on Render.com (Recommended)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

1. Fork this repository
2. Create a new Web Service on Render.com
3. Connect your GitHub repository
4. Add environment variables (see below)
5. Deploy!

### Option 2: Deploy on Heroku

[![Deploy to Heroku](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy)

### Option 3: Local Deployment

```bash
# Clone the repository
git clone https://github.com/yourusername/youtube-telegram-bot.git
cd youtube-telegram-bot

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Edit .env with your credentials
nano .env

# Start the bot
npm start