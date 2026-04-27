---
name: web_search
description: Search the web for current information using Tavily. Use when the user asks about news, recent events, facts beyond your knowledge cutoff, or explicitly says "search" or "look up".
---

# Web Search via Tavily

## When to use

- User asks about current events, recent news, or anything that may have changed after your knowledge cutoff
- User explicitly says "search the web", "look up", or "find online"
- User asks for statistics, prices, or facts that need to be up-to-date
- User needs multiple source links or citations

## How to call

Use the `bash` tool. Requires env var `TAVILY_API_KEY`.

```bash
curl -s -X POST https://api.tavily.com/search \
  -H "content-type: application/json" \
  -d "{\"api_key\":\"$TAVILY_API_KEY\",\"query\":\"YOUR_QUERY_HERE\",\"max_results\":5,\"include_answer\":true}"
```

Replace `YOUR_QUERY_HERE` with the user's actual search query (keep it concise and specific).

## Response format

The JSON response includes:
- `answer`: a short AI-generated summary answer (may be null)
- `results[]`: array of web results, each with:
  - `title`: page title
  - `url`: source URL
  - `content`: relevant excerpt from the page
  - `score`: relevance score (0-1)

## Output guidelines

- Synthesize the information naturally; do not dump raw JSON
- Cite sources inline using markdown links: [Title](URL)
- If `answer` is non-null, use it as the basis but verify with `results`
- Mention the publication/source name when relevant for credibility
- If results seem stale or irrelevant, tell the user and offer to refine the query
