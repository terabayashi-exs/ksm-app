import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getTournamentCourtSettings, saveCourtName, deleteCourtName } from '@/lib/court-name-helper';

/**
 * GET /api/tournaments/[id]/courts
 * 大会のコート設定一覧を取得
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: '管理者権限が必要です' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const tournamentId = parseInt(id);

    if (isNaN(tournamentId)) {
      return NextResponse.json(
        { success: false, error: '無効な大会IDです' },
        { status: 400 }
      );
    }

    const courtSettings = await getTournamentCourtSettings(tournamentId);

    return NextResponse.json({
      success: true,
      data: courtSettings
    });

  } catch (error) {
    console.error('コート設定取得エラー:', error);
    return NextResponse.json(
      { success: false, error: 'コート設定の取得に失敗しました' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/tournaments/[id]/courts
 * コート名を一括保存
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: '管理者権限が必要です' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const tournamentId = parseInt(id);

    if (isNaN(tournamentId)) {
      return NextResponse.json(
        { success: false, error: '無効な大会IDです' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { courts } = body;

    if (!Array.isArray(courts)) {
      return NextResponse.json(
        { success: false, error: '無効なデータ形式です' },
        { status: 400 }
      );
    }

    // バリデーション
    for (const court of courts) {
      if (typeof court.court_number !== 'number' || !court.court_name || typeof court.court_name !== 'string') {
        return NextResponse.json(
          { success: false, error: 'コート番号とコート名は必須です' },
          { status: 400 }
        );
      }

      if (court.court_name.trim().length === 0) {
        return NextResponse.json(
          { success: false, error: 'コート名が空です' },
          { status: 400 }
        );
      }

      if (court.court_name.length > 50) {
        return NextResponse.json(
          { success: false, error: 'コート名は50文字以内で入力してください' },
          { status: 400 }
        );
      }
    }

    // 保存処理
    for (const court of courts) {
      const courtName = court.court_name.trim();

      // 空の場合は削除（デフォルト表示に戻す）
      if (!courtName) {
        await deleteCourtName(tournamentId, court.court_number);
      } else {
        await saveCourtName(tournamentId, court.court_number, courtName);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'コート名を保存しました'
    });

  } catch (error) {
    console.error('コート名保存エラー:', error);
    return NextResponse.json(
      { success: false, error: 'コート名の保存に失敗しました' },
      { status: 500 }
    );
  }
}
