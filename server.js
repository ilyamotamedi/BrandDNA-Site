require('dotenv').config();
const express = require('express');

const { GoogleAuth } = require('google-auth-library');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs').promises;
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const { Storage } = require('@google-cloud/storage');
const storage = new Storage();
const bucket = storage.bucket(process.env.BUCKET_NAME);

const {
  BRAND_DNA_SYSTEM_INSTRUCTIONS,
  BRAND_DNA_SYSTEM_INSTRUCTIONS_SPANISH,
  CHANNEL_DNA_SYSTEM_INSTRUCTIONS,
  CHANNEL_DNA_SYSTEM_INSTRUCTIONS_SPANISH,
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

const {
  LLM_CONFIG,
  VISION_CONFIG,
} = require('./src/configs/aiModels.config.js');

// Initialize current model with default configuration
let currentLlmModel = LLM_CONFIG['gemini-2.0-flash-001'];
let currentVisionModel = VISION_CONFIG['imagen-3.0-generate-002'];

const PROJECT_ID = process.env.PROJECT_ID;
const LOCATION_ID = process.env.LOCATION_ID;

// Initialize creator DNAs file
const AVAILABLE_CREATOR_DNA_LISTS = [
  'creator-dnas.json',
  'creator-dnas-japan.json', // add more filenames here
];

// Initialize current creator DNAs file with default
let currentCreatorDnaListFile = 'creator-dnas.json';

// Initialize Brand DNAs file
const DNAS_FILE_PATH = path.join(__dirname, 'dnas.json');

// Initialize DNA storage file if it doesn't exist
async function initializeDNAsFile() {
  try {
    await fs.access(DNAS_FILE_PATH);
  } catch {
    await fs.writeFile(DNAS_FILE_PATH, JSON.stringify({})); //English
    await fs.writeFile(path.join(__dirname, 'dnas-spanish.json'), JSON.stringify({})); // Spanish
  }
}

// Call this when starting the server
initializeDNAsFile();

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? ['https://branddna.googleplex.com']
    : 'http://localhost:3000',
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.static(path.join(__dirname, 'public')));

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  }
});

const auth = new GoogleAuth({
  scopes: 'https://www.googleapis.com/auth/cloud-platform'
});

// Add a new endpoint to get available models
app.get('/getAvailableModels', (req, res) => {
  const llmModels = Object.entries(LLM_CONFIG).map(([key, config]) => ({
    id: key,
    displayName: config.displayName
  }));

  const visionModels = Object.entries(VISION_CONFIG).map(([key, config]) => ({
    id: key,
    displayName: config.displayName
  }));

  res.json({
    llmModels,
    visionModels
  });
});

app.get('/getCurrentModels', (req, res) => {
  res.json({
    llmModelId: currentLlmModel.modelId,
    visionModelId: currentVisionModel.modelId
  });
});

// Update the setModel endpoint
app.post('/setModel', express.json(), (req, res) => {
  const { modelId, modelType } = req.body;

  if (modelType === 'llm') {
    if (!LLM_CONFIG[modelId]) {
      return res.status(400).json({ error: 'Invalid LLM model selection' });
    }
    currentLlmModel = LLM_CONFIG[modelId];
  } else if (modelType === 'vision') {
    if (!VISION_CONFIG[modelId]) {
      return res.status(400).json({ error: 'Invalid vision model selection' });
    }
    currentVisionModel = VISION_CONFIG[modelId];
  } else {
    return res.status(400).json({ error: 'Invalid model type' });
  }

  res.json({ success: true });
});

// Endpoint to get available creator DNA lists
app.get('/getAvailableCreatorDnaLists', (req, res) => {
  res.json({ creatorDnaLists: AVAILABLE_CREATOR_DNA_LISTS });
});

// Endpoint to set the current creator DNA list file
app.post('/setCurrentCreatorDnaList', express.json(), (req, res) => {
  const { creatorDnaListFile } = req.body;
  if (AVAILABLE_CREATOR_DNA_LISTS.includes(creatorDnaListFile)) {
    currentCreatorDnaListFile = creatorDnaListFile;
    res.json({ success: true });
  } else {
    res.status(400).json({ error: 'Invalid creator DNA list file selection' });
  }
});

