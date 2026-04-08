"use client";

import {
  AlertTriangle,
  Calendar,
  CheckCircle,
  ChevronsUpDown,
  Clock,
  LayoutGrid,
  MapPin,
  MessageSquare,
  Trophy,
  Users,
  XCircle,
} from "lucide-react";
import { useSession } from "next-auth/react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { parseTotalScore } from "@/lib/score-parser";
import { formatDateOnly } from "@/lib/utils";
import MatchNewsArea from "./MatchNewsArea";

interface MatchData {
  match_id: number;
  match_block_id: number;
  tournament_date: string;
  match_number: number;
  match_code: string;
  team1_tournament_team_id?: number | null;
  team2_tournament_team_id?: number | null;
  team1_display_name: string;
  team2_display_name: string;
  court_number: number | null;
  court_name?: string | null;
  venue_name?: string | null;
  venue_id?: number | null;
  start_time: string | null;
  phase: string;
  display_round_name: string;
  block_name: string | null;
  match_type: string;
  block_order: number;
  team1_goals: number | null;
  team2_goals: number | null;
  team1_pk_goals?: number | null; // PK戦スコア（追加）
  team2_pk_goals?: number | null; // PK戦スコア（追加）
  winner_tournament_team_id?: number | null;
  is_draw: boolean;
  is_walkover: boolean;
  match_status: string;
  result_status: string;
  remarks: string | null;
  match_comment?: string | null;
  override_reason?: string | null;
  has_result: boolean;
  cancellation_type: string | null;
  round_name: string | null;
  matchday?: number | null;
  live_team1_scores?: string | null;
  live_team2_scores?: string | null;
}

interface VenueInfo {
  venue_id: number;
  venue_name: string;
  google_maps_url: string | null;
}

interface TournamentScheduleProps {
  tournamentId: number;
  initialMatches?: MatchData[];
  initialVenues?: VenueInfo[];
}

interface TeamOption {
  tournament_team_id: number;
  display_name: string;
}

