const multer = require('multer');
const { Storage } = require('@google-cloud/storage');
const storage = new Storage();
const bucket = storage.bucket(process.env.BUCKET_NAME);

async function readJSONFromStorage(filename) {
  try {
    const file = bucket.file(filename);
    const [exists] = await file.exists();

    if (!exists) {
      await file.save(JSON.stringify({}));
      return {};
    }

    const [content] = await file.download();
    return JSON.parse(content.toString());
  } catch (error) {
    console.error(`Error reading ${filename}:`, error);
    return {};
  }
}

async function writeJSONToStorage(filename, data) {
  try {
    const file = bucket.file(filename);
    await file.save(JSON.stringify(data, null, 2));
  } catch (error) {
    console.error(`Error writing ${filename}:`, error);
    throw error;
  }
}

module.exports ={
  readJSONFromStorage,
  writeJSONToStorage
}