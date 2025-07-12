const express = require('express');
const router = express.Router();

module.exports = (db) => {
  const v1ApiRoutes = require('./api/v1/index.js');

  // Use the v1 API router by CALLING it with the 'db' instance
  router.use('/v1', v1ApiRoutes(db));

  return router; // Return the configured apiRouter
};
