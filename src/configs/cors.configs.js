const cors = require('cors');

const corsConfig = cors({
  origin: process.env.NODE_ENV === 'production'
    ? ['https://test--branddna.us-central1.hosted.app']
    : 'http://localhost:3000',
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
});

module.exports = corsConfig;