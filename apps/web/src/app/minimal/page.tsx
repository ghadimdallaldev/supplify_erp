export default function MinimalTest() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Minimal Test</h1>
        <p className="text-gray-600 mb-4">This is a minimal test page without any complex components.</p>
        <div className="bg-white p-6 rounded-lg shadow">
          <p className="text-green-600 font-semibold">✅ App is working!</p>
        </div>
      </div>
    </div>
  );
}
