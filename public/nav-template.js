// nav-template.js

// --- TRANSLATION OBJECT ---
const translations = {
    'nav-get-dna': {
        english: 'BRAND DNA',
        spanish: 'ADN DE LA MARCA'
    },
    'nav-get-channel-dna': {
        english: 'CHANNEL DNA',
        spanish: 'ADN DEL CREADOR'
    },
    'nav-image-generation': {
        english: 'IMAGE GENERATION',
        spanish: 'GENERACIÓN DE IMÁGENES'
    },
    'nav-video-generation': {
        english: 'VIDEO GENERATION',
        spanish: 'GENERACIÓN DE VIDEO'
    },
    'nav-match-making': {
        english: 'MATCH MAKING',
        spanish: 'MATCH MAKING'
    },
    'nav-storyboarding': {
        english: 'STORYBOARDING',
        spanish: 'STORYBOARDING'
    },
    'nav-conversational-generation': {
        english: 'TALK TO GENERATE',
        spanish: 'GENERACIÓN POR VOZ' // Or "GENERACIÓN DE CONVERSACIONES"
    },
    'nav-no-dna-set': {
        english: 'No DNA set',
        spanish: 'ADN no establecido'
    },
     'using-dna': {
        english: 'Using ',
        spanish: 'Usando '
    },
    'nav-settings': {
        english: 'Settings',
        spanish: 'Ajustes'
    },
     'nav-language-model': {
        english: 'Language Model',
        spanish: 'Modelo de Lenguaje'
    },
    'nav-image-model': {
        english: 'Image Model',
        spanish: 'Modelo de Imagen'
    },
    'nav-creator-dna-list': {
        english: 'Creator DNA List',
        spanish: 'Lista de ADN de Creadores'
    },
    'nav-match': {
        english: 'Match',
        spanish: 'Match'
    },
    'nav-language': {
        english: 'Language',
        spanish: 'Idioma'
    },
    'nav-built-by': {
        english: 'Built by',
        spanish: 'Construido por'
    },
     'nav-as-part-of': {
        english: 'as part of',
        spanish: 'como parte de'
    },
    // --- INDEX PAGE TRANSLATIONS ---
    'index-placeholder': {
        english: 'Brand name',
        spanish: 'Nombre de la marca'
    },
    'index-get-dna-button': {
        english: 'GET DNA',
        spanish: 'OBTENER ADN'
    },
    'index-edit-button': {
        english: 'EDIT',
        spanish: 'EDITAR'
    },
    'index-reprompt-button': {
        english: 'RE-PROMPT',
        spanish: 'RE-SOLICITAR' // Or "VOLVER A SOLICITAR"
    },
    'reprompt-title': {
        english: 'What would you like to adjust about the DNA?',
        spanish: '¿Qué te gustaría ajustar sobre el ADN?'
    },
    'reprompt-placeholder': {
        english: 'Enter your feedback here...',
        spanish: 'Introduce tus comentarios aquí...'
    },
    'reprompt-cancel-button': {
        english: 'CANCEL',
        spanish: 'CANCELAR'
    },
    'reprompt-regenerate-button': {
        english: 'REGENERATE DNA',
        spanish: 'REGENERAR ADN'
    },
    // --- CHANNEL PAGE TRANSLATIONS ---
    'channel-placeholder': {
        english: 'Creator name',
        spanish: 'Nombre del canal'
    },
    'channel-get-dna-button': {
        english: 'GET DNA',
        spanish: 'OBTENER ADN'
    },
    'channel-edit-button': {  // For the dynamically created button
        english: 'EDIT',
        spanish: 'EDITAR'
    },
    'channel-reprompt-button': { // For the dynamically created button
        english: 'RE-PROMPT',
        spanish: 'RE-SOLICITAR'
    },
    'channel-reprompt-title': {
        english: 'What would you like to adjust about the DNA?',
        spanish: '¿Qué te gustaría ajustar sobre el ADN?'
    },
    'channel-reprompt-placeholder': {
        english: 'Enter your feedback here...',
        spanish: 'Introduce tus comentarios aquí...'
    },
    'channel-reprompt-cancel-button': {
        english: 'CANCEL',
        spanish: 'CANCELAR'
    },
    'channel-reprompt-regenerate-button': {
        english: 'REGENERATE DNA',
        spanish: 'REGENERAR ADN'
    },
    // --- IMAGE GENERATION TRANSLATIONS ---
    'image-placeholder': {
        english: 'Describe your image idea...',
        spanish: 'Describe tu idea de imagen...'
    },
    'image-generate-button': {
        english: 'GENERATE IMAGES',
        spanish: 'GENERAR IMÁGENES'
    }, 
    // --- VIDEO GENERATION TRANSLATIONS ---
    'video-placeholder': {
        english: 'Describe your video idea...',
        spanish: 'Describe tu idea de video...'
    },
    'video-generate-button': {
        english: 'GENERATE VIDEOS',
        spanish: 'GENERAR VIDEOS'
    },
    'dialog-message': {
        english: 'Video generation not yet available in this prototype. Prompt has been copied to your clipboard - use VideoFX for video generation.',
        spanish: 'La generación de video aún no está disponible en este prototipo. El prompt se ha copiado a su portapapeles; use VideoFX para la generación de video.'
    },
    // --- MATCH PAGE TRANSLATIONS ---
    'match-placeholder': {
        english: 'Enter your concept or brief',
        spanish: 'Describe tu concepto o brief'
    },
    'match-get-match-button': {
        english: 'GET MATCH',
        spanish: 'OBTENER MATCH'
    },
    'match-type-expected': {
        english: 'Expected',
        spanish: 'Esperado'
    },
    'match-type-balanced': {
        english: 'Balanced',
        spanish: 'Equilibrado'
    },
    'match-type-unexpected': {
        english: 'Unexpected',
        spanish: 'Inesperado'
    },
    'match-view-details': {
        english: 'View Details',
        spanish: 'Ver Detalles'
    },
    'match-hide-details': {
        english: 'Hide Details',
        spanish: 'Ocultar Detalles'
    },
    'match-why-works': {
        english: 'Why This Match Works',
        spanish: 'Por Qué Funciona Esta Combinación'
    },
    'match-content-ideas': {
        english: 'Content Ideas',
        spanish: 'Ideas de Contenido'
    },
    'match-change-ideas': {
        english: 'Change these ideas...',
        spanish: 'Cambiar estas ideas...'
    },
    'match-regenerate-ideas': {
        english: 'REGENERATE IDEAS',
        spanish: 'REGENERAR IDEAS'
    },
    'match-storyboard-idea': {
        english: 'STORYBOARD IDEA',
        spanish: 'GUION GRÁFICO'
    },
    'match-regenerating-ideas': {
        english: 'Regenerating ideas...',
        spanish: 'Regenerando ideas...'
    },
    // --- STORYBOARD PAGE TRANSLATIONS ---
    'storyboard-concept-placeholder': {
        english: 'Describe your video concept...',
        spanish: 'Describe tu concepto de video...'
    },
    'storyboard-integration-placeholder': {
        english: 'Integration',
        spanish: 'Integración'
    },
    'integration-mention': { // Add these new integration translations
        english: 'Mention',
        spanish: 'Mención'
    },
    'integration-adbreak': {
        english: 'Ad Break',
        spanish: 'Pausa Publicitaria' // Or "Corte Comercial"
    },
    'integration-full': {
        english: 'Full Integration',
        spanish: 'Integración Completa'
    },
    'storyboard-creator-placeholder': {
        english: 'Select a creator...',
        spanish: 'Selecciona un creador...'
    },
    'storyboard-generate-button': {
        english: 'GENERATE STORYBOARD',
        spanish: 'GENERAR STORYBOARD' // Or "CREAR GUION GRÁFICO"
    },
    'storyboard-show-prompt': {
        english: 'Show Prompt',
        spanish: 'Mostrar Prompt'
    },
    'scene-1': { // Dynamic keys for scenes
        english: 'Scene 1',
        spanish: 'Escena 1'
    },
    'scene-2': {
        english: 'Scene 2',
        spanish: 'Escena 2'
    },
    'scene-3': {
        english: 'Scene 3',
        spanish: 'Escena 3'
    },
    'scene-4': {
        english: 'Scene 4',
        spanish: 'Escena 4'
    },
    'scene-5': {
        english: 'Scene 5',
        spanish: 'Escena 5'
    },
    // --- STORYBOARD V2 PAGE TRANSLATIONS ---
    'storyboard-campaign-brief': {
        english: 'Campaign brief/goal...',
        spanish: 'Brief/objetivo de campaña...'
    },
    'storyboard-regenerate-frame': {
        english: 'Regenerate Frame',
        spanish: 'Regenerar Escena'
    },
    'storyboard-change-frame-help': {
        english: 'Describe how you want to change this frame...',
        spanish: 'Describe cómo quieres cambiar esta escena...'
    },
    'storyboard-submit-button': {
        english: 'Submit',
        spanish: 'Enviar'
    },
    'storyboard-cancel-button': {
        english: 'Cancel',
        spanish: 'Cancelar'
    },
    'storyboard-add-scene': {
        english: 'Add New Scene',
        spanish: 'Añadir Nueva Escena'
    },
    'storyboard-describe-new-scene': {
        english: 'Describe the new scene you\'d like to add...',
        spanish: 'Describe la nueva escena que te gustaría añadir...'
    },
    'storyboard-add-scene-button': {
        english: 'Add Scene',
        spanish: 'Añadir Escena'
    },
    'storyboard-regenerating-frame': {
        english: 'Regenerating frame...',
        spanish: 'Regenerando escena...'
    },
    'storyboard-generating-scene': {
        english: 'Generating scene...',
        spanish: 'Generando escena...'
    },
    'storyboard-review-button': {
        english: 'REVIEW STORYBOARD',
        spanish: 'REVISAR STORYBOARD'
    },
    'storyboard-reviewing': {
        english: 'Reviewing...',
        spanish: 'Revisando...'
    }
};

