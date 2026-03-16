// app/api/tournaments/formats/recommend/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { TournamentFormat } from '@/lib/types';
import { auth } from '@/lib/auth';
import { getGrantedFormatIds, annotateFormatsWithAccess } from '@/lib/format-access';

export async function GET(request: NextRequest) {
  try {
    // セッション取得（未認証の場合はpublicフォーマットのみ）
    const session = await auth();
    const loginUserId = session?.user?.loginUserId;
    const isSuperadmin = session?.user?.isSuperadmin ?? false;

    // アクセス権取得
    const grantedIds = loginUserId ? await getGrantedFormatIds(loginUserId) : new Set<number>();

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
        tf.default_match_duration,
        tf.default_break_duration,
        tf.phases,
        tf.created_at,
        tf.updated_at,
        tf.sport_type_id,
        tf.visibility,
        st.sport_name,
        st.sport_code
      FROM m_tournament_formats tf
      LEFT JOIN m_sport_types st ON tf.sport_type_id = st.sport_type_id
      WHERE tf.sport_type_id = ?
      ORDER BY tf.target_team_count ASC
    `, [sportTypeId]);

    // フェーズごとの統計を取得
    const phaseStatsResult = await db.execute(`
      SELECT
        mt.format_id,
        mt.phase,
        COUNT(DISTINCT mt.block_name) as block_count,
        MAX(mt.court_number) as max_court_number,
        COUNT(DISTINCT mt.matchday) as matchday_count
      FROM m_match_templates mt
      INNER JOIN m_tournament_formats tf ON mt.format_id = tf.format_id
      WHERE tf.sport_type_id = ?
      GROUP BY mt.format_id, mt.phase
    `, [sportTypeId]);

    // フォーマットごとにフェーズ統計をマッピング
    const phaseStatsMap = new Map<number, Array<{ phase: string; phase_name: string; order: number; block_count: number; max_court_number: number | null }>>();
    // 一時的にformat_id→raw statsを保持（後でphasesから名前解決）
    const rawStatsMap = new Map<number, Array<{ phase: string; block_count: number; max_court_number: number | null }>>();
    for (const row of phaseStatsResult.rows) {
      const fmtId = Number(row.format_id);
      if (!rawStatsMap.has(fmtId)) rawStatsMap.set(fmtId, []);
      rawStatsMap.get(fmtId)!.push({
        phase: String(row.phase || ''),
        block_count: Number(row.block_count || 0),
        max_court_number: row.max_court_number != null ? Number(row.max_court_number) : null,
      });
    }

    // matchday数をフォーマット単位で集計
    const matchdayResult = await db.execute(`
      SELECT mt.format_id, COUNT(DISTINCT mt.matchday) as matchday_count
      FROM m_match_templates mt
      INNER JOIN m_tournament_formats tf ON mt.format_id = tf.format_id
      WHERE tf.sport_type_id = ?
      GROUP BY mt.format_id
    `, [sportTypeId]);
    const matchdayMap = new Map<number, number>();
    for (const row of matchdayResult.rows) {
      matchdayMap.set(Number(row.format_id), Number(row.matchday_count || 0));
    }

    const allFormats = result.rows.map(row => {
      const formatId = Number(row.format_id);

      // phases JSONからフェーズ名・orderを取得
      const phaseLookup: Record<string, { name: string; order: number }> = {};
      if (row.phases) {
        try {
          const parsed = JSON.parse(String(row.phases));
          if (parsed?.phases && Array.isArray(parsed.phases)) {
            for (const p of parsed.phases) {
              phaseLookup[p.id] = { name: p.name || p.id, order: p.order ?? 0 };
            }
          }
        } catch { /* ignore */ }
      }

      const rawStats = rawStatsMap.get(formatId) || [];
      const phaseStats = rawStats
        .map(ps => ({
          ...ps,
          phase_name: phaseLookup[ps.phase]?.name || ps.phase,
          order: phaseLookup[ps.phase]?.order ?? 999,
        }))
        .sort((a, b) => a.order - b.order);
      phaseStatsMap.set(formatId, phaseStats);

      return {
        format_id: formatId,
        format_name: String(row.format_name),
        target_team_count: Number(row.target_team_count),
        format_description: row.format_description as string | undefined,
        default_match_duration: row.default_match_duration ? Number(row.default_match_duration) : null,
        default_break_duration: row.default_break_duration ? Number(row.default_break_duration) : null,
        created_at: String(row.created_at),
        updated_at: String(row.updated_at),
        sport_type_id: Number(row.sport_type_id),
        sport_name: String(row.sport_name || ''),
        sport_code: String(row.sport_code || ''),
        visibility: String(row.visibility || 'public'),
        matchday_count: matchdayMap.get(formatId) || 0,
        phase_stats: phaseStats,
      };
    }) as (TournamentFormat & { sport_type_id: number; sport_name: string; sport_code: string; visibility: string; matchday_count: number; phase_stats: Array<{ phase: string; phase_name: string; order: number; block_count: number; max_court_number: number | null }> })[];

    // アクセス注釈を付与
    const annotatedFormats = annotateFormatsWithAccess(allFormats, isSuperadmin, grantedIds);

    // 推奨ロジック
    const recommendedFormats: Array<typeof annotatedFormats[number] & {
      recommendationReason: string;
      matchType: 'exact' | 'close' | 'alternative'
    }> = [];

    // 1. 完全一致（全て取得）
    const exactMatches = annotatedFormats.filter(format => format.target_team_count === teamCount);
    exactMatches.forEach(format => {
      recommendedFormats.push({
        ...format,
        recommendationReason: `${teamCount}チームに最適化されたフォーマットです`,
        matchType: 'exact'
      });
    });

    // 2. 近い数値（±2の範囲）
    const closeMatches = annotatedFormats.filter(format => {
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
      const largerFormat = annotatedFormats
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
      const smallerFormat = annotatedFormats
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

    return NextResponse.json({
      success: true,
      data: {
        teamCount,
        sportTypeId,
        recommendedFormats: recommendedFormats,
        allFormats: annotatedFormats.map(format => ({
          ...format,
          isRecommended: recommendedFormats.some(rec => rec.format_id === format.format_id)
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