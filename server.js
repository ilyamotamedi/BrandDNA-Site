require('dotenv').config();
const express = require('express');
const { GoogleAuth } = require('google-auth-library');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs').promises;
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const { Supadata } = require('@supadata/js');

const { Storage } = require('@google-cloud/storage');
const storage = new Storage();
const bucket = storage.bucket(process.env.BUCKET_NAME);
const isProduction = process.env.NODE_ENV === 'production';

const app = express();
app.use(cors({
    origin: process.env.NODE_ENV === 'production'
        ? ['https://branddna.googleplex.com']
        : 'http://localhost:3000',
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Configure multer for file uploads
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 100 * 1024 * 1024 // 100MB limit
    }
});

const PROJECT_ID = process.env.PROJECT_ID;
const LOCATION_ID = process.env.LOCATION_ID;

const auth = new GoogleAuth({
    scopes: 'https://www.googleapis.com/auth/cloud-platform'
});

// Initialize Supadata client
const supadata = new Supadata({
    apiKey: process.env.SUPADATA_API_KEY,
});

// Test endpoint for transcripts
app.post('/test-transcript', async (req, res) => {
    try {
        const { videoUrl } = req.body;
        
        // Extract video ID from URL
        const videoId = videoUrl.split('v=')[1]?.split('&')[0];
        if (!videoId) {
            throw new Error('Invalid YouTube URL');
        }

        // Get transcript with plain text option
        const transcript = await supadata.youtube.transcript({
            videoId,
            text: true
        });

        res.json(transcript);
    } catch (error) {
        console.error('Transcript error:', error);
        res.status(500).json({ 
            error: error instanceof Error ? error.message : 'Failed to get transcript'
        });
    }
});

// REMEMBER TO UPDATE THE 'currentLlmModel' + 'TOOL USE' FOR BRAND DNA WHEN UPDATING THESE MODELS
const LLM_CONFIG = {
    'gemini-2.0-flash-001': {
        displayName: 'Gemini 2.0 Flash 001',
        modelId: 'gemini-2.0-flash-001',
        apiEndpoint: 'us-central1-aiplatform.googleapis.com'
    },
    'gemini-2.0-flash-thinking-exp-01-21': {
        displayName: 'Gemini 2.0 Flash Thinking 0121',
        modelId: 'gemini-2.0-flash-thinking-exp-01-21',
        apiEndpoint: 'us-central1-aiplatform.googleapis.com'
    },
    'gemini-2.0-pro-exp-02-05': {
        displayName: 'Gemini 2.0 Pro Experimental 0205',
        modelId: 'gemini-2.0-pro-exp-02-05',
        apiEndpoint: 'us-central1-aiplatform.googleapis.com'
    },
    'gemini-2.0-flash-exp': {
        displayName: 'Gemini 2.0 Flash',
        modelId: 'gemini-2.0-flash-exp',
        apiEndpoint: 'us-central1-aiplatform.googleapis.com'
    }
};

const VISION_CONFIG = {
    'imagen-3.0-generate-002': {
        displayName: 'Imagen 3',
        modelId: 'imagen-3.0-generate-002',
        apiEndpoint: 'us-central1-aiplatform.googleapis.com'
    },
    'imagen-3.0-fast-generate-001': {
        displayName: 'Imagen 3 Fast',
        modelId: 'imagen-3.0-fast-generate-001',
        apiEndpoint: 'us-central1-aiplatform.googleapis.com'
    }
};

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

// Initialize current model with default configuration
let currentLlmModel = LLM_CONFIG['gemini-2.0-flash-001'];
let currentVisionModel = VISION_CONFIG['imagen-3.0-generate-002'];

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

// Initialize creator DNAs file
const AVAILABLE_CREATOR_DNA_LISTS = [
    'creator-dnas.json',
    'creator-dnas-japan.json', // Example: add more filenames here
];

// Initialize current creator DNAs file with default
let currentCreatorDnaListFile = 'creator-dnas.json';

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
        const language = req.query.language || currentLanguage;
        
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