// --- translateUI FUNCTION ---
async function translateUI() {
    try {
        // Get language from sessionStorage instead of API call
        const currentLanguage = getClientLanguage() || 'english'; // Default to English

        const elementsToTranslate = document.querySelectorAll('[data-translation-key]');
        elementsToTranslate.forEach(element => {
            const key = element.dataset.translationKey;
            if (translations[key] && translations[key][currentLanguage]) {
                // Check if the element is a nav-item (has the dot).
                if (element.classList.contains('nav-item')) {
                    // For nav items, replace only the text node *after* the span.
                    // Find the *last* child node, which should be the text node.
                    const textNode = element.lastChild;
                     if (textNode && textNode.nodeType === Node.TEXT_NODE) {
                        textNode.nodeValue = " " + translations[key][currentLanguage]; // Add a space
                     }
                }
                else if (key === 'using-dna'){
                    const currentDNA = getClientDNA();
                    if(currentDNA){
                        element.textContent = translations[key][currentLanguage] + currentDNA.brandName + " DNA";
                    } else {
                        element.textContent = translations['nav-no-dna-set'][currentLanguage];
                    }
                }
                 else {
                    // Check if it's an input with a placeholder
                    if (element.tagName === 'INPUT' && element.hasAttribute('placeholder')) {
                        element.setAttribute('placeholder', translations[key][currentLanguage]);
                    } else {
                        // For other elements (like settings labels), replace the entire textContent.
                        element.textContent = translations[key][currentLanguage];
                    }
                }
            }
        });
    } catch (error) {
        console.error('Error translating UI:', error);
    }
}

