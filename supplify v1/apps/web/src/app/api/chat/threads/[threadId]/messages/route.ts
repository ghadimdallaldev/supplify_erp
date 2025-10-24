import { NextRequest, NextResponse } from 'next/server';

const CHAT_SERVICE_URL = process.env.CHAT_SERVICE_URL || 'http://localhost:3011';

// Get messages for a specific thread
export async function GET(
  request: NextRequest,
  { params }: { params: { threadId: string } }
) {
  try {
    const { threadId } = params;
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get('limit');
    const offset = searchParams.get('offset');

    let url = `${CHAT_SERVICE_URL}/chat/threads/${threadId}/messages`;
    if (limit) url += `?limit=${limit}`;
    if (offset) url += `${limit ? '&' : '?'}offset=${offset}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Chat service error: ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Chat messages API error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch messages' },
      { status: 500 }
    );
  }
}
