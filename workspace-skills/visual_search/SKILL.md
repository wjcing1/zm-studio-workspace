---
name: visual_search
description: Perform a reverse image search to find visually similar images using SerpAPI Google Reverse Image. Use when the user shares an image URL and wants to find similar images, identify the source, or discover related visual content.
---

# Visual Search via SerpAPI Google Reverse Image

## When to use

- User shares an image URL and asks "find similar images", "what is this", or "where is this from"
- User wants to discover images with a similar style, composition, or subject
- User needs to find the original source of an image
- User is looking for visual inspiration or references similar to a given image

## How to call

Use the `bash` tool. Requires env var `SERPAPI_API_KEY`.

```bash
curl -s "https://serpapi.com/search.json?engine=google_reverse_image&image_url=YOUR_IMAGE_URL&api_key=$SERPAPI_API_KEY"
```

Replace `YOUR_IMAGE_URL` with the full URL of the reference image (must be publicly accessible).

Optionally add `&gl=us&hl=en` for locale settings.

## Response format

The JSON response includes multiple sections:

- `image_results[]`: visually similar images, each with:
  - `title`: description of the image
  - `link`: URL of the page containing the image
  - `thumbnail`: thumbnail URL of the similar image
  - `source`: domain name of the source
- `knowledge_graph`: structured info if the image matches a known entity (person, landmark, product)
- `search_metadata.status`: `"Success"` if the search worked

## Output guidelines

- Present the most relevant similar images as a list with titles and source links
- If `knowledge_graph` is present, lead with the identified entity (name, description)
- Include thumbnail URLs so the user can preview results
- Format as markdown for readability:
  ```
  **Similar Images Found:**
  1. [Title](page_link) — from source.com
     ![preview](thumbnail_url)
  ```
- If no results are found or the API returns an error, tell the user:
  - The image URL must be publicly accessible (not behind login or local)
  - `SERPAPI_API_KEY` must be set with a valid SerpAPI key
  - Free tier allows 100 searches/month
