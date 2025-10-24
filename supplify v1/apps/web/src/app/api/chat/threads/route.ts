import { NextRequest, NextResponse } from 'next/server';

const CHAT_SERVICE_URL = process.env.CHAT_SERVICE_URL || 'http://localhost:3011';

// Get all threads for a user
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const orgType = searchParams.get('orgType');
    const scope = searchParams.get('scope');

    if (!userId || !orgType) {
      return NextResponse.json(
        { error: 'Missing userId or orgType' },
        { status: 400 }
      );
    }

    let url = `${CHAT_SERVICE_URL}/chat/threads?userId=${userId}&orgType=${orgType}`;
    if (scope) {
      url += `&scope=${scope}`;
    }

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
    console.error('Chat threads API error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch chat threads' },
      { status: 500 }
    );
  }
}

// Create a new thread
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { scope, orderId, participants, title, description } = body;

    if (!scope || !participants || participants.length === 0) {
      return NextResponse.json(
        { error: 'Missing required fields: scope, participants' },
        { status: 400 }
      );
    }

    const response = await fetch(`${CHAT_SERVICE_URL}/chat/threads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        scope,
        orderId,
        participants,
        title,
        description,
      }),
    });

    if (!response.ok) {
      throw new Error(`Chat service error: ${response.status}`);
    }

    const result = await response.json();
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Chat threads API error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create chat thread' },
      { status: 500 }
    );
  }
}