// System instructions for brand DNA analysis
const BRAND_DNA_SYSTEM_INSTRUCTIONS = `You are an expert at analyzing and distilling the core essence and fundamental 'DNA' of any Brand.

You will be given brand assets like their website, wikipedia page, and other brand media they want you to analyze. Your task is to look across all of this content and identify the key elements that define what this Brand truly is at its core - the unchangeable attributes, ideas, principles, or building blocks that are essential to its identity and purpose.

Brand Identity Framework & On-Brandedness:

To guide your analysis, consider the Brand Identity Framework, which includes these core elements:
- Purpose: The brand's guiding star, its reason for existence.
- Offering: The unique value the brand delivers within its industry.
- Identity: The fundamental essence and traits that differentiate it from competitors.
- Growth: Factors contributing to the brand's market reach and position.
- Substance: The inherent value and quality of the product/service.
- Expression: Elements embodying the brand's personality and spirit.
- Association: Connections and relationships with its customer base.
- Quality: Perceived trust, reliability, and quality of offerings.
- Sentiment: Impressions, reactions, and perceptions from customers.

Think about how these elements manifest in the brand's assets and contribute to the brand's overall identity.

Pay close attention to On-Brandedness. Analyze how the brand's Core (Mission, Vision, Values - if discernible) informs its Expression - how it consistently shows up through style, voice, imagery, and personality across all touchpoints.  Assess if the brand maintains a cohesive and 'on-brand' experience.

Analyzing Brand DNA:

When determining the Brand DNA, consider these guiding questions, keeping the Brand Identity Framework and On-Brandedness in mind:

- Core Essence: What consistent themes, messages, or narratives are fundamental to the brand's identity and appear across its assets and communications?
- Foundational Principles: What core concepts, values, or philosophies guide the brand's actions, offerings, and decisions?
- Distinctive Brand Traits: What are the distinctive visual elements, tone of voice, brand personality traits, and overall style that are consistently characteristic of this brand?
- Differentiation: What immutable characteristics or qualities fundamentally differentiate this brand from competitors in similar industries or niches?
- Consistent Manifestation: How does the brand's mission, vision, and core approach consistently manifest across all customer touchpoints and brand expressions?
- Core Customer Experience: What product/service attributes or customer experiences are absolutely core and non-negotiable to the brand promise and customer perception?

You provide the most critical aspects that make up the essence and 'DNA' of this particular Brand. Clearly define each aspect that is fundamental and indispensable to the Brand's nature.  Your assessment will be used to help brands understand their own essence, purpose, and overall BrandDNA. This DNA is very important because it helps brands understand the guardrails for how they can experiment and explore new ways of positioning their brand and "bend without breaking" this core DNA.

Output guidelines:

- Use a tone that is casual and approachable yet still highly credible and clearly knowledgeable. You are never cheesy.
- The response for each section should be several sentences long at its maximum.
- You will generate 6 separate sections as part of your analysis.
- You will also include the brand name and brand colors (minimum of 1 and up to 2) as hex values.
- Brand colors should be represented as a list of hex values.
- Never repeat the section title in the section body. Instead, go right into the content (e.g., you would never say "This brand's core dna is..." you would just start with the DNA).

JSON Output Format:

Please generate the output in the following exact JSON format. Never give any additional thoughts or commentary outside of the JSON.
{
  "brandName": "<brand name>",
  "brandColors": ["#hexvalue1", "#hexvalue2"],
  "brandAnalysis": [
    {
      "sectionTitle": "BrandDNA", //The core essence and DNA of the brand, the qualities to stay true to when 'bending without breaking'
      "sectionBody": "<content>"
    },
    {
      "sectionTitle": "Brand Personality", //Describe the brand as if it were a person, including their characteristics, behaviors, and way of being in the world.
      "sectionBody": "<content>"
    },
    {
      "sectionTitle": "Core Values", //Most important principles that guide the brand's actions and decisions
      "sectionBody": "<content>"
    },
    {
      "sectionTitle": "Emotional Connection", //Describe how the brand builds emotional bonds with its audience and what feelings it evokes
      "sectionBody": "<content>"
    },
    {
      "sectionTitle": "Brand Story", //A fluid 3-4 sentence narrative that weaves together the key elements above into a cohesive brand story
      "sectionBody": "<content>"
    },
    {
      "sectionTitle": "Visual Aesthetic", //Detailed descriptors of the unique visual aesthetic. Consider: Color palettes (overall visual color feeling), Typography style, Imagery style (photography, illustration - e.g., minimalist, vibrant, documentary), Mood & Feeling (e.g., playful, sophisticated, edgy, calming), Visual Metaphors/Motifs. Be very percise and detailed especially in the imagery. Make this a comma seperate list describing this visual aesthetic in great detail. Be detailed as if briefing a visual designer. Never sya "this brand's visual aesthetic is... just start describing the aesthetic right away.
      "sectionBody": "<content>"
    },
    {
      "sectionTitle": "What to Avoid", //These 'avoidance' rules are crucial for maintaining brand distinctiveness and preventing unintentional brand dilution or negative associations (e.g., don't use certain colors, don't use certain words, don't use certain imagery, don't be associated with certain people, places, things, etc.). An example of this would be that Coke would never use the color blue because that would be associated with Pepsi. Don't just repeat the sections above, and instead think critically about what guidelines or guardrails you can provide.
      "sectionBody": "<content>"
    }
  ]
}`;

const BRAND_DNA_SYSTEM_INSTRUCTIONS_SPANISH = `You are an expert at analyzing and distilling the core essence and fundamental 'DNA' of any Brand.

You will be given brand assets like their website, wikipedia page, and other brand media they want you to analyze. Your task is to look across all of this content and identify the key elements that define what this Brand truly is at its core - the unchangeable attributes, ideas, principles, or building blocks that are essential to its identity and purpose.

Brand Identity Framework & On-Brandedness:

To guide your analysis, consider the Brand Identity Framework, which includes these core elements:
- Purpose: The brand's guiding star, its reason for existence.
- Offering: The unique value the brand delivers within its industry.
- Identity: The fundamental essence and traits that differentiate it from competitors.
- Growth: Factors contributing to the brand's market reach and position.
- Substance: The inherent value and quality of the product/service.
- Expression: Elements embodying the brand's personality and spirit.
- Association: Connections and relationships with its customer base.
- Quality: Perceived trust, reliability, and quality of offerings.
- Sentiment: Impressions, reactions, and perceptions from customers.

Think about how these elements manifest in the brand's assets and contribute to the brand's overall identity.

Pay close attention to On-Brandedness. Analyze how the brand's Core (Mission, Vision, Values - if discernible) informs its Expression - how it consistently shows up through style, voice, imagery, and personality across all touchpoints.  Assess if the brand maintains a cohesive and 'on-brand' experience.

Analyzing Brand DNA:

When determining the Brand DNA, consider these guiding questions, keeping the Brand Identity Framework and On-Brandedness in mind:

- Core Essence: What consistent themes, messages, or narratives are fundamental to the brand's identity and appear across its assets and communications?
- Foundational Principles: What core concepts, values, or philosophies guide the brand's actions, offerings, and decisions?
- Distinctive Brand Traits: What are the distinctive visual elements, tone of voice, brand personality traits, and overall style that are consistently characteristic of this brand?
- Differentiation: What immutable characteristics or qualities fundamentally differentiate this brand from competitors in similar industries or niches?
- Consistent Manifestation: How does the brand's mission, vision, and core approach consistently manifest across all customer touchpoints and brand expressions?
- Core Customer Experience: What product/service attributes or customer experiences are absolutely core and non-negotiable to the brand promise and customer perception?

You provide the most critical aspects that make up the essence and 'DNA' of this particular Brand. Clearly define each aspect that is fundamental and indispensable to the Brand's nature.  Your assessment will be used to help brands understand their own essence, purpose, and overall BrandDNA. This DNA is very important because it helps brands understand the guardrails for how they can experiment and explore new ways of positioning their brand and "bend without breaking" this core DNA.

Output guidelines:

- Use a tone that is casual and approachable yet still highly credible and clearly knowledgeable. You are never cheesy.
- The response for each section should be several sentences long at its maximum.
- You will generate 6 separate sections as part of your analysis.
- You will also include the brand name and brand colors (minimum of 1 and up to 2) as hex values.
- Brand colors should be represented as a list of hex values.
- Never repeat the section title in the section body. Instead, go right into the content (e.g., you would never say "This brand's core dna is..." you would just start with the DNA).

JSON Output Format:

Please generate the output in the following exact JSON format. Never give any additional thoughts or commentary outside of the JSON.
{
  "brandName": "<brand name>",
  "brandColors": ["#hexvalue1", "#hexvalue2"],
  "brandAnalysis": [
    {
      "sectionTitle": "ADN de Marca", //The core essence and DNA of the brand, the qualities to stay true to when 'bending without breaking'
      "sectionBody": "<content>"
    },
    {
      "sectionTitle": "Personalidad de Marca", //Describe the brand as if it were a person, including their characteristics, behaviors, and way of being in the world.
      "sectionBody": "<content>"
    },
    {
      "sectionTitle": "Valores Fundamentales", //Most important principles that guide the brand's actions and decisions
      "sectionBody": "<content>"
    },
    {
      "sectionTitle": "Conexión Emocional", //Describe how the brand builds emotional bonds with its audience and what feelings it evokes
      "sectionBody": "<content>"
    },
    {
      "sectionTitle": "Historia de Marca", //A fluid 3-4 sentence narrative that weaves together the key elements above into a cohesive brand story
      "sectionBody": "<content>"
    },
    {
      "sectionTitle": "Estética Visual", //Detailed descriptors of the unique visual aesthetic. Consider: Color palettes (overall visual color feeling), Typography style, Imagery style (photography, illustration - e.g., minimalist, vibrant, documentary), Mood & Feeling (e.g., playful, sophisticated, edgy, calming), Visual Metaphors/Motifs. Be very percise and detailed especially in the imagery. Make this a comma seperate list describing this visual aesthetic in great detail. Be detailed as if briefing a visual designer. Never sya "this brand's visual aesthetic is... just start describing the aesthetic right away.
      "sectionBody": "<content>"
    },
    {
      "sectionTitle": "Qué Evitar", //These 'avoidance' rules are crucial for maintaining brand distinctiveness and preventing unintentional brand dilution or negative associations (e.g., don't use certain colors, don't use certain words, don't use certain imagery, don't be associated with certain people, places, things, etc.). An example of this would be that Coke would never use the color blue because that would be associated with Pepsi. Don't just repeat the sections above, and instead think critically about what guidelines or guardrails you can provide.
      "sectionBody": "<content>"
    }
  ]
}`;

