import { ModelMessage, streamText, isStepCount, LanguageModel } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createGroq } from '@ai-sdk/groq';
import { randomUUID } from 'crypto';
import { config } from './config.js';
import { buildSystemPrompt } from './prompt.js';
import { webSearchTool } from './tool/search.js';
import { retrieveMemory } from './memory/retrieve.js';
import {
  createSession,
  saveMessage,
} from './memory/store.js';

const gemini = createGoogleGenerativeAI({
  apiKey: config.geminiApiKey,
})

const groq = createGroq({
  apiKey : config.groqApiKey,
})

let model: LanguageModel;

if (groq) {
  model = groq(config.modelName)
} else if (gemini) {
  model = gemini(config.modelName)
}

const sessionId = randomUUID()
createSession(sessionId)

// in-memory message list for the current session
let messages: ModelMessage[] = []

// keep only the last `max` messages to avoid exceeding context window
function trimMessages(msgs: ModelMessage[], max: number): ModelMessage[] {
  if (msgs.length <= max) return msgs;
  return msgs.slice(-max);
}

export interface TurnCallbacks {
  onSearchStart?: (query: string) => void;
  onSearchDone?: (resultCount: number) => void;
  onTextDelta?: (delta: string) => void;
  onFinish?: (fullText: string) => void;
  onError?: (error: Error) => void;
}

// retrieve memory, call llm with tool using the whole system prompt and stream response
export async function runTurn(
  userMessage: string,
  callbacks: TurnCallbacks = {},
): Promise<string> {
  // 1. Save user message to persistent store
  saveMessage(sessionId, 'user', userMessage);

  // 2. Add to in-memory messages
  messages.push({
    role: 'user',
    content: userMessage,
  });

  // 3. Retrieve relevant past conversation context
  const memory = retrieveMemory(userMessage, sessionId);

  // 4. Build system instructions with memory context
  const instructions = buildSystemPrompt(memory);

  // 5. Keep messages within context limits
  const trimmedMessages: ModelMessage[] = trimMessages(
    messages,
    config.maxSessionMessages,
  );

  // Track whether an error callback has already been called
  let errorReported = false;

  try {
    // 6. Stream LLM response with tool use
    const result = streamText({
      model,

      instructions,

      messages: trimmedMessages,

      tools: {
        web_search: webSearchTool,
      },

      stopWhen: isStepCount(config.maxSteps),

      // Called when a tool starts executing
      onToolExecutionStart({ toolCall }) {
        if (toolCall.toolName === 'web_search') {
          const input = toolCall.input as { query?: string };

          callbacks.onSearchStart?.(input.query ?? '');
        }
      },

      // Called when a tool finishes executing
      onToolExecutionEnd({ toolCall, toolOutput }) {
        if (toolCall.toolName === 'web_search') {
          if (toolOutput.type === 'tool-result') {
            const output = toolOutput.output;

            const resultCount = Array.isArray(output)
              ? output.length
              : 0;

            callbacks.onSearchDone?.(resultCount);
          } else {
            callbacks.onSearchDone?.(0);
          }
        }
      },

      // Called when a streaming error occurs
      onError({ error }) {
        errorReported = true;

        const err =
          error instanceof Error
            ? error
            : new Error(String(error));

        callbacks.onError?.(err);
      },
    });

    // 7. Stream text chunks
    let fullText = '';

    for await (const part of result.textStream) {
      fullText += part;

      callbacks.onTextDelta?.(part);
    }

    // 8. Save assistant response
    if (fullText.trim()) {
      saveMessage(sessionId, 'assistant', fullText);

      messages.push({
        role: 'assistant',
        content: fullText,
      });
    }

    // 9. Notify completion
    callbacks.onFinish?.(fullText);

    return fullText;

  } catch (error) {
    const err =
      error instanceof Error
        ? error
        : new Error(String(error));

    // Prevent reporting the same error twice
    if (!errorReported) {
      callbacks.onError?.(err);
    }

    throw err;
  }
}
