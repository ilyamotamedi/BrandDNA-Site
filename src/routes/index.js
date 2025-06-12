const express = require('express');
const Router = express.Router({ mergeParams: true });

Router.use('/transcripts', require('./transcripts'));

module.exports = Router
