/**
 * 🚀 FTECA 24 - Local Development Server
 * Simple HTTP server for local development
 * 
 * Usage:
 *   npm start        → Start server on http://localhost:3000
 *   npm run dev      → Same as npm start
 */

import 'dotenv/config';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { networkInterfaces } from 'os';
import { compress } from 'headroom-ai';
import summaryShareHandler from './api/summary-share.js';
import aiProxyHandler from './api/ai-proxy.js';
import aiQuestionHistoryHandler from './api/ai-question-history.js';
import quizShareHandler from './api/quiz-share.js';
import adminUsersHandler from './api/admin-users.js';
import subjectDetailsHandler from './api/subject-details.js';
import lessonSummaryHandler from './api/lesson-summary.js';
import documentSummaryHandler from './api/document-summary.js';
import { isLocalSubjectDetailsWriteRequest, writeLocalSubjectDetails } from './modules/localSubjectDetailsStore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const LOCAL_SUBJECT_DETAILS_FILE = process.env.FTECA_LOCAL_SUBJECT_DETAILS_FILE
  || path.join(__dirname, 'data', 'subject_details.json');

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

function readJsonBody(req, maxBytes = 1_000_000) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => {
      size += Buffer.byteLength(chunk);
      if (size > maxBytes) {
        reject(Object.assign(new Error('request-too-large'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      body += chunk;
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(Object.assign(new Error('invalid-json'), { statusCode: 400 }));
      }
    });
    req.on('error', reject);
  });
}

async function handleHeadroomCompression(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, reason: 'method-not-allowed' }));
    return true;
  }

  try {
    const payload = await readJsonBody(req);
    const messages = Array.isArray(payload.messages) ? payload.messages : [];
    if (!messages.length || messages.length > 24) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, reason: 'invalid-message-count' }));
      return true;
    }

    const result = await compress(messages, {
      model: process.env.HEADROOM_MODEL || 'openai/gpt-oss-120b',
      baseUrl: process.env.HEADROOM_PROXY_URL || 'http://127.0.0.1:8787',
      timeout: 3000,
      fallback: false,
      stack: 'qlcl-cera-history'
    });

    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    res.end(JSON.stringify({
      ok: true,
      messages: result.messages,
      tokensBefore: result.tokensBefore,
      tokensAfter: result.tokensAfter,
      tokensSaved: result.tokensSaved,
      compressionRatio: result.compressionRatio,
      compressed: result.compressed
    }));
  } catch (error) {
    const status = Number(error?.statusCode) || 503;
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, reason: 'headroom-unavailable' }));
  }
  return true;
}

async function handleSummaryShare(req, res) {
  try {
    const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const body = ['POST', 'DELETE'].includes(req.method) ? await readJsonBody(req, 550_000) : {};
    const vercelRequest = Object.assign(req, {
      query: Object.fromEntries(requestUrl.searchParams.entries()),
      body
    });
    let statusCode = 200;
    const headers = new Map();
    const vercelResponse = {
      status(code) { statusCode = code; return this; },
      setHeader(name, value) { headers.set(name, value); return this; },
      end(payload = '') {
        res.writeHead(statusCode, Object.fromEntries(headers));
        res.end(payload);
      }
    };
    await summaryShareHandler(vercelRequest, vercelResponse);
  } catch (error) {
    const status = Number(error?.statusCode) || 400;
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ok: false, reason: error.message || 'invalid-request' }));
  }
}

async function handleLocalSubjectDetailsWrite(req, res) {
  if (req.method !== 'PUT') {
    res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8', Allow: 'GET, PUT' });
    res.end(JSON.stringify({ ok: false, reason: 'method-not-allowed' }));
    return;
  }
  if (!isLocalSubjectDetailsWriteRequest(req)) {
    res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, reason: 'local-write-only' }));
    return;
  }

  try {
    const { subjectId, details } = await readJsonBody(req, 10_000_000);
    const subjectDetails = writeLocalSubjectDetails(
      LOCAL_SUBJECT_DETAILS_FILE,
      subjectId,
      details
    );
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ok: true, subjectDetails, source: 'local-file' }));
  } catch (error) {
    const status = Number(error?.statusCode) || 400;
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, reason: error.message || 'local-subject-details-write-failed' }));
  }
}

