# 🛡️ Wireless IDS Dashboard with AI Analysis

A real-time wireless intrusion detection system that monitors network attacks, maps them to the MITRE ATT&CK framework, and provides AI-powered explanations through an interactive chat interface.

## ✨ Features

### Core Capabilities
- **Real-time Attack Detection**: Connects to Kismet sensor via WebSocket
- **MITRE ATT&CK Mapping**: Automatically maps detected attacks to MITRE techniques
- **AI-Powered Analysis**: Interactive chat interface powered by Groq (LLaMA 3.1)
- **Conversation History**: Full context-aware conversations with the AI assistant
- **Live Updates**: Socket.IO integration for real-time alert notifications
- **Professional UI**: GitHub-inspired dark theme with modern design

### Security Features
- Comprehensive error handling across all endpoints
- MongoDB ObjectId validation
- API timeout protection (30s)
- Database connection monitoring with auto-reconnect
- WebSocket reconnection with exponential backoff
- Input sanitization and validation
- Optional API-key access control for sensitive endpoints

### API Key Access Control
The backend supports optional API-key protection for write and AI endpoints.

Environment variables:
- `SECURITY_ENFORCE_API_KEY=true|false` (default `false`)
- `SECURITY_API_KEY=<your-secret-key>`

Protected endpoints when enabled:
- `/alerts/test`
- `/alerts/test/bulk`
- `/alerts/reset`
- `/alerts/:id/status`
- `/ai/*`

Frontend support:
- Set `VITE_SECURITY_API_KEY` in `client/.env` to automatically send `x-api-key`.

## 🏗️ Architecture

### Backend (Node.js + Express)
```
server.js              # Main server with Socket.IO
├── config/
│   └── db.js          # MongoDB connection with reconnection logic
├── models/
│   └── Alert.js       # Alert data model
├── routes/
│   ├── alerts.js      # Alert CRUD endpoints
│   └── ai.js          # AI chat endpoints with history support
└── services/
    ├── kismetListener.js    # Kismet WebSocket with reconnection
    └── mitreService.js      # MITRE ATT&CK mapping
```

### Frontend (React 19 + Vite)
```
client/
├── components/
│   ├── Dashboard.jsx       # Main dashboard with Socket.IO
│   ├── ChatInterface.jsx   # Unified AI chat with markdown
│   ├── AlertList.jsx       # Alert list component
│   └── AlertCard.jsx       # Individual alert card
└── src/
    ├── App.jsx
    └── main.jsx
```

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- MongoDB
- Kismet (for wireless monitoring)
- Groq API key

### Installation

1. **Clone and Install Dependencies**
```bash
# Install backend dependencies
npm install

# Install frontend dependencies
cd client
npm install
cd ..
```

2. **Configure Environment Variables**
```bash
# Create .env file in root
echo "GROQ_API_KEY=your_groq_api_key_here" > .env
echo "MONGODB_URI=mongodb://127.0.0.1:27017/wirelessIDS" >> .env
```

3. **Start MongoDB**
```bash
mongod
```

4. **Start the Backend**
```bash
node server.js
```

5. **Start the Frontend** (in a new terminal)
```bash
cd client
npm run dev
```

6. **Access the Dashboard**
- Frontend: http://localhost:5173
- Backend API: http://localhost:5000

## 📡 API Endpoints

### Alerts
- `GET /alerts` - Get all alerts (with pagination)
- `GET /alerts/:id` - Get specific alert
- `GET /alerts/test` - Create test alert

### AI Assistant
- `POST /ai/chat` - Unified chat endpoint with conversation history
  ```json
  {
    "message": "What is a deauth attack?",
    "history": [],
    "alertId": "optional-alert-id"
  }
  ```
- `GET /ai/explain/:id` - Get AI explanation for specific alert
- `POST /ai/chat/:id` - Legacy chat endpoint (deprecated)

## 🎨 UI Features

