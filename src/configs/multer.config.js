const multer = require('multer');

// Configure and export multer for file uploads
module.exports = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  }
});