// Endpoint to get the current creator DNA list file
app.get('/getCurrentCreatorDnaList', (req, res) => {
  res.json({ currentCreatorDnaListFile: currentCreatorDnaListFile });
});

// Add these new endpoints to server.js
app.get('/getDNAs', async (req, res) => {
  try {
    const language = req.query.language || currentLanguage;
    const filename = getDNAFilename(language);

    let dnas = {};
    try {
      dnas = await readJSONFromStorage(filename);
    } catch (error) {
      console.log('No existing DNAs file, returning empty object');
    }

    res.json(dnas);
  } catch (error) {
    console.error('Error getting DNAs:', error);
    res.status(500).json({ error: 'Failed to get DNAs' });
  }
});

// Modify the saveDNAWithTranslation function to handle background translation
async function saveDNAWithTranslation(dna, sourceLanguage, backgroundTranslation = false) {
  try {
    // Get filenames
    const sourceFile = getDNAFilename(sourceLanguage);

    // Save to source language file immediately
    const sourceDNAs = await readJSONFromStorage(sourceFile);
    sourceDNAs[dna.brandName] = dna;
    await writeJSONToStorage(sourceFile, sourceDNAs);

    if (!backgroundTranslation) {
      return true; // Return immediately after saving source language
    }

    // Handle translation and secondary save in the background
    (async () => {
      try {
        const targetFile = getOppositeLanguageFile(sourceFile);
        const targetLanguage = sourceLanguage === 'spanish' ? 'en' : 'es';
        const translatedDNA = await translateDNAObject(dna, targetLanguage);

        const targetDNAs = await readJSONFromStorage(targetFile);
        targetDNAs[dna.brandName] = translatedDNA;
        await writeJSONToStorage(targetFile, targetDNAs);

        console.log(`Background translation completed for ${dna.brandName}`);
      } catch (error) {
        console.error('Error in background translation:', error);
      }
    })();

    return true;
  } catch (error) {
    console.error('Error in saveDNAWithTranslation:', error);
    throw error;
  }
}

// Modify the /saveDNA endpoint
app.post('/saveDNA', express.json(), async (req, res) => {
  try {
    const { dna, language } = req.body;
    const requestLanguage = language || currentLanguage;

    // Save immediately without waiting for translation
    await saveDNAWithTranslation(dna, requestLanguage, true);
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving DNA:', error);
    res.status(500).json({ error: 'Failed to save DNA' });
  }
});

app.delete('/deleteDNA/:brandName', async (req, res) => {
  try {
    const brandName = decodeURIComponent(req.params.brandName);

    // Delete from both language files to ensure consistency
    const englishDNAs = await readJSONFromStorage('dnas.json');
    const spanishDNAs = await readJSONFromStorage('dnas-spanish.json');

    if (englishDNAs[brandName]) delete englishDNAs[brandName];
    if (spanishDNAs[brandName]) delete spanishDNAs[brandName];

    await writeJSONToStorage('dnas.json', englishDNAs);
    await writeJSONToStorage('dnas-spanish.json', spanishDNAs);

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting DNA:', error);
    res.status(500).json({ error: 'Failed to delete DNA' });
  }
});

