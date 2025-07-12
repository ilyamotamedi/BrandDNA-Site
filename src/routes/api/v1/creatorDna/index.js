const express = require("express");
const creatorDnaRouter = express.Router();
const { GoogleAuth } = require('google-auth-library');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { getAverageViews } = require('../../../../services/creatorDna.service.js');
const upload = require('../../../../../src/configs/multer.config.js');

const modelState = require('../../../../services/modelState.service.js');
// const { translateText } = require('../../../../services/geminiCreation.service.js');

const auth = new GoogleAuth({
    scopes: 'https://www.googleapis.com/auth/cloud-platform'
});

const PROJECT_ID = process.env.PROJECT_ID;
const LOCATION_ID = process.env.LOCATION_ID;

let currentLanguage = 'english'; // Default language

const {
    CHANNEL_DNA_SYSTEM_INSTRUCTIONS,
    CHANNEL_DNA_SYSTEM_INSTRUCTIONS_SPANISH,
} = require('../../../../../src/configs/systemInstructions.config.js');

module.exports = (db) => {
    const creatorsCollection = db.collection('creators'); // Reference to the 'creators' Firestore collection
    const geminiCreationServiceSetup = require('../../../../services/geminiCreation.service.js');
    const { translateText } = geminiCreationServiceSetup(db);

    creatorDnaRouter.get('/getAvailableCreatorDnaLists', (req, res) => {
        console.log('[DEBUG] Hit /getAvailableCreatorDnaLists (static route)');
        res.json({ creatorDnaLists: ['English Creators', 'Spanish Creators'] });
    });

    // Endpoint to get the current creator DNA list file (Placeholder / informational)
    // Ensure this specific static path is high up
    creatorDnaRouter.get('/getCurrentCreatorDnaList', (req, res) => {
        console.log('[DEBUG] Hit /getCurrentCreatorDnaList (static route)');
        res.json({ currentCreatorDnaListFile: "Managed by Firestore" });
    });

    /**
     * @route GET /api/v1/creatorDna/getCreatorDNAs
     * @description Retrieves all Creator DNA documents from Firestore.
     * Filters by language if specified, or returns all if no language.
     * Expects documents with a nested 'translations' field containing 'en' and 'es'.
     * This specific static path MUST come before any dynamic /:channelName.
     */
    creatorDnaRouter.get('/getCreatorDNAs', async (req, res) => {
        // console.log('[DEBUG] Hit /getCreatorDNAs (static route)');
        try {
            const requestedLanguage = req.query.language || currentLanguage;
            // console.log(`[DEBUG] Requested language is: ` + requestedLanguage);
            // console.log(`[DEBUG] Attempting to query Firestore collection: 'creators'`);

            const snapshot = await creatorsCollection.get();

            // This will be the array sent as the response
            let creatorDnasArray = [];

            if (!snapshot.empty) {
                console.log(`[DEBUG] Found ${snapshot.size} documents in 'creators' collection.`);
                snapshot.docs.forEach(doc => {
                    const creatorData = doc.data();
                    // Log raw data from Firestore to understand its structure
                    // console.log(`[DEBUG] Processing document ID: ${doc.id}, Raw Data:`, JSON.stringify(creatorData, null, 2));

                    const channelName = creatorData.channelName;

                    if (channelName) {
                        let processedCreator = { id: doc.id, ...creatorData }; // Start with the full document

                        // If translations are present, apply language filtering/translation logic
                        if (creatorData.translations) {
                            const langCode = requestedLanguage === 'spanish' ? 'es' : 'en';

                            if (creatorData.translations[langCode]) {
                                const translatedContent = creatorData.translations[langCode];
                                // Overwrite language-specific fields in the processedCreator object with translated content
                                processedCreator.channelDisplayName = translatedContent.channelDisplayName;
                                processedCreator.channelDescription = translatedContent.channelDescription;
                                processedCreator.channelAnalysis = translatedContent.channelAnalysis;
                                processedCreator.language = requestedLanguage; // Indicate the language returned
                                // console.log(`[DEBUG] Applied ${requestedLanguage} translation for channel: ${channelName}`);
                            } else {
                                console.warn(`[WARN] No ${requestedLanguage} translation found for channel: ${channelName}. Returning base (English) data.`);
                                processedCreator.language = 'english'; // Assuming base is English if requested language not found
                            }
                        } else {
                            console.warn(`[WARN] 'translations' object missing for channel: ${channelName}. Returning base data.`);
                            processedCreator.language = 'english'; // Assuming base is English
                        }

                        creatorDnasArray.push(processedCreator); // Push the processed creator object to the array

                    } else {
                        // Fallback if 'channelName' field is missing, use Firestore doc ID
                        // dnas[doc.id] = { id: doc.id, ...creatorData };
                        console.warn(`[WARN] Channel name missing for doc ID: ${doc.id}. Using doc ID as key. Full data returned.`);
                        // dnas[doc.id].language = 'english'; // Default language for consistency
                    }
                });
            } else {
                console.log('[DEBUG] No Creator DNAs found in Firestore snapshot.');
            }

            const jsonResponseString = JSON.stringify(creatorDnasArray, (key, value) => {
                if (typeof value === 'bigint') {
                    return value.toString();
                }
                return value;
            }, 2); // Use 2-space indentation for readability

            // console.log('[DEBUG] JSON Stringified Response (to be sent):', jsonResponseString);

            res.setHeader('Content-Type', 'application/json');
            res.send(jsonResponseString);
        } catch (error) {
            console.error('[ERROR] Error getting Creator DNAs from Firestore (in /getCreatorDNAs):', error);
            res.status(500).json({ error: 'Failed to retrieve Creator DNAs', details: error.message, code: error.code });
        }
    });

    /**
     * @route GET /api/v1/creatorDna/test-average-views
     * @description Test endpoint for average views.
     * This specific static path MUST come before any dynamic /:channelName.
     */
    creatorDnaRouter.get('/test-average-views', async (req, res) => {
        console.log('[DEBUG] Hit /test-average-views (static route)');
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
            console.error('[ERROR] Error in test endpoint (/test-average-views):', error);
            res.status(500).send(`Error: ${error.message}`);
        }
    });

    creatorDnaRouter.post('/setCurrentCreatorDnaList', express.json(), (req, res) => {
        console.log('[DEBUG] Hit /setCurrentCreatorDnaList (POST route)');
        const { creatorDnaListFile } = req.body;
        // console.log(`[DEBUG] Attempted to set current creator DNA list to: ${creatorDnaListFile}. (No effect on Firestore data retrieval)`);
        res.json({ success: true, message: `Current creator DNA list concept set to: ${creatorDnaListFile}` });
    });

    /**
     * @route POST /api/v1/creatorDna/saveCreatorDNA
     * @description Saves/updates a Creator DNA document in Firestore.
     * This now handles nested translations.
     */
    creatorDnaRouter.post('/saveCreatorDNA', express.json(), async (req, res) => {
        console.log('[DEBUG] Hit /saveCreatorDNA (POST route)');
        try {
            const { creatorDNA, language } = req.body;
            const requestLanguage = language || currentLanguage;
            const langCode = requestLanguage === 'spanish' ? 'es' : 'en';

            if (!creatorDNA || !creatorDNA.channelName) {
                return res.status(400).json({ error: 'Creator DNA object with channelName is required.' });
            }

            // saveDNAWithTranslation is expected to store/update data in the 'creatorDnas' collection
            // using creatorDNA.channelName as the document ID, and manage the 'translations' field within it.
            // This function needs to be robust enough to handle existing documents and merge new translations.
            // await saveDNAWithTranslation(creatorDNA, requestLanguage, true); // `true` for immediate save
            const docId = creatorDNA.channelName; // Use channelName as the main document ID
            const docRef = creatorsCollection.doc(docId);
            console.log(`[DEBUG] Firestore: Attempting to save/update document with ID: ${docId}`);

            // Fetch existing document to merge translations
            const existingDoc = await docRef.get();
            let newDocData = {};

            if (existingDoc.exists) {
                newDocData = existingDoc.data();
                console.log(`[DEBUG] Firestore: Found existing document for ID: ${docId}`);
            } else {
                console.log(`[DEBUG] Firestore: No existing document found for ID: ${docId}. Creating new.`);
            }

            // Ensure translations object exists
            if (!newDocData.translations) {
                newDocData.translations = {};
            }

            // Update/add the specific language translation
            newDocData.translations[langCode] = {
                channelDisplayName: creatorDNA.channelDisplayName || creatorDNA.channelName,
                channelDescription: creatorDNA.channelDescription,
                channelAnalysis: creatorDNA.channelAnalysis
            };

            // Also update top-level fields (like channelName, channelId, etc.) if they come with the new data
            // This assumes the top-level fields are language-agnostic or primarily English/default.
            Object.keys(creatorDNA).forEach(key => {
                if (key !== 'translations') { // Don't overwrite the entire translations object
                    newDocData[key] = creatorDNA[key];
                }
            });

    await docRef.set(newDocData, { merge: true }); // Use merge: true to update parts of the document
            console.log(`[DEBUG] Firestore: Document ${docId} set successfully.`);

            // Background translation to the other language
            (async () => {
                try {
                    const targetLanguageCode = langCode === 'en' ? 'es' : 'en';
                    const targetLanguageFull = targetLanguageCode === 'es' ? 'spanish' : 'english';

                    // Only translate if the target translation doesn't already exist or needs updating
                    if (!newDocData.translations[targetLanguageCode]) {
                        console.log(`[DEBUG] Background translation for channel ${creatorDNA.channelName} from ${langCode} to ${targetLanguageCode}...`);

                        const translatedDNA = JSON.parse(JSON.stringify(creatorDNA)); // Deep copy

                        console.log("Type of translateText:", typeof translateText);
                        console.log("Is translateText a function?", typeof translateText === 'function');

                        // Translate channelDescription
                        translatedDNA.channelDescription = await translateText(creatorDNA.channelDescription, targetLanguageFull);

                        // Translate channelAnalysis sections
                        if (translatedDNA.channelAnalysis && Array.isArray(translatedDNA.channelAnalysis)) {
                            for (const section of translatedDNA.channelAnalysis) {
                                section.sectionBody = await translateText(section.sectionBody, targetLanguageFull);

                                // Special handling for section titles based on language for consistency
                                if (langCode === 'en' && targetLanguageCode === 'es') {
                                    const titleMap = {
                                        'CreatorDNA': 'AxcDN del Creador',
                                        'Creator Personality': 'Personalidad del Creador',
                                        'Content Style': 'Estilo de Contenido',
                                        'Audience Connection': 'Conexión con la Audiencia',
                                        'Channel Story': 'Historia del Canal'
                                    };
                                    section.sectionTitle = titleMap[section.sectionTitle] || await translateText(section.sectionTitle, targetLanguageFull);
                                } else if (langCode === 'es' && targetLanguageCode === 'en') {
                                    const titleMap = {
                                        'ADN del Creador': 'CreatorDNA',
                                        'Personalidad del Creador': 'Creator Personality',
                                        'Estilo de Contenido': 'Content Style',
                                        'Audience Connection': 'Audience Connection',
                                        'Historia del Canal': 'Channel Story'
                                    };
                                    section.sectionTitle = titleMap[section.sectionTitle] || await translateText(section.sectionTitle, targetLanguageFull);
                                } else {
                                    section.sectionTitle = await translateText(section.sectionTitle, targetLanguageFull);
                                }
                            }
                        }

                        // Update the translations field in the Firestore document
                        const updateData = {
                            [`translations.${targetLanguageCode}`]: {
                                channelDisplayName: translatedDNA.channelDisplayName || creatorDNA.channelName, // Usually same as original
                                channelDescription: translatedDNA.channelDescription,
                                channelAnalysis: translatedDNA.channelAnalysis
                            }
                        };
                        await docRef.update(updateData);
                        console.log(`[DEBUG] Background translation for channel ${creatorDNA.channelName} to ${targetLanguageCode} completed and saved.`);
                    } else {
                        console.log(`Translation for channel ${creatorDNA.channelName} to ${targetLanguageCode} already exists or is not needed.`);
                    }
                } catch (translationError) {
                    console.log(`[DEBUG] Translation for channel ${creatorDNA.channelName} to ${targetLanguageCode} already exists or is not needed.`, translationError.message);
                }
            })();

            res.json({ success: true, message: 'Creator DNA saved successfully.' });
        } catch (error) {
            console.error('[ERROR] Error saving creator DNA:', error);
            res.status(500).json({ error: 'Failed to save creator DNA', details: error.message });
        }
    });

    /**
     * @route POST /api/v1/creatorDna/analyzeChannel
     * @description Endpoint to analyze a creator channel using Gemini API.
     * This endpoint does not directly save to Firestore here, but 'saveCreatorDNA'
     * would be called subsequently.
     */
    creatorDnaRouter.post('/analyzeChannel', upload.array('file', 5), async (req, res) => {
        console.log('[DEBUG] Hit /analyzeChannel (POST route)');
        try {
            const { channelName, transcripts, language } = req.body;
            const requestLanguage = language || currentLanguage;
            const files = req.files || [];

            const processedTranscripts = JSON.parse(transcripts).map(t =>
                t.transcript.map(item => item.text).join(' ')
            );

            const parts = [];
            const maxTextSize = 500000; // 500KB limit for text content

            let analysisPrompt = `Analyze the YouTube channel "${channelName}" based on the following content:
            1. Video Transcripts:
            ${processedTranscripts.join('\n\n=== NEXT VIDEO ===\n\n')}
            2. Additional Channel Content and Context:`;

            if (requestLanguage === 'spanish') {
                analysisPrompt += "\n\nPLEASE GENERATE THE ENTIRE ANALYSIS IN SPANISH, INCLUDING ALL CONTENT AND DESCRIPTIONS.";
            }

            parts.push({
                text: analysisPrompt
            });

            for (const file of files) {
                try {
                    if (file.mimetype.startsWith('image/')) {
                        parts.push({
                            inline_data: {
                                data: file.buffer.toString('base64'),
                                mime_type: file.mimetype
                            }
                        });
                    } else {
                        const content = file.buffer.toString('utf8');
                        if (content.length > maxTextSize) {
                            console.warn(`[WARN] File ${file.originalname} exceeds size limit, truncating...`);
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
                    console.warn(`[WARN] Error processing file ${file.originalname}:`, error);
                    continue;
                }
            }

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

            // console.log('[DEBUG] Making Gemini API request with parts:', parts.length);

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
                console.error('[ERROR] API Error Response (analyzeChannel):', errorText);
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
                    channelAnalysis: analysis.channelAnalysis // Assuming analysis structure matches expectation
                }
            });
        } catch (error) {
            console.error('[ERROR] Error in /analyzeChannel:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * @route POST /api/v1/creatorDna/getChannelStats
     * @description Endpoint to get channel stats (average views).
     */
    creatorDnaRouter.post('/getChannelStats', async (req, res) => {
        console.log('[DEBUG] Hit /getChannelStats (POST route)');
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
            console.error('[ERROR] Error getting channel stats:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * @route DELETE /api/v1/creatorDna/deleteCreatorDNA/:channelName
     * @description Deletes a Creator DNA document and its translations.
     * This now assumes a single document per creator, with nested translations.
     */
    creatorDnaRouter.delete('/deleteCreatorDNA/:channelName', async (req, res) => {
        console.log(`[DEBUG] Hit /deleteCreatorDNA/${req.params.channelName} (DELETE route)`);
        try {
            const channelName = decodeURIComponent(req.params.channelName);
            const docId = channelName; // Firestore document ID is the channelName

            const docRef = creatorsCollection.doc(docId);
            const doc = await docRef.get();

            if (!doc.exists) {
                console.log(`[DEBUG] Document ${docId} not found for deletion.`);
                return res.status(404).json({ error: `Creator DNA for "${channelName}" not found.` });
            }

            await docRef.delete();
            console.log(`[DEBUG] Deleted Creator DNA: ${docId}`);
            res.json({ success: true, message: `Creator DNA "${channelName}" deleted successfully.` });
        } catch (error) {
            console.error('[ERROR] Error deleting Creator DNA:', error);
            res.status(500).json({ error: 'Failed to delete Creator DNA', details: error.message });
        }
    });


    /**
     * @route GET /api/v1/creatorDna/:channelName
     * @description Get a single Creator DNA document by its channelName (Firestore document ID).
     * This dynamic route MUST be defined LAST among GET routes in this file
     * to prevent it from intercepting more specific static paths above.
     * It will return the full document data, and the client can handle language display.
     */
    creatorDnaRouter.get('/:channelName', async (req, res) => {
        console.log(`[DEBUG] Hit /:channelName (DYNAMIC GET route) with channelName: ${req.params.channelName}`);
        try {
            const channelName = decodeURIComponent(req.params.channelName);
            // const language = req.query.language || currentLanguage; // Optional: specify language

            // const docId = getCreatorDnaDocId(channelName);
            const docRef = creatorsCollection.doc(channelName);
            const doc = await docRef.get();

            if (!doc.exists) {
                console.log(`[DEBUG] Document ${channelName} NOT FOUND in Firestore for dynamic GET.`);
                return res.status(404).json({ error: 'Creator DNA not found.' });
            }
            res.json({ id: doc.id, ...doc.data() });

        } catch (error) {
            console.error(`[ERROR] Error fetching Creator DNA with name ${req.params.channelName} from Firestore (in dynamic route):`, error);
            res.status(500).json({ error: 'Failed to retrieve Creator DNA.' });
        }
    });

    return creatorDnaRouter;
};
