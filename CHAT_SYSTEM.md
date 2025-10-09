# Mira Chat System

## Overview
A user-specific chat system where each user has their own private chat interface on their webview. Users only see their own queries and responses, not others' chats.

## Architecture

### Frontend
- **ChatInterface Component** (`src/frontend/components/ChatInterface.tsx`)
  - React component that provides a chat UI
  - Real-time message updates via WebSocket
  - Displays user queries and Mira's responses
  - Auto-scrolls to latest messages
  - User-specific chat history

### Backend
- **ChatManager** (`src/chat/ChatManager.ts`)
  - Manages per-user chat sessions
  - Maintains isolated chat history for each user
  - Handles WebSocket connections per user
  - Integrates with MiraAgent for AI responses

### API Endpoints

#### POST `/api/chat/message`
Send a message to Mira
```json
{
  "userId": "user123",
  "message": "Hello Mira"
}
```

#### GET `/api/chat/history?userId=user123`
Retrieve chat history for a specific user

#### WebSocket `/api/chat/ws?userId=user123`
Real-time bidirectional communication for instant message updates

## Features

1. **User Isolation**: Each user has their own private chat history
2. **Real-time Updates**: WebSocket-based instant message delivery
3. **AI Integration**: Messages are processed by MiraAgent
4. **Persistent History**: Chat history is maintained per user during the session
5. **Authentication**: Integrated with MentraOS authentication

## Usage

### Starting the Application

```bash
# Start both backend and frontend
bun run dev

# Or separately
bun run dev:backend  # Backend on port 8040
bun run dev:frontend # Frontend on port 5173
```

### Accessing the Chat

1. Open the webview through MentraOS
2. Authenticate with your MentraOS credentials
3. Start chatting with Mira
4. Only your messages and responses are visible to you

## Technical Details

### Data Flow

1. User types message in ChatInterface
2. Message sent to backend via POST `/api/chat/message`
3. ChatManager processes message with MiraAgent
4. Response broadcast to user's WebSocket connections
5. ChatInterface receives and displays response

### User Isolation Implementation

- Each user has a separate `UserChatData` object in ChatManager
- WebSocket connections are stored per user
- Messages are only broadcast to the user's own WebSocket connections
- Chat history is keyed by userId

## Configuration

The chat system uses the following environment variables:
- `PORT`: Backend server port (default: 8040)
- `SERVER_URL`: Server URL for API calls (default: http://localhost:8040)

## Security

- All endpoints require a valid userId
- WebSocket connections validate userId before accepting
- Chat data is isolated per user
- No cross-user data leakage
