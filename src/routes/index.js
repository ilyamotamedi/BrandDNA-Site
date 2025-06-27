// const express = require("express");
// const app = express();


module.exports = function (app) {
  app.use('/', require('./api')); // currently mismatched routes because there are still legacy routed in server.js
}