import { WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { MiraAgent } from '../agents';
import type { Response } from 'express';

interface ChatMessage {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  image?: string; // Base64 encoded image data
}

interface UserChatData {
  messages: ChatMessage[];
  ws: Set<WebSocket>;
  sse: Set<Response>; // Server-Sent Events connections
}

/**
 * Manages chat sessions and SSE connections per user
 * Each user has their own isolated chat history
 */
export class ChatManager {
  private userChats = new Map<string, UserChatData>();
  private agents = new Map<string, MiraAgent>();
  private serverUrl: string;

  constructor(serverUrl: string) {
    this.serverUrl = serverUrl;
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

    if (!this.userChats.has(userId)) {
      console.log(`[ChatManager] Creating new chat data for user: ${userId}`);
      this.userChats.set(userId, {
        messages: [],
        ws: new Set(),
        sse: new Set()
      });
    }

    const userData = this.userChats.get(userId)!;
    userData.ws.add(ws);
    console.log(`[ChatManager] WebSocket added. Total connections for ${userId}:`, userData.ws.size);

    // Send chat history to new connection
    const historyMessage = JSON.stringify({
      type: 'history',
      messages: userData.messages
    });
    console.log(`[ChatManager] 📜 Sending history with ${userData.messages.length} messages`);
    ws.send(historyMessage);

    // Handle WebSocket close
    ws.on('close', () => {
      console.log(`[ChatManager] 🔌 WebSocket closed for user: ${userId}`);
      userData.ws.delete(ws);
      console.log(`[ChatManager] Remaining connections for ${userId}:`, userData.ws.size);
    });
  }

  /**
   * Get chat history for a user
   */
  getChatHistory(userId: string): ChatMessage[] {
    return this.userChats.get(userId)?.messages || [];
  }

  /**
   * Add a message to user's chat history and broadcast to their connections
   */
  private addMessage(userId: string, message: ChatMessage): void {
    if (!this.userChats.has(userId)) {
      this.userChats.set(userId, {
        messages: [],
        ws: new Set(),
        sse: new Set()
      });
    }

    const userData = this.userChats.get(userId)!;
    userData.messages.push(message);

    // Broadcast to WebSocket connections
    const messageData = JSON.stringify({
      type: 'message',
      messageType: message.type,
      id: message.id,
      content: message.content,
      timestamp: message.timestamp,
      image: message.image
    });

    userData.ws.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(messageData);
      }
    });

    // Broadcast to SSE connections
    const sseData = `data: ${messageData}\n\n`;
    userData.sse.forEach(res => {
      try {
        res.write(sseData);
      } catch (error) {
        console.error('[ChatManager] Error writing to SSE:', error);
      }
    });
  }

  /**
   * Process a user message and generate a response
   */
  async processMessage(userId: string, messageContent: string): Promise<void> {
    // Add user message
    const userMessage: ChatMessage = {
      id: uuidv4(),
      type: 'user',
      content: messageContent,
      timestamp: new Date()
    };

    this.addMessage(userId, userMessage);

    try {
      // Get agent for this user
      const agent = this.getAgentForUser(userId);

      // Process the message with MiraAgent
      const response = await agent.handleContext({
        query: messageContent,
        photo: null // No photo support in web chat for now
      });

      // Add assistant response
      const assistantMessage: ChatMessage = {
        id: uuidv4(),
        type: 'assistant',
        content: typeof response === 'string' ? response : 'I processed your request.',
        timestamp: new Date()
      };

      this.addMessage(userId, assistantMessage);
    } catch (error) {
      console.error('Error processing message:', error);

      // Add error message
      const errorMessage: ChatMessage = {
        id: uuidv4(),
        type: 'assistant',
        content: 'Sorry, I encountered an error processing your message. Please try again.',
        timestamp: new Date()
      };

      this.addMessage(userId, errorMessage);
    }
  }

  /**
   * Add a user message (from voice query) to the chat
   */
  addUserMessage(userId: string, content: string, image?: string): void {
    console.log(`[ChatManager] 👤 Adding user message for ${userId}:`, content);
    if (image) {
      console.log(`[ChatManager] 📷 Message includes image (${image.substring(0, 50)}...)`);
    }

    const userMessage: ChatMessage = {
      id: uuidv4(),
      type: 'user',
      content: content,
      timestamp: new Date(),
      image: image
    };

    this.addMessage(userId, userMessage);
    console.log(`[ChatManager] ✅ User message added and broadcasted`);
  }

  /**
   * Add an assistant message (Mira's response) to the chat
   */
  addAssistantMessage(userId: string, content: string): void {
    console.log(`[ChatManager] 🤖 Adding assistant message for ${userId}:`, content);
    const assistantMessage: ChatMessage = {
      id: uuidv4(),
      type: 'assistant',
      content: content,
      timestamp: new Date()
    };

    this.addMessage(userId, assistantMessage);
    console.log(`[ChatManager] ✅ Assistant message added and broadcasted`);
  }

  /**
   * Set processing state to show/hide loading indicator
   */
  setProcessing(userId: string, isProcessing: boolean): void {
    console.log(`[ChatManager] 🔄 Setting processing state for ${userId}:`, isProcessing);
    const userData = this.userChats.get(userId);
    if (!userData) {
      console.warn(`[ChatManager] ⚠️ No userData found for ${userId}`);
      return;
    }

    console.log(`[ChatManager] Broadcasting to ${userData.ws.size} WS + ${userData.sse.size} SSE connections`);

    const processingData = JSON.stringify({
      type: isProcessing ? 'processing' : 'idle'
    });

    // Broadcast to WebSocket
    userData.ws.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(processingData);
        console.log(`[ChatManager] 📤 Sent processing state to WS:`, processingData);
      } else {
        console.warn(`[ChatManager] ⚠️ WebSocket not open, state:`, ws.readyState);
      }
    });

    // Broadcast to SSE
    const sseData = `data: ${processingData}\n\n`;
    userData.sse.forEach(res => {
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

    if (!this.userChats.has(userId)) {
      console.log(`[ChatManager] Creating new chat data for user: ${userId}`);
      this.userChats.set(userId, {
        messages: [],
        ws: new Set(),
        sse: new Set()
      });
    }

    const userData = this.userChats.get(userId)!;
    userData.sse.add(res);
    console.log(`[ChatManager] SSE added. Total SSE connections for ${userId}:`, userData.sse.size);
  }

  /**
   * Unregister an SSE connection for a user
   */
  unregisterSSE(userId: string, res: Response): void {
    const userData = this.userChats.get(userId);
    if (userData) {
      userData.sse.delete(res);
      console.log(`[ChatManager] SSE removed. Remaining SSE connections for ${userId}:`, userData.sse.size);
    }
  }

  /**
   * Clear chat history for a user
   */
  clearChatHistory(userId: string): void {
    const userData = this.userChats.get(userId);
    if (userData) {
      userData.messages = [];
    }
  }
}
