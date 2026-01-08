// app/api/tournaments/formats/[formatId]/templates/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { MatchTemplate } from '@/lib/types';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ formatId: string }> }
) {
  try {
    const resolvedParams = await params;
    const formatId = parseInt(resolvedParams.formatId);
    
    console.log(`[TEMPLATES] フォーマットIDでテンプレート取得開始: ${formatId}`);
    
    if (isNaN(formatId)) {
      console.log(`[TEMPLATES] 無効なフォーマットID: ${resolvedParams.formatId}`);
      return NextResponse.json(
        { success: false, error: '有効なフォーマットIDを指定してください' },
        { status: 400 }
      );
    }

    // 指定されたフォーマットの試合テンプレートと競技種別情報を取得
    const result = await db.execute(`
      SELECT
        mt.template_id,
        mt.format_id,
        mt.match_number,
        mt.match_code,
        mt.match_type,
        mt.phase,
        mt.round_name,
        mt.block_name,
        mt.team1_source,
        mt.team2_source,
        mt.team1_display_name,
        mt.team2_display_name,
        mt.day_number,
        mt.execution_priority,
        mt.court_number,
        mt.suggested_start_time,
        mt.is_bye_match,
        mt.created_at,
        st.sport_code
      FROM m_match_templates mt
      LEFT JOIN m_tournament_formats tf ON mt.format_id = tf.format_id
      LEFT JOIN m_sport_types st ON tf.sport_type_id = st.sport_type_id
      WHERE mt.format_id = ?
      ORDER BY mt.day_number ASC, mt.execution_priority ASC, mt.match_number ASC
    `, [formatId]);

    console.log(`[TEMPLATES] クエリ実行完了: ${result.rows.length}件のテンプレートを取得`);

    const templates = result.rows.map(row => ({
      template_id: Number(row.template_id),
      format_id: Number(row.format_id),
      match_number: Number(row.match_number),
      match_code: String(row.match_code),
      match_type: String(row.match_type),
      phase: String(row.phase),
      round_name: row.round_name as string | undefined,
      block_name: row.block_name as string | undefined,
      team1_source: row.team1_source as string | undefined,
      team2_source: row.team2_source as string | undefined,
      team1_display_name: String(row.team1_display_name || ""),
      team2_display_name: String(row.team2_display_name || ""),
      day_number: Number(row.day_number),
      execution_priority: Number(row.execution_priority),
      court_number: row.court_number ? Number(row.court_number) : undefined,
      suggested_start_time: row.suggested_start_time ? String(row.suggested_start_time) : undefined,
      period_count: undefined, // スキーマに存在しないため undefined に設定
      is_bye_match: Number(row.is_bye_match || 0),
      created_at: String(row.created_at)
    })) as MatchTemplate[];

    // 競技種別コードを取得（全テンプレートで同じはずなので最初のものを使用）
    const sportCode = result.rows.length > 0 ? result.rows[0].sport_code : null;
    
    console.log(`[TEMPLATES] 処理完了:`, {
      formatId,
      templatesCount: templates.length,
      sportCode,
      firstTemplate: templates[0] ? templates[0].match_code : null
    });
    
    if (templates.length === 0) {
      console.log(`[TEMPLATES] 警告: フォーマットID ${formatId} にはテンプレートが存在しません`);
      return NextResponse.json({
        success: false,
        error: `フォーマットID ${formatId} に対応する試合テンプレートが見つかりません`
      }, { status: 404 });
    }

    // 日程別に分類
    const templatesByDay = templates.reduce((acc, template) => {
      const dayKey = template.day_number.toString();
      if (!acc[dayKey]) {
        acc[dayKey] = [];
      }
      acc[dayKey].push(template);
      return acc;
    }, {} as Record<string, MatchTemplate[]>);

    // 統計情報の計算
    const totalMatches = templates.length;
    const matchesByDay = Object.keys(templatesByDay).map(day => ({
      day: parseInt(day),
      matchCount: templatesByDay[day].length
    }));
    
    // day_numberの最大値と最小値を計算
    const dayNumbers = templates.map(t => t.day_number);
    const minDayNumber = Math.min(...dayNumbers, 1);
    const maxDayNumber = Math.max(...dayNumbers, 1);

    // execution_priorityでグループ化（同時進行可能な試合数を計算）
    const maxSimultaneousMatches = Math.max(
      ...Object.values(templatesByDay).map(dayTemplates => {
        const priorityGroups = dayTemplates.reduce((acc, template) => {
          if (!acc[template.execution_priority]) {
            acc[template.execution_priority] = 0;
          }
          acc[template.execution_priority]++;
          return acc;
        }, {} as Record<number, number>);
        return Math.max(...Object.values(priorityGroups));
      }),
      1
    );

    return NextResponse.json({
      success: true,
      data: {
        formatId,
        sportCode, // 競技種別コードを追加
        templates,
        templatesByDay,
        statistics: {
          totalMatches,
          totalDays: Object.keys(templatesByDay).length,
          matchesByDay,
          maxSimultaneousMatches,
          minDayNumber,
          maxDayNumber,
          requiredDays: maxDayNumber - minDayNumber + 1,
          phases: [...new Set(templates.map(t => t.phase))],
          matchTypes: [...new Set(templates.map(t => t.match_type))]
        }
      }
    });

  } catch (error) {
    console.error('試合テンプレート取得エラー:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: '試合テンプレートの取得に失敗しました',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}