async function handleApiProxy(req, res) {
  try {
    const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const body = req.method === 'POST' ? await readJsonBody(req, 100_000) : {};
    const vercelRequest = Object.assign(req, {
      query: Object.fromEntries(requestUrl.searchParams.entries()),
      body
    });
    let statusCode = 200;
    const headers = new Map();
    const vercelResponse = {
      status(code) { statusCode = code; return this; },
      setHeader(name, value) { headers.set(name, value); return this; },
      end(payload = '') {
        res.writeHead(statusCode, Object.fromEntries(headers));
        res.end(payload);
      }
    };
    await aiProxyHandler(vercelRequest, vercelResponse);
  } catch (error) {
    const status = Number(error?.statusCode) || 500;
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ok: false, reason: error.message || 'proxy-error' }));
  }
}

async function handleAIQuestionHistory(req, res) {
  try {
    const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const body = ['POST', 'PUT'].includes(req.method) ? await readJsonBody(req, 500_000) : {};
    const vercelRequest = Object.assign(req, {
      query: Object.fromEntries(requestUrl.searchParams.entries()),
      body
    });
    let statusCode = 200;
    const headers = new Map();
    const vercelResponse = {
      status(code) { statusCode = code; return this; },
      setHeader(name, value) { headers.set(name, value); return this; },
      end(payload = '') {
        res.writeHead(statusCode, Object.fromEntries(headers));
        res.end(payload);
      }
    };
    await aiQuestionHistoryHandler(vercelRequest, vercelResponse);
  } catch (error) {
    const status = Number(error?.statusCode) || 500;
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ok: false, reason: error.message || 'history-error' }));
  }
}

async function handleAdminUsers(req, res) {
  try {
    const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const body = req.method === 'PATCH' ? await readJsonBody(req, 50_000) : {};
    const vercelRequest = Object.assign(req, {
      query: Object.fromEntries(requestUrl.searchParams.entries()),
      body
    });
    let statusCode = 200;
    const headers = new Map();
    const vercelResponse = {
      status(code) { statusCode = code; return this; },
      setHeader(name, value) { headers.set(name, value); return this; },
      end(payload = '') {
        res.writeHead(statusCode, Object.fromEntries(headers));
        res.end(payload);
      }
    };
    await adminUsersHandler(vercelRequest, vercelResponse);
  } catch (error) {
    const status = Number(error?.statusCode) || 500;
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ok: false, reason: error.message || 'admin-users-error' }));
  }
}

// Các handler trong /api vừa chạy trên Vercel vừa chạy ở server.js local, nên
// ở đây bọc req/res của node thành cặp VercelRequest/VercelResponse.
async function runServerlessHandler(handler, label, req, res, { bodyLimit = 1_000_000 } = {}) {
  try {
    const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readJsonBody(req, bodyLimit) : {};
    let statusCode = 200;
    const headers = new Map();
    const vercelResponse = {
      status(code) { statusCode = code; return this; },
      setHeader(name, value) { headers.set(name, value); return this; },
      end(payload = '') {
        res.writeHead(statusCode, Object.fromEntries(headers));
        res.end(payload);
      }
    };
    await handler(
      Object.assign(req, { query: Object.fromEntries(requestUrl.searchParams.entries()), body }),
      vercelResponse
    );
  } catch (error) {
    res.writeHead(Number(error?.statusCode) || 500, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    res.end(JSON.stringify({ ok: false, reason: error.message || `${label}-error` }));
  }
}

async function handleTtsProxy(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, reason: 'method-not-allowed' }));
    return;
  }
  try {
    const payload = await readJsonBody(req, 20_000);
    const text = String(payload.text || '').trim();
    if (!text) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, reason: 'empty-text' }));
      return;
    }
    const upstream = await fetch('http://127.0.0.1:5050/synthesize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, length_scale: Number(payload.length_scale) || 1.0 }),
      signal: AbortSignal.timeout(30_000)
    });
    if (!upstream.ok) {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, reason: 'tts-engine-error' }));
      return;
    }
    const wav = Buffer.from(await upstream.arrayBuffer());
    res.writeHead(200, {
      'Content-Type': 'audio/wav',
      'Content-Length': String(wav.length),
      'Cache-Control': 'public, max-age=86400'
    });
    res.end(wav);
  } catch {
    res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, reason: 'tts-unavailable' }));
  }
}

