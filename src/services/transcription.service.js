const { YtDlp } = require('ytdlp-nodejs');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');

const geminiCreation = require('./geminiCreation.service');

// --- 1. INITIALIZE CLIENTS ---
const ytdlp = new YtDlp();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Helper function to convert a local file for the Gemini API.
 * @param {string} filePath - The path to the local file.
 * @param {string} mimeType - The MIME type of the file.
 * @returns {object} The generative part object for the API call.
 */
function fileToGenerativePart(filePath, mimeType) {
  return {
    inlineData: {
      data: Buffer.from(fs.readFileSync(filePath)).toString("base64"),
      mimeType
    },
  };
}

/**
 * Downloads audio from a video URL, transcribes it, and cleans up.
 * @param {string} videoUrl The public URL of the video to transcribe.
 * @returns {Promise<object>} An object containing the transcript `{ transcript: '...' }` on success,
 * or an error `{ error: '...' }` on failure.
 */
async function transcribeVideo(videoUrl) {
  // Check for API Key first
  if (!process.env.GEMINI_API_KEY) {
    const errorMsg = "CRITICAL: The GEMINI_API_KEY environment variable is not set.";
    console.error(errorMsg);
    return { error: errorMsg };
  }

  // Create a unique filename to prevent conflicts during concurrent requests
  const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
  const audioFileName = `temp_audio-${uniqueSuffix}.mp3`;
  // Use __dirname to ensure the path is relative to this file, not the calling process
  const absolutePath = path.join(__dirname, audioFileName);

  try {
    // --- STEP 1: DOWNLOAD AUDIO ---
    console.log(`Service: Starting audio download from ${videoUrl}`);
    await ytdlp.downloadAsync(videoUrl, {
      outputPath: absolutePath,
      format: {
        filter: 'audioonly',
        quality: 'highest',
        type: 'mp3'
      }
    });
    console.log(`Service: Audio downloaded to ${absolutePath}`);

    // --- STEP 2: TRANSCRIBE WITH GEMINI ---
    // console.log('Service: Sending audio to Gemini for transcription...');
    // const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    // const prompt = "Transcribe the spoken words in this audio file accurately.";
    // const audioFile = fileToGenerativePart(absolutePath, "audio/mp3");
    
    // const result = await model.generateContent([prompt, audioFile]);
    // const transcript = result.response.text();
    // console.log('Service: Transcription successful.');
    
    // return { transcript: transcript };
    transcription = geminiCreation.transcribeVideo(absolutePath);
    return transcription;

  } catch (error) {
    console.error('Service Error: An error occurred during the transcription process.', error);
    // Return a structured error object
    return { error: error.message };
  } finally {
    // --- STEP 3: ALWAYS CLEAN UP ---
    // The 'finally' block ensures this code runs whether the try block succeeded or failed.
    if (fs.existsSync(absolutePath)) {
      fs.unlinkSync(absolutePath);
      console.log(`Service: Cleaned up temporary file ${absolutePath}`);
    }
  }
}

// --- 2. EXPORT THE SERVICE FUNCTION ---
module.exports = {
  transcribeVideo,
};