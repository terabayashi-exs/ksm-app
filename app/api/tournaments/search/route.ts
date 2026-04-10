// app/api/tournaments/search/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  calculateTournamentStatus,
  formatTournamentPeriod,
  type TournamentStatus,
} from "@/lib/tournament-status";

export async function GET(request: NextRequest) {
  try {
    // まずデータベース接続をテスト
    try {
      await db.execute("SELECT 1");
    } catch (dbError) {
      console.error("データベース接続エラー:", dbError);
      return NextResponse.json(
        {
          success: false,
          error: "データベースに接続できませんでした",
          details: dbError instanceof Error ? dbError.message : "Database connection failed",
        },
        { status: 500 },
      );
    }

    const session = await auth();
    const teamId = session?.user?.role === "team" ? session.user.teamId : undefined;

    const { searchParams } = new URL(request.url);
    const year = searchParams.get("year");
    const month = searchParams.get("month");
    const day = searchParams.get("day");
    const tournamentName = searchParams.get("tournament_name");
    const statusFilter = searchParams.get("status") as TournamentStatus | null;
    const prefectureId = searchParams.get("prefecture_id");
    const organizerId = searchParams.get("organizer_id");
    const sportTypeId = searchParams.get("sport_type_id");
    const limit = searchParams.get("limit");
    const offset = searchParams.get("offset");

    // シンプルなクエリから始める
    let query = `
      SELECT
        t.tournament_id,
        t.tournament_name,
        t.status,
        t.tournament_dates,
        t.recruitment_start_date,
        t.recruitment_end_date,
        t.created_at,
        t.updated_at,
        t.team_count,
        t.visibility,
        t.created_by,
        t.venue_id as venue_id_json,
        t.group_id,
        COALESCE(t.format_name, '未設定') as format_name,
        tg.group_name,
        lu.logo_blob_url,
        COALESCE(lu.display_name, lu.organization_name) as organization_name,
        tg.login_user_id,
        t.sport_type_id,
        st.sport_code,
        0 as registered_teams
        ${teamId ? ", 0 as is_joined" : ", 0 as is_joined"}
      FROM t_tournaments t
      LEFT JOIN t_tournament_groups tg ON t.group_id = tg.group_id
      LEFT JOIN m_login_users lu ON tg.login_user_id = lu.login_user_id
      LEFT JOIN m_sport_types st ON t.sport_type_id = st.sport_type_id
    `;

    const params: (string | number)[] = [];

    const conditions: string[] = [];

    // 公開されている大会のみ（文字列値'open'をチェック）
    conditions.push("t.visibility = 'open'");

    // 大会名 OR チーム名の部分検索
    if (tournamentName) {
      conditions.push(`(t.tournament_name LIKE ? OR t.tournament_id IN (
        SELECT tt.tournament_id FROM t_tournament_teams tt
        WHERE tt.team_name LIKE ? AND tt.participation_status != 'cancelled'
      ))`);
      params.push(`%${tournamentName}%`, `%${tournamentName}%`);
    }

    // 主催者フィルタ（login_user_idで絞り込み）
    if (organizerId) {
      conditions.push("tg.login_user_id = ?");
      params.push(parseInt(organizerId));
    }

    // 競技種別フィルタ
    if (sportTypeId) {
      conditions.push("t.sport_type_id = ?");
      params.push(parseInt(sportTypeId));
    }

    // 都道府県フィルタ（会場の都道府県で絞り込み）
    if (prefectureId) {
      conditions.push(`t.tournament_id IN (
        SELECT t2.tournament_id FROM t_tournaments t2
        INNER JOIN m_venues v2 ON v2.venue_id IN (
          SELECT value FROM JSON_EACH(t2.venue_id)
        )
        WHERE v2.prefecture_id = ?
      )`);
      params.push(parseInt(prefectureId));
    }

    // 日付検索の実装
    if (year || month || day) {
      let dateCondition = "";

      if (year && month && day) {
        // 年月日が全て指定されている場合：その日に開催される大会
        const targetDate = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
        dateCondition = `JSON_EXTRACT(t.tournament_dates, '$."1"') = ? OR JSON_EXTRACT(t.tournament_dates, '$."2"') = ? OR JSON_EXTRACT(t.tournament_dates, '$."3"') = ?`;
        params.push(targetDate, targetDate, targetDate);
      } else if (year && month) {
        // 年月が指定されている場合：その月に開催される大会
        const startDate = `${year}-${month.padStart(2, "0")}-01`;
        const endDate = `${year}-${month.padStart(2, "0")}-31`;
        dateCondition = `
          (JSON_EXTRACT(t.tournament_dates, '$."1"') >= ? AND JSON_EXTRACT(t.tournament_dates, '$."1"') <= ?) OR
          (JSON_EXTRACT(t.tournament_dates, '$."2"') >= ? AND JSON_EXTRACT(t.tournament_dates, '$."2"') <= ?) OR
          (JSON_EXTRACT(t.tournament_dates, '$."3"') >= ? AND JSON_EXTRACT(t.tournament_dates, '$."3"') <= ?)
        `;
        params.push(startDate, endDate, startDate, endDate, startDate, endDate);
      } else if (year) {
        // 年のみが指定されている場合：その年に開催される大会
        const startDate = `${year}-01-01`;
        const endDate = `${year}-12-31`;
        dateCondition = `
          (JSON_EXTRACT(t.tournament_dates, '$."1"') >= ? AND JSON_EXTRACT(t.tournament_dates, '$."1"') <= ?) OR
          (JSON_EXTRACT(t.tournament_dates, '$."2"') >= ? AND JSON_EXTRACT(t.tournament_dates, '$."2"') <= ?) OR
          (JSON_EXTRACT(t.tournament_dates, '$."3"') >= ? AND JSON_EXTRACT(t.tournament_dates, '$."3"') <= ?)
        `;
        params.push(startDate, endDate, startDate, endDate, startDate, endDate);
      }

      if (dateCondition) {
        conditions.push(`(${dateCondition})`);
      }
    }

    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }

    // ORDER BY を追加（GROUP BYは不要）
    query += " ORDER BY t.created_at DESC";

    // ページネーション
    if (limit) {
      query += " LIMIT ?";
      params.push(parseInt(limit));

      if (offset) {
        query += " OFFSET ?";
        params.push(parseInt(offset));
      }
    }

    const result = await db.execute(query, params);

    // デバッグ: クエリと結果を確認
    if (result.rows.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          tournaments: [],
          pagination: {
            total: 0,
            limit: limit ? parseInt(limit) : null,
            offset: offset ? parseInt(offset) : 0,
            hasMore: false,
          },
        },
        debug: {
          query: query.replace(/\s+/g, " ").trim(),
          params,
          rowCount: result.rows.length,
        },
      });
    }

    // 競技種別アイコンマップ
    const sportCodeToIcon: Record<string, string> = {
      soccer: "⚽",
      baseball: "⚾",
      basketball: "🏀",
      volleyball: "🏐",
      futsal: "⚽",
      tennis: "🎾",
      badminton: "🏸",
      handball: "🤾",
      tabletennis: "🏓",
      pk: "🥅",
    };

    // 結果の整形（非同期ステータス計算付き）
    const allTournaments = await Promise.all(
      result.rows.map(async (row) => {
        const tournamentData = {
          status: String(row.status),
          tournament_dates: String(row.tournament_dates),
          recruitment_start_date: row.recruitment_start_date as string | null,
          recruitment_end_date: row.recruitment_end_date as string | null,
        };

        const calculatedStatus = await calculateTournamentStatus(
          tournamentData,
          Number(row.tournament_id),
        );
        let tournamentPeriod = formatTournamentPeriod(String(row.tournament_dates));

        // tournament_datesが空の場合、match_blocksの試合日程から期間を取得
        if (tournamentPeriod === "未設定") {
          try {
            const blockDatesResult = await db.execute(
              `
            SELECT DISTINCT ml.tournament_date
            FROM t_matches_live ml
            INNER JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
            WHERE mb.tournament_id = ?
            AND ml.tournament_date IS NOT NULL AND ml.tournament_date != ''
            ORDER BY ml.tournament_date
          `,
              [Number(row.tournament_id)],
            );
            const blockDates = blockDatesResult.rows
              .map((r) => String(r.tournament_date))
              .filter(Boolean)
              .sort();
            if (blockDates.length === 1) {
              tournamentPeriod = blockDates[0];
            } else if (blockDates.length > 1) {
              tournamentPeriod = `${blockDates[0]} - ${blockDates[blockDates.length - 1]}`;
            }
          } catch {
            /* ignore */
          }
        }

        // tournament_datesからevent_start_dateとevent_end_dateを計算
        let eventStartDate = "";
        let eventEndDate = "";

        if (row.tournament_dates) {
          try {
            const dates = JSON.parse(row.tournament_dates as string);
            const dateValues = Object.values(dates) as string[];
            const sortedDates = dateValues.filter(Boolean).sort();
            eventStartDate = sortedDates[0] || "";
            eventEndDate = sortedDates[sortedDates.length - 1] || "";
          } catch (error) {
            console.error("Error parsing tournament_dates:", error);
          }
        }

        // 全会場名を取得
        let venueNames = "未設定";
        if (row.venue_id_json) {
          try {
            const venueIds = JSON.parse(row.venue_id_json as string);
            if (Array.isArray(venueIds) && venueIds.length > 0) {
              const placeholders = venueIds.map(() => "?").join(",");
              const venueResult = await db.execute(
                `SELECT venue_name FROM m_venues WHERE venue_id IN (${placeholders}) ORDER BY venue_id`,
                venueIds,
              );
              const names = venueResult.rows.map((r) => String(r.venue_name)).filter(Boolean);
              if (names.length > 0) venueNames = names.join(" / ");
            }
          } catch {
            /* ignore */
          }
        }

        // 競技種別アイコン
        const sportIcon = row.sport_code ? sportCodeToIcon[String(row.sport_code)] || "🏆" : "🏆";

        return {
          tournament_id: Number(row.tournament_id),
          tournament_name: String(row.tournament_name),
          group_id: row.group_id ? Number(row.group_id) : null,
          group_name: row.group_name ? String(row.group_name) : null,
          status: calculatedStatus,
          format_name: row.format_name as string,
          venue_name: venueNames,
          sport_type_id: Number(row.sport_type_id),
          sport_icon: sportIcon,
          team_count: Number(row.team_count),
          is_public: row.visibility === "open",
          recruitment_start_date: row.recruitment_start_date as string,
          recruitment_end_date: row.recruitment_end_date as string,
          event_start_date: eventStartDate,
          event_end_date: eventEndDate,
          tournament_period: tournamentPeriod,
          created_at: String(row.created_at),
          created_by: row.created_by as string,
          logo_blob_url: row.logo_blob_url as string | null,
          organization_name: row.organization_name as string | null,
          is_joined: Boolean(row.is_joined),
        };
      }),
    );

    // ステータスフィルタリング（動的ステータスベース）
    const tournaments = statusFilter
      ? allTournaments.filter((tournament) => tournament.status === statusFilter)
      : allTournaments;

    // 総件数はフィルタリング後の結果から計算
    const total = tournaments.length;

    return NextResponse.json({
      success: true,
      data: {
        tournaments,
        pagination: {
          total,
          limit: limit ? parseInt(limit) : null,
          offset: offset ? parseInt(offset) : 0,
          hasMore: limit ? total > parseInt(offset || "0") + tournaments.length : false,
        },
      },
    });
  } catch (error) {
    console.error("一般用大会検索エラー:", error);

    // より詳細なエラー情報を提供
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error details:", { error, errorMessage });

    return NextResponse.json(
      {
        success: false,
        error: "大会データの取得に失敗しました",
        details: errorMessage,
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
