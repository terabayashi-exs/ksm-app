// app/api/tournaments/[id]/public-matches/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSportScoreConfig, getTournamentSportCode } from '@/lib/sport-standings-calculator';

// キャッシュを無効化
export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface RouteParams {
  params: Promise<{ id: string }>;
}

// 大会の公開用試合一覧を取得（認証不要）
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  console.log('API called with params:', params);
  console.log('Params type:', typeof params);
  
  let tournamentId: number = 0; // Initialize with default value
  
  try {
    // Next.js 15対応：paramsは常にPromise
    const resolvedParams = await params;
    
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
    
    tournamentId = parseInt(tournamentIdStr);
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
    
    // 組み合わせ作成状況を判定
    console.log('Checking team assignment status...');
    const teamAssignmentResult = await db.execute(`
      SELECT COUNT(*) as total_matches,
             COUNT(CASE WHEN team1_id IS NOT NULL AND team2_id IS NOT NULL THEN 1 END) as assigned_matches
      FROM t_matches_live ml
      INNER JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      WHERE mb.tournament_id = ?
    `, [tournamentId]);
    
    const teamAssignment = teamAssignmentResult.rows[0] as unknown as { total_matches: number; assigned_matches: number };
    const isTeamAssignmentComplete = teamAssignment.assigned_matches > 0;
    
    console.log(`Team assignment status: ${teamAssignment.assigned_matches}/${teamAssignment.total_matches} matches assigned`);
    console.log(`Is assignment complete: ${isTeamAssignmentComplete}`);

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
              ml.team1_display_name,
              ml.team2_display_name,
              ml.court_number,
              tc.court_name,
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
            LEFT JOIN t_tournament_courts tc ON mb.tournament_id = tc.tournament_id AND ml.court_number = tc.court_number AND tc.is_active = 1
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
            // 組み合わせ作成後は予選リーグのみフィルタリング（決勝トーナメントは常に表示）
            const teamFilter = isTeamAssignmentComplete ? 'AND (mb.phase = "final" OR (ml.team1_id IS NOT NULL AND ml.team2_id IS NOT NULL))' : '';
            matchesResult = await db.execute(`
              SELECT
                ml.match_id,
                ml.match_block_id,
                ml.tournament_date,
                ml.match_number,
                ml.match_code,
                ml.team1_id,
                ml.team2_id,
                CASE
                  WHEN ml.team1_tournament_team_id IS NOT NULL THEN COALESCE(tt1.team_omission, tt1.team_name, ml.team1_display_name)
                  WHEN mb.phase = 'final' AND ml.team1_id IS NOT NULL THEN COALESCE(t1.team_omission, t1.team_name, ml.team1_display_name)
                  ELSE ml.team1_display_name
                END as team1_display_name,
                CASE
                  WHEN ml.team2_tournament_team_id IS NOT NULL THEN COALESCE(tt2.team_omission, tt2.team_name, ml.team2_display_name)
                  WHEN mb.phase = 'final' AND ml.team2_id IS NOT NULL THEN COALESCE(t2.team_omission, t2.team_name, ml.team2_display_name)
                  ELSE ml.team2_display_name
                END as team2_display_name,
                ml.court_number,
                tc.court_name,
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
                COALESCE(ms.match_status, ml.match_status, 'scheduled') as actual_match_status,
                ml.cancellation_type
              FROM t_matches_live ml
              INNER JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
              LEFT JOIN t_match_status ms ON ml.match_id = ms.match_id
              LEFT JOIN t_tournament_courts tc ON mb.tournament_id = tc.tournament_id AND ml.court_number = tc.court_number AND tc.is_active = 1
              LEFT JOIN t_tournament_teams tt1 ON ml.team1_tournament_team_id = tt1.tournament_team_id
              LEFT JOIN t_tournament_teams tt2 ON ml.team2_tournament_team_id = tt2.tournament_team_id
              LEFT JOIN m_teams t1 ON ml.team1_id = t1.team_id
              LEFT JOIN m_teams t2 ON ml.team2_id = t2.team_id
              WHERE mb.tournament_id = ?
              ${teamFilter}
              ORDER BY mb.block_order ASC, ml.match_number ASC
            `, [tournamentId]);
          } else {
            // すべての必要な列が存在する場合はJOINクエリを実行
            console.log('All required columns exist, using JOIN query');
            // 組み合わせ作成後は予選リーグのみフィルタリング（決勝トーナメントは常に表示）
            const teamFilter = isTeamAssignmentComplete ? 'AND (mb.phase = "final" OR (ml.team1_id IS NOT NULL AND ml.team2_id IS NOT NULL))' : '';
            matchesResult = await db.execute(`
              SELECT
                ml.match_id,
                ml.match_block_id,
                ml.tournament_date,
                ml.match_number,
                ml.match_code,
                ml.team1_id,
                ml.team2_id,
                CASE
                  WHEN ml.team1_tournament_team_id IS NOT NULL THEN COALESCE(tt1.team_omission, tt1.team_name, ml.team1_display_name)
                  WHEN mb.phase = 'final' AND ml.team1_id IS NOT NULL THEN COALESCE(t1.team_omission, t1.team_name, ml.team1_display_name)
                  ELSE ml.team1_display_name
                END as team1_display_name,
                CASE
                  WHEN ml.team2_tournament_team_id IS NOT NULL THEN COALESCE(tt2.team_omission, tt2.team_name, ml.team2_display_name)
                  WHEN mb.phase = 'final' AND ml.team2_id IS NOT NULL THEN COALESCE(t2.team_omission, t2.team_name, ml.team2_display_name)
                  ELSE ml.team2_display_name
                END as team2_display_name,
                ml.court_number,
                tc.court_name,
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
                COALESCE(ms.match_status, ml.match_status, 'scheduled') as actual_match_status,
                ml.cancellation_type
              FROM t_matches_live ml
              INNER JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
              LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
              LEFT JOIN t_match_status ms ON ml.match_id = ms.match_id
              LEFT JOIN t_tournament_courts tc ON mb.tournament_id = tc.tournament_id AND ml.court_number = tc.court_number AND tc.is_active = 1
              LEFT JOIN t_tournament_teams tt1 ON ml.team1_tournament_team_id = tt1.tournament_team_id
              LEFT JOIN t_tournament_teams tt2 ON ml.team2_tournament_team_id = tt2.tournament_team_id
              LEFT JOIN m_teams t1 ON ml.team1_id = t1.team_id
              LEFT JOIN m_teams t2 ON ml.team2_id = t2.team_id
              WHERE mb.tournament_id = ?
              ${teamFilter}
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
            ml.team1_display_name,
            ml.team2_display_name,
            ml.court_number,
            tc.court_name,
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
            COALESCE(ms.match_status, ml.match_status, 'scheduled') as actual_match_status,
            ml.cancellation_type
          FROM t_matches_live ml
          INNER JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
          LEFT JOIN t_match_status ms ON ml.match_id = ms.match_id
          LEFT JOIN t_tournament_courts tc ON mb.tournament_id = tc.tournament_id AND ml.court_number = tc.court_number AND tc.is_active = 1
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
    
    // 競技設定を取得（PK戦考慮のため）
    let sportConfig = null;
    try {
      const sportCode = await getTournamentSportCode(tournamentId);
      sportConfig = getSportScoreConfig(sportCode);
    } catch (sportError) {
      console.warn('Failed to get sport config:', sportError);
    }
    
    // PK戦を考慮したスコア計算関数
    const calculateDisplayScore = (scoreData: string | number | bigint | ArrayBuffer | null | undefined) => {
      if (scoreData === null || scoreData === undefined) {
        return { goals: null, scoreDisplay: null };
      }

      // スコアを配列に変換
      let scores: number[] = [];
      
      // ArrayBufferの場合
      if (scoreData instanceof ArrayBuffer) {
        const decoder = new TextDecoder();
        const stringValue = decoder.decode(scoreData);
        if (stringValue.includes(',')) {
          scores = stringValue.split(',').map((s: string) => Number(s) || 0);
        } else {
          scores = [Number(stringValue) || 0];
        }
      }
      // bigintの場合
      else if (typeof scoreData === 'bigint') {
        scores = [Number(scoreData)];
      }
      // 文字列の場合
      else if (typeof scoreData === 'string' && scoreData.includes(',')) {
        scores = scoreData.split(',').map((s: string) => Number(s) || 0);
      } 
      // その他の場合
      else {
        scores = [Number(scoreData) || 0];
      }

      // サッカーでPK戦がある場合の特別処理
      if (sportConfig?.supports_pk && scores.length >= 5) {
        const regularTotal = scores.slice(0, 4).reduce((sum, score) => sum + score, 0);
        const pkTotal = scores.slice(4).reduce((sum, score) => sum + score, 0);

        // PK戦のスコアがある場合は分離表示用データを返す
        if (pkTotal > 0) {
          return {
            goals: regularTotal,
            pkGoals: pkTotal,
            scoreDisplay: null // フロントエンドで合成
          };
        }

        // PK戦がない場合は通常時間のスコアのみ
        return {
          goals: regularTotal,
          pkGoals: null,
          scoreDisplay: null
        };
      }

      // 通常の処理（PK戦がない場合またはサッカー以外）
      const total = scores.reduce((sum, score) => sum + score, 0);
      return {
        goals: total,
        pkGoals: null,
        scoreDisplay: null
      };
    };
    
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
          court_name: row.court_name ? String(row.court_name) : null,
          start_time: row.start_time ? String(row.start_time) : null,
          // ブロック情報
          phase: String(row.phase || 'preliminary'),
          display_round_name: String(row.display_round_name || '予選'),
          block_name: row.block_name ? String(row.block_name) : 'A',
          match_type: String(row.match_type || '通常'),
          block_order: Number(row.block_order || 1),
          // 結果情報（PK戦を考慮したスコア計算）
          ...(function() {
            const team1Score = calculateDisplayScore(row.team1_goals);
            const team2Score = calculateDisplayScore(row.team2_goals);
            
            return {
              team1_goals: team1Score.goals,
              team2_goals: team2Score.goals,
              team1_pk_goals: team1Score.pkGoals,
              team2_pk_goals: team2Score.pkGoals
            };
          })(),
          winner_team_id: row.winner_team_id ? String(row.winner_team_id) : null,
          is_draw: Boolean(row.is_draw),
          is_walkover: Boolean(row.is_walkover),
          match_status: String(row.actual_match_status || 'scheduled'),
          result_status: row.confirmed_at ? 'confirmed' : ((row.team1_goals !== null && row.team1_goals !== undefined) ? 'pending' : 'none'),
          remarks: row.remarks ? String(row.remarks) : null,
          has_result: (row.team1_goals !== null && row.team1_goals !== undefined) && (row.team2_goals !== null && row.team2_goals !== undefined),
          cancellation_type: row.cancellation_type ? String(row.cancellation_type) : null
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