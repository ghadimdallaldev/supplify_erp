import { NextRequest, NextResponse } from 'next/server';

const CHAT_SERVICE_URL = process.env.CHAT_SERVICE_URL || 'http://localhost:3011';

// Send a message
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { threadId, senderId, senderRole, senderName, body: messageBody, replyToId } = body;

    if (!threadId || !senderId || !senderRole || !messageBody) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const response = await fetch(`${CHAT_SERVICE_URL}/chat/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        threadId,
        senderId,
        senderRole,
        senderName,
        body: messageBody,
        messageType: 'TEXT',
        replyToId,
      }),
    });

    if (!response.ok) {
      throw new Error(`Chat service error: ${response.status}`);
    }

    const result = await response.json();
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Chat messages API error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to send message' },
      { status: 500 }
    );
  }
}
