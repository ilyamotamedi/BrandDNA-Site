const express = require('express');
const V1Router = express.Router({ mergeParams: true });

module.exports = (db) => {

    const brandDnaRouterFunction = require('./brandDna/index.js');
    const creatorDnaRouterFunction = require('./creatorDna/index.js');

    const { transcriptsRouter } = require('./transcripts/index.js');
    const aiModelsRouter = require('./aiModels/index.js');

    V1Router.use('/brandDna', brandDnaRouterFunction(db));
    V1Router.use('/creatorDna', creatorDnaRouterFunction(db));

    V1Router.use('/transcripts', transcriptsRouter);
    V1Router.use('/aiModels', aiModelsRouter);

    return V1Router;
};