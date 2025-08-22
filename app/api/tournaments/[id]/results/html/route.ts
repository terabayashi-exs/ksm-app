import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTournamentResults } from '@/lib/match-results-calculator';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// テスト用：戦績表HTML生成API
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

    // 大会情報を取得
    const tournamentResult = await db.execute(`
      SELECT 
        t.tournament_name,
        v.venue_name,
        t.tournament_dates
      FROM t_tournaments t
      LEFT JOIN m_venues v ON t.venue_id = v.venue_id
      WHERE t.tournament_id = ?
    `, [tournamentId]);

    if (tournamentResult.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: '大会が見つかりません' },
        { status: 404 }
      );
    }

    const tournamentRow = tournamentResult.rows[0];
    const tournament = {
      tournament_name: tournamentRow.tournament_name as string,
      venue_name: tournamentRow.venue_name as string | undefined,
      tournament_dates: tournamentRow.tournament_dates as string | undefined
    };
    
    // 戦績表データを取得
    let blockResults;
    try {
      blockResults = await getTournamentResults(tournamentId);
    } catch {
      return NextResponse.json(
        { success: false, error: '戦績表データの取得に失敗しました' },
        { status: 500 }
      );
    }
    
    // 予選リーグのみをフィルタリング
    const preliminaryBlocks = blockResults.filter(block => 
      block.phase === 'preliminary' || block.phase.includes('予選') || block.phase.includes('リーグ')
    );

    if (preliminaryBlocks.length === 0) {
      return NextResponse.json(
        { success: false, error: '表示可能な戦績表がありません' },
        { status: 404 }
      );
    }

    // データ構造をHTML生成関数の期待する形式に変換
    const htmlBlockData = preliminaryBlocks.map(block => ({
      block_name: block.block_name,
      phase: block.phase,
      display_round_name: block.display_round_name,
      results: block.match_matrix as { [teamId: string]: { [opponentId: string]: { result: string; score: string; match_code: string } } },
      teams: block.teams // Keep the full team objects instead of just IDs
    }));

    // PDF用HTMLを生成（PDF APIと同じ関数を流用）
    const htmlContent = generateResultsHTML(tournament, htmlBlockData);

    return new NextResponse(htmlContent, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    });

  } catch (error) {
    console.error('HTML生成エラー:', error);
    return NextResponse.json(
      { success: false, error: 'HTMLの生成に失敗しました' },
      { status: 500 }
    );
  }
}

