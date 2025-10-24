import { NextRequest, NextResponse } from 'next/server';

// Mock notification data (in production, this would come from database)
let notifications = [
  {
    id: 'notif_1',
    threadId: 'thread_1',
    messageId: 'msg_1',
    type: 'MESSAGE',
    title: 'New message from Fresh Foods Supply',
    body: 'Perfect! We have a great selection of organic vegetables available. What would you like to order?',
    senderName: 'Fresh Foods Supply',
    senderRole: 'SUPPLIER',
    createdAt: new Date(Date.now() - 2 * 60 * 1000), // 2 minutes ago
    readAt: null,
  },
  {
    id: 'notif_2',
    threadId: 'thread_2',
    messageId: 'msg_2',
    type: 'MESSAGE',
    title: 'New message from Premium Meats Co.',
    body: 'Great! We have excellent cuts available. What specific cuts are you looking for?',
    senderName: 'Premium Meats Co.',
    senderRole: 'SUPPLIER',
    createdAt: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
    readAt: null,
  },
  {
    id: 'notif_3',
    threadId: 'thread_1',
    messageId: 'msg_3',
    type: 'MESSAGE',
    title: 'New message from Fresh Foods Supply',
    body: 'Perfect! We have a great selection of organic vegetables available. What would you like to order?',
    senderName: 'Fresh Foods Supply',
    senderRole: 'SUPPLIER',
    createdAt: new Date(Date.now() - 8 * 60 * 1000), // 8 minutes ago
    readAt: null,
  },
  {
    id: 'notif_4',
    threadId: 'thread_2',
    messageId: 'msg_4',
    type: 'MESSAGE',
    title: 'New message from Premium Meats Co.',
    body: 'Great! We have excellent cuts available. What specific cuts are you looking for?',
    senderName: 'Premium Meats Co.',
    senderRole: 'SUPPLIER',
    createdAt: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago
    readAt: null,
  },
];

// GET /api/chat/notifications
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const unreadOnly = searchParams.get('unreadOnly') === 'true';
    const limit = parseInt(searchParams.get('limit') || '10');

    let filteredNotifications = notifications;

    if (unreadOnly) {
      filteredNotifications = notifications.filter(n => !n.readAt);
    }

    // Sort by creation date (newest first)
    filteredNotifications.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    // Apply limit
    filteredNotifications = filteredNotifications.slice(0, limit);

    return NextResponse.json(filteredNotifications);
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 });
  }
}

// POST /api/chat/notifications
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, data } = body;

    switch (action) {
      case 'create':
        const newNotification = {
          id: `notif_${Date.now()}`,
          ...data,
          createdAt: new Date(),
          readAt: null,
        };
        notifications.unshift(newNotification);
        return NextResponse.json(newNotification);

      case 'mark_all_read':
        notifications = notifications.map(n => ({
          ...n,
          readAt: new Date(),
        }));
        return NextResponse.json({ success: true });

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Error in notifications POST:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/chat/notifications/[id]/read
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const notificationId = params.id;

    const notificationIndex = notifications.findIndex(n => n.id === notificationId);
    if (notificationIndex === -1) {
      return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
    }

    // Mark as read
    notifications[notificationIndex] = {
      ...notifications[notificationIndex],
      readAt: new Date(),
    };

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    return NextResponse.json({ error: 'Failed to mark notification as read' }, { status: 500 });
  }
}

// DELETE /api/chat/notifications/[id]
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const notificationId = params.id;

    const notificationIndex = notifications.findIndex(n => n.id === notificationId);
    if (notificationIndex === -1) {
      return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
    }

    // Remove notification
    notifications.splice(notificationIndex, 1);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting notification:', error);
    return NextResponse.json({ error: 'Failed to delete notification' }, { status: 500 });
  }
}

// GET /api/chat/notifications/count
// export async function GET_COUNT(request: NextRequest) {
//   try {
//     const { searchParams } = new URL(request.url);
//     const unreadOnly = searchParams.get('unreadOnly') === 'true';

//     let count = notifications.length;

//     if (unreadOnly) {
//       count = notifications.filter(n => !n.readAt).length;
//     }

//     return NextResponse.json({ count });
//   } catch (error) {
//     console.error('Error getting notification count:', error);
//     return NextResponse.json({ error: 'Failed to get notification count' }, { status: 500 });
//   }
// }
