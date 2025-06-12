const ApiRouter = require('express').Router();

ApiRouter.use('/v1', require('./v1'));

module.exports = ApiRouter;
