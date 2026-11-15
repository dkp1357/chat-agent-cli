A memory-augmented ReAct agent with one tool (web search) and persistent conversation recall using Sqlite.

## Architecture

```
        User message
            │
            ▼
┌─────────────────────────┐
│ 1. MEMORY RETRIEVAL     │
│     Parse temporal refs │   <- using chrono-node ("last tuesday" to 2026-11-10)
│     FTS keyword search  │      using SQlite FTS5
│     Date-range query    │
└────────────┬────────────┘
             ▼
┌─────────────────────────┐
│ 2. CONTEXT ASSEMBLY     │  <- System prompt + past conversations + session history
│     Static persona      │
│     Injected memory     │
│     Current session     │
└────────────┬────────────┘
             ▼
┌─────────────────────────┐
│ 3. LLM + TOOL LOOP      │  <-  LLM via Groq or Gemini
│    ┌──────────────┐     │
│    │  Generate    │◄────┤
│    └──────┬───────┘     │
│           │ tool call?  │
│           ▼             │
│    ┌──────────────┐     │
│    │  Web Search  │─────┤  <- using Tavily, results fed back to LLM
│    └──────────────┘     │     (max 10 steps)
└────────────┬────────────┘
             ▼
┌─────────────────────────┐
│ 4. PERSIST + STREAM     │  <- Save and stream to terminal
└─────────────────────────┘
```

It uses one tool, that is the web search tool. Memory retrieval does not occur as a tool call but is rather injected into the system prompt and then given to the LLM. This is faster than having Memory Retrieval as a second tool because there is no extra step of LLM deciding to check memory or not.

### SQLite FTS5 for retrieval

SQLite Full Text Search was chosen over vector embeddings because:

- **Fast.** Sub-millisecond queries on thousands of messages.
- **Sufficient.** The query patterns in the challenge are temporal and keyword-based, not semantic similarity searches. FTS5 covers both well.

### Temporal parsing with chrono-node

Handles natural language date by converting them to ISO timestamp.

- "last Tuesday" → concrete date based on current time
- "3 November" → November 3 of the most recent year
- "Monday" → most recent Monday

These dates become SQLite range queries. Combined with FTS keyword matching, the retrieval covers both "when" and "what" the user is referring to.

### Config

Arbitary numbers were chosen for `maxSessionMessages` (maximum past messages to include from the current session
), `maxMemoryExcerpts` (maximum memory excerpts to inject into context), `maxSteps` (maximum tool calls per turn).

## Future improvements

1. **Semantic memory with embeddings.** Run an embedding model, enabling similarity search across conversations. Allows hybrid retrieval, FTS5 for keyword/date, cosine similarity for semantic.

2. **Parallel search execution.** When the LLM requests multiple searches in one step, execute them concurrently or parallely instead of sequentially.

3. **Conversation summarization.** After each session ends, generate a one-paragraph summary and store it. For memory retrieval, search summaries first (fast, compressed) then expand into full messages. Helps as history grows past thousands of messages.

4. **Query decomposition.** For complex queries, explicitly decompose into sub-queries. Preprocessing step, allows better results.