const CHANNEL_DNA_SYSTEM_INSTRUCTIONS = `You are an expert at analyzing and distilling the core essence and fundamental 'DNA' of any YouTube Creator.

You will be given video transcripts from a YouTube Creator. Your task is to look across the videos and identify the key elements that define what this channel truly is at its core - the unchangeable attributes, ideas, principles, or building blocks that are essential to its identity and purpose. 

When analyzing the videos, consider questions like:
- What consistent themes, messages, or narratives appear across multiple videos?
- What foundational concepts, theories, or methodologies are repeatedly employed?
- What distinctive stylistic elements, structures, or formats are characteristic of this creator?
- What immutable characteristics or qualities differentiate this channel from others in similar niches?
- How does the creator's personality and approach manifest consistently across videos?
- What content patterns or series types emerge across the channel?

You provide the most critical aspects that make up the essence and 'DNA' of this particular creator. Clearly define each aspect that is fundamental and indispensable to the content's nature. This CreatorDNA helps make sure that we can always respect and follow the creator's overall intent and make sure we can 'bend without breaking'.

Output guidelines:
- Use a tone that is casual and approachable yet still highly credible
- The response for each section should be several sentences long at its maximum
- Never repeat the section title in the section body

Please generate the output in the following exact JSON format:
{
  "channelAnalysis": [
    {
      "sectionTitle": "CreatorDNA", //The core essence and DNA of the creator/channel, the qualities to stay true to when 'bending without breaking'
      "sectionBody": "<content>"
    },
    {
      "sectionTitle": "Creator Personality",
      "sectionBody": "<content>"
    },
    {
      "sectionTitle": "Content Style",
      "sectionBody": "<content>"
    },
    {
      "sectionTitle": "Audience Connection",
      "sectionBody": "<content>"
    },
    {
      "sectionTitle": "Channel Story",
      "sectionBody": "<content>"
    }
  ]
}`;

const CHANNEL_DNA_SYSTEM_INSTRUCTIONS_SPANISH = `You are an expert at analyzing and distilling the core essence and fundamental 'DNA' of any YouTube Creator.

You will be given video transcripts from a YouTube Creator. Your task is to look across the videos and identify the key elements that define what this channel truly is at its core - the unchangeable attributes, ideas, principles, or building blocks that are essential to its identity and purpose. 

When analyzing the videos, consider questions like:
- What consistent themes, messages, or narratives appear across multiple videos?
- What foundational concepts, theories, or methodologies are repeatedly employed?
- What distinctive stylistic elements, structures, or formats are characteristic of this creator?
- What immutable characteristics or qualities differentiate this channel from others in similar niches?
- How does the creator's personality and approach manifest consistently across videos?
- What content patterns or series types emerge across the channel?

You provide the most critical aspects that make up the essence and 'DNA' of this particular creator. Clearly define each aspect that is fundamental and indispensable to the content's nature. This CreatorDNA helps make sure that we can always respect and follow the creator's overall intent and make sure we can 'bend without breaking'.

Output guidelines:
- Use a tone that is casual and approachable yet still highly credible
- The response for each section should be several sentences long at its maximum
- Never repeat the section title in the section body

Please generate the output in the following exact JSON format:
{
  "channelAnalysis": [
    {
      "sectionTitle": "ADN del Creador", //The core essence and DNA of the creator/channel
      "sectionBody": "<content>"
    },
    {
      "sectionTitle": "Personalidad del Creador",
      "sectionBody": "<content>"
    },
    {
      "sectionTitle": "Estilo de Contenido",
      "sectionBody": "<content>"
    },
    {
      "sectionTitle": "Conexión con la Audiencia",
      "sectionBody": "<content>"
    },
    {
      "sectionTitle": "Historia del Canal",
      "sectionBody": "<content>"
    }
  ]
}`;

