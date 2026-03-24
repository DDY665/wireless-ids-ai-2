# Wireless IDS + AI Analyst

A real-time wireless intrusion detection and analysis platform built with:

- Node.js + Express + MongoDB on the backend
- React + Vite on the frontend
- Socket.IO for live alert streaming
- Groq LLM integration for analyst-assistant chat

## Current UI Architecture

The active frontend path is:

- `client/components/Dashboard.jsx` (main IDS workspace)
- `client/components/ChatInterface.jsx` (alert-centric analyst chat)
- `client/components/dashboard.css` and `client/components/chat-interface.css` (styling)

Legacy components were removed:

- `client/components/AlertCard.jsx`
- `client/components/AlertChat.jsx`
- `client/components/AlertList.jsx`

## Key Features

- Real-time wireless alert ingestion and push updates
- Alert listing with search/status filters and selection workflow
- MITRE ATT&CK mapping for applicable alert types
- Correlated alert grouping support
- Analyst chat tied to selected alerts
- Conversation history per alert
- Light and dark UI themes

## AI Chat Behavior

`/ai/chat` supports optional structured analysis, but the UI currently requests plain analyst responses by default.

- Frontend sends `includeAnalysis: false`
- Response rendering is plain and concise unless analysis is explicitly requested

Backend AI flow includes:

- model fallback strategy
- weak-answer retry logic
- structured parsing safeguards
- deterministic action-plan fallback when parsing fails

## Project Structure

```text
wireless-ids-ai/
  server.js
  package.json
  config/
    db.js
  models/
    Alert.js
    Conversation.js
  routes/
    ai.js
    alerts.js
  services/
    kismetListener.js
    mitreService.js
    severityService.js
  mitre/
    enterprise-attack.json
  client/
    package.json
    index.html
    components/
      Dashboard.jsx
      ChatInterface.jsx
      dashboard.css
      chat-interface.css
    src/
      main.jsx
      App.jsx
      App.css
      index.css
```

## Requirements

- Node.js 18+
- MongoDB running locally or reachable from `MONGO_URI`
- Groq API key for AI features

## Environment Variables

Create `.env` in the project root:

```env
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/wireless_ids
GROQ_API_KEY=your_groq_api_key

# Optional API key protection for sensitive endpoints
SECURITY_ENFORCE_API_KEY=false
SECURITY_API_KEY=change-me
```

Optional frontend override in `client/.env`:

```env
VITE_API_URL=http://localhost:5000
VITE_SECURITY_API_KEY=change-me
```

## Installation

Install backend dependencies:

```bash
npm install
```

Install frontend dependencies:

```bash
cd client
npm install
```

## Run Locally

Start backend (from project root):

```bash
npm run dev
```

Start frontend (new terminal):

```bash
cd client
npm run dev
```

Frontend: `http://localhost:5173`

Backend API: `http://localhost:5000`

## Scripts

From root:

- `npm run dev` - start backend with nodemon
- `npm start` - start backend with node
- `npm test` - run backend tests

From `client`:

- `npm run dev` - start Vite dev server
- `npm run build` - production build
- `npm run preview` - preview built app

## API Highlights

- `GET /alerts` - list alerts with filters
- `GET /alerts/:id` - get single alert
- `PATCH /alerts/:id/status` - update status
- `GET /alerts/correlated/:id` - related alerts by correlation id
- `POST /ai/chat` - analyst chat for alert context
- `GET /ai/history/:alertId` - conversation history
- `DELETE /ai/history/:alertId` - clear conversation history

## Notes

- If backend startup fails with `EADDRINUSE` on port `5000`, stop the process already using that port or change `PORT`.
- `.gitignore` now excludes MongoDB runtime artifacts under `data/db/` and common local build/runtime noise.
