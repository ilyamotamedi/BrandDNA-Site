require('dotenv').config();
const express = require('express');

const { GoogleAuth } = require('google-auth-library');
const path = require('path');
const fs = require('fs').promises;
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const modelState = require('./src/services/modelState.js');
// const { initializeDNAsFile } = require('./src/services/creatorDna');
const upload = require('./src/configs/multer.config.js');

const { Storage } = require('@google-cloud/storage');
const storage = new Storage();
const bucket = storage.bucket(process.env.BUCKET_NAME);

const {
  IMAGE_GENERATION_SYSTEM_INSTRUCTIONS,
  VIDEO_GENERATION_SYSTEM_INSTRUCTIONS,
  MATCH_SYSTEM_INSTRUCTIONS,
  MATCH_V2_SYSTEM_INSTRUCTIONS,
  STORYBOARD_GENERATION_SYSTEM_INSTRUCTIONS,
  STORYBOARD_V2_GENERATION_SYSTEM_INSTRUCTIONS,
  STORYBOARD_FRAME_REGENERATION_SYSTEM_INSTRUCTIONS,
  STORYBOARD_REVIEW_SYSTEM_INSTRUCTIONS,
  BRAINSTORM_SYSTEM_INSTRUCTIONS
} = require('./src/configs/systemInstructions.config.js');

const PROJECT_ID = process.env.PROJECT_ID;
const LOCATION_ID = process.env.LOCATION_ID;

// Initialize current creator DNAs file with default
let currentCreatorDnaListFile = 'creator-dnas.json';

// Initialize Brand DNAs file
const DNAS_FILE_PATH = path.join(__dirname, 'dnas.json');


// Call this when starting the server to ensure DNA files exist
// initializeDNAsFile();

const app = express();

