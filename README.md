# Chat Agent CLI with Web Search Tool

A memory augmented ReAct chat agent that searches the web and remembers past conversations. Built using Vercel's AI SDK.

## Quick Start

```bash
cp .env.example .env # fill in API Keys
npm install
npm run dev
```

## API Keys

`TAVILY_API_KEY` = Tavily is a web search tool specialised for AI Agents
`GEMINI_API_KEY` = Used to access Gemini AI models
`GROQ_API_KEY`= Used to access models from Groq API

Requires Groq or Gemini api key + Tavily api key (Groq preferred for fast inference)

## What It Does

- **Searches the web** for current information (pricing, news, features)
- **Remembers past conversations** across sessions (SQLite persistence)
- **Understands temporal references** ("last Tuesday", "on 3 November")
- **Streams responses** with live search visibility
- **Cites sources** with URLs

## Architecture

See [DESIGN.md](./DESIGN.md) for the full architecture document.

```
User -> Memory Retrieval -> Context Assembly -> LLM + Search Loop -> Response
        (SQLite FTS5)      (system prompt)     (Groq + Tavily)      (streamed)
```

## Stack

Runtime: Node.js + Typescript
Data Parsing: chrono-node
Memory: SQLite + FTS5 using better-sqlite3
Agent framework: Vercel AI SDK
Search: Tavily
LLM: Groq, Gemini
