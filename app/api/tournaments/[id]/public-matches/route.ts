// app/api/tournaments/[id]/public-matches/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// キャッシュを無効化
export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface RouteParams {
  params: Promise<{ id: string }> | { id: string };
}

// 大会の公開用試合一覧を取得（認証不要）
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  console.log('API called with params:', params);
  console.log('Params type:', typeof params);
  
  try {
    // Next.js 15対応：paramsがPromiseかどうかチェック
    let resolvedParams;
    if (params && typeof params.then === 'function') {
      // Promise の場合
      resolvedParams = await params;
    } else {
      // 直接オブジェクトの場合
      resolvedParams = params as { id: string };
    }
    
    console.log('Resolved params:', resolvedParams);
    
    if (!resolvedParams || !resolvedParams.id) {
      console.log('No ID found in params');
      return NextResponse.json(
        { success: false, error: 'パラメータが不正です' },
        { status: 400 }
      );
    }
    
    const tournamentIdStr = resolvedParams.id;
    console.log('Tournament ID string:', tournamentIdStr);
    
    const tournamentId = parseInt(tournamentIdStr);
    console.log('Parsed tournament ID:', tournamentId);

    if (isNaN(tournamentId) || !tournamentIdStr) {
      console.log('Invalid tournament ID - NaN or empty');
      return NextResponse.json(
        { success: false, error: '有効な大会IDを指定してください' },
        { status: 400 }
      );
    }

    // まず大会の存在確認（visibility条件なし）
    console.log('Checking tournament existence for ID:', tournamentId);
    const allTournamentsResult = await db.execute(`
      SELECT tournament_id, tournament_name, visibility, status FROM t_tournaments 
      WHERE tournament_id = ?
    `, [tournamentId]);

    console.log('All tournaments query result:', allTournamentsResult.rows);

    if (allTournamentsResult.rows.length === 0) {
      console.log('Tournament does not exist at all');
      return NextResponse.json(
        { success: false, error: '指定された大会が存在しません' },
        { status: 404 }
      );
    }

    // visibility値の確認
    const tournament = allTournamentsResult.rows[0];
    console.log('Tournament visibility value:', tournament.visibility, 'type:', typeof tournament.visibility);

    // 大会の公開状態チェック（暫定的に緩和）
    // TODO: 本番環境では visibility = 1 の条件を復活させる
    const tournamentResult = await db.execute(`
      SELECT tournament_id, visibility, status FROM t_tournaments 
      WHERE tournament_id = ?
    `, [tournamentId]);

    console.log('Tournament result for matches:', tournamentResult.rows);

    if (tournamentResult.rows.length === 0) {
      console.log('Tournament not found in second query');
      return NextResponse.json(
        { success: false, error: '大会データの取得に失敗しました' },
        { status: 404 }
      );
    }

    // 最もシンプルなクエリでテスト
    console.log('Fetching matches for tournament:', tournamentId);
    
    let matchesResult;
    try {
      // まずは最小限のデータで試してみる
      console.log('Trying simple query first...');
      matchesResult = await db.execute(`
        SELECT 
          ml.match_id,
          ml.match_code,
          ml.team1_display_name,
          ml.team2_display_name
        FROM t_matches_live ml
        INNER JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
        WHERE mb.tournament_id = ?
        LIMIT 5
      `, [tournamentId]);
      
      console.log('Simple query executed successfully, rows found:', matchesResult.rows.length);
      console.log('Sample data:', matchesResult.rows[0]);
      
    } catch (simpleError) {
      console.error('Simple query failed:', simpleError);
      
      // さらにシンプルに - match_blocksテーブルのみ
      try {
        console.log('Trying match_blocks only...');
        const blockResult = await db.execute(`
          SELECT match_block_id, tournament_id, phase
          FROM t_match_blocks
          WHERE tournament_id = ?
        `, [tournamentId]);
        
        console.log('Match blocks found:', blockResult.rows.length);
        
        if (blockResult.rows.length === 0) {
          return NextResponse.json({
            success: true,
            data: [],
            message: 'No match blocks found for this tournament'
          });
        }
        
      } catch (blockError) {
        console.error('Match blocks query failed:', blockError);
        throw blockError;
      }
      
      throw simpleError;
    }
    
    // 成功した場合、より詳細なクエリを実行
    try {
      console.log('Executing full query...');
      
      // まずt_matches_finalテーブルの存在と構造を確認
      console.log('Checking t_matches_final table structure...');
      try {
        const tableInfoResult = await db.execute(`PRAGMA table_info(t_matches_final)`);
        console.log('t_matches_final table columns:', tableInfoResult.rows);
        
        if (tableInfoResult.rows.length === 0) {
          console.log('t_matches_final table does not exist, using only t_matches_live data');
          // t_matches_finalテーブルが存在しない場合は、t_matches_liveのデータのみを使用
          matchesResult = await db.execute(`
            SELECT 
              ml.match_id,
              ml.match_block_id,
              ml.tournament_date,
              ml.match_number,
              ml.match_code,
              ml.team1_id,
              ml.team2_id,
              COALESCE(t1.team_name, ml.team1_display_name) as team1_display_name,
              COALESCE(t2.team_name, ml.team2_display_name) as team2_display_name,
              ml.court_number,
              ml.start_time,
              mb.phase,
              mb.display_round_name,
              mb.block_name,
              mb.match_type,
              mb.block_order,
              CASE WHEN ml.result_status = 'confirmed' THEN ml.team1_scores ELSE NULL END as team1_goals,
              CASE WHEN ml.result_status = 'confirmed' THEN ml.team2_scores ELSE NULL END as team2_goals,
              CASE WHEN ml.result_status = 'confirmed' THEN ml.winner_team_id ELSE NULL END as winner_team_id,
              CASE WHEN ml.result_status = 'confirmed' THEN ml.is_draw ELSE 0 END as is_draw,
              CASE WHEN ml.result_status = 'confirmed' THEN ml.is_walkover ELSE 0 END as is_walkover,
              ml.remarks,
              CASE WHEN ml.result_status = 'confirmed' THEN ml.updated_at ELSE NULL END as confirmed_at
            FROM t_matches_live ml
            INNER JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
            LEFT JOIN m_teams t1 ON ml.team1_id = t1.team_id
            LEFT JOIN m_teams t2 ON ml.team2_id = t2.team_id
            WHERE mb.tournament_id = ?
            ORDER BY mb.block_order ASC, ml.match_number ASC
          `, [tournamentId]);
        } else {
          // テーブルが存在するが、どの列が実際に存在するかを確認
          const columnNames = tableInfoResult.rows.map(row => row.name);
          console.log('Available columns in t_matches_final:', columnNames);
          
          // 必要な列が存在するかチェック
          const requiredColumns = ['team1_scores', 'team2_scores', 'winner_team_id', 'is_draw', 'is_walkover'];
          const missingColumns = requiredColumns.filter(col => !columnNames.includes(col));
          
          if (missingColumns.length > 0) {
            console.log('Missing columns in t_matches_final:', missingColumns);
            console.log('Using t_matches_live data only due to missing columns');
            // 必要な列が存在しない場合は、t_matches_liveのデータのみを使用
            matchesResult = await db.execute(`
              SELECT 
                ml.match_id,
                ml.match_block_id,
                ml.tournament_date,
                ml.match_number,
                ml.match_code,
                ml.team1_id,
                ml.team2_id,
                COALESCE(t1.team_name, ml.team1_display_name) as team1_display_name,
                COALESCE(t2.team_name, ml.team2_display_name) as team2_display_name,
                ml.court_number,
                ml.start_time,
                mb.phase,
                mb.display_round_name,
                mb.block_name,
                mb.match_type,
                mb.block_order,
                CASE WHEN ml.result_status = 'confirmed' THEN ml.team1_scores ELSE NULL END as team1_goals,
                CASE WHEN ml.result_status = 'confirmed' THEN ml.team2_scores ELSE NULL END as team2_goals,
                CASE WHEN ml.result_status = 'confirmed' THEN ml.winner_team_id ELSE NULL END as winner_team_id,
                CASE WHEN ml.result_status = 'confirmed' THEN ml.is_draw ELSE 0 END as is_draw,
                CASE WHEN ml.result_status = 'confirmed' THEN ml.is_walkover ELSE 0 END as is_walkover,
                ml.remarks,
                CASE WHEN ml.result_status = 'confirmed' THEN ml.updated_at ELSE NULL END as confirmed_at,
                COALESCE(ms.match_status, 'scheduled') as actual_match_status
              FROM t_matches_live ml
              INNER JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
              LEFT JOIN t_match_status ms ON ml.match_id = ms.match_id
              LEFT JOIN m_teams t1 ON ml.team1_id = t1.team_id
              LEFT JOIN m_teams t2 ON ml.team2_id = t2.team_id
              WHERE mb.tournament_id = ?
              ORDER BY mb.block_order ASC, ml.match_number ASC
            `, [tournamentId]);
          } else {
            // すべての必要な列が存在する場合はJOINクエリを実行
            console.log('All required columns exist, using JOIN query');
            matchesResult = await db.execute(`
              SELECT 
                ml.match_id,
                ml.match_block_id,
                ml.tournament_date,
                ml.match_number,
                ml.match_code,
                ml.team1_id,
                ml.team2_id,
                COALESCE(t1.team_name, ml.team1_display_name) as team1_display_name,
                COALESCE(t2.team_name, ml.team2_display_name) as team2_display_name,
                ml.court_number,
                ml.start_time,
                mb.phase,
                mb.display_round_name,
                mb.block_name,
                mb.match_type,
                mb.block_order,
                mf.team1_scores as team1_goals,
                mf.team2_scores as team2_goals,
                mf.winner_team_id,
                mf.is_draw,
                mf.is_walkover,
                COALESCE(mf.remarks, ml.remarks) as remarks,
                mf.updated_at as confirmed_at,
                COALESCE(ms.match_status, 'scheduled') as actual_match_status
              FROM t_matches_live ml
              INNER JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
              LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
              LEFT JOIN t_match_status ms ON ml.match_id = ms.match_id
              LEFT JOIN m_teams t1 ON ml.team1_id = t1.team_id
              LEFT JOIN m_teams t2 ON ml.team2_id = t2.team_id
              WHERE mb.tournament_id = ?
              ORDER BY mb.block_order ASC, ml.match_number ASC
            `, [tournamentId]);
          }
        }
      } catch (tableCheckError) {
        console.error('Table structure check failed:', tableCheckError);
        // テーブル構造チェックに失敗した場合は、t_matches_liveのみを使用
        console.log('Falling back to t_matches_live only query');
        matchesResult = await db.execute(`
          SELECT 
            ml.match_id,
            ml.match_block_id,
            ml.tournament_date,
            ml.match_number,
            ml.match_code,
            ml.team1_id,
            ml.team2_id,
            COALESCE(t1.team_name, ml.team1_display_name) as team1_display_name,
            COALESCE(t2.team_name, ml.team2_display_name) as team2_display_name,
            ml.court_number,
            ml.start_time,
            mb.phase,
            mb.display_round_name,
            mb.block_name,
            mb.match_type,
            mb.block_order,
            CASE WHEN ml.result_status = 'confirmed' THEN ml.team1_scores ELSE NULL END as team1_goals,
            CASE WHEN ml.result_status = 'confirmed' THEN ml.team2_scores ELSE NULL END as team2_goals,
            CASE WHEN ml.result_status = 'confirmed' THEN ml.winner_team_id ELSE NULL END as winner_team_id,
            CASE WHEN ml.result_status = 'confirmed' THEN ml.is_draw ELSE 0 END as is_draw,
            CASE WHEN ml.result_status = 'confirmed' THEN ml.is_walkover ELSE 0 END as is_walkover,
            ml.remarks,
            CASE WHEN ml.result_status = 'confirmed' THEN ml.updated_at ELSE NULL END as confirmed_at,
            COALESCE(ms.match_status, 'scheduled') as actual_match_status
          FROM t_matches_live ml
          INNER JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
          LEFT JOIN t_match_status ms ON ml.match_id = ms.match_id
          LEFT JOIN m_teams t1 ON ml.team1_id = t1.team_id
          LEFT JOIN m_teams t2 ON ml.team2_id = t2.team_id
          WHERE mb.tournament_id = ?
          ORDER BY mb.block_order ASC, ml.match_number ASC
        `, [tournamentId]);
      }
      
      console.log('Full query executed successfully, rows found:', matchesResult.rows.length);
      
    } catch (fullQueryError) {
      console.error('Full query error:', fullQueryError);
      throw fullQueryError;
    }

    console.log('Processing match data, total rows:', matchesResult.rows.length);
    
    const matches = [];
    
    for (let i = 0; i < matchesResult.rows.length; i++) {
      const row = matchesResult.rows[i];
      try {
        // 必須フィールドの存在チェック
        if (!row.match_id) {
          console.warn(`Row ${i}: Missing match_id, skipping`);
          continue;
        }
        
        const processedMatch = {
          match_id: Number(row.match_id),
          match_block_id: Number(row.match_block_id || 0),
          tournament_date: String(row.tournament_date || '2024-01-01'),
          match_number: Number(row.match_number || 0),
          match_code: String(row.match_code || `M${i + 1}`),
          team1_id: row.team1_id ? String(row.team1_id) : null,
          team2_id: row.team2_id ? String(row.team2_id) : null,
          team1_display_name: String(row.team1_display_name || 'チーム1'),
          team2_display_name: String(row.team2_display_name || 'チーム2'),
          court_number: row.court_number ? Number(row.court_number) : 1,
          start_time: row.start_time ? String(row.start_time) : '09:00',
          // ブロック情報
          phase: String(row.phase || 'preliminary'),
          display_round_name: String(row.display_round_name || '予選'),
          block_name: row.block_name ? String(row.block_name) : 'A',
          match_type: String(row.match_type || '通常'),
          block_order: Number(row.block_order || 1),
          // 結果情報
          team1_goals: row.team1_goals !== null && row.team1_goals !== undefined ? Number(row.team1_goals) : null,
          team2_goals: row.team2_goals !== null && row.team2_goals !== undefined ? Number(row.team2_goals) : null,
          winner_team_id: row.winner_team_id ? String(row.winner_team_id) : null,
          is_draw: Boolean(row.is_draw),
          is_walkover: Boolean(row.is_walkover),
          match_status: String(row.actual_match_status || 'scheduled'),
          result_status: row.confirmed_at ? 'confirmed' : ((row.team1_goals !== null && row.team1_goals !== undefined) ? 'pending' : 'none'),
          remarks: row.remarks ? String(row.remarks) : null,
          has_result: (row.team1_goals !== null && row.team1_goals !== undefined) && (row.team2_goals !== null && row.team2_goals !== undefined)
        };
        
        matches.push(processedMatch);
        
      } catch (mapError) {
        console.error(`Error processing row ${i}:`, mapError);
        console.error('Row data:', JSON.stringify(row, null, 2));
        // エラーが発生しても処理を続行
        continue;
      }
    }

    console.log('Successfully processed matches:', matches.length);
    
    return NextResponse.json({
      success: true,
      data: matches
    });

  } catch (error) {
    console.error('公開試合データ取得エラー:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack available');
    console.error('Tournament ID:', tournamentId);
    console.error('Full error object:', JSON.stringify(error, null, 2));
    
    return NextResponse.json(
      { 
        success: false, 
        error: '試合データの取得に失敗しました',
        details: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : 'No stack available',
        tournamentId: tournamentId
      },
      { status: 500 }
    );
  }
}