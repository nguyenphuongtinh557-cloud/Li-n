/**
 * 🚀 FTECA 24 - Local Development Server
 * Simple HTTP server for local development
 * 
 * Usage:
 *   npm start        → Start server on http://localhost:3000
 *   npm run dev      → Same as npm start
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { networkInterfaces } from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;

// MIME types mapping
const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.woff': 'application/font-woff',
  '.ttf': 'application/font-ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.otf': 'application/font-otf',
  '.wasm': 'application/wasm',
  '.pdf': 'application/pdf',
  '.md': 'text/markdown',
  '.txt': 'text/plain'
};

const server = http.createServer((req, res) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);

  // Parse URL and remove query string
  let cleanUrl = req.url.split('?')[0];
  let filePath = '.' + cleanUrl; // ✅ FIX: Dùng cleanUrl thay vì req.url
  
  if (filePath === './') {
    filePath = './index.html';
  }

  // API endpoint routing
  if (cleanUrl === '/api/subject-details') {
    filePath = './data/subject_details.json';
  } else if (cleanUrl === '/api/user_roles') {
    filePath = './data/user_roles.json';
  } else if (cleanUrl === '/api/system_announcements') {
    filePath = './data/system_announcements.json';
  } else if (cleanUrl === '/api/cms_articles') {
    filePath = './data/cms_articles.json';
  } else if (cleanUrl === '/api/community') {
    filePath = './data/community.json';
  }

  // Security: Prevent directory traversal
  const normalizedPath = path.normalize(filePath);
  if (normalizedPath.startsWith('..')) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }

  const extname = String(path.extname(filePath)).toLowerCase();
  const contentType = mimeTypes[extname] || 'application/octet-stream';

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        // File not found
        fs.readFile('./404.html', (error404, content404) => {
          if (error404) {
            res.writeHead(404, { 'Content-Type': 'text/html' });
            res.end('<h1>404 Not Found</h1><p>The requested file was not found on this server.</p>', 'utf-8');
          } else {
            res.writeHead(404, { 'Content-Type': 'text/html' });
            res.end(content404, 'utf-8');
          }
        });
      } else {
        // Server error
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(`Server Error: ${error.code}`, 'utf-8');
      }
    } else {
      // Success
      res.writeHead(200, { 
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*', // Enable CORS for local development
        'Cache-Control': 'no-cache'
      });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, () => {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║                                                            ║');
  console.log('║         🚀 FTECA 24 - Development Server Running          ║');
  console.log('║                                                            ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  console.log(`  ✅ Server: http://localhost:${PORT}`);
  console.log(`  ✅ Network: http://${getLocalIP()}:${PORT}`);
  console.log(`  ✅ Time: ${new Date().toLocaleString('vi-VN')}\n`);
  console.log('  📂 Serving files from:', __dirname);
  console.log('\n  Press Ctrl+C to stop the server\n');
});

// Get local IP address
function getLocalIP() {
  const nets = networkInterfaces();
  
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      // Skip internal (i.e. 127.0.0.1) and non-IPv4 addresses
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  
  return 'localhost';
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n🛑 SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('✅ HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\n\n🛑 Server stopped by user (Ctrl+C)');
  console.log('👋 Goodbye!\n');
  process.exit(0);
});
