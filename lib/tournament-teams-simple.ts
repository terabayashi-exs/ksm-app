// lib/tournament-teams-simple.ts
import { db } from '@/lib/db';

export interface SimpleTournamentTeam {
  tournament_team_id: number;
  team_id: string;
  team_name: string;
  team_omission?: string;
  display_name: string;
  assigned_block?: string;
  block_position?: number;
  display_block?: string;  // 表示用ブロック名（決勝進出チームは1位リーグ等、予選チームはassigned_block）
  contact_person: string;
  contact_email: string;
  contact_phone?: string;
  player_count: number;
}

export interface SimpleTournamentTeamsData {
  tournament_id: number;
  tournament_name: string;
  teams: SimpleTournamentTeam[];
  total_teams: number;
  total_players: number;
}

/**
 * 決勝フェーズのチームを試合データから正しい順序で取得する
 */
async function getFinalPhaseTeamsInOrder(tournamentId: number): Promise<Map<string, { order: number; leagueName: string }>> {
  const teamOrderMap = new Map<string, { order: number; leagueName: string }>();

  try {
    // 大会のフォーマットIDを取得
    const formatResult = await db.execute({
      sql: `SELECT format_id FROM t_tournaments WHERE tournament_id = ?`,
      args: [tournamentId]
    });

    if (formatResult.rows.length === 0) {
      return teamOrderMap;
    }

    const formatId = formatResult.rows[0].format_id as number;

    // 決勝フェーズのテンプレートからチーム順序を取得
    const templateResult = await db.execute({
      sql: `
        SELECT
          mt.match_code,
          mt.round_name,
          mt.team1_source,
          mt.team2_source
        FROM m_match_templates mt
        WHERE mt.format_id = ? AND mt.phase = 'final'
        ORDER BY mt.match_number
      `,
      args: [formatId]
    });

    // チームソースと順序のマッピングを構築（例: A_1 → {round: "1位リーグ", position: 1}）
    const sourceOrderMap = new Map<string, { round: string; position: number }>();

    // round_nameの出現順序を記録（汎用的な順序決定のため）
    const roundOrderMap = new Map<string, number>();
    let currentRoundOrder = 0;

    templateResult.rows.forEach(row => {
      const roundName = row.round_name as string;
      const team1Source = row.team1_source as string;
      const team2Source = row.team2_source as string;

      // round_nameが初めて出現した場合、順序を割り当て
      if (roundName && !roundOrderMap.has(roundName)) {
        roundOrderMap.set(roundName, currentRoundOrder++);
      }

      const assignSource = (source: string) => {
        if (source && source.match(/^[A-Z]_\d+$/)) {
          const [block] = source.split('_');
          // A=1, B=2, C=3, D=4, E=5, F=6
          const position = block.charCodeAt(0) - 'A'.charCodeAt(0) + 1;

          if (!sourceOrderMap.has(source)) {
            sourceOrderMap.set(source, {
              round: roundName,
              position: position
            });
          }
        }
      };

      assignSource(team1Source);
      assignSource(team2Source);
    });

    // 決勝フェーズの試合から実際のチームIDを取得
    const matchesResult = await db.execute({
      sql: `
        SELECT DISTINCT
          ml.match_code,
          ml.team1_id,
          ml.team2_id
        FROM t_matches_live ml
        INNER JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
        WHERE mb.tournament_id = ? AND mb.phase = 'final'
      `,
      args: [tournamentId]
    });

    // テンプレートとマッチングしてチームIDに順序を割り当て
    for (const match of matchesResult.rows) {
      const template = templateResult.rows.find(t => t.match_code === match.match_code);
      if (template) {
        const team1Source = template.team1_source as string;
        const team2Source = template.team2_source as string;
        const team1Id = match.team1_id as string | null;
        const team2Id = match.team2_id as string | null;

        if (team1Id && team1Source && sourceOrderMap.has(team1Source)) {
          const order = sourceOrderMap.get(team1Source)!;
          // ラウンド別 + 位置別の順序（出現順序に基づく汎用的な計算）
          const roundOrder = roundOrderMap.get(order.round) || 0;
          const roundBase = (roundOrder + 1) * 1000;
          const leagueName = order.round; // round_nameをそのまま使用
          teamOrderMap.set(team1Id, { order: roundBase + order.position, leagueName });
        }

        if (team2Id && team2Source && sourceOrderMap.has(team2Source)) {
          const order = sourceOrderMap.get(team2Source)!;
          // ラウンド別 + 位置別の順序（出現順序に基づく汎用的な計算）
          const roundOrder = roundOrderMap.get(order.round) || 0;
          const roundBase = (roundOrder + 1) * 1000;
          const leagueName = order.round; // round_nameをそのまま使用
          teamOrderMap.set(team2Id, { order: roundBase + order.position, leagueName });
        }
      }
    }

  } catch (error) {
    console.error('決勝チーム順序取得エラー:', error);
  }

  return teamOrderMap;
}

/**
 * 大会の参加チーム情報を簡単に取得する
 */