// PDF APIから同じ関数を再利用
function generateResultsHTML(tournament: { tournament_name: string; venue_name?: string; tournament_dates?: string }, blockResults: { block_name: string; phase: string; display_round_name: string; results: { [teamId: string]: { [opponentId: string]: { result: string; score: string; match_code: string } } }; teams: { team_id: string; team_name: string; team_omission?: string; }[] }[]): string {
  const tournamentName = String(tournament.tournament_name);
  const venueName = String(tournament.venue_name || '');
  
  // 日付のフォーマット
  let tournamentDate = '';
  try {
    const dates = JSON.parse(tournament.tournament_dates || '[]');
    if (dates.length > 0) {
      tournamentDate = new Date(dates[0]).toLocaleDateString('ja-JP');
    }
  } catch {
    tournamentDate = '';
  }

  // ブロック色の取得
  const getBlockColor = (blockName: string): string => {
    if (blockName.includes('A')) return '#3B82F6'; // blue
    if (blockName.includes('B')) return '#10B981'; // green  
    if (blockName.includes('C')) return '#F59E0B'; // yellow
    if (blockName.includes('D')) return '#8B5CF6'; // purple
    return '#6B7280'; // gray
  };

  // 結果の色分け
  const getResultColor = (result: string | null): string => {
    if (!result) return '#F3F4F6'; // gray-100
    
    if (result === 'win') return '#D1FAE5'; // green-100
    if (result === 'loss') return '#FEE2E2'; // red-100
    if (result === 'draw') return '#DBEAFE'; // blue-100
    
    return '#F3F4F6'; // gray-100
  };

  // 結果表示のフォーマット
  const formatResult = (result: string | null, score: string): string => {
    if (!score || score === '-') return score || '-';
    
    // スコアに含まれる記号で判定
    if (score.includes('〇')) return score;
    if (score.includes('●')) return score;
    if (score.includes('△')) return score;
    if (score.includes('不戦')) return score;
    
    return score;
  };

  return `
    <!DOCTYPE html>
    <html lang="ja">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>戦績表 - ${tournamentName}</title>
      <style>
        body {
          margin: 0;
          padding: 20px;
          font-family: 'Helvetica Neue', Arial, 'Hiragino Kaku Gothic ProN', 'Hiragino Sans', Meiryo, sans-serif;
          font-size: 12px;
          line-height: 1.4;
          color: #333;
          background: white;
        }
        
        .header {
          text-align: center;
          margin-bottom: 30px;
          border-bottom: 3px solid #2563EB;
          padding-bottom: 15px;
        }
        
        .tournament-title {
          font-size: 24px;
          font-weight: bold;
          color: #1F2937;
          margin-bottom: 8px;
        }
        
        .tournament-info {
          font-size: 14px;
          color: #6B7280;
          margin-bottom: 5px;
        }
        
        .block-section {
          margin-bottom: 40px;
          page-break-inside: avoid;
        }
        
        .block-header {
          display: flex;
          align-items: center;
          margin-bottom: 15px;
          padding: 10px;
          border-radius: 8px;
          background: #F8FAFC;
        }
        
        .block-title {
          font-size: 18px;
          font-weight: bold;
          color: white;
          padding: 8px 16px;
          border-radius: 6px;
          margin-right: 15px;
        }
        
        .block-info {
          font-size: 14px;
          color: #4B5563;
        }
        
        .results-table {
          width: 100%;
          border-collapse: collapse;
          border: 2px solid #E5E7EB;
          margin-bottom: 20px;
          background: white;
        }
        
        .results-table th,
        .results-table td {
          border: 1px solid #D1D5DB;
          padding: 8px;
          text-align: center;
          vertical-align: middle;
        }
        
        .results-table th {
          background: #F9FAFB;
          font-weight: bold;
          color: #374151;
          font-size: 11px;
        }
        
        .team-name-header {
          background: #F3F4F6 !important;
          width: 100px;
          font-weight: bold;
          text-align: left;
          padding-left: 12px;
        }
        
        .team-name-cell {
          background: #F9FAFB;
          font-weight: bold;
          text-align: left;
          padding-left: 12px;
          width: 100px;
        }
        
        .team-header-vertical {
          writing-mode: vertical-rl;
          text-orientation: mixed;
          height: 80px;
          width: 60px;
          font-size: 10px;
          font-weight: bold;
        }
        
        .match-result {
          font-weight: bold;
          font-size: 11px;
          min-width: 60px;
          height: 40px;
          line-height: 40px;
        }
        
        .same-team {
          background: #9CA3AF !important;
          color: #FFFFFF;
        }
        
        .legend {
          margin-top: 20px;
          padding: 15px;
          background: #F8FAFC;
          border-radius: 8px;
          border: 1px solid #E5E7EB;
        }
        
        .legend-title {
          font-weight: bold;
          margin-bottom: 10px;
          color: #374151;
        }
        
        .legend-items {
          display: flex;
          flex-wrap: wrap;
          gap: 20px;
        }
        
        .legend-item {
          display: flex;
          align-items: center;
          font-size: 11px;
        }
        
        .legend-symbol {
          width: 20px;
          height: 20px;
          margin-right: 8px;
          border-radius: 4px;
          border: 1px solid #D1D5DB;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          font-size: 10px;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="tournament-title">${tournamentName} 戦績表</div>
        ${venueName ? `<div class="tournament-info">会場: ${venueName}</div>` : ''}
        ${tournamentDate ? `<div class="tournament-info">開催日: ${tournamentDate}</div>` : ''}
        <div class="tournament-info">出力日時: ${new Date().toLocaleString('ja-JP')}</div>
      </div>

      ${blockResults.map(block => `
        <div class="block-section">
          <div class="block-header">
            <div class="block-title" style="background-color: ${getBlockColor(block.block_name)}">
              ${block.display_round_name || `${block.phase} ${block.block_name}ブロック`}
            </div>
            <div class="block-info">${block.teams.length}チーム参加</div>
          </div>
          
          <table class="results-table">
            <thead>
              <tr>
                <th class="team-name-header">チーム</th>
                ${block.teams.map(opponent => `
                  <th class="team-header-vertical">
                    ${(opponent.team_omission || opponent.team_name).substring(0, 8)}
                  </th>
                `).join('')}
              </tr>
            </thead>
            <tbody>
              ${block.teams.map(team => `
                <tr>
                  <td class="team-name-cell">
                    ${(team.team_omission || team.team_name).substring(0, 12)}
                  </td>
                  ${block.teams.map(opponent => {
                    if (team.team_id === opponent.team_id) {
                      return '<td class="match-result same-team">-</td>';
                    }
                    
                    const matchData = block.results[team.team_id]?.[opponent.team_id];
                    const result = matchData?.result || null;
                    const score = matchData?.score || '-';
                    const backgroundColor = getResultColor(result);
                    const formattedScore = formatResult(result, score);
                    
                    return `
                      <td class="match-result" style="background-color: ${backgroundColor}">
                        ${formattedScore}
                      </td>
                    `;
                  }).join('')}
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `).join('')}
      
      <div class="legend">
        <div class="legend-title">凡例</div>
        <div class="legend-items">
          <div class="legend-item">
            <div class="legend-symbol" style="background-color: #D1FAE5; color: #065F46;">〇</div>
            勝利 (例: 5〇4)
          </div>
          <div class="legend-item">
            <div class="legend-symbol" style="background-color: #FEE2E2; color: #991B1B;">●</div>
            敗北 (例: 4●5)
          </div>
          <div class="legend-item">
            <div class="legend-symbol" style="background-color: #DBEAFE; color: #1E40AF;">△</div>
            引分 (例: 2△2)
          </div>
          <div class="legend-item">
            <div class="legend-symbol" style="background-color: #F3F4F6; color: #374151;">A1</div>
            未実施 (試合コード)
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}