// app/api/tournaments/[id]/disciplinary/route.ts
// 懲罰データの取得（公開）・登録（管理者）
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  getDivisionDisciplinaryData,
  createDisciplinaryAction,
  getDisciplinarySettings,
} from '@/lib/disciplinary-calculator';
import { CARD_TYPES, REASON_PRESETS, type CardType } from '@/lib/disciplinary-constants';
import { normalizePlayerName } from '@/lib/player-name-normalizer';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET: 部門の懲罰データを取得（認証不要・公開）
 */
export async function GET(
  _request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = await params;
    const tournamentId = parseInt(id);
    if (isNaN(tournamentId)) {
      return NextResponse.json({ success: false, error: '無効な部門IDです' }, { status: 400 });
    }

    // group_idを取得
    const tournamentResult = await db.execute(
      `SELECT group_id FROM t_tournaments WHERE tournament_id = ?`,
      [tournamentId]
    );
    if (tournamentResult.rows.length === 0) {
      return NextResponse.json({ success: false, error: '部門が見つかりません' }, { status: 404 });
    }
    const groupId = Number(tournamentResult.rows[0].group_id);

    // 設定チェック
    const settings = await getDisciplinarySettings(groupId);
    if (!settings.is_enabled) {
      return NextResponse.json({ success: true, data: { enabled: false, teams: [], settings } });
    }

    const teams = await getDivisionDisciplinaryData(tournamentId);

    return NextResponse.json({
      success: true,
      data: { enabled: true, teams, settings },
    });
  } catch (error) {
    console.error('懲罰データ取得エラー:', error);
    return NextResponse.json({ success: false, error: 'データ取得に失敗しました' }, { status: 500 });
  }
}

/**
 * POST: カードを登録（管理者/運営者のみ）
 */
export async function POST(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const session = await auth();
    if (!session || (session.user.role !== 'admin' && session.user.role !== 'operator')) {
      return NextResponse.json({ success: false, error: '管理者権限が必要です' }, { status: 401 });
    }

    const { id } = await params;
    const tournamentId = parseInt(id);
    if (isNaN(tournamentId)) {
      return NextResponse.json({ success: false, error: '無効な部門IDです' }, { status: 400 });
    }

    const body = await request.json();
    const { matchId, tournamentTeamId, playerName, cardType, reasonCode, reasonText, suspensionMatches } = body;

    // バリデーション
    if (!matchId || !tournamentTeamId || !playerName || !cardType || !reasonCode) {
      return NextResponse.json({ success: false, error: '必須項目が不足しています' }, { status: 400 });
    }

    const validCardTypes = Object.values(CARD_TYPES);
    if (!validCardTypes.includes(cardType as CardType)) {
      return NextResponse.json({ success: false, error: '無効なカードタイプです' }, { status: 400 });
    }

    const validReasonCodes = REASON_PRESETS.map((r) => r.code);
    if (!validReasonCodes.includes(reasonCode)) {
      return NextResponse.json({ success: false, error: '無効な理由コードです' }, { status: 400 });
    }

    // group_id取得
    const tournamentResult = await db.execute(
      `SELECT group_id FROM t_tournaments WHERE tournament_id = ?`,
      [tournamentId]
    );
    if (tournamentResult.rows.length === 0) {
      return NextResponse.json({ success: false, error: '部門が見つかりません' }, { status: 404 });
    }
    const groupId = Number(tournamentResult.rows[0].group_id);

    const normalizedName = normalizePlayerName(playerName);

    const actionId = await createDisciplinaryAction({
      groupId,
      tournamentId,
      matchId: Number(matchId),
      tournamentTeamId: Number(tournamentTeamId),
      playerName: normalizedName,
      cardType: cardType as CardType,
      reasonCode: Number(reasonCode),
      reasonText: reasonText || undefined,
      suspensionMatches: Number(suspensionMatches) || 0,
      recordedBy: session.user.email || undefined,
    });

    return NextResponse.json({
      success: true,
      data: { actionId },
    });
  } catch (error) {
    console.error('カード登録エラー:', error);
    return NextResponse.json({ success: false, error: '登録に失敗しました' }, { status: 500 });
  }
}
