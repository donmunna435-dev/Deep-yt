require('dotenv').config();

const config = {
  // Telegram Bot
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN,
    adminIds: process.env.ADMIN_USER_IDS 
      ? process.env.ADMIN_USER_IDS.split(',').map(id => parseInt(id.trim())) 
      : [],
    webhook: {
      domain: process.env.WEBHOOK_DOMAIN,
      path: process.env.WEBHOOK_PATH || '/bot-webhook',
      secret: process.env.WEBHOOK_SECRET,
      enabled: process.env.ENABLE_WEBHOOK === 'true'
    }
  },

  // YouTube/Google API
  youtube: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_REDIRECT_URI,
    scopes: [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube',
      'https://www.googleapis.com/auth/userinfo.profile'
    ]
  },

  // Server
  server: {
    port: parseInt(process.env.PORT) || 3000,
    host: '0.0.0.0',
    nodeEnv: process.env.NODE_ENV || 'development',
    isProduction: process.env.NODE_ENV === 'production'
  },

  // File handling
  files: {
    maxSize: parseInt(process.env.MAX_FILE_SIZE) || 50 * 1024 * 1024, // 50MB
    tempDir: './temp',
    uploadsDir: './uploads',
    allowedTypes: [
      'video/mp4',
      'video/x-matroska',
      'video/avi',
      'video/quicktime',
      'video/x-ms-wmv',
      'video/webm',
      'video/x-flv'
    ],
    allowedExtensions: ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm']
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    enableFileLogging: process.env.ENABLE_FILE_LOGGING === 'true'
  }
};

// Validate required configurations
const requiredEnvVars = [
  'TELEGRAM_BOT_TOKEN',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REDIRECT_URI'
];

requiredEnvVars.forEach(envVar => {
  if (!process.env[envVar]) {
    console.warn(`⚠️ Warning: ${envVar} is not set in environment variables`);
  }
});

module.exports = config;