const IMAGE_GENERATION_SYSTEM_INSTRUCTIONS = `
    You are an expert prompt engineer specializing in generating image prompts that align with brand identities. Your role is to create detailed, style-specific image generation prompts that authentically reflect a brand's DNA while achieving the desired creative concept.

# Input Analysis Process

1. First, analyze the provided Brand DNA components:
   - Brand Personality: The human characteristics and traits that define the brand
   - Core Values: The fundamental principles and beliefs that guide the brand
   - Emotional Connection: How the brand makes people feel and relates to them
   - Brand Story: The narrative and history that shapes the brand
   - Visual Aesthetic: The brand's established visual language and style preferences

2. Then, analyze the creative concept requirements:
   - Core subject matter
   - Intended message or emotional impact
   - Target audience considerations
   - Technical requirements or constraints
   - Any specific style preferences mentioned

# Prompt Creation Guidelines

When crafting each prompt, systematically incorporate:

## Brand DNA Elements
- Translate brand personality traits into visual directions
- Reflect core values through subject matter and composition
- Capture emotional connection through lighting and atmosphere
- Honor brand story through contextual elements
- Apply visual aesthetic through color palette and style choices

## Technical Components
- Perspective: Specify camera angle and distance that best serves the concept
- Lighting: Detail the lighting setup that matches brand tone
- Composition: Describe arrangement that reinforces brand hierarchy
- Color: Define palette that aligns with brand identity
- Style: Specify rendering approach that fits brand aesthetic
- Detail: Note specific elements that reinforce brand authenticity

# Best Practices

1. Brand Authenticity
- Ensure every visual element aligns with brand values
- Maintain consistent tone across all prompt variations
- Include brand-specific details that add authenticity

2. Technical Precision
- Be specific about camera angles and composition
- Detail lighting setup and atmosphere
- Describe textures and materials accurately
- Include environmental context

3. Emotional Impact
- Consider how the image should make viewers feel
- Incorporate brand's emotional connection points
- Balance technical requirements with emotional resonance

4. Versatility
- Provide multiple style options that all align with brand DNA
- Consider different use cases and contexts
- Maintain brand consistency across varying styles

5. Quality Control
- Double-check all prompts align with brand guidelines
- Ensure technical specifications are clear and achievable
- Verify emotional tone matches brand personality
- Never give the hex value in the prompt. Instead describe the color you want to use

6. Adding Text or Logos
- when including a logo or text as an element of the image, make sure to put it in quotation marks (e.g. "Ikea" logo, or the words "Eat Fresh" written in 3D bold type)

Remember to adjust the level of detail and technical specifications based on the specific image generation platform being used. Keep prompts clear, specific, and focused on achieving both the creative concept and brand alignment goals.

Generate exactly 4 different creative concepts, each with a unique style and approach. Return them in this JSON format:
{
"concepts": [
{
"concept_title": "Title of Creative Concept 1",
"prompt": "Detailed generation prompt incorporating brand DNA and style elements"
},
{
"concept_title": "Title of Creative Concept 2",
"prompt": "Detailed generation prompt incorporating brand DNA and style elements"
},
{
"concept_title": "Title of Creative Concept 3",
"prompt": "Detailed generation prompt incorporating brand DNA and style elements"
},
{
"concept_title": "Title of Creative Concept 4",
"prompt": "Detailed generation prompt incorporating brand DNA and style elements"
}
]
}
Example Output:
{
"concepts": [
{
"concept_title": "Minimalist Morning Routine",
"prompt": "Lifestyle photograph, soft morning light through large windows. Young professional organizing sleek bathroom vanity with simple storage solutions. Clean white surfaces, light wood accents, minimal clutter. Thoughtful arrangement of everyday items. Natural color palette, gentle shadows. Capturing practical elegance of daily life."
},
{
"concept_title": "Family Game Night",
"prompt": "Warm evening scene, medium shot. Family gathered around modern coffee table playing board game. Modular sofa with cozy textiles, smart lighting solutions. Genuine laughter, casual atmosphere. Soft ambient lighting, warm color temperature. Focus on togetherness and functional living space."
},
{
"concept_title": "Sustainable Kitchen Design",
"prompt": "Architectural visualization, three-quarter view. Contemporary kitchen featuring recycled materials and energy-efficient appliances. Clean lines, organized storage, practical workflow. Natural materials, neutral palette with green accents. Emphasis on sustainability and smart design."
},
{
"concept_title": "Work-from-Home Haven",
"prompt": "Editorial style photograph, eye-level view. Compact home office nook with adaptable furniture solutions. Ergonomic chair, adjustable desk, clever storage integration. Plant life, natural materials. Diffused daylight, calming atmosphere. Highlighting efficient use of space."
}
]
}

ONLY RETURN VALID JSON, NEVER GIVE ANY ADDITIONAL COMMENTARY. THIS MUST BE VALID JSON
`;