function insertNav() {
  const navHTML = `
        <nav class="sidebar">
            <div class="logo">
                <a href="index.html" style="text-decoration: none; color: inherit;">
                    <h1 class="unbounded-logo"><span class="logo-dot"></span>Brand<sup style="padding-left:2px;">DNA</sup></h1>
                </a>
            </div>

            <div class="nav-items">
                <div class="nav-section">
                    <a href="index.html" class="nav-item" id="nav-get-dna" data-translation-key="nav-get-dna">
                        <span class="dot">•</span> BRAND DNA
                    </a>
                    <a href="channel.html" class="nav-item" data-translation-key="nav-get-channel-dna">
                        <span class="dot">•</span> CHANNEL DNA
                    </a>
                    <a href="image.html" class="nav-item" data-translation-key="nav-image-generation">
                        <span class="dot">•</span> IMAGE GENERATION
                    </a>
                    <a href="video.html" class="nav-item" data-translation-key="nav-video-generation">
                        <span class="dot">•</span> VIDEO GENERATION
                    </a>
                    <!--
                    <a href="match.html" class="nav-item" data-translation-key="nav-match-making">
                        <span class="dot">•</span> MATCH MAKING
                    </a>
                    <a href="storyboard.html" class="nav-item" data-translation-key="nav-storyboarding">
                        <span class="dot">•</span> STORYBOARDING
                    </a>
                    -->
                    <a href="match-v2.html" class="nav-item" data-translation-key="nav-match-v2">
                        <span class="dot">•</span> MATCH V2
                    </a>
                    <a href="storyboard-v2.html" class="nav-item" data-translation-key="nav-storyboarding-v2">
                        <span class="dot">•</span> STORYBOARDING V2
                    </a>
                                        <a href="https://multimodal-live-dot-branddna.googleplex.com/" target="_blank" class="nav-item" data-translation-key="nav-conversational-generation">
                        <span class="dot">•</span> TALK TO GENERATE
                    </a>
                </div>
            </div>

            <div class="bottom-section">
                    <button class="dna-btn" id="dnaButton">

                        <div class="dna-icon-wrapper">
                            <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" class="dna-icon-svg">
                                <path d="M200-40v-40q0-139 58-225.5T418-480q-102-88-160-174.5T200-880v-40h80v40q0 11 .5 20.5T282-840h396q1-10 1.5-19.5t.5-20.5v-40h80v40q0 139-58 225.5T542-480q102 88 160 174.5T760-80v40h-80v-40q0-11-.5-20.5T678-120H282q-1 10-1.5 19.5T280-80v40h-80Zm138-640h284q13-19 22.5-38t17.5-42H298q8 22 17.5 41.5T338-680Zm142 148q20-17 39-34t36-34H405q17 17 36 34t39 34Zm-75 172h150q-17-17-36-34t-39-34q-20 17-39 34t-36 34ZM298-200h364q-8-22-17.5-41.5T622-280H338q-13 19-22.5 38T298-200Z"/>
                            </svg>
                        </div>
                        <span class="dna-text" data-translation-key="nav-no-dna-set">No DNA set</span>
                        <div class="dna-menu">
                            <!-- DNA options will be populated dynamically -->
                        </div>
                    </button>

                    <button class="settings-btn">
                    <img src="/icons/settings.svg" alt="Settings" class="settings-icon-svg"> <span data-translation-key="nav-settings">Settings</span>
                    <div class="settings-menu">
                        <div class="settings-section">
                            <div class="settings-label" data-translation-key="nav-language-model">Language Model</div>
                            <select class="settings-select" id="languageModelSelect">
                                <!-- Options will be populated dynamically -->
                            </select>
                        </div>
                        <div class="settings-section">
                            <div class="settings-label" data-translation-key="nav-image-model">Image Model</div>
                            <select class="settings-select" id="imageModelSelect">
                                <!-- Options will be populated dynamically -->
                            </select>
                        </div>
                        <div class="settings-section">
                         <div class="settings-label" data-translation-key="nav-creator-dna-list">Creator DNA List</div>
                         <select class="settings-select" id="creatorDnaListSelect">
                             <!-- Options will be populated dynamically -->
                         </select>
                     </div>
                     <div class="settings-section">
                         <div class="settings-label" data-translation-key="nav-match">Match</div>
                         <select class="settings-select" id="matchSelect">
                             <option value="">-</option>
                             <!-- Creator options will be populated dynamically -->
                         </select>
                     </div>
                     <div class="settings-section">
                            <div class="settings-label" data-translation-key="nav-language">Language</div>
                            <select class="settings-select" id="languageSelect">
                                <option value="english">English</option>
                                <option value="spanish">Spanish</option>
                            </select>
                        </div>
                    </div>
                </button>

                <p class="built-by"><span data-translation-key="nav-built-by">Built by</span> <a href="https://moma.corp.google.com/person/yaakov" target="_blank">yaakov@</a> <span data-translation-key="nav-as-part-of">as part of</span> <a href="https://sites.google.com/corp/google.com/hackmakebuild/home" target="_blank">GenAI Lab</a></p>
            </div>
        </nav>
    `;

    document.getElementById('nav-placeholder').innerHTML = navHTML;
     // --- ADDED: Re-apply active class and translate AFTER inserting HTML ---
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        if (item.getAttribute('href') === currentPage) {
            item.classList.add('active'); // Add 'active' class
        }
    });
}