const server = http.createServer(async (req, res) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  // CSP tối thiểu, không chặn script inline mà app đang dùng:
  // chặn plugin, ghim <base>, chống clickjacking.
  res.setHeader('Content-Security-Policy', "object-src 'none'; base-uri 'self'; frame-ancestors 'self'");

  // Parse URL and remove query string
  let cleanUrl = req.url.split('?')[0];
  let filePath = '.' + cleanUrl; // ✅ FIX: Dùng cleanUrl thay vì req.url
  
  if (filePath === './') {
    filePath = './index.html';
  }

  if (cleanUrl === '/api/headroom-compress') {
    await handleHeadroomCompression(req, res);
    return;
  }
  if (cleanUrl === '/api/ai-proxy') {
    await handleApiProxy(req, res);
    return;
  }
  if (cleanUrl === '/api/ai-question-history') {
    await handleAIQuestionHistory(req, res);
    return;
  }
  if (cleanUrl === '/api/quiz-share') {
    await runServerlessHandler(quizShareHandler, 'quiz-share', req, res, { bodyLimit: 2_000_000 });
    return;
  }
  // Kho đề chia sẻ cục bộ chứa đáp án đúng và điểm người tham gia — không phục vụ tĩnh.
  if (cleanUrl === '/data/local' || cleanUrl.startsWith('/data/local/')) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
    return;
  }
  if (cleanUrl === '/api/tts') {
    await handleTtsProxy(req, res);
    return;
  }
  if (cleanUrl === '/api/summary-share') {
    await handleSummaryShare(req, res);
    return;
  }
  if (cleanUrl === '/api/lesson-summary') {
    await runServerlessHandler(lessonSummaryHandler, 'lesson-summary', req, res, { bodyLimit: 200_000 });
    return;
  }
  if (cleanUrl === '/api/document-summary') {
    await runServerlessHandler(documentSummaryHandler, 'document-summary', req, res, { bodyLimit: 2_000_000 });
    return;
  }
  if (cleanUrl === '/api/admin-users') {
    await handleAdminUsers(req, res);
    return;
  }
  if (cleanUrl === '/api/subject-details' && req.method === 'PUT') {
    await handleLocalSubjectDetailsWrite(req, res);
    return;
  }
  if (cleanUrl === '/api/subject-details' && req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8', Allow: 'GET, PUT' });
    res.end(JSON.stringify({ ok: false, reason: 'method-not-allowed' }));
    return;
  }

  // API endpoint routing
  if (cleanUrl === '/api/subject-details') {
    // Cùng một handler với Vercel để local dev cũng có ETag/304 và header cache edge.
    await runServerlessHandler(subjectDetailsHandler, 'subject-details', req, res, { bodyLimit: 4_000_000 });
    return;
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
        // SPA fallback: path không có đuôi file do router phía client xử lý.
        if (req.method === 'GET' && !path.extname(cleanUrl) && !cleanUrl.startsWith('/api/')) {
          fs.readFile('./index.html', (errorIndex, indexContent) => {
            if (errorIndex) {
              res.writeHead(500, { 'Content-Type': 'text/plain' });
              res.end('Server Error: index.html not found', 'utf-8');
              return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-cache' });
            res.end(indexContent, 'utf-8');
          });
          return;
        }
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
