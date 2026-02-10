// app/api/tournaments/[id]/public-matches/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSportScoreConfig, getTournamentSportCode } from '@/lib/sport-standings-calculator';
import { parseScoreArray } from '@/lib/score-parser';

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

    // まず大会の存在確認（visibility条件なし）とformat_idを取得
    console.log('Checking tournament existence for ID:', tournamentId);
    const allTournamentsResult = await db.execute(`
      SELECT tournament_id, tournament_name, visibility, status, format_id FROM t_tournaments
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

    // visibility値の確認とformat_idの取得
    const tournament = allTournamentsResult.rows[0];
    const formatId = tournament.format_id ? Number(tournament.format_id) : null;
    console.log('Tournament visibility value:', tournament.visibility, 'type:', typeof tournament.visibility);
    console.log('Tournament format_id:', formatId);

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
              ml.team1_tournament_team_id,
              ml.team2_tournament_team_id,
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
              CASE WHEN ml.result_status = 'confirmed' THEN ml.winner_tournament_team_id ELSE NULL END as winner_tournament_team_id,
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
          const requiredColumns = ['team1_scores', 'team2_scores', 'winner_tournament_team_id', 'is_draw', 'is_walkover'];
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
                ml.team1_tournament_team_id,
                ml.team2_tournament_team_id,
                ml.team1_display_name as team1_display_name_raw,
                ml.team2_display_name as team2_display_name_raw,
                tt1.team_name as team1_real_name,
                tt1.team_omission as team1_real_omission,
                tt2.team_name as team2_real_name,
                tt2.team_omission as team2_real_omission,
                mt1.team_name as team1_master_name,
                mt1.team_omission as team1_master_omission,
                mt2.team_name as team2_master_name,
                mt2.team_omission as team2_master_omission,
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
                CASE WHEN ml.result_status = 'confirmed' THEN ml.winner_tournament_team_id ELSE NULL END as winner_tournament_team_id,
                CASE WHEN ml.result_status = 'confirmed' THEN ml.is_draw ELSE 0 END as is_draw,
                CASE WHEN ml.result_status = 'confirmed' THEN ml.is_walkover ELSE 0 END as is_walkover,
                ml.remarks,
                CASE WHEN ml.result_status = 'confirmed' THEN ml.updated_at ELSE NULL END as confirmed_at,
                COALESCE(ms.match_status, ml.match_status, 'scheduled') as actual_match_status,
                ml.cancellation_type,
                mt.is_bye_match,
                mt.team1_source,
                mt.team2_source
              FROM t_matches_live ml
              INNER JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
              LEFT JOIN m_match_templates mt ON mt.format_id = ? AND mt.match_code = ml.match_code AND mt.phase = mb.phase
              LEFT JOIN t_match_status ms ON ml.match_id = ms.match_id
              LEFT JOIN t_tournament_courts tc ON mb.tournament_id = tc.tournament_id AND ml.court_number = tc.court_number AND tc.is_active = 1
              LEFT JOIN t_tournament_teams tt1 ON ml.team1_tournament_team_id = tt1.tournament_team_id
              LEFT JOIN t_tournament_teams tt2 ON ml.team2_tournament_team_id = tt2.tournament_team_id
              LEFT JOIN m_teams mt1 ON tt1.team_id = mt1.team_id
              LEFT JOIN m_teams mt2 ON tt2.team_id = mt2.team_id
              WHERE mb.tournament_id = ?
              ORDER BY mb.block_order ASC, ml.match_number ASC
            `, [formatId, tournamentId]);
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
                ml.team1_tournament_team_id,
                ml.team2_tournament_team_id,
                ml.team1_display_name as team1_display_name_raw,
                ml.team2_display_name as team2_display_name_raw,
                tt1.team_name as team1_real_name,
                tt1.team_omission as team1_real_omission,
                tt2.team_name as team2_real_name,
                tt2.team_omission as team2_real_omission,
                mt1.team_name as team1_master_name,
                mt1.team_omission as team1_master_omission,
                mt2.team_name as team2_master_name,
                mt2.team_omission as team2_master_omission,
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
                mf.winner_tournament_team_id,
                mf.is_draw,
                mf.is_walkover,
                COALESCE(mf.remarks, ml.remarks) as remarks,
                mf.updated_at as confirmed_at,
                COALESCE(ms.match_status, ml.match_status, 'scheduled') as actual_match_status,
                ml.cancellation_type,
                mt.is_bye_match,
                mt.team1_source,
                mt.team2_source
              FROM t_matches_live ml
              INNER JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
              LEFT JOIN m_match_templates mt ON mt.format_id = ? AND mt.match_code = ml.match_code AND mt.phase = mb.phase
              LEFT JOIN t_matches_final mf ON ml.match_id = mf.match_id
              LEFT JOIN t_match_status ms ON ml.match_id = ms.match_id
              LEFT JOIN t_tournament_courts tc ON mb.tournament_id = tc.tournament_id AND ml.court_number = tc.court_number AND tc.is_active = 1
              LEFT JOIN t_tournament_teams tt1 ON ml.team1_tournament_team_id = tt1.tournament_team_id
              LEFT JOIN t_tournament_teams tt2 ON ml.team2_tournament_team_id = tt2.tournament_team_id
              LEFT JOIN m_teams mt1 ON tt1.team_id = mt1.team_id
              LEFT JOIN m_teams mt2 ON tt2.team_id = mt2.team_id
              WHERE mb.tournament_id = ?
              ORDER BY mb.block_order ASC, ml.match_number ASC
            `, [formatId, tournamentId]);
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
            ml.team1_tournament_team_id,
            ml.team2_tournament_team_id,
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
            CASE WHEN ml.result_status = 'confirmed' THEN ml.winner_tournament_team_id ELSE NULL END as winner_tournament_team_id,
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

    // BYE試合のためのチーム名解決マップを作成（マッチ処理前に準備）
    // ブロック名 + ポジション番号 → 実チーム名 のマップ（例: T-1 → ExsA）
    const blockPositionToTeamMap: Record<string, { block_name: string; team_name: string }> = {};

    // assigned_blockとblock_positionから実チーム名を取得してマップ化
    const teamBlockAssignments = await db.execute(`
      SELECT
        assigned_block,
        block_position,
        COALESCE(team_omission, team_name) as team_name
      FROM t_tournament_teams
      WHERE tournament_id = ? AND assigned_block IS NOT NULL AND block_position IS NOT NULL
    `, [tournamentId]);

    teamBlockAssignments.rows.forEach((row) => {
      const key = `${row.assigned_block}-${row.block_position}`;
      blockPositionToTeamMap[key] = {
        block_name: String(row.assigned_block),
        team_name: String(row.team_name)
      };
    });

    console.log('[public-matches] Block position to team map:', blockPositionToTeamMap);

    // プレースホルダー（例: "S1チーム"）からポジション番号を抽出
    const extractPosition = (displayName: string): number | null => {
      // "S1チーム", "T2チーム" などからポジション番号を抽出
      const match = displayName.match(/([A-Za-z]+)(\d+)チーム$/);
      return match ? parseInt(match[2]) : null;
    };

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

      // parseScoreArray()を使って全形式に対応
      const scores = parseScoreArray(scoreData);

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
        
        // チーム名の決定（略称を優先、なければ正式名称、なければプレースホルダーから解決）
        let team1DisplayName = String(
          row.team1_real_omission || row.team1_real_name ||
          row.team1_master_omission || row.team1_master_name ||
          row.team1_display_name_raw || 'チーム1'
        );
        let team2DisplayName = String(
          row.team2_real_omission || row.team2_real_name ||
          row.team2_master_omission || row.team2_master_name ||
          row.team2_display_name_raw || 'チーム2'
        );

        // プレースホルダーの場合、実チーム名に解決
        const blockName = row.block_name ? String(row.block_name) : null;

        if (!row.team1_real_name && !row.team1_master_name && row.team1_display_name_raw && blockName) {
          const position = extractPosition(String(row.team1_display_name_raw));
          if (position !== null) {
            const key = `${blockName}-${position}`;
            const teamData = blockPositionToTeamMap[key];
            if (teamData) {
              team1DisplayName = teamData.team_name;
              console.log(`[public-matches] Resolved team1: ${row.team1_display_name_raw} (block=${blockName}, pos=${position}) → ${teamData.team_name}`);
            }
          }
        }

        if (!row.team2_real_name && !row.team2_master_name && row.team2_display_name_raw && blockName) {
          const position = extractPosition(String(row.team2_display_name_raw));
          if (position !== null) {
            const key = `${blockName}-${position}`;
            const teamData = blockPositionToTeamMap[key];
            if (teamData) {
              team2DisplayName = teamData.team_name;
              console.log(`[public-matches] Resolved team2: ${row.team2_display_name_raw} (block=${blockName}, pos=${position}) → ${teamData.team_name}`);
            }
          }
        }

        const processedMatch = {
          match_id: Number(row.match_id),
          match_block_id: Number(row.match_block_id || 0),
          tournament_date: String(row.tournament_date || '2024-01-01'),
          match_number: Number(row.match_number || 0),
          match_code: String(row.match_code || `M${i + 1}`),
          team1_tournament_team_id: row.team1_tournament_team_id ? Number(row.team1_tournament_team_id) : null,
          team2_tournament_team_id: row.team2_tournament_team_id ? Number(row.team2_tournament_team_id) : null,
          team1_display_name: team1DisplayName,
          team2_display_name: team2DisplayName,
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
          winner_tournament_team_id: row.winner_tournament_team_id ? Number(row.winner_tournament_team_id) : null,
          is_draw: Boolean(row.is_draw),
          is_walkover: Boolean(row.is_walkover),
          match_status: String(row.actual_match_status || 'scheduled'),
          result_status: row.confirmed_at ? 'confirmed' : ((row.team1_goals !== null && row.team1_goals !== undefined) ? 'pending' : 'none'),
          remarks: row.remarks ? String(row.remarks) : null,
          has_result: (row.team1_goals !== null && row.team1_goals !== undefined) && (row.team2_goals !== null && row.team2_goals !== undefined),
          cancellation_type: row.cancellation_type ? String(row.cancellation_type) : null,
          // 不戦勝関連フィールド
          is_bye_match: row.is_bye_match ? Number(row.is_bye_match) : 0,
          team1_source: row.team1_source ? String(row.team1_source) : null,
          team2_source: row.team2_source ? String(row.team2_source) : null
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

    // 不戦勝試合から勝者を抽出（match_code → 勝者チーム名のマップを作成）
    // この時点で既にチーム名は実名に解決されているので、そのまま使用
    const byeMatchWinners: Record<string, string> = {};
    matches.forEach((m) => {
      if (m.is_bye_match === 1) {
        // 不戦勝試合の勝者を特定（空でない方のチーム）
        // 既に実チーム名に解決されている
        const winner = m.team1_display_name || m.team2_display_name;

        if (winner && m.match_code) {
          byeMatchWinners[`${m.match_code}_winner`] = winner;
          console.log(`[public-matches] 不戦勝勝者: ${m.match_code}_winner = ${winner}`);
        }
      }
    });

    console.log('[public-matches] 不戦勝マップ:', byeMatchWinners);

    // 不戦勝試合を除外
    let filteredMatches = matches.filter(match => match.is_bye_match !== 1);

    // 次の試合のteam1_display_name/team2_display_nameを解決
    filteredMatches = filteredMatches.map((m) => {
      const team1 = m.team1_display_name;
      const team2 = m.team2_display_name;

      // team1_sourceやteam2_sourceに基づいて、不戦勝の勝者を反映
      let resolvedTeam1 = team1;
      let resolvedTeam2 = team2;

      if (m.team1_source && byeMatchWinners[m.team1_source]) {
        resolvedTeam1 = byeMatchWinners[m.team1_source];
      }
      if (m.team2_source && byeMatchWinners[m.team2_source]) {
        resolvedTeam2 = byeMatchWinners[m.team2_source];
      }

      return {
        ...m,
        team1_display_name: resolvedTeam1,
        team2_display_name: resolvedTeam2
      };
    });

    console.log('Filtered matches (excluding bye matches):', filteredMatches.length);

    return NextResponse.json({
      success: true,
      data: filteredMatches
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