async function initializeSettings() {
    const settingsBtn = document.querySelector('.settings-btn');
    const settingsMenu = document.querySelector('.settings-menu');
    const languageModelSelect = document.getElementById('languageModelSelect');
    const imageModelSelect = document.getElementById('imageModelSelect');
    const creatorDnaListSelect = document.getElementById('creatorDnaListSelect');
    const matchSelect = document.getElementById('matchSelect');
    const languageSelect = document.getElementById('languageSelect');  // Moved up here

    // Toggle settings menu
    settingsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        settingsMenu.classList.toggle('active');
    });

    // Prevent menu from closing when interacting with dropdowns
    settingsMenu.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
        if (!settingsMenu.contains(e.target) && !settingsBtn.contains(e.target)) {
            settingsMenu.classList.remove('active');
        }
    });

    // --- MODIFIED LANGUAGE SELECTION HANDLER ---
    languageSelect.addEventListener('change', async (e) => {
        const selectedLanguage = e.target.value;
        try {
            // Store language in sessionStorage instead of server API
            setClientLanguage(selectedLanguage);
            await translateUI(); // Translate the UI after updating the language
        } catch (error) {
            console.error('Error updating language:', error);
        }
    });

    // Function to populate the Match dropdown with creator names
    async function populateMatchDropdown() {
        try {
            const language = getClientLanguage();
            const response = await fetch(`${window.API_BASE_URL}/api/v1/creatorDna/getCreatorDNAs?language=${encodeURIComponent(language)}`);

            if (!response.ok) {
                throw new Error('Failed to fetch creator DNAs');
            }
            const creatorDNAsArray = await response.json();

            // Check if the response is actually an array
            if (!Array.isArray(creatorDNAsArray)) {
                console.error("API response for creator DNAs was not an array:", creatorDNAsArray);
                throw new Error("Invalid data format for creator DNAs.");
            }
            
            // Start with the empty option
            let options = '<option value="">-</option>';
            
            // Add creator names as options
            // options += Object.keys(creatorDNAs)
            //     .sort((a, b) => a.localeCompare(b))
            //     .map(creatorName => `<option value="${creatorName}">${creatorName}</option>`)
            //     .join('');

            // Map over the array to create options
            options += creatorDNAsArray
                .sort((a, b) => a.channelName.localeCompare(b.channelName)) // Sort by channelName
                .map(creator => `<option value="${creator.channelName}">${creator.channelName}</option>`)
                .join('');

            matchSelect.innerHTML = options;
            
            // Set the current selection if available
            const currentMatch = sessionStorage.getItem('currentMatch');
            if (currentMatch) {
                matchSelect.value = currentMatch;
            }
        } catch (error) {
            console.error('Error loading creator DNAs for match dropdown:', error);
        }
    }
    
    // Add event listener for the Match dropdown
    matchSelect.addEventListener('change', (e) => {
        const selectedCreator = e.target.value;
        sessionStorage.setItem('currentMatch', selectedCreator);
        console.log('Match creator set to:', selectedCreator);
    });

    // Load available models and populate dropdowns
    async function loadAvailableModels() {
        try {
            const response = await fetch(`${window.API_BASE_URL}/api/v1/aiModels/getAvailableModels`);
            if (!response.ok) {
                throw new Error('Failed to fetch models');
            }

            const { llmModels, visionModels } = await response.json();

            // Populate LLM dropdown
            languageModelSelect.innerHTML = llmModels
                .map(model => `<option value="${model.id}">${model.displayName}</option>`)
                .join('');

            // Populate Vision dropdown
            imageModelSelect.innerHTML = visionModels
                .map(model => `<option value="${model.id}">${model.displayName}</option>`)
                .join('');


                const populateCreatorDnaListDropdown = async () => {
                    try {
                        const language = getClientLanguage(); // Get current language for the API call
                        const response = await fetch(`${window.API_BASE_URL}/api/v1/creatorDna/getCreatorDNAs?language=${encodeURIComponent(language)}`);
                        console.log("Response object from API call for creator is: ", response);
                        if (!response.ok) {
                            throw new Error('Failed to fetch creator DNA lists');
                        }
                        const creatorDnaArray = await response.json();
                        // console.log("Printing creatorDnaArray:", creatorDnaArray); // Log the array

                        // Ensure it's an array and map correctly
                        if (Array.isArray(creatorDnaArray)) {
                            creatorDnaListSelect.innerHTML = creatorDnaArray
                                .map(creator => `<option value="${creator.channelName}">${creator.channelName}</option>`)
                                .join('');

                            // Load current Creator DNA List selection after populating
                            await loadCurrentCreatorDnaList();
                        } else {
                            console.error("API response for creator DNA list was not an array:", creatorDnaArray);
                            // Potentially, provide a fallback message or disable the dropdown
                            creatorDnaListSelect.innerHTML = '<option value="">Error loading list</option>';
                        }

                    } catch (error) {
                        console.error('Error loading creator DNA lists:', error);
                    }
                };

                await populateCreatorDnaListDropdown();
                
                // Populate the Match dropdown with creator names
                await populateMatchDropdown();

            // After populating models, load current selections
            await loadCurrentModels();
            await loadCurrentLanguage();  // Still call this to set the dropdown value
        } catch (error) {
            console.error('Error loading models:', error);
        }
    }

    // Handle model selection
    async function handleModelSelection(modelId, modelType) {
        try {
            const response = await fetch(`${window.API_BASE_URL}/api/v1/aiModels/setModel`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ modelId, modelType })
            });

            if (!response.ok) {
                throw new Error('Failed to update model');
            }
        } catch (error) {
            console.error(`Error updating ${modelType} model:`, error);
        }
    }

    // Add event listeners for both dropdowns
    languageModelSelect.addEventListener('change', (e) => {
        handleModelSelection(e.target.value, 'llm');
    });

    imageModelSelect.addEventListener('change', (e) => {
        handleModelSelection(e.target.value, 'vision');
    });

     // Handle Creator DNA List selection
 async function handleCreatorDnaListSelection(creatorDnaListFile) {
    try {
        const response = await fetch(`${window.API_BASE_URL}/api/v1/creatorDna/setCurrentCreatorDnaList`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ creatorDnaListFile })
        });

        if (!response.ok) {
            throw new Error('Failed to update creator DNA list file');
        }
        // Optionally, reload DNA options in the DNA selector if needed
        await initializeDNASelector(); // Re-initialize DNA selector to use new list
    } catch (error) {
        console.error('Error updating creator DNA list file:', error);
    }
}

