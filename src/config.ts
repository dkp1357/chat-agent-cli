import 'dotenv/config';

export const config = {
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  modelName: process.env.MODEL_NAME || 'gemini-3.8-flash',
  tavilyApiKey: process.env.TAVILY_API_KEY || '',

  // maximum past messages to include from the current session
  maxSessionMessages: 40,

  // maximum memory excerpts to inject into context
  maxMemoryExcerpts: 8,

  // maximum agent steps (tool calls) per turn
  maxSteps: 12,
}