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
    
    if (isNaN(formatId)) {
      return NextResponse.json(
        { success: false, error: '有効なフォーマットIDを指定してください' },
        { status: 400 }
      );
    }

    // 指定されたフォーマットの試合テンプレートを取得
    const result = await db.execute(`
      SELECT 
        template_id,
        format_id,
        match_number,
        match_code,
        match_type,
        phase,
        round_name,
        block_name,
        team1_source,
        team2_source,
        team1_display_name,
        team2_display_name,
        day_number,
        execution_priority,
        court_number,
        suggested_start_time,
        created_at
      FROM m_match_templates
      WHERE format_id = ?
      ORDER BY day_number ASC, execution_priority ASC, match_number ASC
    `, [formatId]);

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
      team1_display_name: String(row.team1_display_name),
      team2_display_name: String(row.team2_display_name),
      day_number: Number(row.day_number),
      execution_priority: Number(row.execution_priority),
      court_number: row.court_number ? Number(row.court_number) : undefined,
      suggested_start_time: row.suggested_start_time ? String(row.suggested_start_time) : undefined,
      created_at: String(row.created_at)
    })) as MatchTemplate[];

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