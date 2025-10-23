'use client';

import React from 'react';
import { NotificationSystem, NotificationBell } from '@/components/NotificationSystem';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Bell, MessageSquare, CheckCircle, Clock } from 'lucide-react';

export default function NotificationTestPage() {
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Chat Notification System
          </h1>
          <p className="text-gray-600">
            Test the notification system with working dismiss functionality
          </p>
        </div>

        {/* Notification Bell */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Bell className="w-5 h-5" />
              <span>Notification Bell</span>
            </CardTitle>
            <CardDescription>
              Click the bell to toggle notifications on/off
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-4">
              <NotificationBell />
              <div className="text-sm text-gray-600">
                The bell shows unread notification count and can be toggled
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2 mb-2">
                <MessageSquare className="w-5 h-5 text-blue-600" />
                <span className="font-semibold">Real-time Messages</span>
              </div>
              <p className="text-sm text-gray-600">
                Get instant notifications for new chat messages
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2 mb-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <span className="font-semibold">Read Receipts</span>
              </div>
              <p className="text-sm text-gray-600">
                Track when messages are read by recipients
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2 mb-2">
                <Clock className="w-5 h-5 text-yellow-600" />
                <span className="font-semibold">Typing Indicators</span>
              </div>
              <p className="text-sm text-gray-600">
                See when someone is typing a message
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2 mb-2">
                <Bell className="w-5 h-5 text-purple-600" />
                <span className="font-semibold">Smart Dismissal</span>
              </div>
              <p className="text-sm text-gray-600">
                Click X to dismiss or auto-dismiss after 8 seconds
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Instructions */}
        <Card>
          <CardHeader>
            <CardTitle>How to Test</CardTitle>
            <CardDescription>
              Follow these steps to test the notification system
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <h4 className="font-semibold">1. Enable Notifications</h4>
              <p className="text-sm text-gray-600">
                Make sure notifications are enabled (you should see notification cards in the top-right)
              </p>
            </div>

            <div className="space-y-2">
              <h4 className="font-semibold">2. Test Dismissal</h4>
              <p className="text-sm text-gray-600">
                Click the X button on any notification to dismiss it. The notification should slide out smoothly.
              </p>
            </div>

            <div className="space-y-2">
              <h4 className="font-semibold">3. Test Auto-Dismissal</h4>
              <p className="text-sm text-gray-600">
                Wait 8 seconds and notifications should automatically disappear
              </p>
            </div>

            <div className="space-y-2">
              <h4 className="font-semibold">4. Test Dismiss All</h4>
              <p className="text-sm text-gray-600">
                Click "Dismiss all" button to clear all notifications at once
              </p>
            </div>

            <div className="space-y-2">
              <h4 className="font-semibold">5. Test Notification Bell</h4>
              <p className="text-sm text-gray-600">
                The bell icon shows unread count and can be clicked to disable/enable notifications
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Current Status */}
        <Card>
          <CardHeader>
            <CardTitle>Current Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Notifications Enabled:</span>
                <Badge variant="default">Yes</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Auto-dismiss Delay:</span>
                <Badge variant="outline">8 seconds</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Max Notifications:</span>
                <Badge variant="outline">5</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Position:</span>
                <Badge variant="outline">Top Right</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Troubleshooting */}
        <Card>
          <CardHeader>
            <CardTitle>Troubleshooting</CardTitle>
            <CardDescription>
              Common issues and solutions
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <h4 className="font-semibold text-red-600">X Button Not Working</h4>
              <p className="text-sm text-gray-600">
                • Make sure you're clicking the X button, not the notification body<br/>
                • Try refreshing the page if notifications are stuck<br/>
                • Check browser console for any JavaScript errors
              </p>
            </div>

            <div className="space-y-2">
              <h4 className="font-semibold text-red-600">Notifications Not Appearing</h4>
              <p className="text-sm text-gray-600">
                • Check if notifications are enabled in the top-right corner<br/>
                • Make sure you're logged in as a user<br/>
                • Verify the API endpoints are working
              </p>
            </div>

            <div className="space-y-2">
              <h4 className="font-semibold text-red-600">Auto-dismiss Not Working</h4>
              <p className="text-sm text-gray-600">
                • Wait the full 8 seconds for auto-dismissal<br/>
                • Check if notifications are being marked as read manually<br/>
                • Verify the timer is not being cleared by other actions
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Render the notification system */}
      <NotificationSystem />
    </div>
  );
}