### Dashboard
- **Live Alert Feed**: Real-time updates via Socket.IO
- **Alert Selection**: Click any alert to analyze it
- **Status Indicators**: Connection status and live monitoring
- **Tactic Color Coding**: Visual distinction of MITRE tactics

### Chat Interface
- **Markdown Rendering**: Formatted responses with code blocks
- **Conversation History**: Full context maintained
- **Typing Indicators**: Visual feedback during AI processing
- **Auto-scroll**: Smooth scrolling to latest messages
- **Timestamps**: Track conversation flow
- **Alert Context**: Automatic injection of alert details
- **Error Handling**: Graceful error messages

## 🔧 Technical Improvements

### Backend Enhancements
1. **Error Handling**
   - ObjectId validation before database queries
   - Timeout protection on AI API calls
   - Detailed error responses in development mode
   - Graceful handling of missing GROQ_API_KEY

2. **Database Resilience**
   - Connection monitoring
   - Auto-reconnection on disconnect
   - Error event handlers
   - Connection timeout configuration

3. **WebSocket Reliability**
   - Exponential backoff reconnection
   - Maximum retry limits
   - Detailed logging with emojis
   - Graceful shutdown handling

4. **MITRE Service**
   - Safe file loading with error handling
   - Fallback for missing mappings
   - Extended attack type coverage
   - Detailed warning messages

### Frontend Enhancements
1. **Real-time Updates**
   - Socket.IO integration
   - Browser notifications
   - New alert animations
   - Connection status display

2. **Chat Experience**
   - Conversation history support
   - Markdown rendering (react-markdown)
   - Code syntax highlighting
   - Typing indicators
   - Message timestamps
   - Auto-scroll to bottom

3. **UI/UX**
   - GitHub-inspired dark theme
   - Responsive layout
   - Empty states
   - Loading states
   - Error banners
   - Tactic color coding

## � Production Reliability

The backend includes comprehensive production-ready features:

### Health & Readiness Probes
- **GET /health** - Liveness probe (always 200 if server running)
  ```json
  {
    "status": "alive",
    "timestamp": "2025-03-22T10:30:00.000Z",
    "uptime": 3600,
    "memory": {...}
  }
  ```
- **GET /ready** - Readiness probe (200 only if database connected)
  ```json
  {
    "status": "ready",
    "timestamp": "2025-03-22T10:30:00.000Z",
    "database": "connected",
    "uptime": 3600
  }
  ```

### Request Logging
- Structured JSON logging of all HTTP requests
- Includes: method, path, status code, duration, IP, user-agent
- Error logging with stack traces in development mode
- Useful for debugging, monitoring, and audit trails

### Standardized Error Responses
All errors return consistent JSON envelope:
```json
{
  "status": "error",
  "error": "ValidationError",
  "message": "validation failed",
  "details": [...],
  "timestamp": "2025-03-22T10:30:00.000Z"
}
```

### Graceful Shutdown
- Tracks active connections
- Stops accepting new connections on SIGTERM/SIGINT
- Waits up to 30 seconds for graceful close
- Force-kills if timeout exceeded
- Structured shutdown logging

### Container/Orchestration Readiness
Perfect for Kubernetes, Docker Compose, or cloud deployments:
- Use `/health` as liveness probe
- Use `/ready` as readiness probe
- Monitor structured JSON logs
- Graceful shutdown with connection draining

## �🔒 Security Considerations

### Current Implementation
- Input validation on all endpoints
- MongoDB ObjectId validation
- Error message sanitization in production
- API timeout protection

### Recommended Additions
- Rate limiting on API routes
- Authentication/authorization
- CORS whitelist (currently allows all)
- Input sanitization middleware
- API key rotation
- HTTPS in production

## 📊 Supported Attack Types

