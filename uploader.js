const { google } = require('googleapis');
const fs = require('fs-extra');
const path = require('path');
const config = require('./config');

class YouTubeUploader {
  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      config.youtube.clientId,
      config.youtube.clientSecret,
      config.youtube.redirectUri
    );

    this.youtube = google.youtube({
      version: 'v3',
      auth: this.oauth2Client
    });

    this.tokensFile = path.join(__dirname, 'auth', 'tokens.json');
    this.ensureAuthDir();
  }

  ensureAuthDir() {
    const authDir = path.join(__dirname, 'auth');
    fs.ensureDirSync(authDir);
  }

  async saveTokens(userId, tokens) {
    try {
      let allTokens = {};
      if (await fs.pathExists(this.tokensFile)) {
        allTokens = JSON.parse(await fs.readFile(this.tokensFile, 'utf8'));
      }
      
      allTokens[userId] = {
        ...tokens,
        savedAt: new Date().toISOString(),
        userId: userId.toString()
      };
      
      await fs.writeFile(this.tokensFile, JSON.stringify(allTokens, null, 2));
      return true;
    } catch (error) {
      console.error('❌ Error saving tokens:', error);
      return false;
    }
  }

  async getTokens(userId) {
    try {
      if (await fs.pathExists(this.tokensFile)) {
        const allTokens = JSON.parse(await fs.readFile(this.tokensFile, 'utf8'));
        return allTokens[userId] || null;
      }
    } catch (error) {
      console.error('❌ Error reading tokens:', error);
    }
    return null;
  }

  async deleteTokens(userId) {
    try {
      if (await fs.pathExists(this.tokensFile)) {
        const allTokens = JSON.parse(await fs.readFile(this.tokensFile, 'utf8'));
        delete allTokens[userId];
        await fs.writeFile(this.tokensFile, JSON.stringify(allTokens, null, 2));
      }
      return true;
    } catch (error) {
      console.error('❌ Error deleting tokens:', error);
      return false;
    }
  }

  async getAuthUrl(userId) {
    const url = this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: config.youtube.scopes,
      state: userId.toString(),
      prompt: 'consent',
      include_granted_scopes: true
    });
    return url;
  }

  async handleAuthCallback(code, userId) {
    try {
      const { tokens } = await this.oauth2Client.getToken(code);
      
      // Verify tokens by getting user info
      this.oauth2Client.setCredentials(tokens);
      
      const oauth2 = google.oauth2({
        version: 'v2',
        auth: this.oauth2Client
      });
      
      const userInfo = await oauth2.userinfo.get();
      
      // Save tokens
      await this.saveTokens(userId, tokens);
      
      return {
        success: true,
        userId,
        email: userInfo.data.email,
        name: userInfo.data.name,
        picture: userInfo.data.picture
      };
    } catch (error) {
      console.error('❌ Auth callback error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async checkAuth(userId) {
    try {
      const tokens = await this.getTokens(userId);
      if (!tokens) return false;
      
      this.oauth2Client.setCredentials(tokens);
      
      // Test token with a simple API call
      await this.youtube.channels.list({
        part: 'snippet',
        mine: true,
        maxResults: 1
      });
      
      return true;
    } catch (error) {
      console.error('❌ Auth check error:', error);
      return false;
    }
  }

  async getChannelInfo(userId) {
    try {
      const tokens = await this.getTokens(userId);
      if (!tokens) return null;
      
      this.oauth2Client.setCredentials(tokens);
      
      const response = await this.youtube.channels.list({
        part: 'snippet,statistics',
        mine: true
      });
      
      if (response.data.items && response.data.items.length > 0) {
        return response.data.items[0];
      }
      return null;
    } catch (error) {
      console.error('❌ Get channel error:', error);
      return null;
    }
  }

  async uploadVideo(userId, videoData, onProgress = null) {
    try {
      // Get user tokens
      const tokens = await this.getTokens(userId);
      if (!tokens) {
        throw new Error('User not authenticated. Please use /auth first.');
      }

      // Set credentials
      this.oauth2Client.setCredentials(tokens);

      // Prepare video metadata
      const videoMetadata = {
        snippet: {
          title: videoData.title.substring(0, 100),
          description: videoData.description ? videoData.description.substring(0, 5000) : '',
          tags: videoData.tags ? 
            videoData.tags.split(',')
              .map(tag => tag.trim())
              .filter(tag => tag.length > 0)
              .slice(0, 30) : [],
          categoryId: videoData.categoryId || '22' // People & Blogs
        },
        status: {
          privacyStatus: videoData.privacyStatus || 'private',
          selfDeclaredMadeForKids: false
        }
      };

      console.log(`📤 Uploading video for user ${userId}: ${videoData.title}`);

      // Upload to YouTube
      const response = await this.youtube.videos.insert({
        part: 'snippet,status',
        requestBody: videoMetadata,
        media: {
          body: fs.createReadStream(videoData.filePath),
          mimeType: videoData.mimeType || 'video/mp4'
        }
      });

      const videoId = response.data.id;
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

      console.log(`✅ Upload successful: ${videoUrl}`);

      return {
        success: true,
        videoId,
        videoUrl,
        title: response.data.snippet.title,
        privacyStatus: response.data.status.privacyStatus,
        thumbnail: response.data.snippet.thumbnails?.default?.url
      };
    } catch (error) {
      console.error('❌ YouTube upload error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getAllUsers() {
    try {
      if (await fs.pathExists(this.tokensFile)) {
        const allTokens = JSON.parse(await fs.readFile(this.tokensFile, 'utf8'));
        return Object.keys(allTokens);
      }
      return [];
    } catch (error) {
      return [];
    }
  }
}

module.exports = YouTubeUploader;