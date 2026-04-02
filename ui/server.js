#!/usr/bin/env node
// Minimal static file server for BotMesh UI with proper security headers
const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3003;

// Security headers (must be HTTP headers — meta tags are ignored by browsers)
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self' https://api.kurokimachi.com",
      "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://static.cloudflareinsights.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob:",
      "connect-src 'self' https://api.kurokimachi.com wss://api.kurokimachi.com",
      "frame-ancestors 'none'",
    ].join('; ')
  );
  next();
});

// Cache static assets for 1 hour
app.use(express.static(path.join(__dirname), {
  maxAge: '1h',
  etag: true,
}));

// SPA fallback
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`[UI] BotMesh UI serving on port ${PORT}`);
});
