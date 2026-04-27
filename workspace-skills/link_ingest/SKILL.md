---
name: link_ingest
description: Fetch and read the content of any URL, returning clean markdown text. Use when the user shares a link and wants you to read, summarize, or analyze its contents.
---

# Link Ingest via Jina Reader

## When to use

- User shares a URL and asks you to read, summarize, or analyze it
- User says "read this article", "what does this page say", or pastes a link
- You need to retrieve the full text of a web page to answer a question
- User wants to extract specific information from a webpage

## How to call

Use the `bash` tool. No API key required — Jina Reader is a free public service.

```bash
curl -s "https://r.jina.ai/YOUR_URL_HERE"
```

Replace `YOUR_URL_HERE` with the full URL the user provided (including `https://`).

Example:
```bash
curl -s "https://r.jina.ai/https://example.com/article"
```

## Response format

The response is clean markdown text extracted from the page, with:
- Headings preserved
- Links included as markdown `[text](url)`
- Images noted as `![alt](url)`
- Boilerplate navigation/ads stripped out

## Output guidelines

- Read the full content and answer the user's specific question about it
- If the user asked to summarize, provide a structured summary with key points
- Quote relevant sections directly when the user needs exact wording
- If the fetch returns an error or empty content, tell the user the page may be paywalled, blocked, or the URL may be incorrect
- For very long pages, focus on the most relevant sections to the user's request
