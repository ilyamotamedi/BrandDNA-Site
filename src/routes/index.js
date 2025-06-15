module.exports = function (app) {
  app.use('/', require('./api')); // currently mismatched routes because there are still legacy routed in server.js
}
