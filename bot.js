const { Telegraf, Markup, session } = require('telegraf');
const config = require('./config');
const FileDownloader = require('./downloader');
const YouTubeUploader = require('./uploader');
const fs = require('fs-extra');
const path = require('path');

class YouTubeUploaderBot {
  constructor() {
    this.bot = new Telegraf(config.telegram.token);
    this.downloader = new FileDownloader();
    this.uploader = new YouTubeUploader();
    this.userSessions = new Map();
    
    this.setupMiddleware();
    this.setupCommands();
    this.setupHandlers();
    this.setupCallbacks();
    
    console.log('🤖 YouTube Uploader Bot initialized');
  }

  setupMiddleware() {
    // Session middleware
    this.bot.use(session({
      defaultSession: () => ({
        step: 'idle',
        videoInfo: {},
        filePath: null,
        authStep: null,
        lastActivity: Date.now()
      })
    }));

    // User authorization middleware
    this.bot.use(async (ctx, next) => {
      const userId = ctx.from.id;
      const username = ctx.from.username || 'Unknown';
      
      console.log(`👤 User: ${username} (${userId}) - Command: ${ctx.message?.text || 'Media'}`);
      
      // Check if user is admin
      const isAdmin = config.telegram.adminIds.includes(userId);
      
      // Initialize user session if not exists
      if (!this.userSessions.has(userId)) {
        this.userSessions.set(userId, {
          step: 'idle',
          videoInfo: {},
          filePath: null,
          authStep: null,
          lastActivity: Date.now(),
          isAdmin: isAdmin
        });
      }
      
      // Update last activity
      const session = this.userSessions.get(userId);
      session.lastActivity = Date.now();
      
      await next();
    });
  }

