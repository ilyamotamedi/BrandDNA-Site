const V1Router = require('express').Router({ mergeParams: true });

V1Router.use('/transcripts', require('./transcripts'));
V1Router.use('/aiModels', require('./aiModels'));

module.exports = V1Router;