export async function getSimpleTournamentTeams(tournamentId: number): Promise<SimpleTournamentTeamsData> {
  try {
    console.log('getSimpleTournamentTeams called with ID:', tournamentId);

    // 大会情報を取得
    const tournamentResult = await db.execute({
      sql: 'SELECT tournament_name FROM t_tournaments WHERE tournament_id = ?',
      args: [tournamentId]
    });

    if (!tournamentResult.rows || tournamentResult.rows.length === 0) {
      throw new Error('大会が見つかりません');
    }

    const tournamentName = tournamentResult.rows[0].tournament_name as string;
    console.log('Tournament found:', tournamentName);

    // 決勝フェーズのチーム順序マップを取得
    const finalTeamOrderMap = await getFinalPhaseTeamsInOrder(tournamentId);

    // 参加チーム一覧を取得
    const teamsResult = await db.execute({
      sql: `
        SELECT
          tt.tournament_team_id,
          tt.team_id,
          tt.assigned_block,
          tt.block_position,
          COALESCE(tt.team_name, t.team_name) as team_name,
          COALESCE(tt.team_omission, t.team_omission) as team_omission,
          t.contact_person,
          t.contact_email,
          t.contact_phone
        FROM t_tournament_teams tt
        JOIN m_teams t ON tt.team_id = t.team_id
        WHERE tt.tournament_id = ?
      `,
      args: [tournamentId]
    });

    console.log('Teams found:', teamsResult.rows?.length || 0);

    const teams: SimpleTournamentTeam[] = [];
    let totalPlayers = 0;

    if (teamsResult.rows && teamsResult.rows.length > 0) {
      for (const teamRow of teamsResult.rows) {
        // 各チームの選手数を取得（tournament_team_idを使用して特定のエントリーの選手のみカウント）
        const playerCountResult = await db.execute({
          sql: `
            SELECT COUNT(*) as player_count
            FROM t_tournament_players tp
            WHERE tp.tournament_team_id = ?
            AND tp.player_status = 'active'
          `,
          args: [teamRow.tournament_team_id]
        });

        const playerCount = (playerCountResult.rows?.[0]?.player_count as number) || 0;
        totalPlayers += playerCount;

        // 決勝進出チームの場合は表示用ブロック名を設定
        const finalOrderInfo = finalTeamOrderMap.get(teamRow.team_id as string);
        const displayBlock = finalOrderInfo
          ? finalOrderInfo.leagueName
          : (teamRow.assigned_block ? String(teamRow.assigned_block) : undefined);

        teams.push({
          tournament_team_id: teamRow.tournament_team_id as number,
          team_id: teamRow.team_id as string,
          team_name: teamRow.team_name as string,
          team_omission: teamRow.team_omission ? String(teamRow.team_omission) : undefined,
          display_name: (teamRow.team_omission ? String(teamRow.team_omission) : String(teamRow.team_name)),
          assigned_block: teamRow.assigned_block ? String(teamRow.assigned_block) : undefined,
          block_position: teamRow.block_position ? Number(teamRow.block_position) : undefined,
          display_block: displayBlock,
          contact_person: teamRow.contact_person as string,
          contact_email: teamRow.contact_email as string,
          contact_phone: teamRow.contact_phone ? String(teamRow.contact_phone) : undefined,
          player_count: playerCount
        });
      }

      // ソート: 決勝進出チームは動的順序、それ以外は予選ブロック順
      teams.sort((a, b) => {
        const aFinalOrderInfo = finalTeamOrderMap.get(a.team_id);
        const bFinalOrderInfo = finalTeamOrderMap.get(b.team_id);

        // 両方とも決勝進出チームの場合
        if (aFinalOrderInfo !== undefined && bFinalOrderInfo !== undefined) {
          const result = aFinalOrderInfo.order - bFinalOrderInfo.order;
          console.log(`[SORT] ${a.display_name} (${aFinalOrderInfo.order}) vs ${b.display_name} (${bFinalOrderInfo.order}) = ${result}`);
          return result;
        }

        // aのみ決勝進出チームの場合（決勝チームを前に）
        if (aFinalOrderInfo !== undefined) {
          return -1;
        }

        // bのみ決勝進出チームの場合（決勝チームを前に）
        if (bFinalOrderInfo !== undefined) {
          return 1;
        }

        // 両方とも予選のみのチームの場合、assigned_blockとblock_positionでソート
        const aBlock = a.assigned_block || '';
        const bBlock = b.assigned_block || '';

        if (aBlock !== bBlock) {
          return aBlock.localeCompare(bBlock);
        }

        const aPos = a.block_position || 999;
        const bPos = b.block_position || 999;

        if (aPos !== bPos) {
          return aPos - bPos;
        }

        return a.team_name.localeCompare(b.team_name, 'ja');
      });

      // ソート後の順序を確認
      console.log('\n=== ソート後のチーム順序 ===');
      teams.forEach((team, index) => {
        const finalOrderInfo = finalTeamOrderMap.get(team.team_id);
        console.log(`${index + 1}. ${team.display_name} (display_block: ${team.display_block}, order: ${finalOrderInfo?.order || 'N/A'})`);
      });
    }

    console.log('Result compiled:', { teams: teams.length, totalPlayers });

    return {
      tournament_id: tournamentId,
      tournament_name: tournamentName,
      teams,
      total_teams: teams.length,
      total_players: totalPlayers
    };

  } catch (error) {
    console.error('getSimpleTournamentTeams error:', error);
    throw error;
  }
}