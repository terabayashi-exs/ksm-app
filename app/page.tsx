// app/page.tsx
import { auth } from "@/lib/auth";
import Footer from "@/components/layout/Footer";
import InitialFooterBanner from "@/components/layout/InitialFooterBanner";
import TopNavBar from "@/components/layout/TopNavBar";
import AnnouncementList from "@/components/features/announcements/AnnouncementList";
import TournamentSearchSection from "@/components/features/top/TournamentSearchSection";
import { LiveDashboard } from "@/components/features/top/LiveDashboard";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import Image from "next/image";
import {
  Trophy, ArrowRight,
  Smartphone, Zap, Megaphone, BarChart3, DollarSign
} from "lucide-react";
import { fetchGroupedPublicTournaments, CategorizedTournaments } from "@/lib/public-tournaments";
import { db } from "@/lib/db";
import { calculateTournamentStatus, formatTournamentPeriod } from "@/lib/tournament-status";

async function fetchSportTypes() {
  try {
    const result = await db.execute(`
      SELECT sport_type_id, sport_name, sport_code
      FROM m_sport_types
      ORDER BY sport_type_id
    `);
    const sportCodeToIcon: Record<string, string> = {
      soccer: '⚽', baseball: '⚾', basketball: '🏀', volleyball: '🏐',
      futsal: '⚽', tennis: '🎾', badminton: '🏸', handball: '🤾',
      tabletennis: '🏓', pk: '🥅',
    };
    const sportNameShort: Record<string, string> = {
      'バスケットボール': 'バスケ',
      'バレーボール': 'バレー',
    };
    return result.rows.map(row => {
      const name = String(row.sport_name);
      return {
        sport_type_id: Number(row.sport_type_id),
        sport_type_name: sportNameShort[name] || name,
        icon: sportCodeToIcon[String(row.sport_code)] || '🏆',
      };
    });
  } catch {
    return [];
  }
}

async function fetchFeaturedOrganizers() {
  try {
    const result = await db.execute(`
      SELECT
        lu.login_user_id,
        lu.organization_name,
        lu.logo_blob_url,
        COUNT(DISTINCT tg.group_id) as group_count,
        COUNT(DISTINCT CASE WHEN t.status = 'ongoing' THEN t.tournament_id END) as ongoing_count,
        COUNT(DISTINCT CASE WHEN t.visibility = 'open' THEN t.tournament_id END) as open_count
      FROM m_login_users lu
      INNER JOIN t_tournament_groups tg ON tg.login_user_id = lu.login_user_id
      INNER JOIN t_tournaments t ON t.group_id = tg.group_id
      WHERE lu.organization_name IS NOT NULL
        AND lu.organization_name != ''
        AND tg.visibility = 'open'
      GROUP BY lu.login_user_id
      HAVING open_count > 0
      ORDER BY ongoing_count DESC, open_count DESC
      LIMIT 8
    `);
    return result.rows.map(row => ({
      login_user_id: Number(row.login_user_id),
      organization_name: String(row.organization_name),
      logo_blob_url: row.logo_blob_url as string | null,
      group_count: Number(row.group_count),
      ongoing_count: Number(row.ongoing_count),
      open_count: Number(row.open_count),
    }));
  } catch {
    return [];
  }
}

