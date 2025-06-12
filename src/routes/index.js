module.exports = function (app) {
  app.use('/api/v1/transcripts', require('./api/v1/transcripts'));
}
