'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Calendar, CheckCircle, Clock } from 'lucide-react';

/**
 * Inventory Counts Page
 * Manage cycle and full inventory counts
 */
export default function InventoryCountsPage() {
  const [showStartDrawer, setShowStartDrawer] = useState(false);
  const queryClient = useQueryClient();

  const { data: counts, isLoading } = useQuery({
    queryKey: ['inventory', 'counts'],
    queryFn: async () => {
      const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `
            query GetCounts($restaurantId: String!) {
              counts(restaurantId: $restaurantId) {
                id countType status scheduledFor startedAt closedAt
                location { name }
              }
            }
          `,
          variables: { restaurantId: 'rest-001' },
        }),
      });

      const result = await response.json();
      return result.data?.counts || [];
    },
  });

  const startCountMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `
            mutation StartCount($input: StartCountInput!) {
              startCount(input: $input) { count { id } linesCreated }
            }
          `,
          variables: { input: data },
        }),
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory', 'counts'] });
      setShowStartDrawer(false);
    },
  });

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
    </div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Inventory Counts</h1>
            <p className="text-gray-600 mt-2">Manage cycle and full physical counts</p>
          </div>
          <button
            onClick={() => setShowStartDrawer(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium flex items-center gap-2"
          >
            <Plus className="h-5 w-5" />
            Start New Count
          </button>
        </div>

        {/* Counts Grid */}
        <div className="grid gap-4">
          {counts?.map((count: any) => (
            <div key={count.id} className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`rounded-full p-3 ${
                    count.status === 'COMPLETED' ? 'bg-green-100' :
                    count.status === 'IN_PROGRESS' ? 'bg-blue-100' :
                    'bg-gray-100'
                  }`}>
                    {count.status === 'COMPLETED' ? (
                      <CheckCircle className="h-6 w-6 text-green-600" />
                    ) : (
                      <Clock className="h-6 w-6 text-blue-600" />
                    )}
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">
                      {count.countType} Count - {count.location.name}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {count.status} | {count.scheduledFor ? new Date(count.scheduledFor).toLocaleDateString() : 'No schedule'}
                    </p>
                  </div>
                </div>
                <button className="text-blue-600 hover:text-blue-700 font-medium">
                  View Details
                </button>
              </div>
            </div>
          ))}

          {counts?.length === 0 && (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <Calendar className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Counts Yet</h3>
              <p className="text-gray-600">Start your first inventory count to track accuracy</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

