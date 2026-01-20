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

export async function GET(
  _request: NextRequest,
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

    // 第1ラウンド（元チームのみ）の試合を取得して想定チーム数を計算
    const firstRoundResult = await db.execute(`
      SELECT
        block_name,
        team1_display_name,
        team2_display_name
      FROM m_match_templates
      WHERE format_id = ?
        AND phase = 'preliminary'
        AND block_name IS NOT NULL
        AND (team1_source IS NULL OR team1_source = '')
        AND (team2_source IS NULL OR team2_source = '')
      ORDER BY block_name, match_number
    `, [formatId]);

    // ブロック別の総試合数も取得（表示用）
    const matchCountResult = await db.execute(`
      SELECT
        block_name,
        COUNT(*) as match_count
      FROM m_match_templates
      WHERE format_id = ? AND phase = 'preliminary' AND block_name IS NOT NULL
      GROUP BY block_name
    `, [formatId]);

    // ブロック別のチームプレースホルダーを集計
    const blockTeamSets = new Map<string, Set<string>>();
    const blockMatchCounts = new Map<string, number>();

    // 試合数を設定
    matchCountResult.rows.forEach(row => {
      blockMatchCounts.set(String(row.block_name), Number(row.match_count));
    });

    // 第1ラウンドの試合からプレースホルダーを収集
    firstRoundResult.rows.forEach(row => {
      const blockName = String(row.block_name);
      if (!blockTeamSets.has(blockName)) {
        blockTeamSets.set(blockName, new Set());
      }
      const teamSet = blockTeamSets.get(blockName)!;

      // team1_display_nameを追加（空文字列でない場合）
      if (row.team1_display_name && String(row.team1_display_name).trim() !== '') {
        teamSet.add(String(row.team1_display_name));
      }
      // team2_display_nameを追加（空文字列でない場合）
      if (row.team2_display_name && String(row.team2_display_name).trim() !== '') {
        teamSet.add(String(row.team2_display_name));
      }
    });

    // 各ブロックの想定チーム数を計算
    const blockTeamCounts: BlockTeamCount[] = Array.from(blockTeamSets.entries())
      .map(([blockName, teamSet]) => ({
        block_name: blockName,
        expected_team_count: teamSet.size,
        match_count: blockMatchCounts.get(blockName) || 0
      }))
      .sort((a, b) => a.block_name.localeCompare(b.block_name));

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