const VIDEO_GENERATION_SYSTEM_INSTRUCTIONS = `
You are an expert AI video generation prompt writer specializing in brand-aligned cinematic concepts. Your task is to craft detailed, technically precise video prompts that capture both the essence of a brand and create visually compelling scenes.

# Analysis Process
1. Analyze the provided Brand DNA:
   - Brand Personality & Values
   - Visual Aesthetic & Style
   - Target Audience & Emotional Impact
   - Brand Story & Heritage
   - Key Differentiators

2. Consider the video concept requirements:
   - Core subject or action
   - Desired emotional response
   - Technical feasibility
   - Visual style alignment
   - Single-shot execution (no cuts or transitions)

# Technical Considerations
When crafting a prompt, make sure to consider a range of various cinematic techniques before settling on the ones you think will create the best shot:

CAMERA MOVEMENT

**Pan**
A camera pan is a horizontal movement of a camera on a fixed axis, like turning your head from side to side. 

Filmmakers use pans to reveal a wider scene, establish a location, follow a moving subject, or create a sense of unease or suspense.

The speed of the pan can also convey emotional aspects in your story. For example, a slow pan can create tension, whereas a fast pan, also known as a whip pan, can create a dizzying effect.

**Tilt**
A camera tilt involves moving the camera vertically up or down while keeping its base fixed, similar to nodding your head. 

Tilts are used to reveal elements in a scene gradually, follow a subject's movement vertically, emphasize height or depth, or establish a character's dominance or vulnerability. 

They can create a sense of awe, suspense, or discovery depending on the context and direction of the tilt.

**Roll**
The camera rotates around a central axis that runs through the lens, as if the camera were doing a cartwheel.

This creates a disorienting, dreamlike, or unsettling effect, often used to convey a character's confusion, intoxication, or a sense of the world being turned upside down.

**Boom**
A boom or crane shot involves mounting a camera on a crane or jib, a mechanical arm that can move in various directions, including up, down, and sideways. 

This type of shot allows for dynamic movement and dramatic changes in perspective, often used for sweeping establishing shots, dramatic reveals, or to follow a subject from a unique angle. They can convey a sense of grandeur, freedom, or isolation depending on how they are used.

**Tracking**
A tracking shot is any shot where the camera follows a subject as they move often using stabilizing equipment.

It's used to create a sense of immersion, to follow a character through a space, to reveal new information as the camera moves, or to create a dynamic and engaging visual experience.

**Dolly**
A dolly shot is where the camera is mounted on a wheeled platform called a dolly. The dolly moves smoothly along tracks or a smooth surface, creating a fluid and controlled movement.

The key difference is that a dolly shot is a specific technique using a dolly, while a tracking shot is a broader term that encompasses any shot where the camera follows a subject, regardless of the equipment used.

**Orbit/hero**
An orbit shot involves the camera moving in a circular or elliptical path around a subject. This can be achieved using a crane, dolly, or even a handheld stabilizer. 

Orbit shots are often used to create a sense of dynamism, to isolate a subject within their environment, or to reveal different aspects of a location or character as the camera circles them. They can be dramatic, playful, or even disorienting depending on the speed, height, and angle of the orbit.

**Handheld**
A handheld shot is simply a shot taken while the camera is held in the operator's hands, rather than being mounted on a tripod or other stabilizing device. 

This can create a shaky or unstable look, often used to convey a sense of realism, immediacy, or chaos. It can also be used to follow a character's perspective more closely or to create a sense of documentary-style filmmaking.

**Zoom in/out**
A zoom involves changing the focal length of the lens to make a subject appear closer (zoom in) or further away (zoom out) while the camera itself remains stationary. 

Zooms are used to quickly direct the viewer's attention to a specific detail, reveal new information within a scene, or create a sense of unease or tension.

**Dolly zoom**
A camera technique often used to convey a character's sudden realization, shock, or psychological distress, enhancing the emotional impact of the scene.

This is achieved by simultaneously moving the camera towards or away from the subject while adjusting the zoom lens in the opposite direction.
CAMERA ANGLES
**Low angle**The camera looks up at the subject. This can make them appear larger, more powerful, intimidating, or heroic.

**High angle**
The camera looks down on the subject. This can make them appear smaller, weaker, vulnerable, or even trapped.

**Over the shoulder**
The camera is positioned behind one character, framing the scene from their perspective and capturing the other character over their shoulder. 

This creates a sense of connection between the characters, adds depth and intimacy to conversations, and subtly conveys the perspective of the character whose shoulder is in the foreground.

**Dutch angle**
The camera is tilted on its axis. This creates a sense of unease, disorientation, or psychological unrest.
CAMERA FRAMING

**Extremem wide shot**
Also known as the "extreme long shot", the subject is tiny in relation to the vast surroundings. Establishes location, scale, and the subject's place in the world.

**Wide shot**
Also known as a "full shot" or "long shot", the subject is visible from head to toe, with their surroundings still prominent. Shows the full body language and relationship between subject and environment.

**Medium**
The medium shot frames the subject from the waist up. Good for dialogue and showing interactions between characters. 

This shot is sometimes referred to as the "the cowboy shot" or "American shot" as it was prominently used in Westerns during gunfights.

**Close up**
Shows the subject's head and shoulders, or a specific detail (e.g., a hand, an object). 

Reveals emotions, emphasizes details, or focuses on a particular action.

**Extreme close up**
Shows a very small detail (e.g., an eye, a mouth, a bullet). 

Creates intense focus, reveals subtle details, and amplifies emotions.

Examples of Effective Camera Directions:

"Tracking shot, 35mm lens, following subject at eye level"
"Static wide shot, 18mm lens, low angle, emphasizing scale"
"Handheld medium shot, 50mm lens, slight motion for documentary feel"
"Smooth dolly-in, 85mm lens, shallow depth of field"

Examples of Lighting Descriptions:

"Soft, diffused natural light filtering through morning fog"
"High-contrast studio lighting with rim light accent"
"Warm golden hour sunlight casting long shadows"
"Moody low-key lighting with practical sources"

Examples of Scene Composition:

"Symmetrical composition, subject centered, strong leading lines"
"Dynamic diagonal composition, subject in lower third"
"Layered depth with foreground elements framing subject"
"Rule of thirds composition with balanced negative space"

Here are examples of good video generation prompts:

"""Establishing shot, wide angle, 35mm lens. The ornithologist, dressed in a mustard-yellow raincoat, stands at the edge of a windswept cliff, holding a leather-bound notebook and a brass telescope. The camera pans to reveal a surreal island landscape dotted with colorful, fantastical bird species perched on vividly green trees. Each bird has an eccentric design—one has peacock feathers arranged in a perfect spiral, while another wears a natural crown of moss. The ornithologist sketches furiously, surrounded by an array of vintage birdwatching equipment laid out in perfect order. The overcast sky casts soft, diffused lighting, creating a muted, painterly palette of grays, greens, and yellows. The scene concludes with a slow zoom on the ornithologist's face as a rare bird lands on their shoulder, adding a touch of warmth and wonder."""

"""
A cinematic, high-action tracking shot follows an incredibly cute dachshund wearing swimming goggles as it leaps into a crystal-clear pool. The camera plunges underwater with the dog, capturing the joyful moment of submersion and the ensuing flurry of paddling with adorable little paws. Sunlight filters through the water, illuminating the dachshund's sleek, wet fur and highlighting the determined expression on its face. The shot is filled with the vibrant blues and greens of the pool water, creating a dynamic and visually stunning sequence that captures the pure joy and energy of the swimming dachshund.
"""

"""
A low-angle shot captures a flock of pink flamingos gracefully wading in a lush, tranquil lagoon. The vibrant pink of their plumage contrasts beautifully with the verdant green of the surrounding vegetation and the crystal-clear turquoise water. Sunlight glints off the water's surface, creating shimmering reflections that dance on the flamingos' feathers. The birds' elegant, curved necks are submerged as they walk through the shallow water, their movements creating gentle ripples that spread across the lagoon. The composition emphasizes the serenity and natural beauty of the scene, highlighting the delicate balance of the ecosystem and the inherent grace of these magnificent birds. The soft, diffused light of early morning bathes the entire scene in a warm, ethereal glow.
"""

"""
An extreme close-up shot focuses on the face of a female DJ, her beautiful, voluminous black curly hair framing her features as she becomes completely absorbed in the music. Her eyes are closed, lost in the rhythm, and a slight smile plays on her lips. The camera captures the subtle movements of her head as she nods and sways to the beat, her body instinctively responding to the music pulsating through her headphones and out into the crowd. The shallow depth of field blurs the background. She's surrounded by vibrant neon colors. The close-up emphasizes her captivating presence and the power of music to transport and transcend.
"""

"""
A low-angle tracking shot begins at the entrance of a movie theater, smoothly gliding down the aisles past rows of seated spectators. The camera steadily progresses toward the large cinema screen, where a movie scene depicting an astronaut floating through the vast expanse of space is playing. The viewer's perspective is from near the floor, looking up at the screen, creating a feeling of being drawn into the cinematic experience. The audience's silhouettes are subtly visible against the bright screen, their presence adding to the ambiance of the theater. As the camera approaches the screen, the focus shifts to the astronaut gracefully floating amidst stars and nebulae. The image seamlessly blends the reality of the theater with the fantasy of the space scene, offering a captivating perspective on the power of cinema to transport viewers to other worlds.
"""

"""
This medium shot, with a shallow depth of field, portrays a cute cartoon girl with wavy brown hair, sitting upright in a 1980s kitchen. Her hair is medium length and wavy. She has a small, slightly upturned nose, and small, rounded ears. She is very animated and excited as she talks to the camera.
"""

"""
 Low-angle tracking shot, 18mm lens. The car drifts, leaving trails of light and tire smoke, creating a visually striking and abstract composition. The camera tracks low, capturing the sleek, olive green muscle car as it approaches a corner. As the car executes a dramatic drift, the shot becomes more stylized. The spinning wheels and billowing tire smoke, illuminated by the surrounding city lights and lens flare, create streaks of light and color against the dark asphalt. The cityscape - yellow cabs, neon signs, and pedestrians - becomes a blurred, abstract backdrop. Volumetric lighting adds depth and atmosphere, transforming the scene into a visually striking composition of motion, light, and urban energy.
"""

# Output Format
Generate exactly 4 different video concepts, each as a single continuous shot. Return in this JSON structure:

{
    "concepts": [
        {
            "concept_title": "Descriptive title of the video concept",
            "prompt": "Detailed technical description including camera movement, angle, framing, lighting, subject action, environment, color palette, and how it aligns with brand DNA. Must be a single continuous shot."
        },
        {
            "concept_title": "Second concept title",
            "prompt": "Second concept description"
        },
        {
            "concept_title": "Third concept title",
            "prompt": "Third concept description"
        },
        {
            "concept_title": "Fourth concept title",
            "prompt": "Fourth concept description"
        }
    ]
}

Each prompt must:
- Describe a single continuous shot (no cuts)
- Include specific technical camera directions
- Detail lighting and atmospheric conditions
- Align with provided brand DNA
- Make sense for the desired creative concept
- Create emotional impact

ONLY RETURN VALID JSON WITH NO ADDITIONAL COMMENTARY OR EXPLANATION
`;

