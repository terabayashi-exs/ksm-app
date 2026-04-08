import jwt from "jsonwebtoken";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

import { SPORT_RULE_CONFIGS } from "@/lib/tournament-rules";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const tournamentId = parseInt(id);

    // クエリパラメータから試合ステータスフィルターを取得
    const { searchParams } = new URL(request.url);
    const includeCompleted = searchParams.get("includeCompleted") === "true";

    // 試合ステータスの条件を動的に構築
    const statusCondition = includeCompleted
      ? "ml.match_status IN ('scheduled', 'ongoing', 'completed')"
      : "ml.match_status IN ('scheduled', 'ongoing')";

    // 大会の存在確認
    const tournamentResult = await db.execute(
      `
      SELECT tournament_id FROM t_tournaments WHERE tournament_id = ?
    `,
      [tournamentId],
    );

    if (tournamentResult.rows.length === 0) {
      return NextResponse.json({ error: "大会が見つかりません" }, { status: 404 });
    }

    // 競技種別とルール情報を取得（ピリオド名表示用）
    const sportResult = await db.execute(
      `
      SELECT st.sport_code
      FROM t_tournaments t
      INNER JOIN m_sport_types st ON t.sport_type_id = st.sport_type_id
      WHERE t.tournament_id = ?
    `,
      [tournamentId],
    );
    const sportCode = sportResult.rows.length > 0 ? String(sportResult.rows[0].sport_code) : "pk";
    const sportConfig = SPORT_RULE_CONFIGS[sportCode];

    // フェーズ別のルール設定を取得（active_periodsからピリオド名リストを生成）
    const rulesResult = await db.execute(
      `
      SELECT phase, active_periods FROM t_tournament_rules WHERE tournament_id = ?
    `,
      [tournamentId],
    );
    const phasePeriodsMap: Record<string, string[]> = {};
    rulesResult.rows.forEach((row) => {
      const phase = String(row.phase);
      try {
        const activePeriodNums: number[] = JSON.parse(String(row.active_periods || "[]")).map(
          Number,
        );
        const periodNames = activePeriodNums
          .map(
            (num) =>
              sportConfig?.default_periods.find((p) => p.period_number === num)?.period_name ||
              `P${num}`,
          )
          .filter(Boolean);
        phasePeriodsMap[phase] = periodNames;
      } catch {
        phasePeriodsMap[phase] = [];
      }
    });

    // 試合一覧を取得（BYE試合を除外）
    const matchesResult = await db.execute(
      `
      SELECT
        ml.match_id,
        ml.match_code,
        ml.court_number,
        ml.court_name,
        ml.start_time,
        ml.tournament_date,
        ml.match_status,
        ml.team1_display_name,
        ml.team2_display_name,
        ml.venue_name,
        ml.matchday,
        mb.match_block_id,
        mb.block_name,
        mb.phase,
        mb.display_round_name,
        ml.round_name,
        tt1.team_name as team1_real_name,
        tt2.team_name as team2_real_name,
        tt1.team_omission as team1_real_omission,
        tt2.team_omission as team2_real_omission,
        ml.is_bye_match,
        ml.team1_source,
        ml.team2_source
      FROM t_matches_live ml
      JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      LEFT JOIN t_tournament_teams tt1 ON ml.team1_tournament_team_id = tt1.tournament_team_id
      LEFT JOIN t_tournament_teams tt2 ON ml.team2_tournament_team_id = tt2.tournament_team_id
      WHERE mb.tournament_id = ?
      AND ${statusCondition}
      AND (ml.is_bye_match IS NULL OR ml.is_bye_match != 1)
      AND (ml.match_type IS NULL OR ml.match_type != 'FM')
      ORDER BY mb.match_block_id, ml.tournament_date, ml.start_time, ml.match_code
    `,
      [tournamentId],
    );

    // BYE試合でチーム名が取得できない場合、プレースホルダーから実チーム名を解決するためのマップを作成
    const blockPositionToTeamMap: Record<
      string,
      { block_name: string; team_name: string; team_omission: string }
    > = {};

    // assigned_blockとblock_positionから実チーム名を取得してマップ化
    const teamBlockAssignments = await db.execute(
      `
      SELECT
        assigned_block,
        block_position,
        team_name,
        COALESCE(team_omission, team_name) as team_omission
      FROM t_tournament_teams
      WHERE tournament_id = ? AND assigned_block IS NOT NULL AND block_position IS NOT NULL
    `,
      [tournamentId],
    );

    teamBlockAssignments.rows.forEach((row) => {
      const key = `${row.assigned_block}-${row.block_position}`;
      blockPositionToTeamMap[key] = {
        block_name: String(row.assigned_block),
        team_name: String(row.team_name),
        team_omission: String(row.team_omission),
      };
    });

    console.log("[QR-List API] Block position to team map:", blockPositionToTeamMap);

    // プレースホルダー（例: "S1チーム"）からポジション番号を抽出
    const extractPosition = (displayName: string): number | null => {
      const match = String(displayName || "").match(/([A-Za-z]+)(\d+)チーム$/);
      return match ? parseInt(match[2]) : null;
    };

    // BYE試合の勝者をマップに保存
    const byeMatchWinners: Record<string, { name: string; omission: string }> = {};

    // まずBYE試合を処理（is_bye_match=1の試合は既にフィルタで除外されているが、念のため別途取得）
    const byeMatchesResult = await db.execute(
      `
      SELECT
        ml.match_code,
        ml.team1_display_name,
        ml.team2_display_name,
        mb.block_name,
        tt1.team_name as team1_real_name,
        tt2.team_name as team2_real_name,
        tt1.team_omission as team1_real_omission,
        tt2.team_omission as team2_real_omission,
        ml.team1_source,
        ml.team2_source
      FROM t_matches_live ml
      JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      LEFT JOIN t_tournament_teams tt1 ON ml.team1_tournament_team_id = tt1.tournament_team_id
      LEFT JOIN t_tournament_teams tt2 ON ml.team2_tournament_team_id = tt2.tournament_team_id
      WHERE mb.tournament_id = ? AND ml.is_bye_match = 1
    `,
      [tournamentId],
    );

    byeMatchesResult.rows.forEach((m) => {
      // BYE試合の勝者を特定（空でない方のチーム）
      let winnerName = "";
      let winnerOmission = "";

      if (m.team1_real_name) {
        winnerName = String(m.team1_real_name);
        winnerOmission = String(m.team1_real_omission || m.team1_real_name);
      } else if (m.team2_real_name) {
        winnerName = String(m.team2_real_name);
        winnerOmission = String(m.team2_real_omission || m.team2_real_name);
      } else {
        // tournament_team_idがない場合、display_nameから解決
        const team1Position = m.team1_display_name
          ? extractPosition(String(m.team1_display_name))
          : null;
        const team2Position = m.team2_display_name
          ? extractPosition(String(m.team2_display_name))
          : null;

        if (team1Position !== null && m.block_name) {
          const key = `${m.block_name}-${team1Position}`;
          const teamData = blockPositionToTeamMap[key];
          if (teamData) {
            winnerName = teamData.team_name;
            winnerOmission = teamData.team_omission;
          }
        } else if (team2Position !== null && m.block_name) {
          const key = `${m.block_name}-${team2Position}`;
          const teamData = blockPositionToTeamMap[key];
          if (teamData) {
            winnerName = teamData.team_name;
            winnerOmission = teamData.team_omission;
          }
        }
      }

      if (winnerName && m.match_code) {
        byeMatchWinners[`${m.match_code}_winner`] = { name: winnerName, omission: winnerOmission };
        console.log(`[QR-List] BYE match winner: ${m.match_code} → ${winnerOmission}`);
      }
    });

    // 各試合のQRコード用トークンとURLを生成
    const now = new Date();
    const validFrom = new Date(now.getTime() - 60 * 60 * 1000); // 1時間前から有効
    const validUntil = new Date(now.getTime() + 48 * 60 * 60 * 1000); // 48時間後まで有効

    const matches = matchesResult.rows.map((match) => {
      // team1の解決
      let resolvedTeam1Name = String(match.team1_real_name || match.team1_display_name || "");
      let resolvedTeam1Omission = String(
        match.team1_real_omission || match.team1_display_name || "",
      );

      // team1_real_nameがない場合、プレースホルダーから実チーム名に変換
      if (!match.team1_real_name && match.team1_display_name && match.block_name) {
        const position = extractPosition(String(match.team1_display_name));
        if (position !== null) {
          const key = `${match.block_name}-${position}`;
          const teamData = blockPositionToTeamMap[key];
          if (teamData) {
            resolvedTeam1Name = teamData.team_name;
            resolvedTeam1Omission = teamData.team_omission;
            console.log(
              `[QR-List] Resolved team1: ${match.team1_display_name} (block=${match.block_name}, pos=${position}) → ${teamData.team_omission}`,
            );
          }
        }
      }

      // team1_sourceに基づいてBYE試合の勝者を反映
      const team1Source = match.team1_source as string | null;
      if (team1Source && byeMatchWinners[team1Source]) {
        resolvedTeam1Name = byeMatchWinners[team1Source].name;
        resolvedTeam1Omission = byeMatchWinners[team1Source].omission;
        console.log(`[QR-List] Resolved team1 from BYE: ${team1Source} → ${resolvedTeam1Omission}`);
      }

      // team2の解決
      let resolvedTeam2Name = String(match.team2_real_name || match.team2_display_name || "");
      let resolvedTeam2Omission = String(
        match.team2_real_omission || match.team2_display_name || "",
      );

      // team2_real_nameがない場合、プレースホルダーから実チーム名に変換
      if (!match.team2_real_name && match.team2_display_name && match.block_name) {
        const position = extractPosition(String(match.team2_display_name));
        if (position !== null) {
          const key = `${match.block_name}-${position}`;
          const teamData = blockPositionToTeamMap[key];
          if (teamData) {
            resolvedTeam2Name = teamData.team_name;
            resolvedTeam2Omission = teamData.team_omission;
            console.log(
              `[QR-List] Resolved team2: ${match.team2_display_name} (block=${match.block_name}, pos=${position}) → ${teamData.team_omission}`,
            );
          }
        }
      }

      // team2_sourceに基づいてBYE試合の勝者を反映
      const team2Source = match.team2_source as string | null;
      if (team2Source && byeMatchWinners[team2Source]) {
        resolvedTeam2Name = byeMatchWinners[team2Source].name;
        resolvedTeam2Omission = byeMatchWinners[team2Source].omission;
        console.log(`[QR-List] Resolved team2 from BYE: ${team2Source} → ${resolvedTeam2Omission}`);
      }

      // JWTトークン生成
      const payload = {
        match_id: match.match_id,
        match_code: match.match_code,
        tournament_id: tournamentId,
        iat: Math.floor(now.getTime() / 1000),
        nbf: Math.floor(validFrom.getTime() / 1000),
        exp: Math.floor(validUntil.getTime() / 1000),
      };

      const token = jwt.sign(payload, process.env.NEXTAUTH_SECRET || "fallback-secret", {
        algorithm: "HS256",
      });

      // 審判用URLを生成（QRコード経由であることを示すパラメータを追加）
      const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
      const refereeUrl = `${baseUrl}/referee/match/${match.match_id}?token=${token}&from=qr`;

      // QRコード画像URLを生成
      const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(refereeUrl)}`;

      // コート表示名を取得
      const courtNumber = match.court_number as number;
      const courtName = match.court_name
        ? String(match.court_name)
        : courtNumber
          ? `コート${courtNumber}`
          : "";

      // 会場表示の構築
      const venueName = match.venue_name ? String(match.venue_name) : null;
      const hasMatchday = match.matchday !== null && match.matchday !== undefined;

      // コート/会場表示ロジック
      // 節ありの場合: コート名があれば括弧付きで表示
      // 節なしの場合: コート名のみ
      let locationDisplay: string;
      if (hasMatchday) {
        if (
          venueName &&
          courtName &&
          courtName !== String(courtNumber) &&
          courtName !== venueName
        ) {
          locationDisplay = `${venueName}(${courtName})`;
        } else if (venueName) {
          locationDisplay = venueName;
        } else {
          locationDisplay = courtName;
        }
      } else {
        locationDisplay = courtName;
      }

      // フェーズに対応するピリオド名リスト
      const matchPhase = String(match.phase);
      const periodLabels = phasePeriodsMap[matchPhase] || [];

      return {
        match_id: match.match_id,
        match_code: match.match_code,
        match_block_id: match.match_block_id,
        court_number: match.court_number,
        court_name: courtName,
        location_display: locationDisplay,
        start_time:
          typeof match.start_time === "string" ? match.start_time.substring(0, 5) : "--:--",
        tournament_date: match.tournament_date || "",
        match_status: match.match_status,
        block_name: match.block_name,
        phase: match.phase,
        phase_name: match.display_round_name
          ? String(match.display_round_name)
          : String(match.phase),
        round_name: match.round_name ? String(match.round_name) : null,
        team1_name: resolvedTeam1Name,
        team2_name: resolvedTeam2Name,
        team1_omission: resolvedTeam1Omission,
        team2_omission: resolvedTeam2Omission,
        referee_url: refereeUrl,
        qr_image_url: qrImageUrl,
        venue_name: venueName,
        matchday: match.matchday ? Number(match.matchday) : null,
        period_labels: periodLabels,
      };
    });

    return NextResponse.json({
      success: true,
      matches,
      total: matches.length,
      validity: {
        validFrom: validFrom.toISOString(),
        validUntil: validUntil.toISOString(),
      },
    });
  } catch (error) {
    console.error("QR一覧取得エラー:", error);
    return NextResponse.json({ error: "QRコード一覧の取得に失敗しました" }, { status: 500 });
  }
}