  setupCommands() {
    // ========== START COMMAND ==========
    this.bot.command('start', async (ctx) => {
      const welcomeMsg = `
🎬 *YouTube Uploader Bot* 🎬

Welcome! I can help you upload videos to YouTube directly from Telegram.

📤 *How to use:*
1. First, authenticate with Google → /auth
2. Send me a video file or link
3. Or use /upload to start the process

🔗 *Supported sources:*
• Video files (up to 50MB)
• Google Drive links
• Direct video URLs

⚡ *Commands:*
/auth - Connect YouTube account
/upload - Upload video
/status - Check upload status
/channel - Your YouTube channel
/logout - Disconnect account
/help - Help guide
/cancel - Cancel operation

📝 *Note:* Videos upload to the YouTube account you authenticate with.
      `;
      
      await ctx.reply(welcomeMsg, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔐 Authenticate', 'start_auth')],
          [Markup.button.callback('📤 Upload Video', 'start_upload')],
          [Markup.button.callback('❓ Help', 'show_help')]
        ])
      });
    });

    // ========== AUTH COMMAND ==========
    this.bot.command('auth', async (ctx) => {
      const userId = ctx.from.id;
      const session = this.userSessions.get(userId);
      
      // Check if already authenticated
      const isAuth = await this.uploader.checkAuth(userId);
      if (isAuth) {
        const channel = await this.uploader.getChannelInfo(userId);
        if (channel) {
          await ctx.reply(
            `✅ *Already Authenticated*\n\n` +
            `📺 *Channel:* ${channel.snippet.title}\n` +
            `👥 *Subscribers:* ${channel.statistics?.subscriberCount || 'N/A'}\n` +
            `🎬 *Videos:* ${channel.statistics?.videoCount || 'N/A'}\n\n` +
            `Use /logout to disconnect.`,
            { parse_mode: 'Markdown' }
          );
        } else {
          await ctx.reply('✅ Already authenticated with YouTube!');
        }
        return;
      }
      
      // Get auth URL
      const authUrl = await this.uploader.getAuthUrl(userId);
      
      const authMsg = `
🔑 *YouTube Authentication Required*

To upload videos, I need access to your YouTube account.

*Steps:*
1. Click the button below
2. Sign in with your Google account
3. Grant the requested permissions
4. You'll get an authorization code
5. Send that code back to me

⚠️ *Important:* 
• Only grant access to accounts you own
• You can revoke access anytime
      `;
      
      await ctx.reply(authMsg, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.url('🔐 Authorize with Google', authUrl)],
          [Markup.button.callback('❌ Cancel', 'cancel_auth')]
        ])
      });
      
      // Set auth step
      session.authStep = 'awaiting_code';
      await ctx.reply('After authorizing, please send me the authorization code you receive:');
    });

    // ========== UPLOAD COMMAND ==========
    this.bot.command('upload', async (ctx) => {
      const userId = ctx.from.id;
      const session = this.userSessions.get(userId);
      
      // Check authentication
      const isAuth = await this.uploader.checkAuth(userId);
      if (!isAuth) {
        return ctx.reply(
          '❌ *Authentication Required*\n\n' +
          'Please authenticate first using /auth command.',
          { parse_mode: 'Markdown' }
        );
      }
      
      const uploadMsg = `
📤 *Upload Video to YouTube*

You can send me:
• A video file (up to 50MB)
• A Google Drive link
• A direct video URL

*Supported formats:* MP4, MKV, AVI, MOV, WMV
*Max size:* 50MB

📝 *Or use the button below for step-by-step upload*
      `;
      
      await ctx.reply(uploadMsg, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('📝 Step-by-step Upload', 'manual_upload')],
          [Markup.button.callback('❌ Cancel', 'cancel')]
        ])
      });
      
      session.step = 'awaiting_video';
    });

    // ========== STATUS COMMAND ==========
    this.bot.command('status', async (ctx) => {
      const userId = ctx.from.id;
      const session = this.userSessions.get(userId) || {};
      
      let statusMsg = `📊 *Current Status*\n\n`;
      
      switch(session.step) {
        case 'idle':
          statusMsg += '✅ Ready for upload';
          break;
        case 'downloading':
          statusMsg += `📥 Downloading: ${session.downloadProgress || 0}%`;
          break;
        case 'uploading':
          statusMsg += `📤 Uploading to YouTube: ${session.uploadProgress || 0}%`;
          break;
        case 'awaiting_title':
          statusMsg += '📝 Waiting for video title';
          break;
        case 'awaiting_description':
          statusMsg += '📝 Waiting for video description';
          break;
        case 'awaiting_privacy':
          statusMsg += '🔒 Waiting for privacy setting';
          break;
        case 'awaiting_tags':
          statusMsg += '🏷️ Waiting for tags';
          break;
        default:
          statusMsg += `Current step: ${session.step || 'idle'}`;
      }
      
      // Add auth status
      const isAuth = await this.uploader.checkAuth(userId);
      statusMsg += `\n🔐 Auth: ${isAuth ? '✅ Connected' : '❌ Not connected'}`;
      
      await ctx.reply(statusMsg, { parse_mode: 'Markdown' });
    });

    // ========== CHANNEL COMMAND ==========
    this.bot.command('channel', async (ctx) => {
      const userId = ctx.from.id;
      
      const isAuth = await this.uploader.checkAuth(userId);
      if (!isAuth) {
        return ctx.reply('❌ Please authenticate first with /auth');
      }
      
      const channel = await this.uploader.getChannelInfo(userId);
      if (!channel) {
        return ctx.reply('❌ Could not fetch channel information');
      }
      
      const channelMsg = `
📺 *Your YouTube Channel*

*Name:* ${channel.snippet.title}
*Subscribers:* ${channel.statistics?.subscriberCount || 'N/A'}
*Videos:* ${channel.statistics?.videoCount || 'N/A'}
*Views:* ${channel.statistics?.viewCount || 'N/A'}

*Description:*
${channel.snippet.description?.substring(0, 300) || 'No description'}...
      `;
      
      await ctx.reply(channelMsg, { parse_mode: 'Markdown' });
    });

    // ========== LOGOUT COMMAND ==========
    this.bot.command('logout', async (ctx) => {
      const userId = ctx.from.id;
      
      const deleted = await this.uploader.deleteTokens(userId);
      this.userSessions.delete(userId);
      
      if (deleted) {
        await ctx.reply('✅ Successfully logged out. Use /auth to authenticate again.');
      } else {
        await ctx.reply('✅ Session cleared. Use /auth to authenticate.');
      }
    });

    // ========== HELP COMMAND ==========
    this.bot.command('help', async (ctx) => {
      const helpMsg = `
🤖 *YouTube Uploader Bot Help*

*Quick Start:*
1. Use /auth to connect YouTube account
2. Send video file or link to bot
3. Follow prompts for video details
4. Wait for upload completion

*Supported Sources:*
• Telegram video files (≤50MB)
• Google Drive shareable links
• Direct video URLs
• Public video links

*Video Requirements:*
• Max size: 50MB
• Formats: MP4, MKV, AVI, MOV, WMV
• Duration: Up to 15 minutes (YouTube limit)

*Privacy Options:*
• Private (only you can see)
• Unlisted (anyone with link)
• Public (everyone can see)

*Need Help?*
Use /cancel to stop any operation
      `;
      
      await ctx.reply(helpMsg, { parse_mode: 'Markdown' });
    });

    // ========== CANCEL COMMAND ==========
    this.bot.command('cancel', async (ctx) => {
      const userId = ctx.from.id;
      const session = this.userSessions.get(userId);
      
      if (session && session.filePath) {
        await this.downloader.cleanup(session.filePath);
      }
      
      this.userSessions.set(userId, {
        step: 'idle',
        videoInfo: {},
        filePath: null,
        authStep: null,
        lastActivity: Date.now(),
        isAdmin: session?.isAdmin || false
      });
      
      await ctx.reply('✅ Operation cancelled.');
    });

    // ========== ADMIN COMMANDS ==========
    this.bot.command('admin', async (ctx) => {
      const userId = ctx.from.id;
      const session = this.userSessions.get(userId);
      
      if (!session?.isAdmin) {
        return ctx.reply('❌ Admin access required');
      }
      
      const users = await this.uploader.getAllUsers();
      const totalUsers = users.length;
      
      const adminMsg = `
👑 *Admin Panel*

*Bot Stats:*
• Total users: ${totalUsers}
• Active sessions: ${this.userSessions.size}
• Storage: Checking...

*Commands:*
/stats - Detailed statistics
/cleanup - Clean temporary files
/broadcast - Send message to all users
      `;
      
      await ctx.reply(adminMsg, { parse_mode: 'Markdown' });
    });
  }

  setupHandlers() {
    // Handle video files
    this.bot.on('video', async (ctx) => {
      await this.handleVideoFile(ctx, ctx.message.video, 'video');
    });

    // Handle documents (video files sent as document)
    this.bot.on('document', async (ctx) => {
      const doc = ctx.message.document;
      
      // Check if it's a video
      if (doc.mime_type && doc.mime_type.startsWith('video/')) {
        await this.handleVideoFile(ctx, doc, 'document');
      } else {
        await ctx.reply('❌ Please send a video file. Supported formats: MP4, MKV, AVI, MOV, WMV');
      }
    });

    // Handle text messages
    this.bot.on('text', async (ctx) => {
      const userId = ctx.from.id;
      const text = ctx.message.text.trim();
      const session = this.userSessions.get(userId);
      
      // Handle auth code
      if (session?.authStep === 'awaiting_code') {
        await this.handleAuthCode(ctx, text, userId);
        return;
      }
      
      // Handle user input based on current step
      switch(session?.step) {
        case 'awaiting_title':
          await this.handleTitle(ctx, text, userId);
          break;
        case 'awaiting_description':
          await this.handleDescription(ctx, text, userId);
          break;
        case 'awaiting_tags':
          await this.handleTags(ctx, text, userId);
          break;
        default:
          // Check if it's a URL
          if (this.isValidUrl(text)) {
            await this.handleUrl(ctx, text, userId);
          } else if (!session || session.step === 'idle') {
            await ctx.reply(
              'Send me a video file or link to upload.\n' +
              'Use /upload to start the process or /help for more info.'
            );
          }
      }
    });
  }

  setupCallbacks() {
    // Start auth callback
    this.bot.action('start_auth', async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.reply('Use /auth command to start authentication.');
    });

    // Start upload callback
    this.bot.action('start_upload', async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.reply('Use /upload command to start upload process.');
    });

    // Show help callback
    this.bot.action('show_help', async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.reply('Use /help command for detailed help guide.');
    });

    // Manual upload
    this.bot.action('manual_upload', async (ctx) => {
      await ctx.answerCbQuery();
      const userId = ctx.from.id;
      
      const isAuth = await this.uploader.checkAuth(userId);
      if (!isAuth) {
        return ctx.reply('❌ Please authenticate first using /auth command.');
      }
      
      this.userSessions.get(userId).step = 'awaiting_video';
      await ctx.editMessageText('Please send me a video file or link to upload:');
    });

    // Cancel auth
    this.bot.action('cancel_auth', async (ctx) => {
      await ctx.answerCbQuery();
      const userId = ctx.from.id;
      const session = this.userSessions.get(userId);
      if (session) session.authStep = null;
      await ctx.editMessageText('Authentication cancelled.');
    });

    // Cancel operation
    this.bot.action('cancel', async (ctx) => {
      await ctx.answerCbQuery();
      const userId = ctx.from.id;
      const session = this.userSessions.get(userId);
      if (session) session.step = 'idle';
      await ctx.editMessageText('Operation cancelled.');
    });

    // Privacy options
    this.bot.action('privacy_private', async (ctx) => {
      await ctx.answerCbQuery();
      await this.setPrivacy(ctx, 'private');
    });

    this.bot.action('privacy_unlisted', async (ctx) => {
      await ctx.answerCbQuery();
      await this.setPrivacy(ctx, 'unlisted');
    });

    this.bot.action('privacy_public', async (ctx) => {
      await ctx.answerCbQuery();
      await this.setPrivacy(ctx, 'public');
    });
  }

  async handleVideoFile(ctx, file, type) {
    const userId = ctx.from.id;
    const session = this.userSessions.get(userId);
    
    if (!session || session.step !== 'awaiting_video') {
      return ctx.reply('Please use /upload first to start the upload process.');
    }
    
    // Check authentication
    const isAuth = await this.uploader.checkAuth(userId);
    if (!isAuth) {
      return ctx.reply('❌ Please authenticate first using /auth command.');
    }
    
    // Check file size
    if (file.file_size > config.files.maxSize) {
      return ctx.reply(
        `❌ File too large!\n\n` +
        `Size: ${(file.file_size / 1024 / 1024).toFixed(2)}MB\n` +
        `Max allowed: ${config.files.maxSize / 1024 / 1024}MB`
      );
    }
    
    // Get file extension
    let fileName = type === 'video' ? 
      `video_${file.file_id}.mp4` : 
      file.file_name || `file_${file.file_id}`;
    
    const extension = this.downloader.getFileExtension(fileName);
    if (!this.downloader.isValidExtension(extension)) {
      return ctx.reply(
        `❌ Unsupported file format: ${extension}\n\n` +
        `Supported formats: ${config.files.allowedExtensions.join(', ')}`
      );
    }
    
    // Start download
    await ctx.reply('📥 Downloading video from Telegram...');
    
    try {
      const fileLink = await ctx.telegram.getFileLink(file.file_id);
      
      session.step = 'downloading';
      session.downloadProgress = 0;
      
      const result = await this.downloader.downloadTelegramFile(
        fileLink.href,
        fileName,
        (progress) => {
          session.downloadProgress = progress;
        }
      );
      
      if (!result.success) {
        session.step = 'idle';
        return ctx.reply(`❌ Download failed: ${result.error}`);
      }
      
      session.filePath = result.filePath;
      session.videoInfo = {
        mimeType: result.mimeType,
        size: result.size
      };
      session.step = 'awaiting_title';
      
      await ctx.reply(
        `✅ Video downloaded successfully!\n\n` +
        `Size: ${(result.size / 1024 / 1024).toFixed(2)}MB\n\n` +
        `Now, please send me the *video title*:`,
        { parse_mode: 'Markdown' }
      );
      
    } catch (error) {
      session.step = 'idle';
      await ctx.reply(`❌ Error: ${error.message}`);
    }
  }

  async handleUrl(ctx, url, userId) {
    const session = this.userSessions.get(userId);
    
    if (!session || session.step !== 'awaiting_video') {
      return ctx.reply('Please use /upload first to start the upload process.');
    }
    
    // Check authentication
    const isAuth = await this.uploader.checkAuth(userId);
    if (!isAuth) {
      return ctx.reply('❌ Please authenticate first using /auth command.');
    }
    
    await ctx.reply('🔗 Processing link...');
    
    session.step = 'downloading';
    session.downloadProgress = 0;
    
    let result;
    
    // Determine URL type and download
    if (url.includes('drive.google.com')) {
      await ctx.reply('📥 Downloading from Google Drive...');
      result = await this.downloader.downloadGoogleDrive(
        url,
        `gdrive_${Date.now()}.mp4`,
        (progress) => {
          session.downloadProgress = progress;
        }
      );
    } else {
      await ctx.reply('📥 Downloading from URL...');
      result = await this.downloader.downloadDirectUrl(
        url,
        `url_${Date.now()}.mp4`,
        (progress) => {
          session.downloadProgress = progress;
        }
      );
    }
    
    if (!result.success) {
      session.step = 'idle';
      return ctx.reply(`❌ Download failed: ${result.error}`);
    }
    
    session.filePath = result.filePath;
    session.videoInfo = {
      mimeType: result.mimeType,
      size: result.size
    };
    session.step = 'awaiting_title';
    
    await ctx.reply(
      `✅ Video downloaded successfully!\n\n` +
      `Size: ${(result.size / 1024 / 1024).toFixed(2)}MB\n\n` +
      `Now, please send me the *video title*:`,
      { parse_mode: 'Markdown' }
    );
  }

  async handleAuthCode(ctx, code, userId) {
    await ctx.reply('🔐 Processing authorization code...');
    
    const result = await this.uploader.handleAuthCallback(code, userId);
    
    const session = this.userSessions.get(userId);
    if (session) {
      session.authStep = null;
    }
    
    if (result.success) {
      const welcomeMsg = `
✅ *Authentication Successful!*

Welcome, *${result.name}*!

You can now upload videos to your YouTube account.

📤 *To upload:*
• Send me a video file
• Send a Google Drive link
• Use /upload command

Your videos will be uploaded to:
${result.email}
      `;
      
      await ctx.reply(welcomeMsg, { parse_mode: 'Markdown' });
    } else {
      await ctx.reply(`❌ Authentication failed: ${result.error}\n\nTry /auth again.`);
    }
  }

  async handleTitle(ctx, text, userId) {
    const session = this.userSessions.get(userId);
    session.videoInfo.title = text;
    session.step = 'awaiting_description';
    
    await ctx.reply('Great! Now send me the *video description* (or type "skip"):', {
      parse_mode: 'Markdown'
    });
  }

  async handleDescription(ctx, text, userId) {
    const session = this.userSessions.get(userId);
    
    if (text.toLowerCase() !== 'skip') {
      session.videoInfo.description = text;
    }
    
    session.step = 'awaiting_privacy';
    
    await ctx.reply('Choose privacy setting:', {
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('🔒 Private', 'privacy_private'),
          Markup.button.callback('🔗 Unlisted', 'privacy_unlisted')
        ],
        [
          Markup.button.callback('🌍 Public', 'privacy_public')
        ]
      ])
    });
  }

  async setPrivacy(ctx, privacy) {
    const userId = ctx.from.id;
    const session = this.userSessions.get(userId);
    
    session.videoInfo.privacyStatus = privacy;
    session.step = 'awaiting_tags';
    
    await ctx.editMessageText(
      `Privacy set to: *${privacy}*\n\n` +
      `Now, send me tags (comma-separated, or type "skip"):`,
      { parse_mode: 'Markdown' }
    );
  }

  async handleTags(ctx, text, userId) {
    const session = this.userSessions.get(userId);
    
    if (text.toLowerCase() !== 'skip') {
      session.videoInfo.tags = text;
    }
    
    session.step = 'uploading';
    
    // Start upload to YouTube
    await ctx.reply('🚀 Starting upload to YouTube...');
    
    try {
      const result = await this.uploader.uploadVideo(userId, session.videoInfo);
      
      if (result.success) {
        const successMsg = `
✅ *Upload Successful!*

📹 *Title:* ${result.title}
🔗 *URL:* ${result.url}
🔒 *Privacy:* ${result.privacyStatus}

The video is now processing on YouTube. It may take a few minutes to be available in full quality.
        `;
        
        await ctx.reply(successMsg, { 
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.url('📺 View on YouTube', result.videoUrl)]
          ])
        });
      } else {
        await ctx.reply(`❌ Upload failed: ${result.error}`);
      }
      
    } catch (error) {
      await ctx.reply(`❌ Upload error: ${error.message}`);
    } finally {
      // Cleanup
      if (session.filePath) {
        await this.downloader.cleanup(session.filePath);
      }
      
      // Reset session
      session.step = 'idle';
      session.videoInfo = {};
      session.filePath = null;
    }
  }

  isValidUrl(string) {
    try {
      new URL(string);
      return true;
    } catch {
      return false;
    }
  }

  launch() {
    if (config.telegram.webhook.enabled && config.server.isProduction) {
      // Webhook mode for production
      const domain = config.telegram.webhook.domain;
      const path = config.telegram.webhook.path;
      
      this.bot.launch({
        webhook: {
          domain: domain,
          port: config.server.port,
          path: path,
          secretToken: config.telegram.webhook.secret
        }
      }).then(() => {
        console.log(`🚀 Bot running in webhook mode on ${domain}${path}`);
      });
    } else {
      // Polling mode for development
      this.bot.launch().then(() => {
        console.log(`🤖 Bot running in polling mode on port ${config.server.port}`);
      });
    }
  }

  stop() {
    this.bot.stop();
  }
}

module.exports = YouTubeUploaderBot;