'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { initializeTestData, getTestDataSummary, clearTestData } from '@/lib/test-data-manager';
import { CheckCircle, Database, Trash2, RefreshCw, Users, MessageSquare } from 'lucide-react';

export default function TestDataManager() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [dataSummary, setDataSummary] = useState(getTestDataSummary());

  const handleInitializeData = async () => {
    setLoading(true);
    setMessage('');
    
    try {
      const testData = initializeTestData();
      setMessage(`✅ Successfully created ${testData.users.length} users, ${testData.relationships.length} relationships, ${testData.chatThreads.length} chat threads, and ${testData.chatMessages.length} messages!`);
      setDataSummary(getTestDataSummary());
    } catch (error) {
      setMessage(`❌ Error initializing test data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleClearData = async () => {
    setLoading(true);
    setMessage('');
    
    try {
      clearTestData();
      setMessage('🗑️ Test data cleared successfully!');
      setDataSummary(null);
    } catch (error) {
      setMessage(`❌ Error clearing test data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshSummary = () => {
    setDataSummary(getTestDataSummary());
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Test Data Manager</h1>
          <p className="text-gray-600">Manage test accounts and chat data for development and testing</p>
        </div>

        {message && (
          <Alert className="mb-6">
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Initialize Data Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="w-5 h-5" />
                Initialize Test Data
              </CardTitle>
              <CardDescription>
                Create 5 restaurant accounts, 5 supplier accounts, and establish relationships with chat threads
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="text-sm text-gray-600">
                  <p>This will create:</p>
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li>5 Restaurant accounts (Golden Fork, Bella Vista, etc.)</li>
                    <li>5 Supplier accounts (Fresh Foods Co., Premium Meats, etc.)</li>
                    <li>25 Relationships (each restaurant ↔ each supplier)</li>
                    <li>25 Chat threads with sample messages</li>
                  </ul>
                </div>
                <Button 
                  onClick={handleInitializeData} 
                  disabled={loading}
                  className="w-full"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Creating Data...
                    </>
                  ) : (
                    <>
                      <Database className="w-4 h-4 mr-2" />
                      Initialize Test Data
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Clear Data Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trash2 className="w-5 h-5" />
                Clear Test Data
              </CardTitle>
              <CardDescription>
                Remove all test accounts and chat data from localStorage
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="text-sm text-gray-600">
                  <p>This will remove:</p>
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li>All test user accounts</li>
                    <li>All chat threads and messages</li>
                    <li>All relationship data</li>
                    <li>Test data metadata</li>
                  </ul>
                </div>
                <Button 
                  onClick={handleClearData} 
                  disabled={loading}
                  variant="destructive"
                  className="w-full"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Clearing...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4 mr-2" />
                      Clear All Test Data
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Data Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5" />
              Current Data Status
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleRefreshSummary}
                className="ml-auto"
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {dataSummary ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <Users className="w-8 h-8 mx-auto mb-2 text-blue-600" />
                  <div className="text-2xl font-bold text-blue-600">{dataSummary.userCount}</div>
                  <div className="text-sm text-gray-600">Users</div>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-600" />
                  <div className="text-2xl font-bold text-green-600">{dataSummary.relationshipCount}</div>
                  <div className="text-sm text-gray-600">Relationships</div>
                </div>
                <div className="text-center p-4 bg-purple-50 rounded-lg">
                  <MessageSquare className="w-8 h-8 mx-auto mb-2 text-purple-600" />
                  <div className="text-2xl font-bold text-purple-600">{dataSummary.threadCount}</div>
                  <div className="text-sm text-gray-600">Chat Threads</div>
                </div>
                <div className="text-center p-4 bg-orange-50 rounded-lg">
                  <MessageSquare className="w-8 h-8 mx-auto mb-2 text-orange-600" />
                  <div className="text-2xl font-bold text-orange-600">{dataSummary.messageCount}</div>
                  <div className="text-sm text-gray-600">Messages</div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <Database className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                <p>No test data initialized yet</p>
                <p className="text-sm">Click "Initialize Test Data" to get started</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Test Account Info */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Test Account Information</CardTitle>
            <CardDescription>
              All test accounts use the password: <code className="bg-gray-100 px-2 py-1 rounded">password123</code>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-semibold mb-3 text-green-600">Restaurant Accounts</h4>
                <div className="space-y-2 text-sm">
                  <div>• restaurant1@example.com - Golden Fork Restaurant</div>
                  <div>• restaurant2@example.com - Bella Vista Bistro</div>
                  <div>• restaurant3@example.com - Downtown Bistro</div>
                  <div>• restaurant4@example.com - Mama Mia Italian</div>
                  <div>• restaurant5@example.com - Sunset Grill</div>
                </div>
              </div>
              <div>
                <h4 className="font-semibold mb-3 text-blue-600">Supplier Accounts</h4>
                <div className="space-y-2 text-sm">
                  <div>• supplier1@example.com - Fresh Foods Co.</div>
                  <div>• supplier2@example.com - Premium Meats Ltd.</div>
                  <div>• supplier3@example.com - Ocean Fresh Seafood</div>
                  <div>• supplier4@example.com - Garden Valley Organics</div>
                  <div>• supplier5@example.com - Artisan Bakery Supply</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