| Attack Type | MITRE Technique | Description |
|------------|----------------|-------------|
| DEAUTHFLOOD | T1499 | Endpoint Denial of Service |
| SSIDCONFLICT | T1557 | Man-in-the-Middle |
| MACCONFLICT | T1036 | Masquerading |
| BEACONFLOOD | T1498 | Network Denial of Service |
| DISASSOCFLOOD | T1499 | Endpoint Denial of Service |
| PROBERESP | T1046 | Network Service Discovery |
| CRYPTODROP | T1562 | Impair Defenses |
| NULLPROBERESP | T1040 | Network Sniffing |

## 🔄 Rollback Instructions

If you need to revert to the previous version:

```bash
# Switch to the backup branch
git checkout backup-before-improvements

# Or reset to the checkpoint commit
git reset --hard backup-before-improvements
```

## 🛠️ Development

### Adding New Attack Types
1. Update `services/mitreService.js` mapping
2. Add MITRE technique ID
3. Restart backend server

### Customizing AI Responses
- Edit system prompts in `routes/ai.js`
- Adjust temperature/max_tokens for response style
- Modify context injection logic

### Styling
- All styles are inline in components
- Follow GitHub color scheme
- Dark theme: `#0d1117`, `#161b22`, `#21262d`
- Accent: `#58a6ff` (blue), `#f85149` (red)

## 📝 Environment Variables

```bash
# Required
GROQ_API_KEY=your_groq_api_key

# Optional
MONGODB_URI=mongodb://127.0.0.1:27017/wirelessIDS
NODE_ENV=production
PORT=5000
ENABLE_KISMET=false

# One-dongle Kismet tuning
SINGLE_DONGLE_MODE=false
MIN_SIGNAL_DBM=-85
DEDUPE_WINDOW_SECONDS=8
# Optional CSV override for event types
# KISMET_ALLOWED_ALERTS=DEAUTHFLOOD,DISASSOCFLOOD,BEACONFLOOD
```

## 🐛 Troubleshooting

### Backend won't start
- Check if MongoDB is running: `mongod`
- Verify GROQ_API_KEY in .env
- Check port 5000 is available

### Frontend connection issues
- Verify backend is running on port 5000
- Check browser console for CORS errors
- Ensure Socket.IO connection is established

### Kismet not connecting
- Verify Kismet is running: `kismet`
- Check WebSocket endpoint: `ws://localhost:2501/alerts/alerts.ws`
- System will retry automatically with exponential backoff

### Single USB dongle tuning
- Set `ENABLE_KISMET=true` to enable live ingestion.
- Set `SINGLE_DONGLE_MODE=true` to reduce noise and missed-event impact.
- Keep `MIN_SIGNAL_DBM` around `-85` for cleaner detections in noisy RF environments.
- Keep `DEDUPE_WINDOW_SECONDS` around `5-10` to merge burst duplicates.
- Lock Kismet capture to your target AP channel for best single-dongle results.

### AI responses not working
- Verify GROQ_API_KEY is valid
- Check Groq API status
- Look for timeout errors (30s limit)

## 📚 Dependencies

### Backend
- express ^5.2.1
- socket.io ^4.8.3
- mongoose ^9.2.4
- groq-sdk ^0.37.0
- ws ^8.19.0
- cors ^2.8.6
- dotenv ^17.3.1

### Frontend
- react ^19.2.0
- react-dom ^19.2.0
- socket.io-client ^4.8.3
- react-markdown ^9.x
- axios ^1.13.6
- vite ^8.0.0-beta.13

## 🎯 Future Enhancements

- [ ] User authentication
- [ ] Alert filtering and search
- [ ] Export reports (PDF/CSV)
- [ ] Custom alert rules
- [ ] Email notifications
- [ ] Multi-sensor support
- [ ] Historical analytics
- [ ] Rate limiting
- [ ] API documentation (Swagger)
- [ ] Docker deployment

## 📄 License

ISC

## 👤 Author

DDY665

---

**Note**: This system is for educational and authorized testing purposes only. Always ensure you have permission before monitoring wireless networks.