creatorDnaListSelect.addEventListener('change', (e) => {
    handleCreatorDnaListSelection(e.target.value);
});

    // Load current model selections
    async function loadCurrentModels() {
        try {
            const response = await fetch(`${window.API_BASE_URL}/api/v1/aiModels/getCurrentModels`);
            if (response.ok) {
                const { llmModelId, visionModelId } = await response.json();
                languageModelSelect.value = llmModelId;
                imageModelSelect.value = visionModelId;
            }
        } catch (error) {
            console.error('Error loading current models:', error);
        }
    }


    // Initialize the models dropdowns
    await loadAvailableModels();

}

async function loadCurrentLanguage() {
    try {
        // Get language from sessionStorage
        const currentLanguage = getClientLanguage();
        
        // Set the dropdown to the current language
        languageSelect.value = currentLanguage;
        
        // Translate the UI
        await translateUI();
        
        // Store language in window object for immediate use
        window.currentLanguage = currentLanguage;
    } catch (error) {
        console.error('Error loading current language:', error);
    }
}

async function loadCurrentCreatorDnaList() {
    try {
        const response = await fetch(`${window.API_BASE_URL}/api/v1/creatorDna/getCurrentCreatorDnaList`);
        if (response.ok) {
            const { currentCreatorDnaListFile } = await response.json();
            creatorDnaListSelect.value = currentCreatorDnaListFile;
            // console.log("Full creator dna list: " + currentCreatorDnaListFile);
        }
    } catch (error) {
        console.error('Error loading current creator DNA list:', error);
    }
}