export default function TournamentSchedule({
  tournamentId,
  initialMatches,
  initialVenues,
}: TournamentScheduleProps) {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin" || session?.user?.role === "operator";
  const [matches, setMatches] = useState<MatchData[]>(initialMatches || []);
  const [venues, setVenues] = useState<VenueInfo[]>(initialVenues || []);
  const [loading, setLoading] = useState(!initialMatches);
  const [error, setError] = useState<string | null>(null);
  const [filterTeamId, setFilterTeamId] = useState<string>("all");
  const [filterCourtNumber, setFilterCourtNumber] = useState<string>("all");
  const [confirmedTeams, setConfirmedTeams] = useState<TeamOption[]>([]);
  const [dateHeaderTop, setDateHeaderTop] = useState(67);
  const jumpNavRef = useRef<HTMLDivElement>(null);

  // sticky オフセットの計算（ヘッダー + タブナビ + JumpNav）
  const updateStickyOffsets = useCallback(() => {
    if (typeof document === "undefined") return;
    const header = 67;
    const tabNav = document.getElementById("tournament-tab-nav");
    const tabHeight = tabNav ? tabNav.offsetHeight : 0;
    const jumpHeight = jumpNavRef.current?.offsetHeight ?? 0;
    setDateHeaderTop(header + tabHeight + jumpHeight);
  }, []);

  useEffect(() => {
    // DOMレンダリング完了後に計算（JumpNavの高さが確定してから）
    const timer1 = requestAnimationFrame(updateStickyOffsets);
    // JumpNavのレンダリング後にもう一度計算
    const timer2 = setTimeout(updateStickyOffsets, 100);
    window.addEventListener("resize", updateStickyOffsets);
    return () => {
      cancelAnimationFrame(timer1);
      clearTimeout(timer2);
      window.removeEventListener("resize", updateStickyOffsets);
    };
  }, [updateStickyOffsets, matches]);

  // JumpNav の sticky top（ヘッダー67px + タブナビ高さ）
  const jumpNavTop = useMemo(() => {
    const header = 67;
    if (typeof document === "undefined") return header;
    const tabNav = document.getElementById("tournament-tab-nav");
    const tabHeight = tabNav ? tabNav.offsetHeight : 0;
    return header + tabHeight;
    // dateHeaderTop を依存に入れて、リサイズ時に再計算
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateHeaderTop]);

  // 試合データの取得（initialMatchesが提供されていない場合のみ）
  useEffect(() => {
    if (initialMatches) return;

    const fetchMatches = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/tournaments/${tournamentId}/public-matches`, {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();

        if (result.success) {
          setMatches(result.data);
          if (result.venues) setVenues(result.venues);
        } else {
          console.error("API Error Details:", result);
          setError(result.error || "試合データの取得に失敗しました");
        }
      } catch (err) {
        console.error("試合データ取得エラー:", err);
        setError(
          `試合データの取得に失敗しました: ${err instanceof Error ? err.message : String(err)}`,
        );
      } finally {
        setLoading(false);
      }
    };

    fetchMatches();
  }, [tournamentId, initialMatches]);

  // 参加確定チーム一覧を取得（辞退チーム除外）
  useEffect(() => {
    const fetchTeams = async () => {
      try {
        const response = await fetch(`/api/tournaments/${tournamentId}/teams`);
        const result = await response.json();
        if (result.success && result.data?.teams) {
          const teams: TeamOption[] = result.data.teams.map(
            (t: { tournament_team_id: number; display_name?: string; team_name?: string }) => ({
              tournament_team_id: t.tournament_team_id,
              display_name: t.display_name || t.team_name || "",
            }),
          );
          teams.sort((a, b) => a.display_name.localeCompare(b.display_name, "ja"));
          setConfirmedTeams(teams);
        }
      } catch (err) {
        console.error("チーム一覧取得エラー:", err);
      }
    };
    fetchTeams();
  }, [tournamentId]);

  // チームが試合に割り当て済みかどうか（フィルター表示条件）
  const hasAssignedTeams = useMemo(() => {
    return matches.some((m) => m.team1_tournament_team_id || m.team2_tournament_team_id);
  }, [matches]);

  // コート選択肢を生成
  const courtOptions = useMemo(() => {
    const courtMap = new Map<number, string>();
    matches.forEach((m) => {
      if (m.court_number != null) {
        courtMap.set(m.court_number, m.court_name || `コート${m.court_number}`);
      }
    });
    return Array.from(courtMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([num, name]) => ({ court_number: num, display_name: name }));
  }, [matches]);

  // フィルタリングされた試合一覧
  const filteredMatches = useMemo(() => {
    let result = matches;
    if (filterTeamId !== "all") {
      const teamId = parseInt(filterTeamId);
      result = result.filter(
        (m) => m.team1_tournament_team_id === teamId || m.team2_tournament_team_id === teamId,
      );
    }
    if (filterCourtNumber !== "all") {
      const courtNum = parseInt(filterCourtNumber);
      result = result.filter((m) => m.court_number === courtNum);
    }
    return result;
  }, [matches, filterTeamId, filterCourtNumber]);

  // リーグ戦モード判定（matchdayが設定されている試合があるか）
  const isLeagueMode = useMemo(() => {
    return matches.some((m) => m.matchday != null && m.matchday > 0);
  }, [matches]);

  // 全試合から最長の会場/コート表示名を算出し、列の min-width を統一
  const venueColWidth = useMemo(() => {
    const maxLen = matches.reduce((max, m) => {
      const venue = m.venue_name || "";
      const court = m.court_name || "";
      return Math.max(max, venue.length, court.length);
    }, 0);
    // text-sm(14px)で全角1文字≒14px、アイコン+余白で+2rem
    return maxLen > 0 ? `${maxLen + 2}rem` : "8rem";
  }, [matches]);

  // 試合結果の表示
  const getMatchResult = (match: MatchData) => {
    // 確定済みの試合結果がない場合
    if (!match.has_result) {
      // 管理者・運営者の場合、進行中・完了の試合にライブスコアを表示
      if (
        isAdmin &&
        (match.match_status === "ongoing" || match.match_status === "completed") &&
        match.live_team1_scores &&
        match.live_team2_scores
      ) {
        try {
          const t1 = parseTotalScore(match.live_team1_scores);
          const t2 = parseTotalScore(match.live_team2_scores);
          const statusLabel = match.match_status === "ongoing" ? "試合中" : "確定待ち";
          const colorClass =
            match.match_status === "ongoing" ? "text-orange-600 animate-pulse" : "text-purple-600";
          const iconEl =
            match.match_status === "ongoing" ? (
              <Clock className="h-4 w-4 text-orange-500" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-purple-500" />
            );
          return {
            status: match.match_status === "ongoing" ? "ongoing" : "completed_unconfirmed",
            display: (
              <div className={`${colorClass} font-medium`}>
                <div className="text-lg">
                  {t1} - {t2}
                </div>
                <div className="text-xs">({statusLabel})</div>
              </div>
            ),
            team1Score: t1,
            team2Score: t2,
            statusLabel,
            statusColor: colorClass,
            icon: iconEl,
          };
        } catch {
          // パース失敗時はフォールスルー
        }
      }

      // 試合状態に応じて表示を変更
      switch (match.match_status) {
        case "ongoing":
          return {
            status: "ongoing",
            display: (
              <span className="text-orange-600 text-lg font-medium animate-pulse">試合中</span>
            ),
            icon: <Clock className="h-4 w-4 text-orange-500" />,
          };
        case "completed":
          return {
            status: "completed_unconfirmed",
            display: <span className="text-purple-600 text-lg font-medium">試合完了</span>,
            icon: <AlertTriangle className="h-4 w-4 text-purple-500" />,
          };
        case "cancelled":
          // 中止の種別に応じた表示
          let cancelLabel = "中止";
          if (match.cancellation_type === "no_count") {
            cancelLabel = "中止";
          } else if (match.cancellation_type === "no_show_both") {
            cancelLabel = "中止（両者不参加）";
          } else if (match.cancellation_type === "no_show_team1") {
            cancelLabel = "中止（不戦勝）";
          } else if (match.cancellation_type === "no_show_team2") {
            cancelLabel = "中止（不戦勝）";
          }

          return {
            status: "cancelled",
            display: <span className="text-red-600 text-lg font-medium">{cancelLabel}</span>,
            icon: <XCircle className="h-4 w-4 text-red-500" />,
          };
        default:
          return {
            status: "scheduled",
            display: <span className="text-gray-500 text-base">未実施</span>,
            icon: <Clock className="h-4 w-4 text-gray-500" />,
          };
      }
    }

    if (match.is_walkover) {
      const walkoverScore = `${match.team1_goals ?? 0} - ${match.team2_goals ?? 0}`;
      // 不戦引き分けの場合（両チーム不参加）
      if (match.is_draw) {
        return {
          status: "walkover_draw",
          display: (
            <span className="text-blue-600 text-lg font-medium">不戦引分 {walkoverScore}</span>
          ),
          icon: <AlertTriangle className="h-4 w-4 text-blue-500" />,
        };
      }
      // 通常の不戦勝（片方チーム不参加）
      // 勝者を判定してwinnerプロパティを追加
      const winnerIsTeam1 = match.winner_tournament_team_id === match.team1_tournament_team_id;

      return {
        status: "walkover",
        display: (
          <span className="text-orange-600 text-lg font-medium">不戦勝 {walkoverScore}</span>
        ),
        team1Score: match.team1_goals ?? 0,
        team2Score: match.team2_goals ?? 0,
        pkSuffix: "",
        icon: <AlertTriangle className="h-4 w-4 text-orange-500" />,
        winner: winnerIsTeam1 ? "team1" : "team2",
      };
    }

    // PK戦があるか
    const hasPk = (match.team1_pk_goals ?? 0) > 0 || (match.team2_pk_goals ?? 0) > 0;
    const pkSuffix = hasPk ? ` (PK ${match.team1_pk_goals || 0}-${match.team2_pk_goals || 0})` : "";

    if (match.is_draw) {
      return {
        status: "draw",
        display: (
          <span className="text-lg font-medium">
            {match.team1_goals} - {match.team2_goals}
            {pkSuffix}
          </span>
        ),
        team1Score: match.team1_goals ?? 0,
        team2Score: match.team2_goals ?? 0,
        pkSuffix,
        icon: <Users className="h-4 w-4 text-blue-500" />,
      };
    }

    // 勝敗がついている場合
    const winnerIsTeam1 = match.winner_tournament_team_id === match.team1_tournament_team_id;
    return {
      status: "completed",
      display: (
        <span className="text-lg font-medium">
          <span className={winnerIsTeam1 ? "text-red-600" : ""}>{match.team1_goals}</span>
          <span> - </span>
          <span className={!winnerIsTeam1 ? "text-red-600" : ""}>{match.team2_goals}</span>
          {pkSuffix && <span className="text-gray-500 text-sm">{pkSuffix}</span>}
        </span>
      ),
      team1Score: match.team1_goals ?? 0,
      team2Score: match.team2_goals ?? 0,
      pkSuffix,
      icon: <CheckCircle className="h-4 w-4 text-green-500" />,
      winner: winnerIsTeam1 ? "team1" : "team2",
    };
  };

  // 時刻フォーマット
  const formatTime = (timeStr: string | null): string => {
    if (!timeStr) return "--:--";
    return timeStr.substring(0, 5); // HH:MM形式に変換
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="text-center py-12">
          <Clock className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-gray-500">スケジュールを読み込み中...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-red-200">
        <CardContent className="text-center py-12">
          <XCircle className="h-8 w-8 mx-auto text-red-600 mb-4" />
          <p className="text-red-600">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (matches.length === 0) {
    return (
      <Card>
        <CardContent className="text-center py-12">
          <Calendar className="h-12 w-12 text-gray-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">試合スケジュール</h3>
          <p className="text-gray-500">まだ試合スケジュールが作成されていません。</p>
        </CardContent>
      </Card>
    );
  }

  // 概要情報カードコンポーネント
  const OverviewCard = ({ filteredMatches }: { filteredMatches: MatchData[] }) => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <Trophy className="h-5 w-5 mr-2 text-blue-600" />
          スケジュール概要
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              {
                Object.keys(
                  filteredMatches.reduce(
                    (acc, match) => {
                      acc[match.tournament_date] = true;
                      return acc;
                    },
                    {} as Record<string, boolean>,
                  ),
                ).length
              }
            </div>
            <div className="text-sm text-gray-500">開催日数</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{filteredMatches.length}</div>
            <div className="text-sm text-gray-500">試合数</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">
              {filteredMatches.filter((m) => m.has_result).length}
            </div>
            <div className="text-sm text-gray-500">実施済み</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  // 移動ボタンコンポーネント（ドロップダウン方式・sticky）
  const JumpNav = ({ filteredMatches }: { filteredMatches: MatchData[] }) => {
    const scrollTo = (id: string) => {
      const el = document.getElementById(id);
      if (!el) return;
      const y = el.getBoundingClientRect().top + window.scrollY - dateHeaderTop - 8;
      window.scrollTo({ top: y, behavior: "smooth" });
    };

    // 短い日付フォーマット（M/d(曜日)）
    const formatShort = (dateStr: string): string => {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
      return `${d.getMonth() + 1}/${d.getDate()}(${weekdays[d.getDay()]})`;
    };

    const dropdownButton = (label: string) => (
      <button
        type="button"
        className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
      >
        <Calendar className="h-4 w-4" />
        {label}
        <ChevronsUpDown className="h-3.5 w-3.5 text-gray-400" />
      </button>
    );

    if (isLeagueMode) {
      const matchdays = [
        ...new Set(filteredMatches.map((m) => m.matchday ?? 0).filter((md) => md > 0)),
      ].sort((a, b) => a - b);
      if (matchdays.length <= 1) return null;
      return (
        <div
          ref={jumpNavRef}
          className="sticky z-30 bg-white pb-2 no-print"
          style={{ top: `${jumpNavTop}px` }}
        >
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>{dropdownButton("節を選んで移動")}</DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="bottom" sideOffset={4}>
              {matchdays.map((md) => (
                <DropdownMenuItem key={md} onClick={() => scrollTo(`schedule-matchday-${md}`)}>
                  第{md}節
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      );
    } else {
      const dates = [...new Set(filteredMatches.map((m) => m.tournament_date))].sort();
      if (dates.length <= 1) return null;
      return (
        <div
          ref={jumpNavRef}
          className="sticky z-30 bg-white pb-2 no-print"
          style={{ top: `${jumpNavTop}px` }}
        >
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              {dropdownButton("開催日を選んで移動")}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="bottom" sideOffset={4}>
              {dates.map((date) => (
                <DropdownMenuItem key={date} onClick={() => scrollTo(`schedule-date-${date}`)}>
                  {formatShort(date)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      );
    }
  };

  // 日程別スケジュール表示コンポーネント（日付→コート→時間順）
  const ScheduleByDate = ({ filteredMatches }: { filteredMatches: MatchData[] }) => {
    const filteredMatchesByDate = filteredMatches.reduce(
      (acc, match) => {
        const date = match.tournament_date;
        if (!acc[date]) {
          acc[date] = [];
        }
        acc[date].push(match);
        return acc;
      },
      {} as Record<string, MatchData[]>,
    );

    const sortedFilteredDates = Object.keys(filteredMatchesByDate).sort();

    // 開催日ごとの背景色
    const dateBgColors = [
      "bg-blue-50/60",
      "bg-amber-50/60",
      "bg-green-50/60",
      "bg-purple-50/60",
      "bg-rose-50/60",
      "bg-cyan-50/60",
      "bg-orange-50/60",
      "bg-indigo-50/60",
    ];

    return (
      <>
        {sortedFilteredDates.map((date, dateIndex) => {
          const dayMatches = filteredMatchesByDate[date];
          const bgColor = dateBgColors[dateIndex % dateBgColors.length];

          // 会場→コートの2階層でグルーピング
          // 1. 会場ごとにグループ化
          const matchesByVenue: Record<string, MatchData[]> = {};
          dayMatches.forEach((m) => {
            const venueKey = m.venue_id ? String(m.venue_id) : "none";
            if (!matchesByVenue[venueKey]) matchesByVenue[venueKey] = [];
            matchesByVenue[venueKey].push(m);
          });

          // 会場キーをソート（venue_id昇順、未設定は最後）
          const sortedVenueKeys = Object.keys(matchesByVenue).sort((a, b) => {
            if (a === "none") return 1;
            if (b === "none") return -1;
            return Number(a) - Number(b);
          });

          // 全体でコートが複数あるか判定
          const allCourtKeys = new Set<string>();
          dayMatches.forEach((m) => {
            const courtKey =
              m.court_name || (m.court_number ? `コート${m.court_number}` : "未設定");
            allCourtKeys.add(courtKey);
          });
          const hasMultipleCourts =
            allCourtKeys.size > 1 || (allCourtKeys.size === 1 && !allCourtKeys.has("未設定"));

          return (
            <div key={date} id={`schedule-date-${date}`} className="space-y-0">
              {/* 開催日ヘッダー（sticky：ヘッダー + タブナビ + JumpNav の下に追従） */}
              <div
                className={`sticky z-10 ${bgColor} border border-gray-200 rounded-t-lg px-4 py-3 flex items-center justify-between shadow-sm`}
                style={{ top: `${dateHeaderTop}px` }}
              >
                <div className="flex items-center text-2xl font-semibold leading-none tracking-tight">
                  <Calendar className="h-5 w-5 mr-2" />
                  開催日: {formatDateOnly(date)}
                </div>
                <div className="flex items-center text-sm text-gray-500">
                  <Clock className="h-4 w-4 mr-1" />
                  {dayMatches.length}試合
                </div>
              </div>

              {/* 会場→コート別試合表示 */}
              <div
                className={`${bgColor} border border-t-0 border-gray-200 rounded-b-lg space-y-4 p-2 sm:p-3`}
              >
                {sortedVenueKeys.map((venueKey) => {
                  const venueMatches = matchesByVenue[venueKey];
                  const venueInfo =
                    venueKey !== "none"
                      ? venues.find((v) => v.venue_id === Number(venueKey))
                      : null;

                  // この会場内でコートごとにグループ化
                  const matchesByCourt: Record<string, MatchData[]> = {};
                  venueMatches.forEach((m) => {
                    const courtKey =
                      m.court_name || (m.court_number ? `コート${m.court_number}` : "未設定");
                    if (!matchesByCourt[courtKey]) matchesByCourt[courtKey] = [];
                    matchesByCourt[courtKey].push(m);
                  });

                  // コートキーをcourt_number昇順でソート
                  const sortedCourtKeys = Object.keys(matchesByCourt).sort((a, b) => {
                    if (a === "未設定") return 1;
                    if (b === "未設定") return -1;
                    const numA = matchesByCourt[a][0]?.court_number ?? Infinity;
                    const numB = matchesByCourt[b][0]?.court_number ?? Infinity;
                    return numA - numB;
                  });

                  return (
                    <div key={venueKey} className="space-y-3">
                      {/* 会場ヘッダー（会場が複数ある場合、または1つでも会場情報がある場合に表示） */}
                      {venueInfo && (
                        <div className="flex items-center gap-1 text-sm text-gray-600 font-medium px-1">
                          <MapPin className="h-4 w-4 shrink-0" />
                          {venueInfo.google_maps_url ? (
                            <a
                              href={venueInfo.google_maps_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline"
                            >
                              {venueInfo.venue_name}
                            </a>
                          ) : (
                            <span>{venueInfo.venue_name}</span>
                          )}
                        </div>
                      )}

                      {sortedCourtKeys.map((courtKey) => {
                        const courtMatches = matchesByCourt[courtKey];
                        // コート内で時間順にソート
                        const sortedMatches = [...courtMatches].sort((a, b) => {
                          const timeA = a.start_time || "99:99";
                          const timeB = b.start_time || "99:99";
                          if (timeA !== timeB) return timeA.localeCompare(timeB);
                          return a.match_code.localeCompare(b.match_code, undefined, {
                            numeric: true,
                          });
                        });

                        return (
                          <Card key={courtKey} className="bg-white/80">
                            {hasMultipleCourts && (
                              <CardHeader className="pb-0">
                                {(() => {
                                  const courtNameMatchesVenue =
                                    venueInfo && venueInfo.venue_name === courtKey;
                                  return (
                                    <>
                                      {!courtNameMatchesVenue && (
                                        <CardTitle className="flex items-center text-sm font-medium">
                                          <LayoutGrid className="h-4 w-4 mr-1.5 text-gray-500" />
                                          {courtKey}
                                          <span className="text-xs text-gray-500 font-normal ml-2">
                                            ({courtMatches.length}試合)
                                          </span>
                                        </CardTitle>
                                      )}
                                      {courtNameMatchesVenue && (
                                        <span className="text-xs text-gray-500 font-normal">
                                          ({courtMatches.length}試合)
                                        </span>
                                      )}
                                    </>
                                  );
                                })()}
                              </CardHeader>
                            )}
                            <CardContent
                              className={`${hasMultipleCourts ? "pt-2" : "pt-4"} px-2 sm:px-4`}
                            >
                              <table className="w-full border-collapse">
                                <thead>
                                  <tr className="border-b">
                                    <th className="text-left py-3 px-1 font-medium whitespace-nowrap">
                                      時間
                                    </th>
                                    <th className="text-left py-3 px-1 font-medium whitespace-nowrap">
                                      試合
                                    </th>
                                    <th className="text-left py-3 px-1 font-medium w-full">対戦</th>
                                    <th className="text-center md:text-right py-3 px-1 font-medium whitespace-nowrap">
                                      結果
                                    </th>
                                    {!hasMultipleCourts && (
                                      <th className="text-right py-3 px-1 font-medium hidden md:table-cell whitespace-nowrap">
                                        コート
                                      </th>
                                    )}
                                  </tr>
                                </thead>
                                <tbody>
                                  {sortedMatches.map((match, matchIndex) => {
                                    const result = getMatchResult(match);
                                    const isEvenRow = matchIndex % 2 === 1;

                                    const matchRemarks = [
                                      match.remarks && !match.is_walkover ? match.remarks : null,
                                      match.override_reason,
                                    ]
                                      .filter(Boolean)
                                      .join(" / ");
                                    const hasRemarksMobile = !!matchRemarks;

                                    const team1Class =
                                      result.winner === "team1"
                                        ? "font-bold text-red-600"
                                        : match.match_type === "FM"
                                          ? "text-rose-400"
                                          : "";
                                    const team2Class =
                                      result.winner === "team2"
                                        ? "font-bold text-red-600"
                                        : match.match_type === "FM"
                                          ? "text-rose-400"
                                          : "";
                                    const score1Class =
                                      result.winner === "team1" ? "text-red-600 font-bold" : "";
                                    const score2Class =
                                      result.winner === "team2" ? "text-red-600 font-bold" : "";

                                    const hasSubRows = hasRemarksMobile || !!match.match_comment;
                                    const mainRowBorder = hasSubRows ? "" : "border-b";

                                    return (
                                      <React.Fragment key={match.match_id}>
                                        <tr
                                          className={`${mainRowBorder} hover:bg-gray-50/50 ${isEvenRow ? "bg-black/[0.03]" : ""}`}
                                        >
                                          <td className="py-2 px-1 whitespace-nowrap align-middle">
                                            <span className="text-lg font-medium">
                                              {formatTime(match.start_time)}
                                            </span>
                                          </td>
                                          <td className="py-2 px-1 whitespace-nowrap align-middle">
                                            <div
                                              className={`text-lg font-medium ${match.match_type === "FM" ? "text-rose-400" : ""}`}
                                            >
                                              {match.match_code}
                                            </div>
                                          </td>
                                          <td className="py-2 px-1">
                                            {/* PC: 1行表示 */}
                                            <div className="hidden md:block text-base">
                                              <span className={team1Class}>
                                                {match.team1_display_name || "調整中"}
                                              </span>
                                              <span className="text-gray-500 mx-2">&times;</span>
                                              <span className={team2Class}>
                                                {match.team2_display_name || "調整中"}
                                              </span>
                                            </div>
                                            {/* スマホ: 縦並び */}
                                            <div className="md:hidden text-base space-y-0.5">
                                              <div className={team1Class}>
                                                {match.team1_display_name || "調整中"}
                                              </div>
                                              <div className="text-sm text-gray-500">&times;</div>
                                              <div className={team2Class}>
                                                {match.team2_display_name || "調整中"}
                                              </div>
                                            </div>
                                          </td>
                                          <td className="py-2 px-1 whitespace-nowrap text-center md:text-right align-middle">
                                            {/* PC: 横並びスコア */}
                                            <div className="hidden md:flex items-center justify-end">
                                              <div className="text-base">{result.display}</div>
                                            </div>
                                            {/* スマホ: 縦並びスコア */}
                                            <div className="md:hidden">
                                              {result.status === "completed" ||
                                              result.status === "draw" ||
                                              result.status === "walkover" ? (
                                                <div className="flex flex-col items-center leading-tight space-y-0.5">
                                                  <span
                                                    className={`text-base font-medium ${score1Class}`}
                                                  >
                                                    {result.team1Score}
                                                  </span>
                                                  <span className="text-sm text-gray-500">
                                                    &nbsp;
                                                  </span>
                                                  <span
                                                    className={`text-base font-medium ${score2Class}`}
                                                  >
                                                    {result.team2Score}
                                                  </span>
                                                </div>
                                              ) : (result.status === "ongoing" ||
                                                  result.status === "completed_unconfirmed") &&
                                                result.team1Score !== undefined ? (
                                                <div className="flex flex-col items-center leading-tight space-y-0.5">
                                                  <span
                                                    className={`text-base font-medium ${result.statusColor || ""}`}
                                                  >
                                                    {result.team1Score}
                                                  </span>
                                                  <span
                                                    className={`text-xs ${result.statusColor || ""}`}
                                                  >
                                                    ({result.statusLabel})
                                                  </span>
                                                  <span
                                                    className={`text-base font-medium ${result.statusColor || ""}`}
                                                  >
                                                    {result.team2Score}
                                                  </span>
                                                </div>
                                              ) : (
                                                <div className="text-base">{result.display}</div>
                                              )}
                                            </div>
                                            {hasRemarksMobile && (
                                              <div className="text-xs text-gray-500 mt-1 hidden md:block text-right">
                                                {matchRemarks}
                                              </div>
                                            )}
                                          </td>
                                          {!hasMultipleCourts && (
                                            <td className="py-2 px-1 whitespace-nowrap text-right align-middle hidden md:table-cell">
                                              {match.court_number ? (
                                                <div className="flex items-center justify-end text-sm">
                                                  <MapPin className="h-3 w-3 mr-1 text-gray-500" />
                                                  <span>
                                                    {match.court_name || match.court_number}
                                                  </span>
                                                </div>
                                              ) : (
                                                <span className="text-gray-500 text-sm">-</span>
                                              )}
                                            </td>
                                          )}
                                        </tr>
                                        {/* スマホ: 備考を全列結合で表示 */}
                                        {hasRemarksMobile && (
                                          <tr
                                            className={`${!match.match_comment ? "border-b" : ""} md:hidden ${isEvenRow ? "bg-black/[0.03]" : ""}`}
                                          >
                                            <td
                                              colSpan={hasMultipleCourts ? 4 : 5}
                                              className="pb-2 px-1 pt-0"
                                            >
                                              <div className="text-xs text-gray-500 text-right">
                                                備考: {matchRemarks}
                                              </div>
                                            </td>
                                          </tr>
                                        )}
                                        {/* コメント表示（PC・スマホ共通、全列結合で試合下部に表示） */}
                                        {match.match_comment && (
                                          <tr
                                            className={`border-b ${isEvenRow ? "bg-black/[0.03]" : ""}`}
                                          >
                                            <td colSpan={99} className="pb-2 px-1 pt-1">
                                              <div className="flex items-start gap-1 text-xs text-blue-600">
                                                <MessageSquare className="h-3 w-3 shrink-0 mt-0.5" />
                                                <span>{match.match_comment}</span>
                                              </div>
                                            </td>
                                          </tr>
                                        )}
                                      </React.Fragment>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </>
    );
  };

  // 節別スケジュール表示コンポーネント（リーグ戦用・試合コード順）
  const ScheduleByMatchday = ({ filteredMatches: fm }: { filteredMatches: MatchData[] }) => {
    // 節ごとにグループ化
    const matchesByMatchday = fm.reduce(
      (acc, match) => {
        const md = match.matchday ?? 0;
        if (!acc[md]) acc[md] = [];
        acc[md].push(match);
        return acc;
      },
      {} as Record<number, MatchData[]>,
    );

    const sortedMatchdays = Object.keys(matchesByMatchday)
      .map(Number)
      .sort((a, b) => a - b);

    // 日付の短縮フォーマット（M/d）
    const formatShortDate = (dateStr: string): string => {
      if (!dateStr || dateStr === "2024-01-01") return "-";
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return "-";
      return `${d.getMonth() + 1}/${d.getDate()}`;
    };

    // 節ごとの背景色（薄い色、交互に変化）
    const matchdayBgColors = [
      "bg-blue-50/60",
      "bg-amber-50/60",
      "bg-green-50/60",
      "bg-purple-50/60",
      "bg-rose-50/60",
      "bg-cyan-50/60",
      "bg-orange-50/60",
      "bg-indigo-50/60",
    ];

    return (
      <>
        {sortedMatchdays.map((matchday, mdIndex) => {
          const mdMatches = matchesByMatchday[matchday];
          const bgColor = matchdayBgColors[mdIndex % matchdayBgColors.length];

          // 試合コード順にソート
          const sortedMatches = [...mdMatches].sort((a, b) =>
            a.match_code.localeCompare(b.match_code, undefined, { numeric: true }),
          );

          return (
            <div key={matchday} id={`schedule-matchday-${matchday}`} className="space-y-0">
              {/* 節ヘッダー（sticky：ヘッダー + タブナビ + JumpNav の下に追従） */}
              <div
                className={`sticky z-10 ${bgColor} border border-gray-200 rounded-t-lg px-4 py-3 flex items-center justify-between shadow-sm`}
                style={{ top: `${dateHeaderTop}px` }}
              >
                <div className="flex items-center text-2xl font-semibold leading-none tracking-tight">
                  <Trophy className="h-5 w-5 mr-2 text-primary" />第{matchday}節
                </div>
                <span className="text-sm text-gray-500 font-normal">{mdMatches.length}試合</span>
              </div>

              {/* 試合テーブル */}
              <div
                className={`${bgColor} border border-t-0 border-gray-200 rounded-b-lg p-2 sm:p-3`}
              >
                <Card className="bg-white/80">
                  <CardContent className="pt-4 px-2 sm:px-4">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-3 px-1 font-medium whitespace-nowrap">
                            日時
                          </th>
                          <th className="text-left py-3 px-1 font-medium whitespace-nowrap">
                            試合
                          </th>
                          <th className="text-left py-3 px-1 font-medium w-full">対戦</th>
                          <th className="text-center md:text-right py-3 px-1 font-medium whitespace-nowrap">
                            結果
                          </th>
                          <th
                            className="text-center py-3 px-1 font-medium hidden md:table-cell whitespace-nowrap"
                            style={{ minWidth: venueColWidth }}
                          >
                            会場
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedMatches.map((match, matchIndex) => {
                          const result = getMatchResult(match);
                          const hasVenue = match.venue_name || match.court_name;
                          const courtDiffersFromVenue =
                            match.court_name &&
                            match.venue_name &&
                            match.court_name !== match.venue_name;
                          const matchVenue = match.venue_id
                            ? venues.find((v) => v.venue_id === match.venue_id)
                            : null;
                          const isEvenRow = matchIndex % 2 === 1;
                          const matchRemarks = [
                            match.remarks && !match.is_walkover ? match.remarks : null,
                            match.override_reason,
                          ]
                            .filter(Boolean)
                            .join(" / ");
                          const hasRemarks = !!matchRemarks;
                          const hasSubRows = hasVenue || hasRemarks || !!match.match_comment;
                          const mainRowBorder = hasSubRows ? "" : "border-b";

                          const team1Class =
                            result.winner === "team1"
                              ? "font-bold text-red-600"
                              : match.match_type === "FM"
                                ? "text-rose-400"
                                : "";
                          const team2Class =
                            result.winner === "team2"
                              ? "font-bold text-red-600"
                              : match.match_type === "FM"
                                ? "text-rose-400"
                                : "";
                          const score1Class =
                            result.winner === "team1" ? "text-red-600 font-bold" : "";
                          const score2Class =
                            result.winner === "team2" ? "text-red-600 font-bold" : "";

                          return (
                            <React.Fragment key={match.match_id}>
                              <tr
                                className={`hover:bg-gray-50/50 ${mainRowBorder} ${isEvenRow ? "bg-black/[0.03]" : ""}`}
                              >
                                <td className="py-2 px-1 whitespace-nowrap align-top">
                                  <div className="text-lg font-medium">
                                    {formatShortDate(match.tournament_date)}
                                  </div>
                                  <div className="text-lg font-medium">
                                    {formatTime(match.start_time)}
                                  </div>
                                </td>
                                <td className="py-2 px-1 whitespace-nowrap align-middle">
                                  <div
                                    className={`text-lg font-medium ${match.match_type === "FM" ? "text-rose-400" : ""}`}
                                  >
                                    {match.match_code}
                                  </div>
                                </td>
                                <td className="py-2 px-1">
                                  {/* PC: 1行表示 */}
                                  <div className="hidden md:block text-base">
                                    <span className={team1Class}>
                                      {match.team1_display_name || "調整中"}
                                    </span>
                                    <span className="text-gray-500 mx-2">&times;</span>
                                    <span className={team2Class}>
                                      {match.team2_display_name || "調整中"}
                                    </span>
                                  </div>
                                  {/* スマホ: 縦並び */}
                                  <div className="md:hidden text-base space-y-0.5">
                                    <div className={team1Class}>
                                      {match.team1_display_name || "調整中"}
                                    </div>
                                    <div className="text-sm text-gray-500">&times;</div>
                                    <div className={team2Class}>
                                      {match.team2_display_name || "調整中"}
                                    </div>
                                  </div>
                                </td>
                                <td className="py-2 px-1 whitespace-nowrap text-center md:text-right align-middle">
                                  {/* PC: 横並びスコア */}
                                  <div className="hidden md:flex items-center justify-end">
                                    <div className="text-base">{result.display}</div>
                                  </div>
                                  {/* スマホ: 縦並びスコア */}
                                  <div className="md:hidden">
                                    {result.status === "completed" ||
                                    result.status === "draw" ||
                                    result.status === "walkover" ? (
                                      <div className="flex flex-col items-center leading-tight space-y-0.5">
                                        <span className={`text-base font-medium ${score1Class}`}>
                                          {result.team1Score}
                                        </span>
                                        <span className="text-sm text-gray-500">&nbsp;</span>
                                        <span className={`text-base font-medium ${score2Class}`}>
                                          {result.team2Score}
                                        </span>
                                      </div>
                                    ) : (result.status === "ongoing" ||
                                        result.status === "completed_unconfirmed") &&
                                      result.team1Score !== undefined ? (
                                      <div className="flex flex-col items-center leading-tight space-y-0.5">
                                        <span
                                          className={`text-base font-medium ${result.statusColor || ""}`}
                                        >
                                          {result.team1Score}
                                        </span>
                                        <span className={`text-xs ${result.statusColor || ""}`}>
                                          ({result.statusLabel})
                                        </span>
                                        <span
                                          className={`text-base font-medium ${result.statusColor || ""}`}
                                        >
                                          {result.team2Score}
                                        </span>
                                      </div>
                                    ) : (
                                      <div className="text-base">{result.display}</div>
                                    )}
                                  </div>
                                  {hasRemarks && (
                                    <div className="text-xs text-gray-500 mt-1 hidden md:block text-right">
                                      {matchRemarks}
                                    </div>
                                  )}
                                </td>
                                {/* PC: 会場列 */}
                                <td className="py-2 px-1 text-center align-middle hidden md:table-cell whitespace-nowrap">
                                  {hasVenue ? (
                                    <div className="text-sm">
                                      <div className="flex items-center justify-center">
                                        <MapPin className="h-3 w-3 mr-1 text-gray-500" />
                                        {matchVenue?.google_maps_url ? (
                                          <a
                                            href={matchVenue.google_maps_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-primary hover:underline"
                                          >
                                            {match.venue_name || match.court_name}
                                          </a>
                                        ) : (
                                          <span>{match.venue_name || match.court_name}</span>
                                        )}
                                      </div>
                                      {courtDiffersFromVenue && (
                                        <div className="text-xs text-gray-500 text-center">
                                          {match.court_name}
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-gray-500 text-sm">-</span>
                                  )}
                                </td>
                              </tr>
                              {/* スマホ: 全列結合の会場行 */}
                              {hasVenue && (
                                <tr
                                  className={`${!hasRemarks && !match.match_comment ? "border-b" : ""} md:hidden ${isEvenRow ? "bg-black/[0.03]" : ""}`}
                                >
                                  <td colSpan={4} className="pb-2 px-1 pt-0">
                                    <div className="flex items-center text-xs text-gray-500">
                                      <MapPin className="h-3 w-3 mr-0.5 shrink-0" />
                                      {matchVenue?.google_maps_url ? (
                                        <a
                                          href={matchVenue.google_maps_url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-primary hover:underline"
                                        >
                                          {match.venue_name || match.court_name}
                                        </a>
                                      ) : (
                                        <span>{match.venue_name || match.court_name}</span>
                                      )}
                                      {courtDiffersFromVenue && (
                                        <span className="ml-1">/ {match.court_name}</span>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )}
                              {/* スマホ: 備考を全列結合で表示 */}
                              {hasRemarks && (
                                <tr
                                  className={`${!match.match_comment ? "border-b" : ""} md:hidden ${isEvenRow ? "bg-black/[0.03]" : ""}`}
                                >
                                  <td colSpan={5} className="pb-2 px-1 pt-0">
                                    <div className="text-xs text-gray-500">
                                      備考: {matchRemarks}
                                    </div>
                                  </td>
                                </tr>
                              )}
                              {/* コメント表示（PC・スマホ共通、全列結合で試合下部に表示） */}
                              {match.match_comment && (
                                <tr className={`border-b ${isEvenRow ? "bg-black/[0.03]" : ""}`}>
                                  <td colSpan={99} className="pb-2 px-1 pt-1">
                                    <div className="flex items-start gap-1 text-xs text-blue-600">
                                      <MessageSquare className="h-3 w-3 shrink-0 mt-0.5" />
                                      <span>{match.match_comment}</span>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              </div>
            </div>
          );
        })}
      </>
    );
  };

  return (
    <div className="space-y-6">
      {/* 試合速報エリア */}
      <MatchNewsArea tournamentId={tournamentId} />

      {/* フィルター */}
      {((hasAssignedTeams && confirmedTeams.length > 0) || courtOptions.length > 1) && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          {hasAssignedTeams && confirmedTeams.length > 0 && (
            <div className="flex items-center gap-2 min-w-0">
              <Users className="h-4 w-4 text-gray-500 shrink-0" />
              <Select value={filterTeamId} onValueChange={setFilterTeamId}>
                <SelectTrigger className="w-full sm:w-[280px]">
                  <SelectValue placeholder="チームで絞り込み" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">すべてのチーム</SelectItem>
                  {confirmedTeams.map((team) => (
                    <SelectItem
                      key={team.tournament_team_id}
                      value={team.tournament_team_id.toString()}
                    >
                      {team.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {courtOptions.length > 1 && (
            <div className="flex items-center gap-2 min-w-0">
              <MapPin className="h-4 w-4 text-gray-500 shrink-0" />
              <Select value={filterCourtNumber} onValueChange={setFilterCourtNumber}>
                <SelectTrigger className="w-full sm:w-[220px]">
                  <SelectValue placeholder="コートで絞り込み" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">すべてのコート</SelectItem>
                  {courtOptions.map((court) => (
                    <SelectItem key={court.court_number} value={court.court_number.toString()}>
                      {court.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {(filterTeamId !== "all" || filterCourtNumber !== "all") && (
            <span className="text-sm text-gray-500 shrink-0">{filteredMatches.length}試合</span>
          )}
        </div>
      )}

      <OverviewCard filteredMatches={filteredMatches} />
      <JumpNav filteredMatches={filteredMatches} />
      {isLeagueMode ? (
        <ScheduleByMatchday filteredMatches={filteredMatches} />
      ) : (
        <ScheduleByDate filteredMatches={filteredMatches} />
      )}
    </div>
  );
}
