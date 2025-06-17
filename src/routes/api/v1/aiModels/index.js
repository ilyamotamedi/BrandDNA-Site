const express = require('express');
const AiModelsRouter = require('express').Router({ mergeParams: true });

const {
  LLM_CONFIG,
  VISION_CONFIG,
} = require('../../../../configs/aiModels.config');

let currentLlmModel = LLM_CONFIG['gemini-2.0-flash-001'];
let currentVisionModel = VISION_CONFIG['imagen-3.0-generate-002'];

AiModelsRouter.get('/getAvailableModels', (req, res) => {
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

AiModelsRouter.get('/getCurrentModels', (req, res) => {
  res.json({
    llmModelId: currentLlmModel.modelId,
    visionModelId: currentVisionModel.modelId
  });
});

AiModelsRouter.post('/setModel', express.json(), (req, res) => {
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

module.exports = AiModelsRouter;