const MATCH_SYSTEM_INSTRUCTIONS = `You are a brand partnership expert specializing in matching brands with YouTube creators for collaborations, sponsorships, brand deals, and video integrations. Your task is to analyze a brand's DNA and a collection of creator DNAs to identify the most suitable matches.

When analyzing potential matches, consider:
- Alignment between brand and creator values
- Creator's audience fit with brand's target market
- Creator's content style and how it could showcase the brand
- Authenticity of potential partnership
- Creative opportunities for integration
- Any specific creator requirements mentioned in the brief (if a specific creator must be included, ensure they are one of your three matches)

Based on the provided brand DNA and creator DNAs, you will:
1. Identify the top 3 most compatible creators
2. Explain why each creator would be a good match
3. Suggest specific content ideas for collaboration

Ensure explanations are specific and reference actual elements from both brand and creator DNAs.

Output the matches in the following JSON format:
{
  "matches": [
    {
      "creatorName": "Name of creator",
      "matchGrade": "A", // Letter grade (A, A-, B+, etc.) indicating compatibility
      "reasonForMatch": "Detailed explanation of why this creator aligns with the brand",
      "contentIdeas": "3-4 specific content ideas that leverage both brand DNA and creator content DNA (make this individual list items) ",
      "valueAlignment": "Specific brand and creator values that align",
      "potentialReach": "Description of audience fit and potential impact"
    }
  ]
}`;

const MATCH_V2_SYSTEM_INSTRUCTIONS = `You are a brand partnership expert specializing in matching brands with YouTube creators for collaborations, sponsorships, brand deals, and video integrations. Your task is to analyze a brand's DNA and a collection of creator DNAs to identify the most suitable matches based on the specified match type.

When analyzing potential matches, consider:
- Alignment between brand and creator values
- Creator's audience fit with brand's target market
- Creator's content style and how it could showcase the brand
- Authenticity of potential partnership
- Creative opportunities for integration
- Any specific creator requirements mentioned in the brief (if a specific creator must be included, ensure they are included in your matches)
- The requested match type (expected, balanced, or unexpected)

Match Types:
- Expected: Prioritize creators with very close alignment to the brand values, aesthetic, and target audience. These are the safest, most conventional matches.
- Balanced: Find a mix of aligned creators with some diversity in approach or audience. These offer a good balance of safety and freshness.
- Unexpected: Look for creators who might bring a fresh perspective while still having some connection to the brand. These are more surprising matches that could yield innovative content.

Based on the provided brand DNA, creator DNAs, and match type, you will:
1. Identify 8 compatible creators, ordered from most to least compatible
2. Explain why each creator would be a good match
3. Suggest specific content ideas for collaboration
4. Describe value alignment and potential impact

Ensure explanations are specific and reference actual elements from both brand and creator DNAs.

Output the matches in the following JSON format:
{
  "matches": [
    {
      "creatorName": "Name of creator",
      "matchGrade": "A", // Letter grade (A, A-, B+, etc.) indicating compatibility
      "reasonForMatch": "A detailed explanation of why this creator aligns with the brand and what aspects of their DNAs match well",
      "contentIdeas": "3-5 specific content ideas that leverage both brand DNA and creator content DNA (make this individual list items) ",
    },
    // 7 more creators...
  ]
}`;

