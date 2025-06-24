const { GoogleAuth } = require('google-auth-library');
const fs = require('fs');
const path = require('path');

const { readJSONFromStorage, writeJSONToStorage, upload } = require('../utils/apiHelpers.js');


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
} = require('../configs/systemInstructions.config.js');


const {
  LLM_CONFIG,
  VISION_CONFIG,
} = require('../configs/aiModels.config.js');

// Initialize current model with default configuration
let currentLlmModel = LLM_CONFIG['gemini-2.0-flash-001'];
let currentVisionModel = VISION_CONFIG['imagen-3.0-generate-002'];

const PROJECT_ID = process.env.PROJECT_ID;
const LOCATION_ID = process.env.LOCATION_ID;

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
// const { creatorDnaRouter } = require('./src/routes/api/v1/creatorDna/index.js');

const auth = new GoogleAuth({
  scopes: 'https://www.googleapis.com/auth/cloud-platform'
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

// Helper function to get the appropriate filename based on language
function getDNAFilename(language) {
  return language === 'spanish' ? 'dnas-spanish.json' : 'dnas.json';
}

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


// Helper function to get the opposite language's filename
function getOppositeLanguageFile(currentFile) {
  return currentFile === 'dnas.json' ? 'dnas-spanish.json' : 'dnas.json';
}

module.exports={
  callGeminiAPI, 
  saveDNAWithTranslation,
  translateText
};