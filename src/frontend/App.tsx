import React from 'react';
import { useMentraAuth } from '@mentra/react';
import ChatInterface from './components/ChatInterface';

/**
 * Main App component that manages authentication state and renders
 * the user's personal Mira chat interface
 */
function App(): React.JSX.Element {
  const { userId, isLoading, error, isAuthenticated } = useMentraAuth();

  // Handle loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-black">
        <div className="flex flex-col items-center justify-center min-h-screen gap-4">
          <div className="w-10 h-10 border-3 border-gray-700 border-t-purple-500 rounded-full animate-spin"></div>
          <p className="text-gray-400">Loading authentication...</p>
        </div>
      </div>
    );
  }

  // Handle error state
  if (error) {
    return (
      <div className="min-h-screen flex flex-col bg-black">
        <div className="flex flex-col items-center justify-center min-h-screen text-center p-8">
          <h2 className="text-red-500 text-2xl font-semibold mb-4">Authentication Error</h2>
          <p className="text-red-400 font-medium mb-2">{error}</p>
          <p className="text-gray-400 text-sm">
            Please ensure you are opening this page from the MentraOS app.
          </p>
        </div>
      </div>
    );
  }

  // Handle unauthenticated state
  if (!isAuthenticated || !userId) {
    return (
      <div className="min-h-screen flex flex-col bg-black">
        <div className="flex flex-col items-center justify-center min-h-screen text-center p-8">
          <h2 className="text-red-500 text-2xl font-semibold mb-4">Not Authenticated</h2>
          <p className="text-gray-400">Please open this page from the MentraOS manager app to view your chat.</p>
        </div>
      </div>
    );
  }

  // Authenticated - show chat interface with Mira assistant
  return (
    <ChatInterface userId={userId} recipientId="mira-assistant" />
  );
}

export default App;
