import React from 'react';
import { useMentraAuth } from '@mentra/react';

/**
 * Main App component that manages authentication state and renders
 * a simple "Hello World" message
 */
function App(): React.JSX.Element {
  const { userId, isLoading, error, isAuthenticated } = useMentraAuth();

  // Handle loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-100">
        <div className="flex flex-col items-center justify-center min-h-screen gap-4">
          <div className="w-10 h-10 border-3 border-gray-300 border-t-blue rounded-full animate-spin"></div>
          <p className="text-gray-600">Loading authentication...</p>
        </div>
      </div>
    );
  }

  // Handle error state
  if (error) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-100">
        <div className="flex flex-col items-center justify-center min-h-screen text-center p-8">
          <h2 className="text-red-600 text-2xl font-semibold mb-4">Authentication Error</h2>
          <p className="text-red-600 font-medium mb-2">{error}</p>
          <p className="text-gray-600 text-sm">
            Please ensure you are opening this page from the MentraOS app.
          </p>
        </div>
      </div>
    );
  }

  // Handle unauthenticated state
  if (!isAuthenticated || !userId) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-100">
        <div className="flex flex-col items-center justify-center min-h-screen text-center p-8">
          <h2 className="text-red-600 text-2xl font-semibold mb-4">Not Authenticated</h2>
          <p className="text-gray-700">Please open this page from the MentraOS manager app.</p>
        </div>
      </div>
    );
  }

  // Authenticated - show Hello World
  return (
    <div className="min-h-screen flex flex-col bg-gray-100">
      <header className="bg-blue text-white px-8 py-6 shadow-md">
        <h1 className="text-3xl font-semibold mb-2">Mira</h1>
        <div className="text-sm opacity-90">
          <span className="mr-2">User ID:</span>
          <span className="font-mono bg-white bg-opacity-10 px-2 py-0.5 rounded">
            {userId}
          </span>
        </div>
      </header>
      <main className="flex-1 p-8 max-w-6xl mx-auto w-full">
        <div className="bg-white rounded-lg shadow-md p-8 text-center">
          <h2 className="text-4xl font-bold text-gray-800">Hello World</h2>
        </div>
      </main>
    </div>
  );
}

export default App;