async function initializeDNASelector() {
    console.log('Initializing DNA selector...'); // Debug log
    const dnaButton = document.getElementById('dnaButton');
    const dnaMenu = document.querySelector('.dna-menu');
    
    // Store brand options for reference
    let brandOptions = new Map();

    // First load the current DNA
    await loadCurrentDNA();

    // Then set up event listeners
    dnaButton.addEventListener('click', (e) => {
        e.stopPropagation();
        dnaMenu.classList.toggle('active');
        if (dnaMenu.classList.contains('active')) {
            loadDNAOptions();
        }
    });

    dnaMenu.addEventListener('click', (e) => {
        e.stopPropagation();
        
        // Handle DNA option clicks
        const option = e.target.closest('.dna-option');
        if (option) {
            const optionId = option.dataset.id;
            if (brandOptions.has(optionId)) {
                setDNA(brandOptions.get(optionId));
            }
        }
    });

    document.addEventListener('click', () => {
        dnaMenu.classList.remove('active');
    });

    // Load DNA options
    async function loadDNAOptions() {
        try {
            const response = await fetch(`${window.API_BASE_URL}/api/v1/brandDna/getDNAs`);
            // This endpoint also returns an array now, so adjust here as well
            const dnas = await response.json();
            
            // Clear previous brand options
            brandOptions.clear();
            
            // Generate HTML for DNA options
            // Assuming dnas is an array from the server now
            if (Array.isArray(dnas)) { // Add array check
                dnaMenu.innerHTML = dnas
                    .sort((a, b) => a.brandName.localeCompare(b.brandName)) // Sort by brandName
                    .map((data, index) => { // Map over array elements
                        const optionId = `dna-option-${index}`;
                        brandOptions.set(optionId, data.brandName); // Store brandName
                        
                        return `
                        <div class="dna-option" data-id="${optionId}">
                            <div class="dna-option-color" style="background-color: ${data.brandColors[0]}"></div>
                            <div class="dna-option-name">${data.brandName}</div>
                        </div>
                        `;
                    }).join('');
            } else {
                console.error("Error: Expected an array from /getDNAs (Brand), but received:", dnas);
            }
            
            dnaMenu.innerHTML = '<div class="dna-option">Error loading brands</div>';

        } catch (error) {
            console.error('Error loading DNAs:', error);
        }
    }

    // Load current DNA selection
    await loadCurrentDNA();
}

