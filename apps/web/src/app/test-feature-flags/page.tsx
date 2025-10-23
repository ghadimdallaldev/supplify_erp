'use client';

import { useState, useEffect } from 'react';

export default function FeatureFlagsTest() {
  const [flags, setFlags] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('Fetching flags...');
      const flagsResponse = await fetch('/api/admin/feature-flags?type=flags');
      console.log('Flags response:', flagsResponse);
      
      if (!flagsResponse.ok) {
        throw new Error(`Failed to fetch flags: ${flagsResponse.status}`);
      }
      
      const fetchedFlags = await flagsResponse.json();
      console.log('Fetched flags:', fetchedFlags);
      setFlags(fetchedFlags);
      
      console.log('Fetching organizations...');
      const orgsResponse = await fetch('/api/admin/feature-flags?type=organizations');
      console.log('Organizations response:', orgsResponse);
      
      if (!orgsResponse.ok) {
        throw new Error(`Failed to fetch organizations: ${orgsResponse.status}`);
      }
      
      const fetchedOrgs = await orgsResponse.json();
      console.log('Fetched organizations:', fetchedOrgs);
      setOrganizations(fetchedOrgs);
      
    } catch (error) {
      console.error('Error fetching data:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p>Loading feature flags...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center text-red-600">
          <h2 className="text-xl font-bold mb-2">Error</h2>
          <p>{error}</p>
          <button 
            onClick={fetchData}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Feature Flags Test</h1>
        
        {/* Debug Info */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-8">
          <h3 className="font-medium text-yellow-800 mb-2">Debug Info</h3>
          <div className="text-sm text-yellow-700">
            <p>Flags loaded: {flags.length}</p>
            <p>Organizations loaded: {organizations.length}</p>
            <p>Loading: {loading ? 'Yes' : 'No'}</p>
            <p>Error: {error || 'None'}</p>
          </div>
        </div>

        {/* Flags */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Feature Flags ({flags.length})</h2>
          {flags.length === 0 ? (
            <div className="bg-gray-100 rounded-lg p-8 text-center">
              <p className="text-gray-600">No flags loaded</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {flags.map((flag: any) => (
                <div key={flag.id} className="bg-white border border-gray-200 rounded-lg p-4">
                  <h3 className="font-medium text-gray-900">{flag.name}</h3>
                  <p className="text-sm text-gray-600 mb-2">{flag.key}</p>
                  <p className="text-sm text-gray-500">{flag.description}</p>
                  <div className="mt-2">
                    <span className={`inline-block px-2 py-1 text-xs rounded ${
                      flag.enabledByDefault ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {flag.enabledByDefault ? 'Enabled by Default' : 'Disabled by Default'}
                    </span>
                  </div>
                  <div className="mt-2">
                    {flag.tags.map((tag: string) => (
                      <span key={tag} className="inline-block px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded mr-1">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Organizations */}
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Organizations ({organizations.length})</h2>
          {organizations.length === 0 ? (
            <div className="bg-gray-100 rounded-lg p-8 text-center">
              <p className="text-gray-600">No organizations loaded</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {organizations.map((org: any) => (
                <div key={org.id} className="bg-white border border-gray-200 rounded-lg p-4">
                  <h3 className="font-medium text-gray-900">{org.name}</h3>
                  <p className="text-sm text-gray-600 mb-2">{org.type}</p>
                  <div className="mt-2">
                    <span className={`inline-block px-2 py-1 text-xs rounded ${
                      org.tier === 'PRO' || org.tier === 'PREMIUM' ? 'bg-purple-100 text-purple-800' : 
                      org.tier === 'BASIC' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {org.tier}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Refresh Button */}
        <div className="mt-8 text-center">
          <button 
            onClick={fetchData}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Refresh Data
          </button>
        </div>
      </div>
    </div>
  );
}
