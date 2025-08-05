// app/api/debug/session/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    
    return NextResponse.json({
      success: true,
      session: session,
      user: session?.user,
      hasSession: !!session,
      hasUser: !!session?.user,
      role: session?.user?.role,
      teamId: session?.user?.teamId,
      userId: session?.user?.id
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      details: process.env.NODE_ENV === 'development' ? String(error) : undefined
    }, { status: 500 });
  }
}