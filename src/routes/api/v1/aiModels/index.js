const express = require('express');
const AiModelsRouter = require('express').Router({ mergeParams: true });
const modelState = require('../../../../services/modelState.js');

const {
  LLM_CONFIG,
  VISION_CONFIG,
} = require('../../../../configs/aiModels.config');

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
    llmModelId: modelState.getLlm().modelId,
    visionModelId: modelState.getVision().modelId
  });
});

AiModelsRouter.post('/setModel', express.json(), (req, res) => {
  const { modelId, modelType } = req.body;

  if (modelType === 'llm') {
    if (!modelState.setLlm(modelId)) {
      return res.status(400).json({ error: 'Invalid LLM model selection' });
    }
  } else if (modelType === 'vision') {
    if (!modelState.setVision(modelId)) {
      return res.status(400).json({ error: 'Invalid vision model selection' });
    }
  } else {
    return res.status(400).json({ error: 'Invalid model type' });
  }

  res.json({ success: true });
});

module.exports = AiModelsRouter;