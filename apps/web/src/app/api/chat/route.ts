import { NextRequest, NextResponse } from 'next/server';

const CHAT_SERVICE_URL = process.env.CHAT_SERVICE_URL || 'http://localhost:3011';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const endpoint = searchParams.get('endpoint');
    const userId = searchParams.get('userId');
    const orgType = searchParams.get('orgType');
    const conversationId = searchParams.get('conversationId');

    let url = `${CHAT_SERVICE_URL}/chat`;
    
    if (endpoint === 'conversations') {
      url += `/conversations?userId=${userId}&orgType=${orgType}`;
    } else if (endpoint === 'conversation' && conversationId) {
      url += `/conversations/${conversationId}`;
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
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch chat data' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { endpoint, ...data } = body;

    let url = `${CHAT_SERVICE_URL}/chat`;
    
    if (endpoint === 'conversations') {
      url += '/conversations';
    } else if (endpoint === 'message') {
      url += '/messages';
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`Chat service error: ${response.status}`);
    }

    const result = await response.json();
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to send chat data' },
      { status: 500 }
    );
  }
}