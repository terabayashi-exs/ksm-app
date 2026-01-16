// app/api/tournaments/[id]/block-team-counts/route.ts
// 各ブロックの想定チーム数を試合テンプレートから計算して返すAPI

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';

interface BlockTeamCount {
  block_name: string;
  expected_team_count: number;
  match_count: number;
}

/**
 * リーグ戦の試合数からチーム数を逆算
 * 公式: 試合数 = n(n-1)/2
 * 逆算: n = (1 + √(1 + 8×試合数)) / 2
 */
function calculateTeamCountFromMatches(matchCount: number): number {
  const n = (1 + Math.sqrt(1 + 8 * matchCount)) / 2;
  return Math.round(n);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 認証チェック
    const session = await auth();
    if (!session) {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      );
    }

    const resolvedParams = await params;
    const tournamentId = parseInt(resolvedParams.id);

    if (isNaN(tournamentId)) {
      return NextResponse.json(
        { success: false, error: '無効な大会IDです' },
        { status: 400 }
      );
    }

    // 大会のフォーマットIDを取得
    const tournamentResult = await db.execute(`
      SELECT t.format_id, f.format_name
      FROM t_tournaments t
      LEFT JOIN m_tournament_formats f ON t.format_id = f.format_id
      WHERE t.tournament_id = ?
    `, [tournamentId]);

    if (tournamentResult.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: '大会が見つかりません' },
        { status: 404 }
      );
    }

    const formatId = tournamentResult.rows[0].format_id;

    // 試合テンプレートから予選ブロック別の試合数を取得
    const templatesResult = await db.execute(`
      SELECT
        block_name,
        COUNT(*) as match_count
      FROM m_match_templates
      WHERE format_id = ? AND phase = 'preliminary' AND block_name IS NOT NULL
      GROUP BY block_name
      ORDER BY block_name
    `, [formatId]);

    // 各ブロックの想定チーム数を計算
    const blockTeamCounts: BlockTeamCount[] = templatesResult.rows.map(row => {
      const matchCount = Number(row.match_count);
      const expectedTeamCount = calculateTeamCountFromMatches(matchCount);

      return {
        block_name: String(row.block_name),
        expected_team_count: expectedTeamCount,
        match_count: matchCount
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        tournament_id: tournamentId,
        format_id: Number(formatId),
        block_team_counts: blockTeamCounts
      }
    });

  } catch (error) {
    console.error('ブロック別チーム数取得エラー:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'ブロック別チーム数の取得に失敗しました',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
