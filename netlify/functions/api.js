// netlify/functions/api.js
const { createProxyMiddleware } = require('http-proxy-middleware');
const express = require('express');
const serverless = require('serverless-http');

const app = express();

// Proxy API requests to Next.js API routes
app.use('/.netlify/functions/api', createProxyMiddleware({
  target: 'http://localhost:3000',
  changeOrigin: true,
  pathRewrite: {
    '^/.netlify/functions/api': '/api',
  },
}));

// Export the serverless function
module.exports.handler = serverless(app);
