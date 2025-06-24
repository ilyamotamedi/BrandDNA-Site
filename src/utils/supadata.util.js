const { Supadata } = require('@supadata/js');
require('dotenv').config();

// Initialize Supadata client
const supadata = new Supadata({
  apiKey: process.env.SUPADATA_API_KEY,
});

module.exports = supadata;
