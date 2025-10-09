# Mira Transcript Display System

## Overview
A read-only transcript display where users can view their voice queries made through their MentraOS device and Mira's responses in real-time on their webview. Each user only sees their own conversation history - no text input, just a live view of the voice conversation.

## Architecture

### Frontend
- **ChatInterface Component** (`src/frontend/components/ChatInterface.tsx`)
  - Read-only React component (no input field)
  - Displays voice queries and Mira's responses
  - Real-time updates via WebSocket
  - Shows processing indicator when Mira is thinking
  - Auto-scrolls to latest messages
  - User-specific conversation history

### Backend Integration
- **TranscriptionManager** (`src/index.ts`)
  - Captures voice queries from user
  - Sends queries to ChatManager for webview display
  - Broadcasts Mira's responses to webview

- **ChatManager** (`src/chat/ChatManager.ts`)
  - Manages per-user conversation history
  - Handles WebSocket connections per user
  - Broadcasts messages only to the user's connections
  - Supports processing state indicators

### API Endpoints

#### GET `/api/chat/history?userId=user123`
Retrieve conversation history for a specific user

#### WebSocket `/api/chat/ws?userId=user123`
Real-time bidirectional communication for instant message updates

**WebSocket Message Types:**
- `history` - Initial conversation history when connecting
- `message` - New user query or Mira response
- `processing` - Mira is processing a query
- `idle` - Processing complete

## Features

1. **Read-Only Display**: No text input - only displays voice conversations
2. **User Isolation**: Each user has their own private conversation history
3. **Real-time Updates**: WebSocket-based instant message delivery
4. **Voice Integration**: Automatically displays queries from MentraOS voice interface
5. **Processing Indicators**: Shows when Mira is thinking
6. **Persistent History**: Conversation history maintained per user during the session
7. **Authentication**: Integrated with MentraOS authentication

## Usage

### Starting the Application

```bash
# Start both backend and frontend
bun run dev

# Or separately
bun run dev:backend  # Backend on port 3002
bun run dev:frontend # Frontend on port 5173
```

### Viewing the Transcript

1. Open the webview through MentraOS
2. Authenticate with your MentraOS credentials
3. Start talking to Mira through your device
4. Watch your queries and Mira's responses appear in real-time
5. Only your conversation is visible to you

## Technical Details

### Data Flow

1. User speaks to device (voice query)
2. TranscriptionManager processes the transcription
3. Query sent to ChatManager → WebSocket → Frontend
4. Processing indicator shown
5. MiraAgent processes query
6. Response sent to ChatManager → WebSocket → Frontend
7. Response displayed, processing indicator hidden

### User Isolation Implementation

- Each user has a separate `UserChatData` object in ChatManager
- WebSocket connections are stored per user
- Messages are only broadcast to the user's own WebSocket connections
- Conversation history is keyed by userId
- TranscriptionManager passes userId to ChatManager

### WebSocket Message Format

```javascript
// User or assistant message
{
  type: 'message',
  messageType: 'user' | 'assistant',
  id: 'uuid',
  content: 'message text',
  timestamp: '2025-10-09T18:30:00.000Z'
}

// Processing state
{
  type: 'processing' | 'idle'
}

// Conversation history
{
  type: 'history',
  messages: [{...}, {...}]
}
```

## Configuration

The transcript system uses the following environment variables:
- `PORT`: Backend server port (default from .env, fallback: 80)
- `SERVER_URL`: Server URL for API calls

## Security

- All endpoints require a valid userId
- WebSocket connections validate userId before accepting
- Conversation data is isolated per user
- No cross-user data leakage
- Read-only interface prevents unauthorized input
