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

export {
  LLM_CONFIG,
  VISION_CONFIG
}
