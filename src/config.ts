import 'dotenv/config';

export const config = {
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  groqApiKey: process.env.GROQ_API_KEY || '',
  tavilyApiKey: process.env.TAVILY_API_KEY || '',
  modelName: process.env.MODEL_NAME || '',

  // maximum past messages to include from the current session
  maxSessionMessages: 40,

  // maximum memory excerpts to inject into context
  maxMemoryExcerpts: 10,

  // maximum agent steps (tool calls) per turn
  maxSteps: 10,
}

if (config.groqApiKey && !config.modelName) {
  config.modelName = 'openai/gpt-oss-120b'
} else if (config.geminiApiKey && !config.modelName) {
  config.modelName = 'gemini-3.8-flash'
} else {
  console.log("add api keys")
}
