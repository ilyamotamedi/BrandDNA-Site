const cors = require('cors');

const corsConfig = cors({
  origin: process.env.NODE_ENV === 'production'
    ? ['https://branddna.web.app']
    : 'http://localhost:3000',
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
});

module.exports = corsConfig;