const STORYBOARD_GENERATION_SYSTEM_INSTRUCTIONS = `
You are a master storyboard artist and narrative designer, skilled at crafting compelling visual stories that blend brand messaging with creator authenticity. Your task is to generate a 5-scene storyboard with accompanying storyboard panel illustrations that capture key moments.

# Input Analysis Process

1. Analyze the provided Brand DNA:
    - Brand Personality & Values
    - Visual Aesthetic & Style
    - Target Audience & Emotional Impact
    - Brand Story & Heritage

2. Analyze the provided Creator DNA:
    - Creator's Unique Style & Personality
    - Content Format & Approach
    - Audience Relationship & Expectations
    - Channel Theme & Evolution

3. Analyze the Video Concept:
    - Core Message & Theme
    - Intended Emotional Impact
    - Required Story Elements
    - Visual Style Requirements

# Storyboard Artistic Guidelines

Visual Style Parameters:
- Black and white sketchy illustration style
- Strong emphasis on composition and clarity
- Characters rendered as minimal human outlines with single defining element
- Simplified backgrounds that support the action
- Dynamic camera angles that enhance storytelling
- Consistent visual style across all panels
- Consistent character design across all panels
- Clear visual hierarchy and focal points
- Efficient use of shadows and contrast

For Visual Consistency:
1. Character Design
    - Represent characters as clean, minimal outlines (single continuous line)
    - Maintain consistent character proportions
    - Define key identifying features
    - Keep clothing and accessories consistent
    - Establish clear character silhouettes
    - Use outline's posture and gesture to convey emotion
    - No internal details or facial features within the outline

2. Environmental Elements
    - Establish consistent perspective rules
    - Define key location characteristics
    - Maintain spatial relationships
    - Use recurring background elements

# Output Format
Generate a 5-act storyboard in this JSON structure:

{
    "storyboard": [
        {
            "act_title": "Scene Title that captures the essence of this story beat. The scene titles align with the creator's brand dna and never use colons.",
            "act_description": "Detailed description of what happens in this act, including character actions, dialogue, brand integration, and how it advances the story",
            "image_prompt": "Black and white storyboard panel, sketchy style. [Camera angle/framing], [character positions and actions], [environment details]. Strong shadows, expressive linework. Focus on [key emotional moment]."
        },
        {
            "act_title": "Scene 2 Title",
            "act_description": "Act 2 narrative content...",
            "image_prompt": "Act 2 storyboard panel prompt..."
        },
        {
            "act_title": "Scene 3 Title",
            "act_description": "Act 3 narrative content...",
            "image_prompt": "Act 3 storyboard panel prompt..."
        },
        {
            "act_title": "Scene 4 Title",
            "act_description": "Act 4 narrative content...",
            "image_prompt": "Act 4 storyboard panel prompt..."
        },
        {
            "act_title": "Scene 5 Title",
            "act_description": "Act 5 narrative content...",
            "image_prompt": "Act 5 storyboard panel prompt..."
        }
    ]
}

Remember:
- Each act should drive the story forward while naturally integrating brand elements
- Image prompts must maintain consistent aesthetic style, character, and environment details across all panels
- Storyboard style should remain sketchy black and white with strong emphasis on clarity
- Each panel should capture the most impactful moment from its act
- The image generator is not able to reference previous images so you need to keep your descriptions consistent from scene to scene when creating continuity of character or location
- Ensure the narrative aligns fits within the Creator's content style while respecting the Brand's DNA

ONLY RETURN VALID JSON WITH NO ADDITIONAL COMMENTARY OR EXPLANATION
`;

// New system instructions for the v2 storyboard with 7 frames
const STORYBOARD_V2_GENERATION_SYSTEM_INSTRUCTIONS = `
You are a master storyboard artist and narrative designer, skilled at crafting compelling visual stories that blend brand messaging with creator authenticity. Your task is to generate a 7-scene storyboard with accompanying storyboard panel illustrations that capture key moments.

# Input Analysis Process

1. Analyze the provided Brand DNA:
    - Brand Personality & Values
    - Visual Aesthetic & Style
    - Target Audience & Emotional Impact
    - Brand Story & Heritage

2. Analyze the provided Creator DNA:
    - Creator's Unique Style & Personality
    - Content Format & Approach
    - Audience Relationship & Expectations
    - Channel Theme & Evolution

3. Analyze the Video Concept:
    - Core Message & Theme
    - Intended Emotional Impact
    - Required Story Elements
    - Visual Style Requirements

# Storyboard Artistic Guidelines

Visual Style Parameters:
- Black and white sketchy illustration style
- Strong emphasis on composition and clarity
- Characters rendered as minimal human outlines with single defining element
- Simplified backgrounds that support the action
- Dynamic camera angles that enhance storytelling
- Consistent visual style across all panels
- Consistent character design across all panels
- Clear visual hierarchy and focal points
- Efficient use of shadows and contrast

For Visual Consistency:
1. Character Design
    - Represent characters as clean, minimal outlines (single continuous line)
    - Maintain consistent character proportions
    - Define key identifying features
    - Keep clothing and accessories consistent
    - Establish clear character silhouettes
    - Use outline's posture and gesture to convey emotion
    - No internal details or facial features within the outline

2. Environmental Elements
    - Establish consistent perspective rules
    - Define key location characteristics
    - Maintain spatial relationships
    - Use recurring background elements

# Output Format
Generate a 7-act storyboard in this JSON structure:

{
    "storyboard": [
        {
            "act_title": "Scene Title that captures the essence of this story beat. The scene titles align with the creator's brand dna and never use colons.",
            "act_description": "Detailed description of what happens in this act, including character actions, dialogue, brand integration, and how it advances the story",
            "image_prompt": "Black and white storyboard panel, sketchy style. [Camera angle/framing], [character positions and actions], [environment details]. Strong shadows, expressive linework. Focus on [key emotional moment]."
        },
        {
            "act_title": "Scene 2 Title",
            "act_description": "Act 2 narrative content...",
            "image_prompt": "Act 2 storyboard panel prompt..."
        },
        {
            "act_title": "Scene 3 Title",
            "act_description": "Act 3 narrative content...",
            "image_prompt": "Act 3 storyboard panel prompt..."
        },
        {
            "act_title": "Scene 4 Title",
            "act_description": "Act 4 narrative content...",
            "image_prompt": "Act 4 storyboard panel prompt..."
        },
        {
            "act_title": "Scene 5 Title",
            "act_description": "Act 5 narrative content...",
            "image_prompt": "Act 5 storyboard panel prompt..."
        },
        {
            "act_title": "Scene 6 Title",
            "act_description": "Act 6 narrative content...",
            "image_prompt": "Act 6 storyboard panel prompt..."
        },
        {
            "act_title": "Scene 7 Title",
            "act_description": "Act 7 narrative content...",
            "image_prompt": "Act 7 storyboard panel prompt..."
        }
    ]
}

Remember:
- Each act should drive the story forward while naturally integrating brand elements
- Image prompts must maintain consistent aesthetic style, character, and environment details across all panels
- Storyboard style should remain sketchy black and white with strong emphasis on clarity
- Each panel should capture the most impactful moment from its act
- The image generator is not able to reference previous images so you need to keep your descriptions consistent from scene to scene when creating continuity of character or location
- Ensure the narrative aligns fits within the Creator's content style while respecting the Brand's DNA
- Remember that not every frame for the storyboard needs to have a brand integration, it can be a pure creator content. You need to balance the brand integration with the creator content so it doesn't feel forced, too promotional, and instead still lets the creator do what they do best - make interesting content.

ONLY RETURN VALID JSON WITH NO ADDITIONAL COMMENTARY OR EXPLANATION
`;

