import React, { useState, useEffect, useRef } from 'react';

interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  image?: string;
}

interface ChatInterfaceProps {
  userId: string;
}

/**
 * ChatInterface component - Read-only transcript display
 * Shows voice queries made through the app and Mira's responses
 * Each user only sees their own conversation history
 */
function ChatInterface({ userId }: ChatInterfaceProps): React.JSX.Element {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sseRef = useRef<EventSource | null>(null);

  console.log('[ChatInterface] Component rendered. State:', {
    userId,
    messageCount: messages.length,
    isProcessing,
    messages: messages
  });

  // Scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Set up SSE connection for real-time updates
  useEffect(() => {
    console.log('[ChatInterface] useEffect triggered, userId:', userId);

    if (!userId) {
      console.warn('[ChatInterface] No userId provided, skipping SSE setup');
      return;
    }

    // Connect to SSE endpoint - bypass proxy for SSE (proxy has issues with streaming)
    const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const backendUrl = isDev ? 'http://localhost:3002' : '';
    const sseUrl = `${backendUrl}/api/chat/stream?userId=${encodeURIComponent(userId)}`;
    console.log('[ChatInterface] 📡 Connecting to SSE:', sseUrl);

    const eventSource = new EventSource(sseUrl);
    sseRef.current = eventSource;

    eventSource.onopen = () => {
      console.log('[ChatInterface] ✅ SSE connected successfully!');
    };

    eventSource.onmessage = (event) => {
      console.log('[ChatInterface] 📨 SSE message received:', event.data);

      // Skip keepalive messages
      if (!event.data || event.data.trim() === '') {
        return;
      }

      try {
        const data = JSON.parse(event.data);
        console.log('[ChatInterface] Parsed message:', data);

        if (data.type === 'message') {
          console.log('[ChatInterface] Adding message:', data.messageType, data.content);
          setIsProcessing(false);

          setMessages(prev => {
            const newMessages = [...prev, {
              id: data.id || Date.now().toString(),
              type: data.messageType,
              content: data.content,
              timestamp: new Date(data.timestamp),
              image: data.image
            }];
            console.log('[ChatInterface] Updated messages array:', newMessages);
            return newMessages;
          });
        } else if (data.type === 'processing') {
          console.log('[ChatInterface] 🔄 Processing indicator shown');
          setIsProcessing(true);
        } else if (data.type === 'idle') {
          console.log('[ChatInterface] ⏸️ Processing complete');
          setIsProcessing(false);
        } else if (data.type === 'history') {
          console.log('[ChatInterface] 📜 Received history with', data.messages?.length || 0, 'messages');
          setMessages(data.messages.map((msg: any) => ({
            id: msg.id,
            type: msg.type,
            content: msg.content,
            timestamp: new Date(msg.timestamp),
            image: msg.image
          })));
        } else if (data.type === 'connected') {
          console.log('[ChatInterface] 🎉 SSE connection confirmed for user:', data.userId);
        } else {
          console.warn('[ChatInterface] Unknown message type:', data.type);
        }
      } catch (error) {
        console.error('[ChatInterface] ❌ Error parsing SSE message:', error);
        console.error('[ChatInterface] Raw message:', event.data);
      }
    };

    eventSource.onerror = (error) => {
      console.error('[ChatInterface] ❌ SSE error:', error);
      console.log('[ChatInterface] SSE readyState:', eventSource.readyState);
    };

    return () => {
      console.log('[ChatInterface] Closing SSE connection');
      eventSource.close();
    };
  }, [userId]);


  return (
    <div className="flex flex-col h-full bg-white rounded-lg shadow-md">
      {/* Header */}
      <div className="bg-blue text-white px-6 py-4 rounded-t-lg">
        <h2 className="text-xl font-semibold">Mira Conversation</h2>
        <p className="text-sm opacity-90">Live transcript of your voice queries and responses</p>
      </div>

      {/* Debug Info */}
      <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-2 text-xs font-mono">
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <div><strong>Debug Info:</strong></div>
            <div>User ID: {userId || 'Not loaded'}</div>
            <div>Messages: {messages.length}</div>
            <div>Processing: {isProcessing ? 'Yes' : 'No'}</div>
            <div>SSE: {sseRef.current ? (sseRef.current.readyState === EventSource.OPEN ? '✅ Connected' : sseRef.current.readyState === EventSource.CONNECTING ? '🔄 Connecting...' : '❌ Closed') : '❌ Not initialized'}</div>
            <div className="text-xs text-gray-500 mt-1">Check browser console (F12) for detailed logs</div>
          </div>
          <button
            onClick={() => {
              console.log('[ChatInterface] TEST: Adding test message manually');
              setMessages(prev => [...prev, {
                id: 'test-' + Date.now(),
                type: 'user',
                content: 'Test message ' + new Date().toLocaleTimeString(),
                timestamp: new Date()
              }]);
            }}
            className="ml-4 px-3 py-1 bg-blue text-white rounded text-xs hover:bg-blue/90"
          >
            Add Test Message
          </button>
        </div>
      </div>

      {/* Messages container */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 mt-8">
            <p className="text-lg mb-2">No conversation yet</p>
            <p className="text-sm">Start talking to Mira through your device</p>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-4 py-3 ${
                  message.type === 'user'
                    ? 'bg-blue text-white'
                    : 'bg-gray-100 text-gray-800'
                }`}
              >
                <p className="text-xs font-semibold mb-1 opacity-75">
                  {message.type === 'user' ? 'You' : 'Mira'}
                </p>
                {message.image && (
                  <img
                    src={message.image}
                    alt="Query context"
                    className="rounded-lg mb-2 max-w-full h-auto"
                    style={{ maxHeight: '300px' }}
                  />
                )}
                <p className="whitespace-pre-wrap break-words">{message.content}</p>
                <p className={`text-xs mt-1 ${
                  message.type === 'user' ? 'text-white/70' : 'text-gray-500'
                }`}>
                  {message.timestamp.toLocaleTimeString()}
                </p>
              </div>
            </div>
          ))
        )}
        {isProcessing && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-lg px-4 py-3">
              <p className="text-xs font-semibold mb-2 text-gray-600">Mira</p>
              <div className="flex space-x-2">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Footer - No input, read-only */}
      <div className="border-t px-6 py-3 bg-gray-50 rounded-b-lg">
        <p className="text-sm text-gray-600 text-center">
          💬 Speak to your device to interact with Mira
        </p>
      </div>
    </div>
  );
}

export default ChatInterface;
