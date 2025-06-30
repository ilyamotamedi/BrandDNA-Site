const express = require('express');
const router = express.Router();

// This main router is mounted at /api in server.js
// It then delegates to the router defined in ./api/index.js
router.use('/', require('./api'));

module.exports = router;
