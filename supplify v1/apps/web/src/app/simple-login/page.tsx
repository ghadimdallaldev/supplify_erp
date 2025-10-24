export default function SimpleLogin() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-4xl w-full">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="w-12 h-12 bg-blue-600 rounded-lg"></div>
            <h1 className="text-3xl font-bold text-gray-900">Supplify</h1>
          </div>
          <p className="text-gray-600 text-lg">B2B Food Supply Platform</p>
          <p className="text-gray-500 mt-2">Choose your role to access the platform</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-lg border shadow-sm hover:shadow-lg transition-shadow cursor-pointer">
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <div className="w-8 h-8 bg-blue-600 rounded"></div>
              </div>
              <h3 className="text-xl font-semibold mb-2">Restaurant</h3>
              <p className="text-gray-600 mb-4">
                Manage inventory, place orders, track deliveries, and communicate with suppliers
              </p>
              <button className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
                Login as Restaurant
              </button>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg border shadow-sm hover:shadow-lg transition-shadow cursor-pointer">
            <div className="text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <div className="w-8 h-8 bg-green-600 rounded"></div>
              </div>
              <h3 className="text-xl font-semibold mb-2">Supplier</h3>
              <p className="text-gray-600 mb-4">
                Manage products, create campaigns, process orders, and grow your business
              </p>
              <button className="w-full bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors">
                Login as Supplier
              </button>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg border shadow-sm hover:shadow-lg transition-shadow cursor-pointer">
            <div className="text-center">
              <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <div className="w-8 h-8 bg-purple-600 rounded"></div>
              </div>
              <h3 className="text-xl font-semibold mb-2">Admin</h3>
              <p className="text-gray-600 mb-4">
                Platform management, subscription oversight, feature flags, and analytics
              </p>
              <button className="w-full bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors">
                Login as Admin
              </button>
            </div>
          </div>
        </div>

        <div className="text-center mt-8">
          <p className="text-sm text-gray-500">
            This is a demo environment. Click any role above to access the platform.
          </p>
        </div>
      </div>
    </div>
  );
}
