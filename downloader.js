const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const { promisify } = require('util');
const stream = require('stream');
const config = require('./config');

const pipeline = promisify(stream.pipeline);

class FileDownloader {
  constructor() {
    this.tempDir = config.files.tempDir;
    this.ensureDirs();
  }

  ensureDirs() {
    fs.ensureDirSync(this.tempDir);
    fs.ensureDirSync(config.files.uploadsDir);
  }

  async downloadTelegramFile(fileUrl, fileName, onProgress = null) {
    try {
      const filePath = path.join(this.tempDir, fileName);
      
      console.log(`📥 Downloading Telegram file: ${fileName}`);
      
      const response = await axios({
        method: 'GET',
        url: fileUrl,
        responseType: 'stream',
        timeout: 300000, // 5 minutes
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      const totalLength = response.headers['content-length'];
      let downloaded = 0;

      response.data.on('data', (chunk) => {
        downloaded += chunk.length;
        if (totalLength && onProgress) {
          const progress = Math.round((downloaded / totalLength) * 100);
          onProgress(progress);
        }
      });

      await pipeline(response.data, fs.createWriteStream(filePath));
      
      // Verify download
      const stats = await fs.stat(filePath);
      
      if (stats.size === 0) {
        await fs.remove(filePath);
        throw new Error('Downloaded file is empty');
      }

      if (stats.size > config.files.maxSize) {
        await fs.remove(filePath);
        throw new Error(`File too large: ${(stats.size / 1024 / 1024).toFixed(2)}MB (max: ${config.files.maxSize / 1024 / 1024}MB)`);
      }

      return {
        success: true,
        filePath,
        fileName: path.basename(filePath),
        size: stats.size,
        mimeType: response.headers['content-type'] || 'video/mp4'
      };
    } catch (error) {
      console.error('❌ Download error:', error.message);
      return {
        success: false,
        error: `Download failed: ${error.message}`
      };
    }
  }

  async downloadDirectUrl(url, fileName = null, onProgress = null) {
    try {
      if (!url.startsWith('http')) {
        return { success: false, error: 'Invalid URL' };
      }

      const filePath = path.join(this.tempDir, fileName || `direct_${Date.now()}.mp4`);
      
      console.log(`🔗 Downloading from URL: ${url}`);
      
      // First, check if it's a video
      const headResponse = await axios.head(url, {
        timeout: 10000
      }).catch(() => null);

      const contentType = headResponse?.headers['content-type'] || '';
      if (!contentType.includes('video')) {
        console.warn('⚠️ Content-Type not video:', contentType);
      }

      const response = await axios({
        method: 'GET',
        url: url,
        responseType: 'stream',
        timeout: 300000,
        maxRedirects: 5,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'video/*, */*'
        }
      });

      const totalLength = response.headers['content-length'];
      let downloaded = 0;

      response.data.on('data', (chunk) => {
        downloaded += chunk.length;
        if (totalLength && onProgress) {
          const progress = Math.round((downloaded / totalLength) * 100);
          onProgress(progress);
        }
      });

      await pipeline(response.data, fs.createWriteStream(filePath));
      
      const stats = await fs.stat(filePath);
      
      if (stats.size > config.files.maxSize) {
        await fs.remove(filePath);
        throw new Error(`File too large: ${(stats.size / 1024 / 1024).toFixed(2)}MB`);
      }

      return {
        success: true,
        filePath,
        fileName: path.basename(filePath),
        size: stats.size,
        mimeType: response.headers['content-type'] || 'video/mp4'
      };
    } catch (error) {
      console.error('❌ URL download error:', error.message);
      return {
        success: false,
        error: `URL download failed: ${error.message}`
      };
    }
  }

  async downloadGoogleDrive(url, fileName = null, onProgress = null) {
    try {
      // Extract file ID from Google Drive URL
      let fileId = null;
      const urlPatterns = [
        /\/d\/([^\/]+)/,
        /id=([^&]+)/,
        /\/file\/d\/([^\/]+)/,
        /drive\.google\.com\/open\?id=([^&]+)/
      ];

      for (const pattern of urlPatterns) {
        const match = url.match(pattern);
        if (match && match[1]) {
          fileId = match[1];
          break;
        }
      }

      if (!fileId) {
        return { success: false, error: 'Invalid Google Drive URL format' };
      }

      // Use direct download link
      const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
      
      console.log(`☁️ Downloading Google Drive file ID: ${fileId}`);
      
      return await this.downloadDirectUrl(
        downloadUrl, 
        fileName || `gdrive_${Date.now()}.mp4`, 
        onProgress
      );
    } catch (error) {
      console.error('❌ Google Drive error:', error);
      return {
        success: false,
        error: `Google Drive download failed: ${error.message}`
      };
    }
  }

  isValidExtension(filename) {
    const ext = path.extname(filename).toLowerCase();
    return config.files.allowedExtensions.includes(ext);
  }

  getFileExtension(filename) {
    return path.extname(filename).toLowerCase();
  }

  async cleanup(filePath) {
    try {
      if (filePath && await fs.pathExists(filePath)) {
        await fs.remove(filePath);
        console.log(`🧹 Cleaned up: ${filePath}`);
      }
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  }

  async cleanupOldFiles(maxAgeHours = 24) {
    try {
      const files = await fs.readdir(this.tempDir);
      const now = Date.now();
      const maxAge = maxAgeHours * 60 * 60 * 1000;

      for (const file of files) {
        const filePath = path.join(this.tempDir, file);
        const stats = await fs.stat(filePath);
        
        if (now - stats.mtimeMs > maxAge) {
          await fs.remove(filePath);
          console.log(`🧹 Cleaned up old file: ${file}`);
        }
      }
    } catch (error) {
      console.error('Cleanup old files error:', error);
    }
  }
}

module.exports = FileDownloader;