/** 動的ステータスで開催中と判定された大会IDリストからライブ情報を取得 */
async function fetchLiveStats(ongoingTournamentIds: number[]) {
  if (ongoingTournamentIds.length === 0) {
    return { ongoingCount: 0, totalMatches: 0, recentUpdates: [] as { tournamentName: string; description: string; badge: 'live' | 'finished' | 'updated'; homeTeam?: string; awayTeam?: string; homeScore?: number; awayScore?: number }[] };
  }

  const ongoingCount = ongoingTournamentIds.length;
  const placeholders = ongoingTournamentIds.map(() => '?').join(',');

  try {
    const matchResult = await db.execute(`
      SELECT COUNT(DISTINCT ml.match_id) as cnt
      FROM t_matches_live ml
      INNER JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      WHERE mb.tournament_id IN (${placeholders})
        AND ml.tournament_date = strftime('%Y-%m-%d', 'now', '+9 hours')
    `, ongoingTournamentIds);
    const totalMatches = Number(matchResult.rows[0]?.cnt) || 0;

    const recentResult = await db.execute(`
      SELECT
        tg.group_name,
        t.tournament_name,
        ms.match_status,
        ml.match_id,
        COALESCE(tt1.team_name, ml.team1_display_name) as team1_name,
        COALESCE(tt2.team_name, ml.team2_display_name) as team2_name,
        ml.team1_scores,
        ml.team2_scores
      FROM t_match_status ms
      INNER JOIN t_matches_live ml ON ms.match_id = ml.match_id
      INNER JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
      INNER JOIN t_tournaments t ON mb.tournament_id = t.tournament_id
      LEFT JOIN t_tournament_groups tg ON t.group_id = tg.group_id
      LEFT JOIN t_tournament_teams tt1 ON ml.team1_tournament_team_id = tt1.tournament_team_id
      LEFT JOIN t_tournament_teams tt2 ON ml.team2_tournament_team_id = tt2.tournament_team_id
      WHERE mb.tournament_id IN (${placeholders})
        AND ms.match_status != 'scheduled'
      ORDER BY ms.updated_at DESC
      LIMIT 5
    `, ongoingTournamentIds);

    const sumScores = (scoresJson: unknown): number | undefined => {
      if (!scoresJson) return undefined;
      try {
        const arr = JSON.parse(String(scoresJson));
        if (Array.isArray(arr)) return arr.reduce((s: number, v: number) => s + (v || 0), 0);
      } catch { /* ignore */ }
      return undefined;
    };

    const recentUpdates = recentResult.rows.map(row => ({
      tournamentName: row.group_name
        ? `${String(row.group_name)} / ${String(row.tournament_name)}`
        : String(row.tournament_name),
      description: row.match_status === 'ongoing' ? '試合進行中' :
                   row.match_status === 'completed' ? '試合終了' : '結果更新',
      badge: (row.match_status === 'ongoing' ? 'live' :
              row.match_status === 'completed' ? 'finished' : 'updated') as 'live' | 'finished' | 'updated',
      homeTeam: row.team1_name ? String(row.team1_name) : undefined,
      awayTeam: row.team2_name ? String(row.team2_name) : undefined,
      homeScore: sumScores(row.team1_scores),
      awayScore: sumScores(row.team2_scores),
    }));

    return { ongoingCount, totalMatches, recentUpdates };
  } catch {
    return { ongoingCount, totalMatches: 0, recentUpdates: [] as { tournamentName: string; description: string; badge: 'live' | 'finished' | 'updated'; homeTeam?: string; awayTeam?: string; homeScore?: number; awayScore?: number }[] };
  }
}

/** 初期表示用の公開大会一覧をサーバーサイドで取得 */
async function fetchInitialTournaments() {
  try {
    const sportCodeToIcon: Record<string, string> = {
      soccer: '⚽', baseball: '⚾', basketball: '🏀', volleyball: '🏐',
      futsal: '⚽', tennis: '🎾', badminton: '🏸', handball: '🤾',
      tabletennis: '🏓', pk: '🥅',
    };

    const result = await db.execute(`
      SELECT
        t.tournament_id,
        t.tournament_name,
        t.status,
        t.tournament_dates,
        t.recruitment_start_date,
        t.recruitment_end_date,
        t.public_start_date,
        t.team_count,
        t.visibility,
        t.format_name,
        t.venue_id as venue_id_json,
        tg.group_name,
        lu.logo_blob_url,
        lu.organization_name,
        st.sport_code
      FROM t_tournaments t
      LEFT JOIN t_tournament_groups tg ON t.group_id = tg.group_id
      LEFT JOIN m_login_users lu ON tg.login_user_id = lu.login_user_id
      LEFT JOIN m_sport_types st ON t.sport_type_id = st.sport_type_id
      WHERE t.visibility = 'open'
      ORDER BY t.created_at DESC
    `);

    const tournaments = await Promise.all(result.rows.map(async (row) => {
      const calculatedStatus = await calculateTournamentStatus({
        status: String(row.status),
        tournament_dates: String(row.tournament_dates || '{}'),
        recruitment_start_date: row.recruitment_start_date as string | null,
        recruitment_end_date: row.recruitment_end_date as string | null,
        public_start_date: row.public_start_date as string | null,
      }, Number(row.tournament_id));

      let tournamentPeriod = formatTournamentPeriod(String(row.tournament_dates || '{}'));

      // tournament_datesが空の場合、match_blocksの試合日程から期間を取得
      if (tournamentPeriod === '未設定') {
        try {
          const blockDatesResult = await db.execute(`
            SELECT DISTINCT ml.tournament_date
            FROM t_matches_live ml
            INNER JOIN t_match_blocks mb ON ml.match_block_id = mb.match_block_id
            WHERE mb.tournament_id = ?
            AND ml.tournament_date IS NOT NULL AND ml.tournament_date != ''
            ORDER BY ml.tournament_date
          `, [Number(row.tournament_id)]);
          const blockDates = blockDatesResult.rows
            .map(r => String(r.tournament_date))
            .filter(Boolean)
            .sort();
          if (blockDates.length === 1) {
            tournamentPeriod = blockDates[0];
          } else if (blockDates.length > 1) {
            tournamentPeriod = `${blockDates[0]} - ${blockDates[blockDates.length - 1]}`;
          }
        } catch { /* ignore */ }
      }

      let eventStartDate = '';
      let eventEndDate = '';
      if (row.tournament_dates) {
        try {
          const dates = JSON.parse(row.tournament_dates as string);
          const dateValues = (Object.values(dates) as string[]).filter(Boolean).sort();
          eventStartDate = dateValues[0] || '';
          eventEndDate = dateValues[dateValues.length - 1] || '';
        } catch { /* ignore */ }
      }

      // 全会場名を取得
      let venueNames = '未設定';
      if (row.venue_id_json) {
        try {
          const venueIds = JSON.parse(row.venue_id_json as string);
          if (Array.isArray(venueIds) && venueIds.length > 0) {
            const placeholders = venueIds.map(() => '?').join(',');
            const venueResult = await db.execute(
              `SELECT venue_name FROM m_venues WHERE venue_id IN (${placeholders}) ORDER BY venue_id`,
              venueIds
            );
            const names = venueResult.rows.map(r => String(r.venue_name)).filter(Boolean);
            if (names.length > 0) venueNames = names.join(' / ');
          }
        } catch { /* ignore */ }
      }

      const sportIcon = row.sport_code ? (sportCodeToIcon[String(row.sport_code)] || '🏆') : '🏆';

      return {
        tournament_id: Number(row.tournament_id),
        tournament_name: String(row.tournament_name),
        group_name: row.group_name ? String(row.group_name) : null,
        status: calculatedStatus,
        format_name: String(row.format_name || '未設定'),
        venue_name: venueNames,
        sport_icon: sportIcon,
        team_count: Number(row.team_count),
        event_start_date: eventStartDate,
        event_end_date: eventEndDate,
        tournament_period: tournamentPeriod,
        recruitment_start_date: String(row.recruitment_start_date || ''),
        recruitment_end_date: String(row.recruitment_end_date || ''),
        logo_blob_url: row.logo_blob_url as string | null,
        organization_name: row.organization_name as string | null,
        is_joined: false,
      };
    }));

    // planning を除外
    return tournaments.filter(t => t.status !== 'planning');
  } catch {
    return [];
  }
}

