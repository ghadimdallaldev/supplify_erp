export default function SimpleTest() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">✅ Web App is Working!</h1>
        <p className="text-gray-600 mb-4">The Next.js app is running successfully.</p>
        <div className="bg-white p-6 rounded-lg shadow">
          <p className="text-green-600 font-semibold">🎉 Success!</p>
          <p className="text-sm text-gray-500 mt-2">You can now access the main app at the root URL.</p>
        </div>
      </div>
    </div>
  );
}
