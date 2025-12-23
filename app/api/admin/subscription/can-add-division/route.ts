// 部門追加可否チェックAPI
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { canAddDivision } from '@/lib/subscription/plan-checker';

export async function GET(request: Request) {
  try {
    const session = await auth();

    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const groupId = searchParams.get('group_id');

    if (!groupId) {
      return NextResponse.json({ error: 'group_idは必須です' }, { status: 400 });
    }

    const adminLoginId = session.user.id;
    const result = await canAddDivision(adminLoginId, Number(groupId));

    return NextResponse.json({
      allowed: result.allowed,
      reason: result.reason,
      current: result.current,
      limit: result.limit,
    });
  } catch (error) {
    console.error('Division check error:', error);
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}