export default async function Home() {
  const session = await auth();
  const teamId = session?.user?.role === 'team' ? session.user.teamId : undefined;

  const [groupedData, sportTypes, organizers, initialTournaments] = await Promise.all([
    fetchGroupedPublicTournaments(teamId).catch(() => ({
      ongoing: [], recruiting: [], before_event: [], completed: []
    } as CategorizedTournaments)),
    fetchSportTypes(),
    fetchFeaturedOrganizers(),
    fetchInitialTournaments(),
  ]);

  // 動的ステータスで開催中と判定された大会IDを抽出
  const ongoingTournamentIds = groupedData.ongoing.flatMap(
    (g: any) => g.divisions // eslint-disable-line @typescript-eslint/no-explicit-any
      .filter((d: any) => d.status === 'ongoing') // eslint-disable-line @typescript-eslint/no-explicit-any
      .map((d: any) => d.tournament_id as number) // eslint-disable-line @typescript-eslint/no-explicit-any
  );
  const liveStats = await fetchLiveStats(ongoingTournamentIds);

  return (
    <div className="min-h-screen bg-white">
      <TopNavBar />

      {/* ======== ヒーローセクション + 検索 + 大会一覧 ======== */}
      <section className="bg-hero-gradient pb-12 pt-8 sm:pb-16 sm:pt-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* ロゴ */}
          <div className="text-center mb-6">
            <div className="mb-3 relative w-full max-w-4xl mx-auto">
              <Image
                src="/images/taikaigo-logo-main.svg"
                alt="大会GO"
                width={500}
                height={176}
                className="mx-auto w-full h-auto max-w-xs sm:max-w-md md:max-w-xl lg:max-w-2xl"
                style={{ objectFit: 'contain' }}
                priority
              />
            </div>
            <p className="text-sm sm:text-lg text-white/90 max-w-2xl mx-auto leading-relaxed mb-2">
              あなたの大会、すぐに見つかる
            </p>
            <p className="text-xs sm:text-sm text-white/70 max-w-xl mx-auto">
              チーム名・大会名から、リアルタイムの試合結果をチェック
            </p>
          </div>

          {/* ログイン/ダッシュボードリンク */}
          <div className="flex justify-center gap-3 mb-6">
            {session?.user ? (
              <Button asChild size="sm" variant="outline" className="group border-white/40 text-white bg-transparent hover:bg-white/10 hover:text-white">
                <Link href="/my">
                  ダッシュボード
                  <ArrowRight className="ml-1.5 h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                </Link>
              </Button>
            ) : (
              <Button asChild size="sm" variant="outline" className="border-white/40 text-white bg-transparent hover:bg-white/10 hover:text-white">
                <Link href="/auth/login">
                  ログイン / 新規登録
                </Link>
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* ======== 検索ボックス + 大会一覧（一体クライアントコンポーネント） ======== */}
      <section className="relative -mt-8 pb-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <TournamentSearchSection
            sportTypes={sportTypes}
            initialTournaments={initialTournaments}
            organizers={organizers}
          />
        </div>
      </section>

      {/* ======== お知らせ ======== */}
      <section className="py-6 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <AnnouncementList />
        </div>
      </section>

      {/* ======== ただいま熱戦中！ライブダッシュボード ======== */}
      <section className="py-10 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <LiveDashboard
            ongoingCount={liveStats.ongoingCount}
            totalMatches={liveStats.totalMatches}
            recentUpdates={liveStats.recentUpdates}
          />
        </div>
      </section>

      {/* ======== 大会GOだからできること（機能紹介） ======== */}
      <section className="py-12 bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3">大会GOだからできること</h2>
            <p className="text-sm text-gray-500 max-w-2xl mx-auto leading-relaxed">
              大会運営を効率化する、次世代の大会管理システム
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              { icon: <Smartphone className="h-7 w-7 text-primary" />, title: "スマホ1つで結果入力", description: "審判がQRコードを読み取るだけ。重い機材も専用端末も不要。雨の日でもスムーズに運営できます。" },
              { icon: <Trophy className="h-7 w-7 text-primary" />, title: "トーナメント表の完全自動生成", description: "参加チーム数に応じて、最適な対戦表を自動作成。変更も即座に反映されます。" },
              { icon: <Megaphone className="h-7 w-7 text-primary" />, title: "緊急お知らせ機能", description: "雨天中止や会場変更を、全参加者のスマホに一斉通知。電話連絡の手間が激減します。" },
              { icon: <Zap className="h-7 w-7 text-primary" />, title: "リアルタイム更新", description: "試合結果が入力された瞬間、全ユーザーの画面に反映。現地にいなくても子供の活躍をすぐに知れます。" },
              { icon: <DollarSign className="h-7 w-7 text-primary" />, title: "スポンサー管理機能", description: "協賛企業のバナーを大会ページに表示。スポンサー獲得を支援し、大会運営の収益化をサポート。" },
              { icon: <BarChart3 className="h-7 w-7 text-primary" />, title: "参加データの自動集計", description: "チーム数、選手数、試合数を自動で集計。報告書作成の時間を大幅に削減します。" },
            ].map((feature, i) => (
              <div key={i} className="bg-white border-2 border-gray-200 rounded-xl p-6 text-center hover:border-primary hover:-translate-y-1 hover:shadow-lg transition-all duration-300">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  {feature.icon}
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">{feature.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ======== 導入事例 ======== */}
      <section className="py-12 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3">導入事例</h2>
            <p className="text-sm text-gray-500 max-w-2xl mx-auto leading-relaxed">
              大会GOで、大会運営が本当に「楽勝」になりました
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { image: "bg-hero-gradient", title: "富山県サッカー協会様", result: "運営スタッフ50%削減！", text: "年間10大会以上を運営する当協会にとって、革命的でした。QRコード入力機能により、審判への説明が不要になり、スタッフ配置を大幅に削減できました。" },
              { image: "bg-live-gradient", title: "PK選手権実行委員会様", result: "保護者満足度95%以上", text: "リアルタイム更新により、会場に来られない保護者も子供の試合をスマホで追えるようになりました。「次いつ？」の問い合わせがゼロに。" },
              { image: "bg-gradient-to-br from-emerald-400 to-cyan-500", title: "イベント企画会社様", result: "準備時間が1/3に短縮", text: "従来はExcelでトーナメント表を手作業で作成していましたが、自動生成機能で準備時間が劇的に短縮。複数大会の同時運営も可能になりました。" },
            ].map((study, i) => (
              <div key={i} className="bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100">
                <div className={`h-36 ${study.image} flex items-center justify-center`}>
                  <Trophy className="h-12 w-12 text-white/60" />
                </div>
                <div className="p-5">
                  <h3 className="text-base font-bold text-gray-900 mb-2">{study.title}</h3>
                  <p className="text-lg font-bold text-red-500 mb-3">{study.result}</p>
                  <p className="text-sm text-gray-500 leading-relaxed">{study.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Footer />
      <InitialFooterBanner />
    </div>
  );
}