async function callGeminiAPI(brandName, files = null, language = 'english') {
  const fetch = await import('node-fetch').then(module => module.default);

  // Prepare the parts array
  const parts = [];

  // Add files if provided
  if (files && files.length > 0) {
    files.forEach(file => {
      const filePart = {
        inline_data: {
          data: file.buffer.toString('base64'),
          mimeType: file.mimetype
        }
      };
      parts.push(filePart);
    });
  }

  // Add the text prompt with language instruction if Spanish
  let promptText = `Get the brand DNA of ${brandName}`;
  if (language === 'spanish') {
    promptText += "\nPLEASE RESPOND IN SPANISH";
  }

  parts.push({
    text: promptText
  });

  // Base request configuration
  const requestBody = {
    contents: [{
      role: "user",
      parts: parts
    }],
    systemInstruction: {
      parts: [{
        text: language === 'spanish' ? BRAND_DNA_SYSTEM_INSTRUCTIONS_SPANISH : BRAND_DNA_SYSTEM_INSTRUCTIONS
      }]
    },
    generationConfig: {
      responseModalities: ["TEXT"],
      temperature: 1,
      maxOutputTokens: 8192,
      topP: 0.95
    },
    safetySettings: [
      {
        category: "HARM_CATEGORY_HATE_SPEECH",
        threshold: "OFF"
      },
      {
        category: "HARM_CATEGORY_DANGEROUS_CONTENT",
        threshold: "OFF"
      },
      {
        category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
        threshold: "OFF"
      },
      {
        category: "HARM_CATEGORY_HARASSMENT",
        threshold: "OFF"
      }
    ]
  };

  // Add tools configuration for supported models
  const modelsWithToolUse = ['gemini-2.0-flash-001', 'gemini-2.0-pro-exp-02-05', 'gemini-2.0-flash-exp'];
  if (modelsWithToolUse.includes(currentLlmModel.modelId)) {
    requestBody.tools = [{
      googleSearch: {}
    }];
  }

  try {
    const client = await auth.getClient();
    const accessToken = await client.getAccessToken();

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
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || null;

    if (!rawText) {
      throw new Error('No text content in API response');
    }

    // Clean up the text by removing markdown code blocks and extra whitespace
    const cleanJson = rawText.replace(/```json\n|\n```/g, '').trim();

    // Parse and verify the JSON structure
    const parsedData = JSON.parse(cleanJson);
    return parsedData;
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}

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

app.post('/generateImages', express.json(), async (req, res) => {
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
app.post('/generateImagesFromPrompt', express.json(), async (req, res) => {
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

// Modify the /getBrandDNA endpoint
app.post('/getBrandDNA', upload.array('file', 5), async (req, res) => {
  const brandName = req.body.brandName;
  const language = req.body.language || currentLanguage;

  if (!brandName) {
    return res.status(400).json({ error: 'Brand name is required' });
  }

  try {
    const files = req.files;
    const result = await callGeminiAPI(brandName, files, language);

    // Save the DNA in current language and trigger background translation
    await saveDNAWithTranslation(result, language, true);

    res.json(result);
  } catch (error) {
    console.error('Error processing request:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/getCurrentDNA', async (req, res) => {
  res.json({ success: true });
});

app.post('/setDNA', express.json(), async (req, res) => {
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

app.post('/generateVideoConcepts', express.json(), async (req, res) => {
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
app.post('/generateStoryboard', express.json(), async (req, res) => {
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
app.post('/generateStoryboardImages', express.json(), async (req, res) => {
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


// CHANNEL DNA

app.get('/getCreatorDNAs', async (req, res) => {
  try {
    const language = req.query.language || currentLanguage;
    const filename = language === 'spanish' ? 'creator-dnas-spanish.json' : 'creator-dnas.json';

    let dnas = {};
    try {
      dnas = await readJSONFromStorage(filename);
    } catch (error) {
      console.log('No existing creator DNAs file, returning empty object');
    }

    res.json(dnas);
  } catch (error) {
    console.error('Error reading creator DNAs:', error);
    res.status(500).json({ error: 'Failed to retrieve creator DNAs' });
  }
});

app.post('/saveCreatorDNA', express.json(), async (req, res) => {
  try {
    const { creatorDNA, language } = req.body;
    const requestLanguage = language || currentLanguage;

    // Save to source language file
    const sourceFile = requestLanguage === 'spanish' ? 'creator-dnas-spanish.json' : 'creator-dnas.json';

    let sourceDNAs = {};
    try {
      sourceDNAs = await readJSONFromStorage(sourceFile);
    } catch (error) {
      console.log('No existing creator DNAs file, creating new one');
    }

    sourceDNAs[creatorDNA.channelName] = creatorDNA;
    await writeJSONToStorage(sourceFile, sourceDNAs);

    // Translate and save to other language file in the background
    (async () => {
      try {
        const targetFile = requestLanguage === 'spanish' ? 'creator-dnas-spanish.json' : 'creator-dnas.json';
        const targetLanguage = requestLanguage === 'spanish' ? 'en' : 'es';

        // Translate the channel analysis
        const translatedDNA = JSON.parse(JSON.stringify(creatorDNA));

        // Ensure channelName is preserved
        const originalChannelName = translatedDNA.channelName;

        // Log the structure for troubleshooting
        console.log(`DNA structure for ${originalChannelName}:`,
          `channelAnalysis type: ${translatedDNA.channelAnalysis ?
            (Array.isArray(translatedDNA.channelAnalysis) ? 'array' : typeof translatedDNA.channelAnalysis) :
            'undefined'}`
        );

        // Translate each section if channelAnalysis exists and is an array
        if (translatedDNA.channelAnalysis && Array.isArray(translatedDNA.channelAnalysis)) {
          for (const section of translatedDNA.channelAnalysis) {
            // First translate the body to maintain context
            section.sectionBody = await translateText(section.sectionBody, targetLanguage);

            // Then translate the title if needed
            if (requestLanguage === 'spanish') {
              // Map Spanish to English titles
              const titleMap = {
                'ADN del Creador': 'CreatorDNA',
                'Personalidad del Creador': 'Creator Personality',
                'Estilo de Contenido': 'Content Style',
                'Conexión con la Audiencia': 'Audience Connection',
                'Historia del Canal': 'Channel Story'
              };
              section.sectionTitle = titleMap[section.sectionTitle] || await translateText(section.sectionTitle, targetLanguage);
            } else {
              // Map English to Spanish titles
              const titleMap = {
                'CreatorDNA': 'ADN del Creador',
                'Creator Personality': 'Personalidad del Creador',
                'Content Style': 'Estilo de Contenido',
                'Audience Connection': 'Conexión con la Audiencia',
                'Channel Story': 'Historia del Canal'
              };
              section.sectionTitle = titleMap[section.sectionTitle] || await translateText(section.sectionTitle, targetLanguage);
            }
          }
        } else {
          console.log(`Warning: channelAnalysis not found or not an array for channel ${creatorDNA.channelName}`);
        }

        // Restore original channel name
        translatedDNA.channelName = originalChannelName;

        const targetDNAs = await readJSONFromStorage(targetFile);
        targetDNAs[creatorDNA.channelName] = translatedDNA;
        await writeJSONToStorage(targetFile, targetDNAs);

        console.log(`Background translation completed for channel ${creatorDNA.channelName}`);
      } catch (error) {
        console.error('Error in background translation:', error);
      }
    })();

    res.json({ success: true });
  } catch (error) {
    console.error('Error saving creator DNA:', error);
    res.status(500).json({ error: 'Failed to save creator DNA' });
  }
});

app.delete('/deleteCreatorDNA/:channelName', async (req, res) => {
  try {
    const channelName = decodeURIComponent(req.params.channelName);
    console.log('Attempting to delete channel:', channelName);

    // Delete from both language files
    const englishDNAs = await readJSONFromStorage('creator-dnas.json');
    const spanishDNAs = await readJSONFromStorage('creator-dnas-spanish.json');

    if (englishDNAs[channelName]) delete englishDNAs[channelName];
    if (spanishDNAs[channelName]) delete spanishDNAs[channelName];

    await writeJSONToStorage('creator-dnas.json', englishDNAs);
    await writeJSONToStorage('creator-dnas-spanish.json', spanishDNAs);

    console.log('Successfully deleted channel:', channelName);
    res.json({
      success: true,
      message: `Successfully deleted ${channelName}`
    });
  } catch (error) {
    console.error('Error deleting creator DNA:', error);
    res.status(500).json({
      error: 'Failed to delete creator DNA',
      details: error.message
    });
  }
});

app.post('/analyzeChannel', upload.array('file', 5), async (req, res) => {
  try {
    const { channelName, transcripts, language } = req.body;
    const requestLanguage = language || currentLanguage;
    const files = req.files || [];

    const processedTranscripts = JSON.parse(transcripts).map(t =>
      t.transcript.map(item => item.text).join(' ')
    );

    // Process uploaded files and split into text and binary files
    const parts = [];
    const maxTextSize = 500000; // 500KB limit for text content

    // Add main text prompt part with language instruction
    let analysisPrompt = `Analyze the YouTube channel "${channelName}" based on the following content:

1. Video Transcripts:
${processedTranscripts.join('\n\n=== NEXT VIDEO ===\n\n')}

2. Additional Channel Content and Context:`;

    // Add language instruction for Spanish
    if (requestLanguage === 'spanish') {
      analysisPrompt += "\n\nPLEASE GENERATE THE ENTIRE ANALYSIS IN SPANISH, INCLUDING ALL CONTENT AND DESCRIPTIONS.";
    }

    parts.push({
      text: analysisPrompt
    });

    // Process each file
    for (const file of files) {
      try {
        // Check if file is an image based on mimetype
        if (file.mimetype.startsWith('image/')) {
          parts.push({
            inline_data: {
              data: file.buffer.toString('base64'),
              mime_type: file.mimetype
            }
          });
        } else {
          // For text files, check size and add content
          const content = file.buffer.toString('utf8');
          if (content.length > maxTextSize) {
            console.warn(`File ${file.originalname} exceeds size limit, truncating...`);
            parts.push({
              text: `\n\nDocument (${file.originalname}):\n${content.substring(0, maxTextSize)}... (truncated)`
            });
          } else {
            parts.push({
              text: `\n\nDocument (${file.originalname}):\n${content}`
            });
          }
        }
      } catch (error) {
        console.warn(`Error processing file ${file.originalname}:`, error);
        // Continue with other files if one fails
        continue;
      }
    }

    // Add final prompt part
    parts.push({
      text: `\n\nPlease analyze all available content to provide a comprehensive understanding of the channel's DNA, considering the video transcripts, images, and any additional documents provided.`
    });

    const client = await auth.getClient();
    const accessToken = await client.getAccessToken();

    const requestBody = {
      contents: [{
        role: "user",
        parts: parts
      }],
      systemInstruction: {
        parts: [{
          text: requestLanguage === 'spanish' ?
            CHANNEL_DNA_SYSTEM_INSTRUCTIONS_SPANISH :
            CHANNEL_DNA_SYSTEM_INSTRUCTIONS
        }]
      },
      generationConfig: {
        temperature: 1,
        maxOutputTokens: 8192,
        topP: 0.95
      }
    };

    console.log('Making request with parts:', parts.length);

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
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || null;

    if (!rawText) {
      throw new Error('No text content in API response');
    }

    const cleanJson = rawText.replace(/```json\n|\n```/g, '').trim();
    const analysis = JSON.parse(cleanJson);

    res.json({
      success: true,
      analysis: {
        channelName,
        channelAnalysis: analysis.channelAnalysis
      }
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
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
app.post('/setCurrentLanguage', express.json(), (req, res) => {
  const { language } = req.body;

  if (language === 'english' || language === 'spanish') {
    currentLanguage = language;
    res.json({ success: true });
  } else {
    res.status(400).json({ error: 'Invalid language selection' });
  }
});

app.post('/translate', express.json(), async (req, res) => {
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

async function translateText(text, targetLanguage = 'en') {
  const fetch = await import('node-fetch').then(module => module.default);

  const parts = [{
    text: `You are an expert translator. Translate the following text to ${targetLanguage}. Never give any commentary, just translate the text, and match the exact formatting that the text is already in:\n\n${text}`
  }];

  const requestBody = {
    contents: [{
      role: "user",
      parts: parts
    }],
    generationConfig: {
      temperature: 0.2, // Lower temperature for more precise translation
      maxOutputTokens: 8192,
      topP: 0.95
    }
  };

  try {
    const client = await auth.getClient();
    const accessToken = await client.getAccessToken();

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
    return responseText.trim(); // Clean up any extra whitespace.

  } catch (error) {
    console.error('Error during translation:', error);
    throw error; // Re-throw so calling function can handle
  }
}

// Helper function to get the appropriate filename based on language
function getDNAFilename(language) {
  return language === 'spanish' ? 'dnas-spanish.json' : 'dnas.json';
}

// Helper function to get the opposite language's filename
function getOppositeLanguageFile(currentFile) {
  return currentFile === 'dnas.json' ? 'dnas-spanish.json' : 'dnas.json';
}

// Helper function to translate DNA object
async function translateDNAObject(dna, targetLanguage) {
  try {
    // Create a deep copy of the DNA object
    const translatedDNA = JSON.parse(JSON.stringify(dna));

    // Translate each section of the brand analysis
    for (const section of translatedDNA.brandAnalysis) {
      // Translate both the section title and body
      section.sectionTitle = await translateText(section.sectionTitle, targetLanguage);
      section.sectionBody = await translateText(section.sectionBody, targetLanguage);
    }

    return translatedDNA;
  } catch (error) {
    console.error('Error translating DNA:', error);
    throw error;
  }
}

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});

// Add this function after the getChannelTranscripts endpoint
async function getAverageViews(channelId) {
  const API_KEY = process.env.BRANDCONNECT_API_KEY;

  try {
    console.log(`Calculating average views for channel: ${channelId}`);

    // Step 1: Get the uploads playlist ID for the channel
    const channelResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${channelId}&key=${API_KEY}`
    );
    const channelData = await channelResponse.json();

    if (!channelData.items || channelData.items.length === 0) {
      console.error('No channel found with ID:', channelId);
      return 0;
    }

    const uploadsPlaylistId = channelData.items[0].contentDetails.relatedPlaylists.uploads;
    console.log(`Uploads playlist ID: ${uploadsPlaylistId}`);

    // Step 2: Get the most recent videos from the uploads playlist (up to 50)
    const playlistResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${uploadsPlaylistId}&maxResults=50&key=${API_KEY}`
    );
    const playlistData = await playlistResponse.json();

    if (!playlistData.items || playlistData.items.length === 0) {
      console.error('No videos found in uploads playlist');
      return 0;
    }

    // Get the video IDs
    const videoIds = playlistData.items.map(item => item.contentDetails.videoId);
    console.log(`Found ${videoIds.length} videos in uploads playlist`);

    // Step 3: Get video details including statistics and publish dates
    const videosResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoIds.join(',')}&key=${API_KEY}`
    );
    const videosData = await videosResponse.json();

    if (!videosData.items || videosData.items.length === 0) {
      console.error('No video details found');
      return 0;
    }

    // Step 4: Filter videos from the last 3 months and calculate average views
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    // Sort videos by publish date (newest first)
    const sortedVideos = videosData.items.sort((a, b) => {
      const dateA = new Date(a.snippet.publishedAt);
      const dateB = new Date(b.snippet.publishedAt);
      return dateB - dateA;
    });

    // First try to get videos from the last 3 months
    let recentVideos = sortedVideos.filter(video => {
      const publishDate = new Date(video.snippet.publishedAt);
      return publishDate >= threeMonthsAgo;
    });

    // If no videos in the last 3 months, use the 5 most recent videos
    let timeframe = "past 3 months";
    if (recentVideos.length === 0) {
      console.log('No videos published in the last 3 months, using 5 most recent videos instead');
      recentVideos = sortedVideos.slice(0, 5);
      timeframe = "5 most recent videos";
    }

    console.log(`Found ${recentVideos.length} videos for average calculation (${timeframe})`);

    if (recentVideos.length === 0) {
      console.log('No videos available for average calculation');
      return { averageViews: 0, timeframe: "no videos available" };
    }

    // Calculate total views and average
    let totalViews = 0;

    recentVideos.forEach(video => {
      const views = parseInt(video.statistics.viewCount) || 0;
      console.log(`Video ${video.id}: ${video.snippet.title} - ${views} views (published: ${video.snippet.publishedAt})`);
      totalViews += views;
    });

    const averageViews = Math.round(totalViews / recentVideos.length);
    console.log(`Total views: ${totalViews}, Average views: ${averageViews} (${timeframe})`);

    return { averageViews, timeframe };
  } catch (error) {
    console.error('Error calculating average views:', error);
    return { averageViews: 0, timeframe: "error" };
  }
}

// Add a new endpoint to get channel stats
app.post('/getChannelStats', async (req, res) => {
  const { channelId } = req.body;

  if (!channelId) {
    return res.status(400).json({
      success: false,
      error: 'Channel ID is required'
    });
  }

  try {
    const result = await getAverageViews(channelId);

    res.json({
      success: true,
      stats: {
        averageViews: result.averageViews,
        timeframe: result.timeframe
      }
    });
  } catch (error) {
    console.error('Error getting channel stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Add a test endpoint for average views
app.get('/test-average-views', async (req, res) => {
  const { channelId } = req.query;

  if (!channelId) {
    return res.status(400).send('Channel ID is required as a query parameter');
  }

  try {
    const averageViews = await getAverageViews(channelId);

    res.send(`
            <h1>Average Views Test</h1>
            <p>Channel ID: ${channelId}</p>
            <p>Average Views (last 3 months): ${averageViews.toLocaleString()}</p>
        `);
  } catch (error) {
    console.error('Error in test endpoint:', error);
    res.status(500).send(`Error: ${error.message}`);
  }
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
app.post('/regenerateStoryboardFrame', express.json(), async (req, res) => {
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
app.post('/reviewStoryboard', express.json(), async (req, res) => {
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
