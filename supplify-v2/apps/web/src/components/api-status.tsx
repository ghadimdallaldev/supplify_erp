'use client';

import { useEffect, useState } from 'react';

export function ApiStatus() {
  const [status, setStatus] = useState<'checking' | 'online' | 'offline'>('checking');

  useEffect(() => {
    const checkApi = async () => {
      try {
        const response = await fetch('http://localhost:4000/health');
        if (response.ok) {
          setStatus('online');
        } else {
          setStatus('offline');
        }
      } catch (error) {
        setStatus('offline');
      }
    };

    checkApi();
    const interval = setInterval(checkApi, 30000); // Check every 30 seconds

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div className={`px-3 py-1 rounded-full text-xs font-medium ${
        status === 'online' 
          ? 'bg-green-100 text-green-800' 
          : status === 'offline'
          ? 'bg-red-100 text-red-800'
          : 'bg-yellow-100 text-yellow-800'
      }`}>
        API: {status === 'online' ? 'Online' : status === 'offline' ? 'Offline' : 'Checking...'}
      </div>
    </div>
  );
}
