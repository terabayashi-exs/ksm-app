// app/api/tournaments/[id]/live-updates/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTournamentSportCode, getSportScoreConfig } from '@/lib/sport-standings-calculator';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// Server-Sent Events for real-time match updates
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const resolvedParams = await context.params;
    const tournamentId = parseInt(resolvedParams.id);

    if (isNaN(tournamentId)) {
      return NextResponse.json(
        { success: false, error: '無効な大会IDです' },
        { status: 400 }
      );
    }

    // Create a readable stream for SSE
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();

        // Initial data send
        const sendInitialData = async () => {
          try {
            // 多競技対応：大会の競技種別設定を取得
            const sportCode = await getTournamentSportCode(tournamentId);
            const sportConfig = getSportScoreConfig(sportCode);
            
            const matches = await db.execute(`
              SELECT 
                ml.match_id,
                ml.match_code,
                ml.team1_display_name,
                ml.team2_display_name,
                ml.court_number,
                ml.start_time,
                ms.current_period,
                ml.period_count,
                ms.match_status,
                ms.actual_start_time,
                ms.actual_end_time,
                ms.updated_at
              FROM t_matches_live ml
              INNER JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
              LEFT JOIN t_match_status ms ON ml.match_id = ms.match_id
              WHERE mb.tournament_id = ?
              ORDER BY ml.match_number
            `, [tournamentId]);

            const data = {
              type: 'initial',
              // 多競技対応：スポーツ設定を追加
              sport_config: sportConfig,
              matches: matches.rows.map(row => ({
                match_id: row.match_id,
                match_code: row.match_code,
                team1_name: row.team1_display_name,
                team2_name: row.team2_display_name,
                court_number: row.court_number,
                scheduled_time: row.start_time,
                current_period: row.current_period,
                period_count: row.period_count,
                match_status: row.match_status || 'scheduled',
                actual_start_time: row.actual_start_time,
                actual_end_time: row.actual_end_time,
                updated_at: row.updated_at
              }))
            };

            const message = `data: ${JSON.stringify(data)}\n\n`;
            controller.enqueue(encoder.encode(message));
          } catch (error) {
            console.error('Initial data send error:', error);
          }
        };

        sendInitialData();

        // Poll for updates every 5 seconds
        // In a production environment, you would use database triggers or WebSockets
        const intervalId = setInterval(async () => {
          try {
            const recentUpdates = await db.execute(`
              SELECT 
                ml.match_id,
                ml.match_code,
                ml.team1_display_name,
                ml.team2_display_name,
                ml.court_number,
                ms.current_period,
                ms.match_status,
                ms.actual_start_time,
                ms.actual_end_time,
                ms.updated_at
              FROM t_matches_live ml
              INNER JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
              LEFT JOIN t_match_status ms ON ml.match_id = ms.match_id
              WHERE mb.tournament_id = ? 
                AND ms.updated_at > datetime('now', '-10 seconds')
              ORDER BY ms.updated_at DESC
            `, [tournamentId]);

            if (recentUpdates.rows.length > 0) {
              const data = {
                type: 'status_update',
                updates: recentUpdates.rows.map(row => ({
                  match_id: row.match_id,
                  match_code: row.match_code,
                  team1_name: row.team1_display_name,
                  team2_name: row.team2_display_name,
                  court_number: row.court_number,
                  current_period: row.current_period,
                  match_status: row.match_status,
                  actual_start_time: row.actual_start_time,
                  actual_end_time: row.actual_end_time,
                  updated_at: row.updated_at
                })),
                timestamp: new Date().toISOString()
              };

              const message = `data: ${JSON.stringify(data)}\n\n`;
              controller.enqueue(encoder.encode(message));
            }

            // Send heartbeat
            const heartbeat = `data: ${JSON.stringify({ type: 'heartbeat', timestamp: new Date().toISOString() })}\n\n`;
            controller.enqueue(encoder.encode(heartbeat));

          } catch (error) {
            console.error('SSE update error:', error);
          }
        }, 5000);

        // Cleanup on close
        request.signal.addEventListener('abort', () => {
          clearInterval(intervalId);
          controller.close();
        });
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
      }
    });

  } catch (error) {
    console.error('SSE setup error:', error);
    return NextResponse.json(
      { success: false, error: 'リアルタイム更新の設定に失敗しました' },
      { status: 500 }
    );
  }
}