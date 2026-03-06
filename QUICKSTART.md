# 🚀 Quick Start Guide

## Prerequisites Check

Before starting, ensure you have:
- ✅ Node.js 18+ installed
- ✅ MongoDB installed and running
- ✅ Groq API key (get from https://console.groq.com)

## Step-by-Step Setup

### 1. Configure Environment Variables

Create a `.env` file in the root directory:

```bash
GROQ_API_KEY=your_actual_groq_api_key_here
MONGODB_URI=mongodb://127.0.0.1:27017/wirelessIDS
NODE_ENV=development
```

### 2. Install Dependencies

```bash
# Backend dependencies (from root)
npm install

# Frontend dependencies
cd client
npm install
cd ..
```

### 3. Start MongoDB

```bash
# Start MongoDB server
mongod
```

Keep this terminal open.

### 4. Start the Backend

Open a new terminal:

```bash
# From project root
node server.js
```

You should see:
```
✅ MongoDB Connected successfully
✅ MITRE ATT&CK data loaded successfully
Server running on port 5000
⚠️  Kismet not running yet. Will retry...
```

The Kismet warning is normal if you don't have Kismet running yet.

### 5. Start the Frontend

Open another terminal:

```bash
cd client
npm run dev
```

You should see:
```
VITE ready in XXX ms
➜  Local:   http://localhost:5173/
```

### 6. Open the Dashboard

1. Open your browser to: **http://localhost:5173**
2. You should see the Wireless IDS Dashboard
3. Click the "🔄 Refresh" button to fetch alerts

### 7. Test the System

Create a test alert to verify everything works:

```bash
curl http://localhost:5000/alerts/test
```

You should see:
- A new alert appear in the dashboard
- The alert list updates in real-time
- You can click the alert to open the AI chat

### 8. Try the AI Chat

1. Click on any alert in the left panel
2. The chat interface opens on the right
3. Ask questions like:
   - "What is this attack?"
   - "How dangerous is this?"
   - "How do I prevent this?"
   - "Explain in simple terms"

## Testing Real-time Updates

1. Open the dashboard in your browser
2. In a terminal, create multiple test alerts:
   ```bash
   curl http://localhost:5000/alerts/test
   ```
3. Watch alerts appear instantly in the dashboard
4. You should get a browser notification (if you allowed permissions)

## Optional: Setup Kismet (for real monitoring)

If you want to monitor real wireless networks:

1. Install Kismet:
   ```bash
   # Ubuntu/Debian
   sudo apt-get install kismet

   # macOS
   brew install kismet
   ```

2. Start Kismet:
   ```bash
   sudo kismet
   ```

3. The backend will automatically connect to Kismet's WebSocket API

## Troubleshooting

### MongoDB won't start
```bash
# Check if MongoDB is already running
ps aux | grep mongod

# Kill existing process if needed
sudo pkill mongod

# Start fresh
mongod
```

### Port 5000 already in use
```bash
# Find what's using port 5000
lsof -i :5000

# Kill the process or change PORT in .env
```

### API Key Issues
- Make sure your Groq API key is correct
- Check .env file exists in root directory
- No quotes around the value in .env
- Restart the backend after .env changes

### Frontend won't connect
- Verify backend is running on port 5000
- Check browser console for errors
- Clear browser cache and reload

### No alerts showing
- Click the "🔄 Refresh" button
- Check backend terminal for errors
- Try creating a test alert:
  ```bash
  curl http://localhost:5000/alerts/test
  ```

## What's Working?

After setup, you should have:
- ✅ Backend running on port 5000
- ✅ Frontend running on port 5173
- ✅ MongoDB connected
- ✅ Real-time Socket.IO connection (see 🟢 Live indicator)
- ✅ AI chat working
- ✅ Test alerts can be created
- ⚠️ Kismet may not be connected (optional)

## Next Steps

1. **Explore the Chat**: Ask the AI about different attacks
2. **Create Test Alerts**: Use the `/alerts/test` endpoint
3. **Check the Docs**: Read README.md for full documentation
4. **Customize**: Modify prompts in `routes/ai.js`
5. **Deploy**: See deployment section in README.md

## Need Help?

Check these files:
- `README.md` - Full documentation
- `CHANGELOG.md` - What changed in v2.0
- Backend logs in terminal
- Browser console (F12)

## Rollback

If something breaks, rollback to the previous version:

```bash
git checkout backup-before-improvements
npm install
cd client && npm install
```

---

**Success Indicator**: You should see the 🟢 Live indicator in the top-right of the dashboard, showing that Socket.IO is connected and ready for real-time alerts!
