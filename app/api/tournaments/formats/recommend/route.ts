// app/api/tournaments/formats/recommend/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { TournamentFormat } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const teamCountStr = searchParams.get('teamCount');
    const sportTypeIdStr = searchParams.get('sportTypeId');
    
    if (!teamCountStr) {
      return NextResponse.json(
        { success: false, error: 'チーム数が指定されていません' },
        { status: 400 }
      );
    }

    if (!sportTypeIdStr) {
      return NextResponse.json(
        { success: false, error: '競技種別が指定されていません' },
        { status: 400 }
      );
    }

    const teamCount = parseInt(teamCountStr);
    const sportTypeId = parseInt(sportTypeIdStr);
    
    if (isNaN(teamCount) || teamCount < 2) {
      return NextResponse.json(
        { success: false, error: '有効なチーム数を指定してください（2以上）' },
        { status: 400 }
      );
    }

    if (isNaN(sportTypeId) || sportTypeId < 1) {
      return NextResponse.json(
        { success: false, error: '有効な競技種別を指定してください' },
        { status: 400 }
      );
    }

    // 指定された競技種別のフォーマットのみを取得
    const result = await db.execute(`
      SELECT 
        tf.format_id,
        tf.format_name,
        tf.target_team_count,
        tf.format_description,
        tf.created_at,
        tf.updated_at,
        tf.sport_type_id,
        st.sport_name,
        st.sport_code
      FROM m_tournament_formats tf
      LEFT JOIN m_sport_types st ON tf.sport_type_id = st.sport_type_id
      WHERE tf.sport_type_id = ?
      ORDER BY tf.target_team_count ASC
    `, [sportTypeId]);

    const allFormats = result.rows.map(row => ({
      format_id: Number(row.format_id),
      format_name: String(row.format_name),
      target_team_count: Number(row.target_team_count),
      format_description: row.format_description as string | undefined,
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
      sport_type_id: Number(row.sport_type_id),
      sport_name: String(row.sport_name || ''),
      sport_code: String(row.sport_code || '')
    })) as (TournamentFormat & { sport_type_id: number; sport_name: string; sport_code: string })[];

    // 推奨ロジック
    const recommendedFormats: Array<TournamentFormat & { 
      recommendationReason: string; 
      matchType: 'exact' | 'close' | 'alternative' 
    }> = [];

    // 1. 完全一致
    const exactMatch = allFormats.find(format => format.target_team_count === teamCount);
    if (exactMatch) {
      recommendedFormats.push({
        ...exactMatch,
        recommendationReason: `${teamCount}チームに最適化されたフォーマットです`,
        matchType: 'exact'
      });
    }

    // 2. 近い数値（±2の範囲）
    const closeMatches = allFormats.filter(format => {
      const diff = Math.abs(format.target_team_count - teamCount);
      return diff > 0 && diff <= 2 && format.target_team_count !== teamCount;
    });

    closeMatches.forEach(format => {
      const diff = format.target_team_count - teamCount;
      let reason = '';
      if (diff > 0) {
        reason = `${teamCount}チームより${diff}チーム多いですが、近いフォーマットとして推奨`;
      } else {
        reason = `${teamCount}チームより${Math.abs(diff)}チーム少ないですが、近いフォーマットとして推奨`;
      }
      
      recommendedFormats.push({
        ...format,
        recommendationReason: reason,
        matchType: 'close'
      });
    });

    // 3. 代替案（より大きい数や一般的なフォーマット）
    if (recommendedFormats.length === 0) {
      // より大きいフォーマットから最小のものを選択
      const largerFormat = allFormats
        .filter(format => format.target_team_count > teamCount)
        .sort((a, b) => a.target_team_count - b.target_team_count)[0];

      if (largerFormat) {
        recommendedFormats.push({
          ...largerFormat,
          recommendationReason: `${teamCount}チームより多いですが、最も近い大きなフォーマットです`,
          matchType: 'alternative'
        });
      }

      // より小さいフォーマットから最大のものを選択
      const smallerFormat = allFormats
        .filter(format => format.target_team_count < teamCount)
        .sort((a, b) => b.target_team_count - a.target_team_count)[0];

      if (smallerFormat && recommendedFormats.length < 2) {
        recommendedFormats.push({
          ...smallerFormat,
          recommendationReason: `${teamCount}チームより少ないですが、最も近い小さなフォーマットです`,
          matchType: 'alternative'
        });
      }
    }

    // 最大3つまでに制限
    const finalRecommendations = recommendedFormats.slice(0, 3);

    return NextResponse.json({
      success: true,
      data: {
        teamCount,
        sportTypeId,
        recommendedFormats: finalRecommendations,
        allFormats: allFormats.map(format => ({
          ...format,
          isRecommended: finalRecommendations.some(rec => rec.format_id === format.format_id)
        }))
      }
    });

  } catch (error) {
    console.error('フォーマット推奨エラー:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'フォーマットの推奨に失敗しました',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}