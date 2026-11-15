import * as chrono from 'chrono-node';
import {
  getMessagesByDateRange,
  searchMessages,
  getRecentMessages,
  type StoredMessage,
} from './store.js';
import {config} from '../config.js'

export interface MemoryContext {
  text: String;

  // number of past messages retrieved
  count: number;
}

// iso 
interface DateRange {
  from: string; 
  to: string;
}

/**
 * Parse natural-language date references into concrete date ranges.
 * "last Tuesday" → [Tue 00:00, Wed 00:00)
 * "3 November"   → [Nov 3 00:00, Nov 4 00:00)
 * "Monday"       → [Mon 00:00, Tue 00:00)
 */
function extractDateRanges(text: string): DateRange[] {
  const results = chrono.parse(text, new Date(), { forwardDate: false });
  const ranges: DateRange[] = [];

  for (const result of results) {
    const start = result.start.date();
    // If the result has an end date, use it; otherwise, assume a 1-day window
    const end = result.end
      ? result.end.date()
      : new Date(start.getTime() + 24 * 60 * 60 * 1000);

    // Set start to beginning of day
    const dayStart = new Date(start);
    dayStart.setHours(0, 0, 0, 0);

    // Set end to end of day
    const dayEnd = new Date(end);
    dayEnd.setHours(23, 59, 59, 999);

    ranges.push({
      from: dayStart.toISOString(),
      to: dayEnd.toISOString(),
    });
  }

  return ranges;
}

/** Stop words to exclude from FTS queries */
const STOP_WORDS = new Set([
  'i', 'me', 'my', 'you', 'your', 'we', 'our', 'the', 'a', 'an',
  'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'has', 'have', 'had', 'do', 'does', 'did',
  'will', 'would', 'could', 'should', 'can', 'may', 'might',
  'and', 'or', 'but', 'if', 'then', 'than', 'that', 'this',
  'what', 'when', 'where', 'which', 'who', 'how', 'why',
  'not', 'no', 'so', 'as', 'at', 'by', 'for', 'from', 'in',
  'of', 'on', 'to', 'up', 'with', 'about', 'into', 'any',
  'ask', 'asked', 'tell', 'told', 'said', 'say',
  'last', 'ago', 'since', 'still', 'today', 'yesterday',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday',
  'saturday', 'sunday',
]);

/**
 * Extract meaningful search keywords from the user's message.
 * Strips stop words, temporal references, and conversational filler.
 */
function extractSearchKeywords(text: string): string {
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

  return words.join(' ');
}

/** Heuristic: does this message reference a past conversation? */
function looksLikeMemoryQuery(text: string): boolean {
  const patterns = [
    /\bask(?:ed)?\b.*\b(?:you|me|about)\b/i,
    /\blast\s+(?:time|week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
    /\bprevious(?:ly)?\b/i,
    /\bbefore\b/i,
    /\bearlier\b/i,
    /\bremember\b/i,
    /\bwe\s+(?:discussed|talked|shortlisted|picked|chose|mentioned)\b/i,
    /\bhas\s+(?:any|anything)\b.*\bchanged\b/i,
    /\bstill\s+(?:correct|right|true|valid|accurate)\b/i,
    /\bsince\s+(?:then|last|I)\b/i,
    /\bwhat\s+did\b/i,
  ];
  return patterns.some((p) => p.test(text));
}


/**
 * Format retrieved messages into a readable context block.
 * Groups consecutive messages from the same session into conversation threads.
 */
function formatMemoryContext(messages: StoredMessage[]): string {
  if (messages.length === 0) return '';

  // Group by session
  const sessions = new Map<string, StoredMessage[]>();
  for (const msg of messages) {
    const group = sessions.get(msg.sessionId) || [];
    group.push(msg);
    sessions.set(msg.sessionId, group);
  }

  const blocks: string[] = [];

  for (const [, msgs] of sessions) {
    if (msgs.length === 0) continue;

    const date = new Date(msgs[0].timestamp);
    const dateStr = date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const lines = [`--- Past conversation from ${dateStr} ---`];
    for (const msg of msgs) {
      const prefix = msg.role === 'user' ? 'User' : 'Assistant';
      // Truncate very long messages to save context space
      const content =
        msg.content.length > 1500
          ? msg.content.slice(0, 1500) + '… [truncated]'
          : msg.content;
      lines.push(`${prefix}: ${content}`);
    }
    lines.push('--- End of past conversation ---');
    blocks.push(lines.join('\n'));
  }

  return blocks.join('\n\n');
}

/**
 * Retrieve relevant past conversation context for the current user message.
 * Combines temporal retrieval (date references) with keyword retrieval (FTS5).
 */
export function retrieveMemory(
  userMessage: string,
  currentSessionId: string,
): MemoryContext {
  const allMessages: Map<number, StoredMessage> = new Map();

  // Strategy 1: Temporal retrieval — parse date references
  const dateRanges = extractDateRanges(userMessage);
  for (const { from, to } of dateRanges) {
    const msgs = getMessagesByDateRange(from, to);
    for (const m of msgs) {
      if (m.sessionId !== currentSessionId) {
        allMessages.set(m.id, m);
      }
    }
  }

  // Strategy 2: Keyword retrieval — FTS5 search
  const keywords = extractSearchKeywords(userMessage);
  if (keywords) {
    const msgs = searchMessages(keywords, 30);
    for (const m of msgs) {
      if (m.sessionId !== currentSessionId) {
        allMessages.set(m.id, m);
      }
    }
  }

  // Strategy 3: If no temporal or keyword hits, include recent history
  // so the agent has some context about past interactions
  if (allMessages.size === 0 && looksLikeMemoryQuery(userMessage)) {
    const recent = getRecentMessages(currentSessionId, 20);
    for (const m of recent) {
      allMessages.set(m.id, m);
    }
  }

  // Deduplicate and sort by timestamp
  const sorted = [...allMessages.values()].sort(
    (a, b) => a.id - b.id,
  );

  // Limit to configured max
  const limited = sorted.slice(0, config.maxMemoryExcerpts * 5);
  // Group into conversation turns for readability
  const formatted = formatMemoryContext(limited);

  return {
    text: formatted,
    count: limited.length,
  };
}
