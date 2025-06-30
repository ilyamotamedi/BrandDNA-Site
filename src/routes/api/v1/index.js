const { v1 } = require('@google-cloud/aiplatform');

const V1Router = require('express').Router({ mergeParams: true });

V1Router.use('/transcripts', require('./transcripts').transcriptsRouter);
V1Router.use('/aiModels', require('./aiModels'));
V1Router.use('/brandDna', require('./brandDna').brandDnaRouter);
V1Router.use('/creatorDna', require('./creatorDna').creatorDnaRouter);


module.exports = V1Router;
