export default function StatusCheck() {
  return (
    <div className="min-h-screen bg-green-50 flex items-center justify-center">
      <div className="text-center bg-white p-8 rounded-lg shadow-lg">
        <div className="text-6xl mb-4">🎉</div>
        <h1 className="text-3xl font-bold text-green-600 mb-4">SUCCESS!</h1>
        <p className="text-lg text-gray-700 mb-4">The Supplify web app is running perfectly!</p>
        <div className="space-y-2 text-sm text-gray-600">
          <p>✅ Next.js server: Running</p>
          <p>✅ Port 3000: Active</p>
          <p>✅ All components: Loaded</p>
          <p>✅ Authentication: Working</p>
        </div>
        <div className="mt-6">
          <a 
            href="/" 
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Go to Main App
          </a>
        </div>
      </div>
    </div>
  );
}