// Apply middleware before any routes are defined.
// This is crucial for req.body to be populated.
app.use(require('./src/configs/cors.configs.js'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Register API routes AFTER middleware
app.use('/api/', require('./src/routes/index.js'));


const auth = new GoogleAuth({
  scopes: 'https://www.googleapis.com/auth/cloud-platform'
});


async function generateImagePrompts(prompt, brandDNA = null, language = 'english') {
  const fetch = await import('node-fetch').then(module => module.default);

  // Prepare the prompt with brand DNA if available
  let fullPrompt = prompt;
  if (brandDNA) {
    fullPrompt = `Brand DNA:\n${JSON.stringify(brandDNA)}\n Overall creative concept for this image: ${prompt}`;
  }

  // --- LANGUAGE MODIFICATION ---
  if (language === 'spanish') {
    fullPrompt += "\nPLEASE RESPOND IN SPANISH";
  }

  // Prepare the parts array
  const parts = [{
    text: fullPrompt
  }];

  const requestBody = {
    contents: [{
      role: "user",
      parts: parts
    }],
    systemInstruction: {
      parts: [{
        text: IMAGE_GENERATION_SYSTEM_INSTRUCTIONS
      }]
    },
    generationConfig: {
      temperature: 1,
      maxOutputTokens: 8192,
      topP: 0.95
    }
  };

  try {
    const client = await auth.getClient();
    const accessToken = await client.getAccessToken();

    const currentLlmModel = modelState.getLlm();
    const url = `https://${currentLlmModel.apiEndpoint}/v1/projects/${PROJECT_ID}/locations/${LOCATION_ID}/publishers/google/models/${currentLlmModel.modelId}:generateContent`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken.token}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API Error Response:', errorText);
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const data = await response.json();
    const responseText = data?.candidates?.[0]?.content?.parts?.[0]?.text || null;

    if (!responseText) {
      throw new Error('No text content in API response');
    }

    return responseText;
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}

app.post('/generateImages', async (req, res) => {
  const { prompt, brandDNA } = req.body;
  const language = getLanguageFromRequest(req);

  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  try {
    const result = await generateImagePrompts(prompt, brandDNA, language);
    res.json(result);
  } catch (error) {
    console.error('Error processing request:', error);
    res.status(500).json({ error: error.message });
  }
});

async function generateImagesFromPrompt(prompt, aspectRatio = '4:3', language = currentLanguage) {
  const aiplatform = require('@google-cloud/aiplatform');
  const { PredictionServiceClient } = aiplatform.v1;
  const { helpers } = aiplatform;

  const clientOptions = {
    apiEndpoint: `${LOCATION_ID}-aiplatform.googleapis.com`,
  };

  const predictionServiceClient = new PredictionServiceClient(clientOptions);

  const currentVisionModel = modelState.getVision();
  const endpoint = `projects/${PROJECT_ID}/locations/${LOCATION_ID}/publishers/google/models/${currentVisionModel.modelId}`;

  let promptToUse = prompt; // Initialize with the original prompt
  if (language === 'spanish') {
    try {
      // Translate Spanish prompt to English for better image generation results
      promptToUse = await translateText(prompt, 'en');
      console.log('Original Prompt (Spanish):', prompt);
      console.log('Translated Prompt (English):', promptToUse);
    } catch (error) {
      console.error('Translation failed, using original prompt:', error);
      // If translation fails, we'll use the original prompt
    }
  }

  const promptText = {
    prompt: promptToUse
  };

  const instanceValue = helpers.toValue(promptText);
  const instances = [instanceValue];

  const parameter = {
    sampleCount: 4,
    aspectRatio: aspectRatio,
    safetyFilterLevel: 'block_few',
    personGeneration: 'allow_adult'
    //enhancePrompt: 'true'
  };
  const parameters = helpers.toValue(parameter);

  const request = {
    endpoint,
    instances,
    parameters,
  };

  try {
    const [response] = await predictionServiceClient.predict(request);
    const predictions = response.predictions;

    if (predictions.length === 0) {
      throw new Error('No images were generated');
    }

    // Convert base64 images to array
    const images = predictions.map(prediction =>
      prediction.structValue.fields.bytesBase64Encoded.stringValue
    );

    return images;
  } catch (error) {
    console.error('Error generating images:', error);
    throw error;
  }
}

// Add new endpoint for image generation
app.post('/generateImagesFromPrompt', async (req, res) => {
  const { prompt, aspectRatio } = req.body;
  const language = getLanguageFromRequest(req);

  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  try {
    const images = await generateImagesFromPrompt(prompt, aspectRatio, language);
    res.json({ images });
  } catch (error) {
    console.error('Error processing request:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/getCurrentDNA', async (req, res) => {
  res.json({ success: true });
});

app.post('/setDNA', async (req, res) => {
  res.json({ success: true });
});

async function generateVideoConcepts(prompt, brandDNA = null, language = 'english') {
  console.log('generateVideoConcepts function called with language:', language);

  const fetch = await import('node-fetch').then(module => module.default);

  // Prepare the prompt with brand DNA if available
  let fullPrompt = prompt;
  if (brandDNA) {
    fullPrompt = `Brand DNA:\n${JSON.stringify(brandDNA)}\n\nOverall creative concept for this video: ${prompt}`;
  }

  // --- LANGUAGE MODIFICATION ---
  console.log('Language check in generateVideoConcepts:', language);
  if (language === 'spanish') {
    console.log('Adding Spanish instruction to prompt');
    fullPrompt += "\nPLEASE RESPOND IN SPANISH";
  }

  // Prepare the parts array
  const parts = [{
    text: fullPrompt
  }];

  const requestBody = {
    contents: [{
      role: "user",
      parts: parts
    }],
    systemInstruction: {
      parts: [{
        text: VIDEO_GENERATION_SYSTEM_INSTRUCTIONS
      }]
    },
    generationConfig: {
      temperature: 1,
      maxOutputTokens: 8192,
      topP: 0.95
    }
  };

  try {
    const client = await auth.getClient();
    const accessToken = await client.getAccessToken();

    const currentLlmModel = modelState.getLlm();
    const url = `https://${currentLlmModel.apiEndpoint}/v1/projects/${PROJECT_ID}/locations/${LOCATION_ID}/publishers/google/models/${currentLlmModel.modelId}:generateContent`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken.token}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API Error Response:', errorText);
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const data = await response.json();
    const responseText = data?.candidates?.[0]?.content?.parts?.[0]?.text || null;

    if (!responseText) {
      throw new Error('No text content in API response');
    }

    return responseText;
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}

app.post('/generateVideoConcepts', async (req, res) => {
  const { prompt, brandDNA } = req.body;
  const language = getLanguageFromRequest(req);

  console.log('Video Concepts Request - Body:', req.body);
  console.log('Video Concepts Request - Extracted Language:', language);

  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  try {
    console.log('Calling generateVideoConcepts with language:', language);
    const result = await generateVideoConcepts(prompt, brandDNA, language);
    res.json(result);
  } catch (error) {
    console.error('Error processing request:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper function
async function generateStoryboard(videoConcept, brandDNA, creatorDNA, integrationType, language, version = 'v1') {
  const fetch = await import('node-fetch').then(module => module.default);

  // Prepare the prompt with brand DNA, creator DNA, video concept, and integration type
  let fullPrompt = `
        Brand DNA:
        ${JSON.stringify(brandDNA)}

        Creator DNA:
        ${JSON.stringify(creatorDNA)}

        Video Concept:
        ${videoConcept}

        Integration Type:
        ${integrationType.type} - ${integrationType.description}
        
        Please create a storyboard that effectively incorporates this specific type of brand integration while maintaining authenticity with the creator's DNA, style, and content approach.
    `;

  if (language === 'spanish') {
    fullPrompt += "\nPLEASE RESPOND IN SPANISH";
  }

  // Prepare the parts array
  const parts = [{
    text: fullPrompt
  }];

  // Select the appropriate system instructions based on version
  const systemInstructions = version === 'v2'
    ? STORYBOARD_V2_GENERATION_SYSTEM_INSTRUCTIONS
    : STORYBOARD_GENERATION_SYSTEM_INSTRUCTIONS;

  const requestBody = {
    contents: [{
      role: "user",
      parts: parts
    }],
    systemInstruction: {
      parts: [{
        text: systemInstructions
      }]
    },
    generationConfig: {
      temperature: 1,
      maxOutputTokens: 8192,
      topP: 0.95
    }
  };

  try {
    const client = await auth.getClient();
    const accessToken = await client.getAccessToken();

    const currentLlmModel = modelState.getLlm();
    const url = `https://${currentLlmModel.apiEndpoint}/v1/projects/${PROJECT_ID}/locations/${LOCATION_ID}/publishers/google/models/${currentLlmModel.modelId}:generateContent`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken.token}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API Error Response:', errorText);
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const data = await response.json();
    const responseText = data?.candidates?.[0]?.content?.parts?.[0]?.text || null;

    if (!responseText) {
      throw new Error('No text content in API response');
    }

    return responseText;
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}

// Endpoint handler
app.post('/generateStoryboard', async (req, res) => {
  const { videoConcept, brandDNA, creatorDNA, integrationType, version } = req.body;
  const language = getLanguageFromRequest(req);

  console.log('Storyboard Request - Extracted Language:', language);
  console.log('Storyboard Request - Version:', version || 'v1');

  if (!videoConcept) {
    return res.status(400).json({ error: 'Video concept is required' });
  }

  if (!brandDNA) {
    return res.status(400).json({ error: 'Brand DNA is required' });
  }

  if (!creatorDNA) {
    return res.status(400).json({ error: 'Creator DNA is required' });
  }

  if (!integrationType) {
    return res.status(400).json({ error: 'Integration type is required' });
  }

  try {
    const result = await generateStoryboard(videoConcept, brandDNA, creatorDNA, integrationType, language, version);
    res.json(result);
  } catch (error) {
    console.error('Error processing request:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add this new endpoint for storyboard image generation
app.post('/generateStoryboardImages', async (req, res) => {
  const { imagePrompts } = req.body;
  const language = getLanguageFromRequest(req);

  console.log('Storyboard Images Request - Extracted Language:', language);

  if (!Array.isArray(imagePrompts)) {
    return res.status(400).json({ error: 'Image prompts must be an array' });
  }

  try {
    // Generate all images in parallel
    const imagePromises = imagePrompts.map(prompt => generateImagesFromPrompt(prompt, '4:3', language));
    const results = await Promise.all(imagePromises);

    // For storyboards, we only want the first image from each generation
    const storyboardImages = results.map(result => result[0]);

    res.json({ images: storyboardImages });
  } catch (error) {
    console.error('Error processing request:', error);
    res.status(500).json({ error: error.message });
  }
});


app.post('/getMatch', upload.array('file', 5), async (req, res) => {
  try {
    const { brief, brandDNA } = req.body;
    const language = req.body.language || 'english';
    const matchType = req.body.matchType || 'expected'; // Get match type if provided

    console.log('Match Request - Body:', req.body);
    console.log('Match Request - Language from body:', language);
    console.log('Match Request - Match Type:', matchType);

    const files = req.files || [];

    // Read available creator DNAs
    const creatorDNAs = await readJSONFromStorage('creator-dnas.json');

    // Prepare the parts array for Gemini
    const parts = [];

    // Add any PDF files first
    for (const file of files) {
      parts.push({
        inline_data: {
          data: file.buffer.toString('base64'),
          mime_type: file.mimetype
        }
      });
    }

    // Create the match prompt
    let fullPrompt = `Please analyze this brand and their concept to find the best creator matches.

Brand Brief: ${brief}
<!-- The brief may contain a requirement to include a specific creator in the matches -->

Brand DNA: ${brandDNA}

Available Creator DNAs to choose from:
${JSON.stringify(creatorDNAs, null, 2)}

Please analyze the brand DNA and above creator DNAs to find the best matches for this collaboration opportunity. Think critically about the Brand's DNA, the Brand's Brief, and review every creator's DNA before making your recommendation.

YOU MUST OUTPUT the matches in the specified JSON format. NEVER GIVE ANY ADDITIONAL COMMENTARY. ONLY OUTPUT THE JSON`;

    if (language === 'spanish') {
      fullPrompt += "\nPLEASE RESPOND IN SPANISH";
    }

    parts.push({ text: fullPrompt });

    // Make request to Gemini
    const client = await auth.getClient();
    const accessToken = await client.getAccessToken();

    // Determine which system instructions to use based on whether matchType is provided
    const systemInstructions = matchType ? MATCH_V2_SYSTEM_INSTRUCTIONS : MATCH_SYSTEM_INSTRUCTIONS;

    const requestBody = {
      contents: [{
        role: "user",
        parts: parts
      }],
      systemInstruction: {
        parts: [{
          text: systemInstructions
        }]
      },
      generationConfig: {
        temperature: 1,
        maxOutputTokens: 8192,
        topP: 0.95
      }
    };

    const currentLlmModel = modelState.getLlm();
    const url = `https://${currentLlmModel.apiEndpoint}/v1/projects/${PROJECT_ID}/locations/${LOCATION_ID}/publishers/google/models/${currentLlmModel.modelId}:generateContent`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken.token}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    const rawText = data.candidates[0].content.parts[0].text;

    // More robust JSON cleaning
    let cleanJson = rawText;

    // Remove markdown code block markers if they exist
    if (cleanJson.includes('```')) {
      // Remove opening ```json or ``` and any whitespace
      cleanJson = cleanJson.replace(/^```(?:json)?\s*/, '');
      // Remove closing ``` and any whitespace
      cleanJson = cleanJson.replace(/\s*```\s*$/, '');
    }

    cleanJson = cleanJson.trim();

    try {
      const matches = JSON.parse(cleanJson);
      res.json({
        success: true,
        matches: matches.matches
      });
    } catch (parseError) {
      console.error('JSON Parse Error:', parseError);
      console.error('Failed to parse text:', cleanJson);

      // If first parse fails, try one more time by finding the JSON object directly
      try {
        const jsonStart = cleanJson.indexOf('{');
        const jsonEnd = cleanJson.lastIndexOf('}') + 1;
        if (jsonStart >= 0 && jsonEnd > jsonStart) {
          const extractedJson = cleanJson.slice(jsonStart, jsonEnd);
          const matches = JSON.parse(extractedJson);
          res.json({
            success: true,
            matches: matches.matches
          });
        } else {
          throw new Error('Could not locate valid JSON in response');
        }
      } catch (finalError) {
        res.status(500).json({
          success: false,
          error: 'Failed to parse model response'
        });
      }
    }
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/proxy-image', async (req, res) => {
  const imageUrl = req.query.url;

  if (!imageUrl) {
    return res.status(400).send('Image URL is required');
  }

  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }

    // Forward the content type
    res.set('Content-Type', response.headers.get('content-type'));

    // Pipe the image data directly to the response
    response.body.pipe(res);
  } catch (error) {
    console.error('Error proxying image:', error);
    res.status(500).send('Error fetching image');
  }
});

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


// Initialize current language
let currentLanguage = 'english'; // Default language

// Helper function to get language from request or use default
function getLanguageFromRequest(req) {
  console.log('getLanguageFromRequest - Request body:', req.body);
  console.log('getLanguageFromRequest - Request query:', req.query);

  // First check if language is in the request body
  if (req.body && req.body.language) {
    console.log('getLanguageFromRequest - Found language in body:', req.body.language);
    return req.body.language === 'spanish' ? 'spanish' : 'english';
  }
  // Then check if it's in query parameters
  if (req.query && req.query.language) {
    console.log('getLanguageFromRequest - Found language in query:', req.query.language);
    return req.query.language === 'spanish' ? 'spanish' : 'english';
  }
  // Finally fall back to the server's global setting
  console.log('getLanguageFromRequest - Using default language:', currentLanguage);
  return currentLanguage;
}

// Endpoint to get the current language
app.get('/getCurrentLanguage', (req, res) => {
  res.json({ currentLanguage });
});

// Endpoint to set the current language
app.post('/setCurrentLanguage', async (req, res) => {
  const { language } = req.body;

  if (language === 'english' || language === 'spanish') {
    currentLanguage = language;
    res.json({ success: true });
  } else {
    res.status(400).json({ error: 'Invalid language selection' });
  }
});

app.post('/translate', async (req, res) => {
  const { text, targetLanguage } = req.body;

  if (!text) {
    return res.status(400).json({ error: 'Text to translate is required.' });
  }

  try {
    const translatedText = await translateText(text, targetLanguage);
    res.json({ translatedText });
  } catch (error) {
    console.error('Error in /translate endpoint:', error);
    res.status(500).json({ error: 'Translation failed.' });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});

// Endpoint to regenerate content ideas for a specific creator
app.post('/regenerateContentIdeas', async (req, res) => {
  try {
    const { brandDNA, creatorDNA, currentIdeas, feedback, brief } = req.body;

    if (!brandDNA || !creatorDNA || !feedback) {
      return res.status(400).json({
        success: false,
        error: 'Missing required data: brandDNA, creatorDNA, or feedback'
      });
    }

    console.log('Regenerate Ideas Request - Creator:', creatorDNA.creatorName);
    console.log('Regenerate Ideas Request - Feedback:', feedback);


    // Create the prompt for Gemini
    const prompt = `Please generate new content ideas for a brand-creator collaboration based on the following information:

BRAND DNA:
${JSON.stringify(brandDNA, null, 2)}

CREATOR DNA:
${JSON.stringify(creatorDNA, null, 2)}

ORIGINAL BRIEF:
${brief || "No brief provided"}

CURRENT CONTENT IDEAS:
${Array.isArray(currentIdeas) ? currentIdeas.join('\n') : currentIdeas}

USER FEEDBACK:
${feedback}

Based on this information, please generate 3-5 new content ideas that address the user's feedback while maintaining alignment between the brand and creator. Remember to keep each idea concise, direct, and without titles or numbering.`;

    // Make request to Gemini
    const client = await auth.getClient();
    const accessToken = await client.getAccessToken();

    const requestBody = {
      contents: [{
        role: "user",
        parts: [{ text: prompt }]
      }],
      systemInstruction: {
        parts: [{
          text: BRAINSTORM_SYSTEM_INSTRUCTIONS
        }]
      },
      generationConfig: {
        temperature: 1.0,
        maxOutputTokens: 2048,
        topP: 0.95
      }
    };

    const currentLlmModel = modelState.getLlm();
    const url = `https://${currentLlmModel.apiEndpoint}/v1/projects/${PROJECT_ID}/locations/${LOCATION_ID}/publishers/google/models/${currentLlmModel.modelId}:generateContent`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken.token}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    const rawText = data.candidates[0].content.parts[0].text;

    // Clean up the JSON response
    let cleanJson = rawText;

    // Remove markdown code block markers if they exist
    if (cleanJson.includes('```')) {
      // Remove opening ```json or ``` and any whitespace
      cleanJson = cleanJson.replace(/^```(?:json)?\s*/, '');
      // Remove closing ``` and any whitespace
      cleanJson = cleanJson.replace(/\s*```\s*$/, '');
    }

    cleanJson = cleanJson.trim();

    try {
      const parsedResponse = JSON.parse(cleanJson);
      res.json({
        success: true,
        contentIdeas: parsedResponse.contentIdeas
      });
    } catch (parseError) {
      console.error('JSON Parse Error:', parseError);
      console.error('Failed to parse text:', cleanJson);

      // If first parse fails, try one more time by finding the JSON object directly
      try {
        const jsonStart = cleanJson.indexOf('{');
        const jsonEnd = cleanJson.lastIndexOf('}') + 1;
        if (jsonStart >= 0 && jsonEnd > jsonStart) {
          const extractedJson = cleanJson.slice(jsonStart, jsonEnd);
          const parsedResponse = JSON.parse(extractedJson);
          res.json({
            success: true,
            contentIdeas: parsedResponse.contentIdeas
          });
        } else {
          throw new Error('Could not locate valid JSON in response');
        }
      } catch (finalError) {
        res.status(500).json({
          success: false,
          error: 'Failed to parse model response'
        });
      }
    }
  } catch (error) {
    console.error('Error regenerating content ideas:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Helper function to regenerate a single storyboard frame
async function regenerateStoryboardFrame(videoConcept, brandDNA, creatorDNA, integrationType, storyboard, frameIndex, feedback, language) {
  const fetch = await import('node-fetch').then(module => module.default);

  // Prepare the prompt with all necessary context
  let fullPrompt = `
        Brand DNA:
        ${JSON.stringify(brandDNA)}

        Creator DNA:
        ${JSON.stringify(creatorDNA)}

        Video Concept:
        ${videoConcept}

        Integration Type:
        ${integrationType.type} - ${integrationType.description}
        
        Complete Storyboard:
        ${JSON.stringify(storyboard)}
        
        Frame to Regenerate (Index ${frameIndex}):
        ${JSON.stringify(storyboard[frameIndex])}
        
        User Feedback for this Frame:
        ${feedback}
        
        Please regenerate ONLY this specific frame based on the user feedback while maintaining consistency with the rest of the storyboard.
    `;

  if (language === 'spanish') {
    fullPrompt += "\nPLEASE RESPOND IN SPANISH";
  }

  // Prepare the parts array
  const parts = [{
    text: fullPrompt
  }];

  const requestBody = {
    contents: [{
      role: "user",
      parts: parts
    }],
    systemInstruction: {
      parts: [{
        text: STORYBOARD_FRAME_REGENERATION_SYSTEM_INSTRUCTIONS
      }]
    },
    generationConfig: {
      temperature: 1,
      maxOutputTokens: 8192,
      topP: 0.95
    }
  };

  try {
    const client = await auth.getClient();
    const accessToken = await client.getAccessToken();

    const currentLlmModel = modelState.getLlm();
    const url = `https://${currentLlmModel.apiEndpoint}/v1/projects/${PROJECT_ID}/locations/${LOCATION_ID}/publishers/google/models/${currentLlmModel.modelId}:generateContent`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken.token}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API Error Response:', errorText);
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const data = await response.json();
    const responseText = data?.candidates?.[0]?.content?.parts?.[0]?.text || null;

    if (!responseText) {
      throw new Error('No text content in API response');
    }

    return responseText;
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}

// Endpoint handler for regenerating a single storyboard frame
app.post('/regenerateStoryboardFrame', async (req, res) => {
  const { videoConcept, brandDNA, creatorDNA, integrationType, storyboard, frameIndex, feedback } = req.body;
  const language = getLanguageFromRequest(req);

  console.log('Storyboard Frame Regeneration Request - Extracted Language:', language);
  console.log('Regenerating frame index:', frameIndex);

  if (!videoConcept) {
    return res.status(400).json({ error: 'Video concept is required' });
  }

  if (!brandDNA) {
    return res.status(400).json({ error: 'Brand DNA is required' });
  }

  if (!creatorDNA) {
    return res.status(400).json({ error: 'Creator DNA is required' });
  }

  if (!integrationType) {
    return res.status(400).json({ error: 'Integration type is required' });
  }

  if (!storyboard || !Array.isArray(storyboard)) {
    return res.status(400).json({ error: 'Valid storyboard array is required' });
  }

  if (frameIndex === undefined || frameIndex < 0 || frameIndex >= storyboard.length) {
    return res.status(400).json({ error: 'Valid frame index is required' });
  }

  if (!feedback) {
    return res.status(400).json({ error: 'Feedback is required' });
  }

  try {
    const result = await regenerateStoryboardFrame(
      videoConcept,
      brandDNA,
      creatorDNA,
      integrationType,
      storyboard,
      frameIndex,
      feedback,
      language
    );

    // Parse the result to extract the frame data
    const cleanJSON = result.replace(/```json\n|\n```/g, '').trim();
    const frameData = JSON.parse(cleanJSON);

    res.json(frameData);
  } catch (error) {
    console.error('Error processing request:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint handler for reviewing storyboard
app.post('/reviewStoryboard', async (req, res) => {
  const { scenes, brandDNA, campaignBrief, campaignGoal } = req.body;
  const language = getLanguageFromRequest(req);

  if (!scenes || !Array.isArray(scenes)) {
    return res.status(400).json({ error: 'Valid scenes array is required' });
  }

  if (!brandDNA) {
    return res.status(400).json({ error: 'Brand DNA is required' });
  }

  if (!campaignBrief) {
    return res.status(400).json({ error: 'Campaign brief is required' });
  }

  if (!campaignGoal) {
    return res.status(400).json({ error: 'Campaign goal is required' });
  }

  try {
    const fetch = await import('node-fetch').then(module => module.default);

    // Prepare the prompt
    let fullPrompt = `
            Brand DNA:
            ${JSON.stringify(brandDNA)}

            Campaign Brief:
            ${campaignBrief}

            Campaign Goal:
            ${campaignGoal}

            Scenes to Review:
            ${JSON.stringify(scenes)}

            Please review each scene and identify any potential conflicts with the brand DNA.
        `;

    if (language === 'spanish') {
      fullPrompt += "\nPLEASE RESPOND IN SPANISH";
    }

    // Prepare the parts array
    const parts = [{
      text: fullPrompt
    }];

    const requestBody = {
      contents: [{
        role: "user",
        parts: parts
      }],
      systemInstruction: {
        parts: [{
          text: STORYBOARD_REVIEW_SYSTEM_INSTRUCTIONS
        }]
      },
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 8192,
        topP: 0.8
      }
    };

    const client = await auth.getClient();
    const accessToken = await client.getAccessToken();

    const currentLlmModel = modelState.getLlm();
    const url = `https://${currentLlmModel.apiEndpoint}/v1/projects/${PROJECT_ID}/locations/${LOCATION_ID}/publishers/google/models/${currentLlmModel.modelId}:generateContent`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken.token}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API Error Response:', errorText);
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const data = await response.json();
    const responseText = data?.candidates?.[0]?.content?.parts?.[0]?.text || null;

    if (!responseText) {
      throw new Error('No text content in API response');
    }

    // Parse the response and send it back
    const cleanJSON = responseText.replace(/```json\n|\n```/g, '').trim();
    const reviewData = JSON.parse(cleanJSON);

    res.json(reviewData);
  } catch (error) {
    console.error('Error processing request:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add Gemini AI Studio imports
const {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} = require("@google/generative-ai");
const { GoogleAIFileManager } = require("@google/generative-ai/server");
// Using existing fs module but need synchronous version as well
const fsSync = require('fs');
const os = require('os');
// const { AiModelsRouter } = require('./src/routes/api/v1/aiModels/index.js');
// const { creatorDnaRouter } = require('./src/routes/api/v1/creatorDna/index.js');

// Initialize Gemini for image editing
const geminiApiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(geminiApiKey);
const fileManager = new GoogleAIFileManager(geminiApiKey);
const imageEditModel = genAI.getGenerativeModel({
  model: "gemini-2.0-flash-exp-image-generation",
  generationConfig: {
    temperature: 1,
    topP: 0.95,
    topK: 40,
    maxOutputTokens: 8192,
    responseModalities: ['Text', 'Image']
  }
});

/**
 * Edit an image using Gemini's image generation capabilities
 */
async function editImageWithGemini(imageBuffer, editDescription) {
  try {
    // Convert image buffer to base64
    const base64Image = imageBuffer.toString('base64');

    // Prepare the content parts
    const contents = [
      {
        inlineData: {
          mimeType: 'image/png',
          data: base64Image
        }
      },
      { text: editDescription }
    ];

    // Generate content with the image and text
    const result = await imageEditModel.generateContent(contents);
    const response = result.response;

    // Check if response contains an image
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        // Return the base64 data of the edited image
        return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      }
    }

    throw new Error('No image found in Gemini response');
  } catch (error) {
    console.error('Error in image editing:', error);
    throw error;
  }
}

// Add new endpoint for image editing
app.post('/editImage', async (req, res) => {
  const { imageBase64, editDescription } = req.body;

  if (!imageBase64 || !editDescription) {
    return res.status(400).json({ error: 'Image and edit description are required' });
  }

  try {
    // Extract base64 data from data URL
    const base64Data = imageBase64.split(',')[1];
    // Convert base64 to buffer
    const imageBuffer = Buffer.from(base64Data, 'base64');

    // Get edited image as base64 data URL
    const editedImageDataUrl = await editImageWithGemini(imageBuffer, editDescription);

    // Return the edited image directly
    res.json({ editedImageDataUrl });
  } catch (error) {
    console.error('Error processing image edit request:', error);
    res.status(500).json({ error: error.message });
  }
});
