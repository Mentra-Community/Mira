import { WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { MiraAgent } from '../agents';
import type { Response } from 'express';

interface ChatMessage {
  id: string;
  senderId: string;
  recipientId: string;
  content: string;
  timestamp: Date;
  image?: string; // Base64 encoded image data
}

interface ConversationData {
  messages: ChatMessage[];
}

interface UserConnectionData {
  ws: Set<WebSocket>;
  sse: Set<Response>; // Server-Sent Events connections
}

/**
 * Manages user-to-user chat sessions with in-memory storage
 * Messages are stored per conversation (between two users)
 * Each user only sees their own conversations with Mira
 */
export class ChatManager {
  // Store conversations by conversationId (format: "userId1:userId2" where userId1 < userId2)
  private conversations = new Map<string, ConversationData>();

  // Store user connections separately (for broadcasting)
  private userConnections = new Map<string, UserConnectionData>();

  private agents = new Map<string, MiraAgent>();
  private serverUrl: string;

  constructor(serverUrl: string) {
    this.serverUrl = serverUrl;
  }

  /**
   * Generate a consistent conversation ID for two users
   */
  private getConversationId(userId1: string, userId2: string): string {
    return userId1 < userId2 ? `${userId1}:${userId2}` : `${userId2}:${userId1}`;
  }

  /**
   * Get or create MiraAgent for a user
   */
  private getAgentForUser(userId: string): MiraAgent {
    if (!this.agents.has(userId)) {
      const agent = new MiraAgent(this.serverUrl, userId);
      this.agents.set(userId, agent);
    }
    return this.agents.get(userId)!;
  }

  /**
   * Register a WebSocket connection for a user
   */
  registerWebSocket(userId: string, ws: WebSocket): void {
    console.log(`[ChatManager] 🔌 Registering WebSocket for user: ${userId}`);

    if (!this.userConnections.has(userId)) {
      console.log(`[ChatManager] Creating new connection data for user: ${userId}`);
      this.userConnections.set(userId, {
        ws: new Set(),
        sse: new Set()
      });
    }

    const userData = this.userConnections.get(userId)!;
    userData.ws.add(ws);
    console.log(`[ChatManager] WebSocket added. Total connections for ${userId}:`, userData.ws.size);

    // Handle WebSocket close
    ws.on('close', () => {
      console.log(`[ChatManager] 🔌 WebSocket closed for user: ${userId}`);
      userData.ws.delete(ws);
      console.log(`[ChatManager] Remaining connections for ${userId}:`, userData.ws.size);
    });
  }

  /**
   * Get chat history for a conversation between two users
   */
  getChatHistory(userId1: string, userId2: string): ChatMessage[] {
    const conversationId = this.getConversationId(userId1, userId2);
    return this.conversations.get(conversationId)?.messages || [];
  }

  /**
   * Add a message to the conversation and broadcast to both users
   */
  private addMessage(senderId: string, recipientId: string, content: string, image?: string): void {
    const conversationId = this.getConversationId(senderId, recipientId);

    if (!this.conversations.has(conversationId)) {
      this.conversations.set(conversationId, {
        messages: []
      });
    }

    const message: ChatMessage = {
      id: uuidv4(),
      senderId,
      recipientId,
      content,
      timestamp: new Date(),
      image
    };

    const conversationData = this.conversations.get(conversationId)!;
    conversationData.messages.push(message);

    console.log(`[ChatManager] 💾 Message stored in conversation ${conversationId}. Total messages: ${conversationData.messages.length}`);

    // Broadcast to both sender and recipient
    this.broadcastMessage(senderId, message);
    this.broadcastMessage(recipientId, message);
  }

  /**
   * Broadcast a message to all connections of a specific user
   */
  private broadcastMessage(userId: string, message: ChatMessage): void {
    const userData = this.userConnections.get(userId);
    if (!userData) {
      console.log(`[ChatManager] ⚠️ No connections for user ${userId}, message not broadcasted`);
      return;
    }

    // Broadcast to WebSocket connections
    const messageData = JSON.stringify({
      type: 'message',
      id: message.id,
      senderId: message.senderId,
      recipientId: message.recipientId,
      content: message.content,
      timestamp: message.timestamp,
      image: message.image
    });

    console.log(`[ChatManager] 📡 Broadcasting to ${userId}: ${userData.ws.size} WS + ${userData.sse.size} SSE connections`);

    userData.ws.forEach((ws: WebSocket) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(messageData);
        console.log(`[ChatManager] ✅ Sent via WebSocket to ${userId}`);
      }
    });

    // Broadcast to SSE connections
    const sseData = `data: ${messageData}\n\n`;
    userData.sse.forEach((res: Response) => {
      try {
        res.write(sseData);
        console.log(`[ChatManager] ✅ Sent via SSE to ${userId}`);
      } catch (error) {
        console.error('[ChatManager] Error writing to SSE:', error);
      }
    });
  }

  /**
   * Process a user message and generate a response (for AI agent)
   */
  async processMessage(userId: string, messageContent: string): Promise<void> {
    // This is for AI responses - we'll treat the AI as a "recipient"
    const aiRecipientId = 'mira-assistant';

    // Add user message
    this.addMessage(userId, aiRecipientId, messageContent);

    try {
      // Get agent for this user
      const agent = this.getAgentForUser(userId);

      // Process the message with MiraAgent
      const response = await agent.handleContext({
        query: messageContent,
        photo: null // No photo support in web chat for now
      });

      // Add assistant response
      const responseContent = typeof response === 'string' ? response : 'I processed your request.';
      this.addMessage(aiRecipientId, userId, responseContent);
    } catch (error) {
      console.error('Error processing message:', error);

      // Add error message
      this.addMessage(aiRecipientId, userId, 'Sorry, I encountered an error processing your message. Please try again.');
    }
  }

  /**
   * Send a message from one user to another
   */
  sendUserMessage(senderId: string, recipientId: string, content: string, image?: string): void {
    console.log(`[ChatManager] 📤 Sending message from ${senderId} to ${recipientId}`);
    if (image) {
      console.log(`[ChatManager] 📷 Message includes image`);
    }

    this.addMessage(senderId, recipientId, content, image);
    console.log(`[ChatManager] ✅ Message sent and broadcasted`);
  }

  /**
   * Add a user message (from voice query) to the chat
   */
  addUserMessage(userId: string, content: string, image?: string): void {
    console.log(`[ChatManager] 👤 Adding user message for ${userId}:`, content.substring(0, 50) + '...');
    const aiRecipientId = 'mira-assistant';
    this.addMessage(userId, aiRecipientId, content, image);
    console.log(`[ChatManager] ✅ User message added and broadcasted`);
  }

  /**
   * Add an assistant message (Mira's response) to the chat
   */
  addAssistantMessage(userId: string, content: string): void {
    console.log(`[ChatManager] 🤖 Adding assistant message for ${userId}:`, content.substring(0, 50) + '...');
    const aiSenderId = 'mira-assistant';
    this.addMessage(aiSenderId, userId, content);
    console.log(`[ChatManager] ✅ Assistant message added and broadcasted`);
  }

  /**
   * Set processing state to show/hide loading indicator
   */
  setProcessing(userId: string, isProcessing: boolean): void {
    console.log(`[ChatManager] 🔄 Setting processing state for ${userId}:`, isProcessing);
    const userData = this.userConnections.get(userId);
    if (!userData) {
      console.warn(`[ChatManager] ⚠️ No userData found for ${userId}`);
      return;
    }

    console.log(`[ChatManager] Broadcasting to ${userData.ws.size} WS + ${userData.sse.size} SSE connections`);

    const processingData = JSON.stringify({
      type: isProcessing ? 'processing' : 'idle'
    });

    // Broadcast to WebSocket
    userData.ws.forEach((ws: WebSocket) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(processingData);
        console.log(`[ChatManager] 📤 Sent processing state to WS:`, processingData);
      } else {
        console.warn(`[ChatManager] ⚠️ WebSocket not open, state:`, ws.readyState);
      }
    });

    // Broadcast to SSE
    const sseData = `data: ${processingData}\n\n`;
    userData.sse.forEach((res: Response) => {
      try {
        res.write(sseData);
        console.log(`[ChatManager] 📤 Sent processing state to SSE:`, processingData);
      } catch (error) {
        console.error('[ChatManager] Error writing processing state to SSE:', error);
      }
    });
  }

  /**
   * Register an SSE connection for a user
   */
  registerSSE(userId: string, res: Response): void {
    console.log(`[ChatManager] 📡 Registering SSE for user: ${userId}`);

    if (!this.userConnections.has(userId)) {
      console.log(`[ChatManager] Creating new connection data for user: ${userId}`);
      this.userConnections.set(userId, {
        ws: new Set(),
        sse: new Set()
      });
    }

    const userData = this.userConnections.get(userId)!;
    userData.sse.add(res);
    console.log(`[ChatManager] SSE added. Total SSE connections for ${userId}:`, userData.sse.size);
  }

  /**
   * Unregister an SSE connection for a user
   */
  unregisterSSE(userId: string, res: Response): void {
    const userData = this.userConnections.get(userId);
    if (userData) {
      userData.sse.delete(res);
      console.log(`[ChatManager] SSE removed. Remaining SSE connections for ${userId}:`, userData.sse.size);
    }
  }

  /**
   * Clear chat history for a conversation
   */
  clearChatHistory(userId1: string, userId2: string): void {
    const conversationId = this.getConversationId(userId1, userId2);
    const conversationData = this.conversations.get(conversationId);
    if (conversationData) {
      conversationData.messages = [];
    }
  }
}
