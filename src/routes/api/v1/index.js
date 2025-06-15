const V1Router = require('express').Router({ mergeParams: true });

V1Router.use('/transcripts', require('./transcripts'));

module.exports = V1Router;