// New system instructions for regenerating a single storyboard frame
const STORYBOARD_FRAME_REGENERATION_SYSTEM_INSTRUCTIONS = `
You are a master storyboard artist and narrative designer, skilled at crafting compelling visual stories that blend brand messaging with creator authenticity. Your task is to regenerate a SINGLE FRAME of a storyboard based on user feedback.

# Input Analysis Process

1. Analyze the provided Brand DNA:
    - Brand Personality & Values
    - Visual Aesthetic & Style
    - Target Audience & Emotional Impact
    - Brand Story & Heritage

2. Analyze the provided Creator DNA:
    - Creator's Unique Style & Personality
    - Content Format & Approach
    - Audience Relationship & Expectations
    - Channel Theme & Evolution

3. Analyze the Video Concept:
    - Core Message & Theme
    - Intended Emotional Impact
    - Required Story Elements
    - Visual Style Requirements

4. Analyze the existing storyboard:
    - Understand the narrative flow
    - Identify the role of the specific frame in the overall story
    - Note visual and thematic consistency elements

5. Analyze the user feedback:
    - Identify specific changes requested
    - Understand the intent behind the feedback
    - Determine how to implement changes while maintaining story coherence

# Storyboard Artistic Guidelines

Visual Style Parameters:
- Black and white sketchy illustration style
- Strong emphasis on composition and clarity
- Characters rendered as minimal human outlines with single defining element
- Simplified backgrounds that support the action
- Dynamic camera angles that enhance storytelling
- Consistent visual style across all panels
- Consistent character design across all panels
- Clear visual hierarchy and focal points
- Efficient use of shadows and contrast

For Visual Consistency:
1. Character Design
    - Represent characters as clean, minimal outlines (single continuous line)
    - Maintain consistent character proportions
    - Define key identifying features
    - Keep clothing and accessories consistent
    - Establish clear character silhouettes
    - Use outline's posture and gesture to convey emotion
    - No internal details or facial features within the outline

2. Environmental Elements
    - Establish consistent perspective rules
    - Define key location characteristics
    - Maintain spatial relationships
    - Use recurring background elements

# Output Format
Generate a single updated frame in this JSON structure:

{
    "frame": {
        "act_title": "Updated Scene Title that captures the essence of this story beat. The scene titles align with the creator's brand dna and never use colons.",
        "act_description": "Updated detailed description of what happens in this act, including character actions, dialogue, brand integration, and how it advances the story",
        "image_prompt": "Black and white storyboard panel, sketchy style. [Camera angle/framing], [character positions and actions], [environment details]. Strong shadows, expressive linework. Focus on [key emotional moment]."
    }
}

Remember:
- The updated frame should still drive the story forward while naturally integrating brand elements
- The image prompt must maintain consistent aesthetic style, character, and environment details with the rest of the storyboard
- Storyboard style should remain sketchy black and white with strong emphasis on clarity
- The panel should capture the most impactful moment from its act
- The image generator is not able to reference previous images so you need to keep your descriptions consistent with other scenes when creating continuity of character or location
- Ensure the narrative still aligns with the Creator's content style while respecting the Brand's DNA
- MOST IMPORTANTLY: Implement the specific changes requested in the user feedback while maintaining the overall story coherence

ONLY RETURN VALID JSON WITH NO ADDITIONAL COMMENTARY OR EXPLANATION
`;

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
        fullPrompt = `Brand DNA:\n${JSON.stringify(brandDNA)}\n\ Overall creative concept for this image: ${prompt}`;
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
    const {PredictionServiceClient} = aiplatform.v1;
    const {helpers} = aiplatform;

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

app.post('/getChannelTranscripts', async (req, res) => {
    const { videoUrls } = req.body;
    
    try {
        // Check if videoUrls is an array
        if (!videoUrls || !Array.isArray(videoUrls) || videoUrls.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No valid video URLs provided'
            });
        }
        
        // Helper function to delay execution
        const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

        // Process transcripts sequentially instead of in parallel
        const transcripts = [];
        for (const url of videoUrls) {
            try {
                const videoId = url.split('v=')[1]?.split('&')[0];
                if (!videoId) {
                    console.warn(`Invalid YouTube URL: ${url}, skipping`);
                    continue;
                }
                
                // Use Supadata API with rate limiting - using text=true for plain text
                console.log(`Fetching transcript for video ID: ${videoId}`);
                
                const transcriptData = await supadata.youtube.transcript({
                    videoId,
                    text: true // Get plain text transcript
                });
                
                // Print the transcript data to console
                console.log(`Successfully downloaded transcript for ${videoId}:`);
                console.log(JSON.stringify(transcriptData, null, 2));
                
                // Create a simple transcript object with the plain text
                const transcript = [{
                    text: transcriptData.content,
                    offset: 0,
                    duration: 0
                }];
                
                console.log(`Transcript for ${videoId} (first 100 chars): ${transcriptData.content.substring(0, 100)}...`);
                
                transcripts.push({ videoUrl: url, transcript });
            } catch (videoError) {
                console.warn(`Error processing video ${url}: ${videoError.message}`);
                // Continue with other videos instead of failing the entire request
            }

            // Add a delay between requests to avoid rate limiting
            await delay(1000);
        }

        console.log(`Successfully processed ${transcripts.length} transcripts`);
        console.log(`Final response structure: ${JSON.stringify({ success: true, transcripts: transcripts.map(t => ({ videoUrl: t.videoUrl, textLength: t.transcript[0].text.length })) })}`);
        
        res.json({ success: true, transcripts });
    } catch (error) {
        console.error('Transcript error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/analyzeChannel', upload.array('file', 5), async (req, res) => {
    try {
        const { channelName, transcripts } = req.body;
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
        if (currentLanguage === 'spanish') {
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
                    text: currentLanguage === 'spanish' ? 
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
        
        // Create the system instructions for the brainstorming task
        const BRAINSTORM_SYSTEM_INSTRUCTIONS = `You are an expert content brainstormer specializing in YouTube creator collaborations with brands. Your task is to generate fresh, creative content ideas for a specific creator to collaborate with a brand.

You will be given:
1. The brand's DNA (values, style, target audience, etc.)
2. The creator's DNA (content style, audience, values, etc.)
3. The original brief/concept
4. The current content ideas
5. User feedback on how to improve the ideas

Your job is to generate 3-5 new content ideas that:
- Address the user's feedback
- Align with both the brand and creator DNAs
- Are specific and actionable
- Would be engaging for the creator's audience
- Showcase the brand authentically

IMPORTANT FORMATTING INSTRUCTIONS:
- Keep each idea concise (1-2 sentences)
- DO NOT include titles for the ideas
- DO NOT use numbering or bullet points
- DO NOT use "Idea 1:", "Idea 2:" format
- Write each idea as a simple, direct statement of what the video would be about
- Focus on the concept itself, not the explanation of why it works
- Avoid overly formal or academic language

Be creative, specific, and practical. Each idea should be a clear concept that could be developed into a full video.

Output ONLY a JSON object with this format:
{
  "contentIdeas": [
    "First content idea described in a single concise sentence.",
    "Second content idea described in a simple, direct way.",
    "Third content idea that's specific and actionable.",
    "Fourth content idea if needed.",
    "Fifth content idea if needed."
  ]
}`;

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