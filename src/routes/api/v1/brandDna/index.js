const express = require("express");
const brandDnaRouter = express.Router();

const { readJSONFromStorage, writeJSONToStorage, upload } = require('../../../../utils/apiHelpers.js');
const {callGeminiAPI, saveDNAWithTranslation, translateText} = require('../../../../services/aicreation.js');

// Modify the /getBrandDNA endpoint 
brandDnaRouter.post('/getBrandDNA', upload.array('file', 5), async (req, res) => {
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

// Modify the /getBrandDNA endpoint 
brandDnaRouter.post('/test', (req, res) => {
    console.log("working")
    res.json
});


brandDnaRouter.delete('/deleteDNA/:brandName', async (req, res) => {
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

// Modify the /saveDNA endpoint
brandDnaRouter.post('/saveDNA', express.json(), async (req, res) => {
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

// Add these new endpoints to server.js
brandDnaRouter.get('/getDNAs', async (req, res) => {
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


module.exports= {
    brandDnaRouter,
}

