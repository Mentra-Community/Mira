import React from 'react';
import ChatInterface from './components/ChatInterface';

/**
 * Main App component - Simple transcript display
 */
function App(): React.JSX.Element {
  // Hardcoded user ID for development/testing
  const userId = 'aryan.mentra.dev.public@gmail.com';

  return (
    <div className="min-h-screen flex flex-col bg-gray-100">
      <header className="bg-blue text-white px-8 py-6 shadow-md">
        <h1 className="text-3xl font-semibold mb-2">Mira</h1>
        <div className="text-sm opacity-90">
          <span className="mr-2">Testing Mode - User ID:</span>
          <span className="font-mono bg-black bg-opacity-10 px-2 py-0.5 rounded">
            {userId}
          </span>
        </div>
      </header>
      <main className="flex-1 p-8 max-w-6xl mx-auto w-full flex flex-col overflow-hidden">
        <ChatInterface userId={userId} />
      </main>
    </div>
  );
}

export default App;
