const express = require("express");
const brandDnaRouter = express.Router();

const upload = require('../../../../../src/configs/multer.config.js');

// Define a helper function to get the Firestore document ID based on brandName.
const getBrandDnaDocId = (brandName) => {
    return brandName; // Document ID is simply the brand name
};

// Initialize current language (used as a fallback if not provided in request)
let currentLanguage = 'english'; // Default language

// Export a function that receives the Firestore db instance
module.exports = (db) => {
    const brandsCollection = db.collection('brands'); // Reference to the 'brands' Firestore collection

    const { callGeminiAPI, saveDNAWithTranslation, translateText } /*, getDNAFilename, getOppositeLanguageFile */ = require('../../../../services/geminiCreation.service.js')(db);

    /**
     * @route POST /api/v1/brandDna/getBrandDNA
     * @description Processes brand name and files, calls Gemini API, and saves DNA.
     * Uses multer for file uploads.
     * This endpoint relies on 'callGeminiAPI' and 'saveDNAWithTranslation'
     * in 'geminiCreation.service.js' to handle Firestore interactions
     * according to the new document structure.
     */
    brandDnaRouter.post('/getBrandDNA', upload.array('file', 5), async (req, res) => {
        const brandName = req.body.brandName;
        const language = req.body.language || currentLanguage;

        if (!brandName) {
            return res.status(400).json({ error: 'Brand name is required' });
        }

        try {
            const files = req.files;
            const result = await callGeminiAPI(brandName, files, language);

            // saveDNAWithTranslation is expected to store data in the 'brands' collection
            // using brandName as the document ID, potentially updating specific language fields.
            // This function (in geminiCreation.service.js) needs to handle Firestore interaction
            await saveDNAWithTranslation(result, language, true);

            res.json(result);
        } catch (error) {
            console.error('Error processing getBrandDNA request:', error);
            res.status(500).json({ error: error.message || 'Failed to process brand DNA request.' });
        }
    });

    /**
     * @route DELETE /api/v1/brandDna/deleteDNA/:brandName
     * @description Deletes a single Brand DNA document by its brand name (which is the Firestore ID).
     * This assumes a single document per brand, not separate documents per language.
     */
    brandDnaRouter.delete('/deleteDNA/:brandName', async (req, res) => {
        try {
            const brandName = decodeURIComponent(req.params.brandName);
            const docId = getBrandDnaDocId(brandName); // Use brandName as the document ID

            const docRef = brandsCollection.doc(docId);
            const doc = await docRef.get();

            if (!doc.exists) {
                return res.status(404).json({ error: `Brand DNA for "${brandName}" not found.` });
            }

            await docRef.delete();
            console.log(`Deleted Brand DNA: ${docId}`);
            res.json({ success: true, message: `Brand DNA "${brandName}" deleted successfully.` });
        } catch (error) {
            console.error('Error deleting DNA:', error);
            res.status(500).json({ error: 'Failed to delete DNA' });
        }
    });

    /**
     * @route POST /api/v1/brandDna/saveDNA
     * @description Saves/updates a Brand DNA object (potentially translated) to Firestore.
     * This endpoint relies on 'saveDNAWithTranslation' in 'geminiCreation.service.js'
     * to handle Firestore interactions according to the new document structure.
     */
    brandDnaRouter.post('/saveDNA', express.json(), async (req, res) => {
        try {
            const { dna, language } = req.body;
            const requestLanguage = language || currentLanguage;

            res.json({ success: true, message: 'Brand DNA saved successfully.' });
        } catch (error) {
            console.error('Error saving DNA:', error);
            res.status(500).json({ error: 'Failed to save DNA' });
        }
    });

    /**
     * @route GET /api/v1/brandDna/getDNAs
     * @description Retrieves all Brand DNA documents from Firestore.
     * It structures the response as an array of brand objects.
     * Language filtering is applied to return the requested translation or base data.
     */
    brandDnaRouter.get('/getDNAs', async (req, res) => {
        // console.log('[DEBUG] Hit /brandDna/getDNAs (static route)');
        try {
            const requestedLanguage = req.query.language || currentLanguage;

            console.log(`[DEBUG] Attempting to query Firestore collection: 'brands' with requested language: ${requestedLanguage}`);
            const snapshot = await brandsCollection.get();

            // Initialize brandDnasArray as an ARRAY
            let brandDnasArray = [];

            if (!snapshot.empty) {
                console.log(`[DEBUG] Found ${snapshot.size} documents in 'brands' collection.`);
                snapshot.docs.forEach(doc => {
                    const brandData = doc.data();
                    // Optional: Log raw data from Firestore to understand its structure
                    // console.log(`[DEBUG] Processing brand document ID: ${doc.id}, Raw Data:`, JSON.stringify(brandData, null, 2));

                    const brandName = brandData.brandName;

                    if (brandName) {
                        let processedBrand = { id: doc.id, ...brandData };

                        // Apply translation logic if a specific language is requested AND translations exist
                        if (requestedLanguage && brandData.translations) {
                            const langCode = requestedLanguage === 'spanish' ? 'es' : 'en';

                            if (brandData.translations[langCode]) {
                                const translatedContent = brandData.translations[langCode];
                                // Overwrite language-specific fields with translated content from 'translations'
                                processedBrand.brandName = translatedContent.brandDisplayName || processedBrand.brandName;
                                processedBrand.brandAnalysis = translatedContent.brandAnalysis;
                                processedBrand.language = requestedLanguage;
                                console.log(`[DEBUG] Applied ${requestedLanguage} translation for brand: ${brandName}`);
                            } else {
                                console.warn(`[WARN] No ${requestedLanguage} translation found for brand: ${brandName}. Returning default (English) data.`);
                                processedBrand.language = 'english';
                            }
                        } else if (!brandData.translations) {
                            console.warn(`[WARN] 'translations' object missing for brand: ${brandName}. Returning base data.`);
                            processedBrand.language = 'english';
                        } else if (!requestedLanguage) {
                            console.log(`[DEBUG] No specific language requested for brand: ${brandName}. Returning full document.`);
                            processedBrand.language = 'english';
                        }
                        brandDnasArray.push(processedBrand); // Push the processed brand object to the array
                    } else {
                        console.warn(`[WARN] Brand name missing for doc ID: ${doc.id}. This document will be skipped for now.`);
                    }
                });
            } else {
                console.log(`[DEBUG] No Brand DNAs found in Firestore snapshot for language: ${requestedLanguage}.`);
            }

            res.json(brandDnasArray); // Send the array
            // console.log(`[DEBUG] Type of brandDnasArray before stringify: ${typeof brandDnasArray}, isArray: ${Array.isArray(brandDnasArray)}`);

        } catch (error) {
            console.error('Error getting DNAs from Firestore:', error);
            res.status(500).json({ error: 'Failed to get DNAs.' });
        }
    });

    /**
     * @route GET /api/v1/brandDna/:brandName
     * @description Get a single Brand DNA document by its brand name (Firestore document ID).
     * @param {string} brandName - The brand name, which serves as the Firestore document ID.
     * @returns {Object} A single Brand DNA object.
     */
    brandDnaRouter.get('/:brandName', async (req, res) => {
        try {
            const brandName = decodeURIComponent(req.params.brandName); // Get brand name from URL param
            const docId = getBrandDnaDocId(brandName); // Use brandName as the document ID
            const docRef = brandsCollection.doc(docId);
            const doc = await docRef.get();

            if (!doc.exists) {
                return res.status(404).json({ error: `Brand DNA for "${brandName}" not found.` });
            }
            res.json({ id: doc.id, ...doc.data() });
        } catch (error) {
            console.error(`Error fetching Brand DNA with name ${req.params.brandName} from Firestore:`, error);
            res.status(500).json({ error: 'Failed to retrieve Brand DNA.' });
        }
    });

    /**
     * @route POST /api/v1/brandDna/create
     * @description Creates a new Brand DNA document. The 'brandName' from the request body
     * will be used as the Firestore document ID.
     * @body {Object} newBrandDna - The full brand DNA object, including 'brandName'.
     * @returns {Object} The ID of the newly created document.
     */
    brandDnaRouter.post('/create', async (req, res) => {
        try {
            const newBrandDna = req.body; // Expects a full brand DNA object
            if (!newBrandDna.brandName) {
                return res.status(400).json({ error: 'Brand name is required for creating a new Brand DNA.' });
            }

            const docId = getBrandDnaDocId(newBrandDna.brandName);
            const docRef = brandsCollection.doc(docId);

            // Check if a document with this brandName already exists to avoid accidental overwrite
            const existingDoc = await docRef.get();
            if (existingDoc.exists) {
                return res.status(409).json({ error: `Brand DNA for "${newBrandDna.brandName}" already exists.` });
            }

            await docRef.set(newBrandDna); // Set creates or overwrites
            res.status(201).json({ message: 'Brand DNA created successfully', id: docId });
        } catch (error) {
            console.error('Error creating Brand DNA in Firestore:', error);
            res.status(500).json({ error: 'Failed to create Brand DNA.' });
        }
    });

    /**
     * @route PUT /api/v1/brandDna/:brandName
     * @description Updates an existing Brand DNA document by its brand name (Firestore document ID).
     * @param {string} brandName - The brand name, which serves as the Firestore document ID.
     * @body {Object} updatedData - The partial or full data to update.
     */
    brandDnaRouter.put('/:brandName', async (req, res) => {
        try {
            const brandName = decodeURIComponent(req.params.brandName);
            const docId = getBrandDnaDocId(brandName);
            const updatedData = req.body;
            const docRef = brandsCollection.doc(docId);

            const doc = await docRef.get();
            if (!doc.exists) {
                return res.status(404).json({ error: 'Brand DNA not found for update.' });
            }

            await docRef.update(updatedData); // Updates specific fields
            res.json({ message: `Brand DNA "${brandName}" updated successfully.` });
        } catch (error) {
            console.error(`Error updating Brand DNA with name ${req.params.brandName} in Firestore:`, error);
            res.status(500).json({ error: 'Failed to update Brand DNA.' });
        }
    });

    return brandDnaRouter; // Make sure to return the router
};
