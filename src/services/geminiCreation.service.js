const { GoogleAuth } = require('google-auth-library');
const fs = require('fs');
const path = require('path');
const modelState = require('./modelState.service.js');
const { YtDlp } = require('ytdlp-nodejs'); // <-- ADDED: For video downloading


const {
  BRAND_DNA_SYSTEM_INSTRUCTIONS,
  BRAND_DNA_SYSTEM_INSTRUCTIONS_SPANISH,
} = require('../configs/systemInstructions.config.js');

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

const auth = new GoogleAuth({
  scopes: 'https://www.googleapis.com/auth/cloud-platform'
});
module.exports = (db) => {
  const brandsCollection = db.collection('brands');
  const ytdlp = new YtDlp(); // <-- ADDED: Initialize ytdlp client


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
    if (modelsWithToolUse.includes(modelState.getLlm().modelId)) {
      requestBody.tools = [{
        googleSearch: {}
      }];
    }

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

  /**
   * @function saveDNAWithTranslation
   * @description Saves/updates a Brand DNA document in Firestore, handling nested translations.
   * @param {Object} dna - The brand DNA object to save. Assumes dna.brandName exists.
   * @param {string} sourceLanguage - The language of the provided DNA ('english' or 'spanish').
   * @param {boolean} backgroundTranslation - Whether to trigger background translation.
   * @returns {Promise<boolean>} True if successful.
   */
  async function saveDNAWithTranslation(dna, sourceLanguage, backgroundTranslation = false) {
    try {
      const docId = dna.brandName; // Use brandName as the document ID
      const docRef = brandsCollection.doc(docId); // Reference to the specific document
      const langCode = sourceLanguage === 'spanish' ? 'es' : 'en';

      console.log(`[DEBUG] Firestore: Attempting to save/update brand DNA for ID: ${docId}, language: ${sourceLanguage}`);

      // Fetch existing document to merge translations and other fields
      const existingDoc = await docRef.get();
      let newDocData = {};

      if (existingDoc.exists) {
        newDocData = existingDoc.data();
        console.log(`[DEBUG] Firestore: Found existing document for ID: ${docId}. Merging data.`);
      } else {
        console.log(`[DEBUG] Firestore: No existing document found for ID: ${docId}. Creating new.`);
        // If new, initialize translations object
        newDocData.translations = {};
      }

      // Update/add the specific language translation
      newDocData.translations[langCode] = {
        brandDisplayName: dna.brandName, // Display name is usually the brandName itself
        brandAnalysis: dna.brandAnalysis // The array of sectionTitle/sectionBody
      };

      // Also update top-level fields (like brandName, brandColors) if they come with the new data
      // This assumes top-level fields are the primary, language-agnostic representation
      Object.keys(dna).forEach(key => {
        if (key !== 'translations') { // Don't overwrite the entire translations object
          newDocData[key] = dna[key];
        }
      });
      // Ensure brandName is always set at the top level
      newDocData.brandName = dna.brandName;


      await docRef.set(newDocData, { merge: true }); // Use merge: true to update parts of the document
      console.log(`[DEBUG] Firestore: Document ${docId} set successfully.`);

      if (backgroundTranslation) {
        // Handle translation and secondary save in the background
        (async () => {
          try {
            const targetLanguageCode = langCode === 'en' ? 'es' : 'en';
            const targetLanguageFull = targetLanguageCode === 'es' ? 'spanish' : 'english';

            // Only translate if the target translation doesn't already exist or needs updating
            if (!newDocData.translations[targetLanguageCode]) {
              console.log(`[DEBUG] Background translation for brand ${dna.brandName} from ${langCode} to ${targetLanguageCode}...`);

              // Create a deep copy of the original DNA for translation
              const dnaToTranslate = {
                brandName: dna.brandName, // Preserve original brand name for context
                brandAnalysis: dna.brandAnalysis // The content to translate
              };

              const translatedContent = await translateDNAObject(dnaToTranslate, targetLanguageFull);

              // Update the translations field in the Firestore document using FieldValue.arrayUnion or simply set
              const updateData = {
                [`translations.${targetLanguageCode}`]: {
                  brandDisplayName: translatedContent.brandName, // Use translated brandName (if any, or original)
                  brandAnalysis: translatedContent.brandAnalysis
                }
              };
              await docRef.update(updateData);
              console.log(`[DEBUG] Background translation for brand ${dna.brandName} to ${targetLanguageCode} completed and saved.`);
            } else {
              console.log(`[DEBUG] Translation for brand ${dna.brandName} to ${targetLanguageCode} already exists or is not needed.`);
            }
          } catch (translationError) {
            console.error(`[ERROR] Error in background translation for ${dna.brandName}:`, translationError);
          }
        })();
      }

      return true;
    } catch (error) {
      console.error('[ERROR] Error in saveDNAWithTranslation:', error);
      throw error;
    }
  }

  /**
   * @function translateDNAObject
   * @description Helper function to translate a brand DNA object's content.
   * @param {Object} dna - The DNA object to translate.
   * @param {string} targetLanguage - The target language ('english' or 'spanish').
   * @returns {Promise<Object>} The translated DNA object.
   */
  async function translateDNAObject(dna, targetLanguage) {
    try {
      const translatedDNA = JSON.parse(JSON.stringify(dna)); // Deep copy

      // Translate each section of the brand analysis
      if (translatedDNA.brandAnalysis && Array.isArray(translatedDNA.brandAnalysis)) {
        for (const section of translatedDNA.brandAnalysis) {
          section.sectionTitle = await translateText(section.sectionTitle, targetLanguage);
          section.sectionBody = await translateText(section.sectionBody, targetLanguage);
        }
      }

      return translatedDNA;
    } catch (error) {
      console.error('Error translating DNA object:', error);
      throw error;
    }
  }

  /**
   * @function translateText
   * @description Translates a given text using the Gemini API.
   * @param {string} text - The text to translate.
   * @param {string} targetLanguage - The target language ('english' or 'spanish').
   * @returns {Promise<string>} The translated text.
   */
  async function translateText(text, targetLanguage) {
    const fetch = await import('node-fetch').then(module => module.default);
    const targetLangCode = targetLanguage === 'spanish' ? 'es' : 'en'; // Convert to lang code

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
        console.error('API Error Response during translation:', errorText);
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const data = await response.json();
      const responseText = data?.candidates?.[0]?.content?.parts?.[0]?.text || null;

      if (!responseText) {
        throw new Error('No text content in API translation response');
      }
      return responseText.trim(); // Clean up any extra whitespace.

    } catch (error) {
      console.error('Error during translation:', error);
      throw error; // Re-throw so calling function can handle
    }
  }

  /**
   * @function transcribeVideo
   * @description Downloads audio from a video URL and transcribes it using Gemini,
   * matching the existing authentication and API call pattern.
   * @param {string} absolutePath The path from the URL of the video to transcribe.
   * @returns {Promise<string>} The transcribed text.
   */
  async function transcribeVideo(absolutePath) {
   
      const audioData = fs.readFileSync(absolutePath);
      const requestBody = {
        contents: [{
          role: "user",
          parts: [
            { text: "Transcribe the spoken words in this audio file accurately. Provide only the text, without any commentary." },
            {
              inline_data: {
                data: audioData.toString('base64'),
                mimeType: 'audio/mp3'
              }
            }
          ]
        }],
        generationConfig: {
          temperature: 0.1, // Lower temp for more deterministic transcription
        }
      };

      const client = await auth.getClient();
      const accessToken = await client.getAccessToken();

      // Use a model known for multimodal capabilities.
      // The beta endpoint is often used for the latest features.
      const modelId = 'gemini-2.5-flash-001';
      const url = `https://${LOCATION_ID}-aiplatform.googleapis.com/v1beta1/projects/${PROJECT_ID}/locations/${LOCATION_ID}/publishers/google/models/${modelId}:generateContent`;

      console.log(`[DEBUG] Transcription: Calling Gemini API at ${url}`);
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
        console.error('API Error Response during transcription:', errorText);
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const data = await response.json();
      const transcript = data?.candidates?.[0]?.content?.parts?.[0]?.text || null;

      if (!transcript) {
        throw new Error('No text content in transcription API response');
      }

      console.log('[DEBUG] Transcription: Successfully received transcript from Gemini.');
      return transcript.trim();

    
}

  return {
    callGeminiAPI,
    saveDNAWithTranslation,
    translateText,
    transcribeVideo, // <-- ADDED: The new function is now exported

  };
};
