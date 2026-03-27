# Assets AI Chat Design

## Goal
Add a real AI chat assistant on the right side of the `Digital Assets` page so visitors can ask about studio projects, locations, and experience, while keeping the MiniMax API key on the server only.

## User Experience
- The `Assets` page becomes a two-column layout on desktop.
- The left column keeps the current assets search, filters, and cards.
- The right column becomes a sticky AI assistant panel with:
  - a short assistant intro
  - three suggested prompts
  - a scrollable message thread
  - a text input and send button
  - loading and error states
- On narrow screens, the AI assistant moves below the assets content.

## Data Model
- Move studio data into a shared JSON file so both the page and the backend use the same source of truth.
- Extend projects with structured fields that support better answers:
  - `year`
  - `location`
  - `summary`
  - `deliverables`
  - `website`

## Backend
- Replace the temporary static file server with a Node server.
- The server serves:
  - static files for the site
  - `GET /api/studio-data`
  - `POST /api/chat`
- `POST /api/chat`:
  - reads the shared studio data
  - builds a constrained system/developer prompt
  - sends the conversation to MiniMax through the OpenAI-compatible Chat Completions API
  - returns only the assistant reply and lightweight metadata
- If `MINIMAX_API_KEY` is missing, return a helpful `503` JSON error instead of failing silently.

## Frontend Integration
- `222.html` stops owning project and asset arrays directly.
- The page fetches `/api/studio-data` on load and uses that to render projects and assets.
- The chat panel sends the current user message plus prior messages to `/api/chat`.
- The frontend never sees or stores the API key.

## Safety and Answer Quality
- The backend prompt tells the model to answer only from the studio data.
- If the data does not contain the answer, the assistant should say that the current portfolio data does not include it.
- The assistant should match the user's language when possible.

## Run Model
- `node server.mjs`
- Optional env vars:
  - `PORT`
  - `MINIMAX_API_KEY`
  - `MINIMAX_MODEL`
  - `MINIMAX_BASE_URL`