async function setClientDNA(dna) {
    return new Promise(resolve => { // Wrap in a Promise
        if (dna) {
            sessionStorage.setItem('currentDNA', JSON.stringify(dna));
        } else {
            sessionStorage.removeItem('currentDNA');
        }
        resolve(); // Resolve the Promise when done
    });
}

function getClientDNA() {
    const storedDNA = sessionStorage.getItem('currentDNA');
    return storedDNA ? JSON.parse(storedDNA) : null;
}

// Function to set DNA
async function setDNA(brandName) {
    console.log('Setting DNA for brand:', brandName);
    try {
        if (!brandName) {
            await setClientDNA(null); // Await the clearing
            updateDNAButton(null);
            return;
        }

        // Fetch all brand DNAs and then find the one by name
        const response = await fetch(`${window.API_BASE_URL}/api/v1/brandDna/getDNAs`);
        const dnasArray = await response.json(); // Expecting an array now

        // Find the specific brand DNA in the array
        const selectedDna = dnasArray.find(dna => dna.brandName === brandName);

        if (!selectedDna) {
            console.log('DNA not found for brand:', brandName);
            return;
        }

        await setClientDNA(selectedDna); // Await the setting
        updateDNAButton(selectedDna); // update after the await

        // Close the menu
        document.querySelector('.dna-menu').classList.remove('active');
    } catch (error) {
        console.error('Error setting DNA:', error);
    }
}

