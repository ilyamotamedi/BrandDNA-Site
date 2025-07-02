const { LLM_CONFIG, VISION_CONFIG } = require('../configs/aiModels.config.js');

const modelState = {
  llm: LLM_CONFIG['gemini-2.0-flash-001'],
  vision: VISION_CONFIG['imagen-3.0-generate-002'],

  getLlm() {
    return this.llm;
  },

  getVision() {
    return this.vision;
  },

  setLlm(modelId) {
    if (LLM_CONFIG[modelId]) {
      this.llm = LLM_CONFIG[modelId];
      console.log(`LLM model set to: ${this.llm.displayName}`);
      return true;
    }
    return false;
  },

  setVision(modelId) {
    if (VISION_CONFIG[modelId]) {
      this.vision = VISION_CONFIG[modelId];
      console.log(`Vision model set to: ${this.vision.displayName}`);
      return true;
    }
    return false;
  }
};

module.exports = modelState;
