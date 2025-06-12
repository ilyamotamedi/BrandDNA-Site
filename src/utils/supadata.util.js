{ Supadata } = require('@supdata/js');

// Initialize Supadata client
const supadata = new Supadata({
  apiKey: process.env.SUPADATA_API_KEY,
});

module.exports = supadata;