function hexToFilter(hex) {
    // Remove the hash if it exists
    hex = hex.replace('#', '');

    // Convert hex to RGB
    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;

    // Calculate sepia, saturate, and hue-rotate values
    const sepia = Math.round((r + g + b) / 3 * 100);
    const saturate = Math.round(Math.max(r, g, b) * 100);
    const hueRotate = Math.round(Math.atan2(Math.sqrt(3) * (g - b), 2 * r - g - b) * 180 / Math.PI);

    return `sepia(${sepia}%) saturate(${saturate}%) hue-rotate(${hueRotate}deg)`;
}

function updateDNAButton(dna) {
    const dnaButton = document.getElementById('dnaButton');
    const dnaText = dnaButton.querySelector('.dna-text');
    const dnaIconWrapper = dnaButton.querySelector('.dna-icon-wrapper');
    const dnaIcon = dnaButton.querySelector('.dna-icon-svg');

    if (dna) {
        dnaButton.classList.add('active');
        dnaIconWrapper.style.backgroundColor = dna.brandColors[0];

        // Set the fill color for the path
        const path = dnaIcon.querySelector('path');
        if (path) {
            path.style.fill = dna.brandColors[1];
        }

        dnaText.setAttribute('data-translation-key', 'using-dna');

    } else {
        dnaButton.classList.remove('active');
        dnaIconWrapper.style.backgroundColor = 'transparent';

        // Reset the fill color
        const path = dnaIcon.querySelector('path');
        if (path) {
            path.style.fill = 'currentColor';
        }

        dnaText.setAttribute('data-translation-key', 'nav-no-dna-set'); // Reset to default

    }
      translateUI();
}

// Function to load current DNA
async function loadCurrentDNA() {
    console.log('Loading current DNA...');
    try {
        const currentDNA = getClientDNA();
        if (currentDNA) {
            // Verify the DNA still exists in storage
            const response = await fetch(`${window.API_BASE_URL}/api/v1/brandDna/getDNAs`);
            const dnasArray = await response.json(); // Expecting an array now

            // Find the specific DNA in the array by brandName
            const existingDna = dnasArray.find(dna => dna.brandName === currentDNA.brandName);

            if (existingDna) {
                updateDNAButton(existingDna); // Update with the re-fetched data
                await setClientDNA(existingDna); // Update sessionStorage with fresh data
            } else {
                // If the DNA no longer exists in storage, clear it
                setClientDNA(null);
                updateDNAButton(null);
            }
        } else {
            updateDNAButton(null);
        }
    } catch (error) {
        console.error('Error loading current DNA:', error);
        updateDNAButton(null);
    }
}

function setupEnterKeyHandler() {
    // Find all input elements inside elements with class 'search-container'
    const searchContainers = document.querySelectorAll('.search-container');

    searchContainers.forEach(container => {
        const input = container.querySelector('input');
        const button = container.querySelector('button');

        if (input && button) {
            input.addEventListener('keypress', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    button.click(); // Simulate a click on the associated button
                }
            });
        }
    });
}

// Add functions to get and set client language (similar to DNA functions)
function setClientLanguage(language) {
    if (language) {
        sessionStorage.setItem('currentLanguage', language);
    } else {
        sessionStorage.removeItem('currentLanguage');
    }
    // Also set in window object for immediate use
    window.currentLanguage = language || 'english';
}

function getClientLanguage() {
    const storedLanguage = sessionStorage.getItem('currentLanguage');
    return storedLanguage || 'english'; // Default to English
}

// Helper function to add language parameter to API requests
function addLanguageToRequest(requestBody = {}) {
    const language = getClientLanguage();
    return { ...requestBody, language };
}

// Initialize everything when the DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
    // Clear any existing DNA state
    if (performance.navigation.type === 1) { // 1 indicates a page refresh
        // Clear DNA state only on refresh
        sessionStorage.removeItem('currentDNA');
        // Also clear language state on refresh
        sessionStorage.removeItem('currentLanguage');
        // Clear match setting on refresh
        sessionStorage.removeItem('currentMatch');
    }

    console.log('DOM loaded, initializing...');
    insertNav(); //Insert and translate at the start
    setupEnterKeyHandler();
    try {
        await Promise.all([
            initializeSettings(),
            initializeDNASelector()
        ]);
        console.log('Initialization complete');
    } catch (error) {
        console.error('Error during initialization:', error);
    }
});