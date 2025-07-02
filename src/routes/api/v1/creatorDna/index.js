const express = require("express");
const { GoogleAuth } = require('google-auth-library');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { getAverageViews } = require('../../../../services/creatorDna.service.js');
const upload = require('../../../../../src/configs/multer.config.js');

const creatorDnaRouter = express.Router();

const modelState = require('../../../../services/modelState.service.js');
const { translateText } = require('../../../../services/geminiCreation.service.js');


const { readJSONFromStorage, writeJSONToStorage } = require('../../../../utils/apiHelpers.util.js');

const auth = new GoogleAuth({
  scopes: 'https://www.googleapis.com/auth/cloud-platform'
});

const PROJECT_ID = process.env.PROJECT_ID;
const LOCATION_ID = process.env.LOCATION_ID;

let currentCreatorDnaListFile = 'creator-dnas.json';
let currentLanguage = 'english'; // Default language

// Initialize creator DNAs file
const AVAILABLE_CREATOR_DNA_LISTS = [
  'creator-dnas.json',
  'creator-dnas-japan.json', // add more filenames here
];

const {
  CHANNEL_DNA_SYSTEM_INSTRUCTIONS,
  CHANNEL_DNA_SYSTEM_INSTRUCTIONS_SPANISH,
} = require('../../../../../src/configs/systemInstructions.config.js');



// Endpoint to get available creator DNA lists
creatorDnaRouter.get('/getAvailableCreatorDnaLists', (req, res) => {
  res.json({ creatorDnaLists: AVAILABLE_CREATOR_DNA_LISTS });
});

// Endpoint to get available creator DNA lists
creatorDnaRouter.get('/getAvailableCreatorDnaLists', (req, res) => {
  res.json({ creatorDnaLists: AVAILABLE_CREATOR_DNA_LISTS });
});

// Endpoint to set the current creator DNA list file 
creatorDnaRouter.post('/setCurrentCreatorDnaList', express.json(), (req, res) => {
  const { creatorDnaListFile } = req.body;
  if (AVAILABLE_CREATOR_DNA_LISTS.includes(creatorDnaListFile)) {
    currentCreatorDnaListFile = creatorDnaListFile;
    res.json({ success: true });
  } else {
    res.status(400).json({ error: 'Invalid creator DNA list file selection' });
  }
});

// Endpoint to get the current creator DNA list file 
creatorDnaRouter.get('/getCurrentCreatorDnaList', (req, res) => {
  res.json({ currentCreatorDnaListFile: currentCreatorDnaListFile });
});

// Create DNA based on language
creatorDnaRouter.get('/getCreatorDNAs', async (req, res) => {
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

// Endpoint to save creator DNA
creatorDnaRouter.post('/saveCreatorDNA', express.json(), async (req, res) => {
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
        const targetFile = requestLanguage === 'spanish' ? 'creator-dnas.json' : 'creator-dnas-spanish.json';
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

// Endpoint to delete creator DNA
creatorDnaRouter.delete('/deleteCreatorDNA/:channelName', async (req, res) => {
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

// Analyze Creator Channel 
creatorDnaRouter.post('/analyzeChannel', upload.array('file', 5), async (req, res) => {
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
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || null;

    if (!rawText) {
      throw new Error('No text content in API response');
    }

    const cleanJson = rawText.replace(/```json\n|\n```/g, '').trim();
    // TODO: Fix Unexpected token 'O', "Okay, I'm "... is not valid JSON
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

// Add a new endpoint to get channel stats
creatorDnaRouter.post('/getChannelStats', async (req, res) => {
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
creatorDnaRouter.get('/test-average-views', async (req, res) => {
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


module.exports = {
  creatorDnaRouter,
};
