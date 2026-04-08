"use client";

import { Building2, Calendar, Loader2, MapPin, Search, Trophy, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getStatusLabel, type TournamentStatus } from "@/lib/tournament-status";

interface Prefecture {
  prefecture_id: number;
  prefecture_name: string;
  region_name: string;
}

interface SportType {
  sport_type_id: number;
  sport_type_name: string;
  icon?: string;
}

interface Organizer {
  login_user_id: number;
  organization_name: string;
  logo_blob_url: string | null;
  group_count: number;
  ongoing_count: number;
  open_count: number;
}

interface SearchTournament {
  tournament_id: number;
  tournament_name: string;
  group_id?: number | null;
  group_name?: string | null;
  status: TournamentStatus;
  format_name: string;
  venue_name: string;
  sport_type_id?: number;
  sport_icon?: string;
  team_count: number;
  event_start_date: string;
  event_end_date: string;
  tournament_period: string;
  recruitment_start_date: string;
  recruitment_end_date: string;
  logo_blob_url: string | null;
  organization_name: string | null;
  is_joined: boolean;
}

// 大会（グループ）単位の表示用
interface GroupedTournament {
  group_id: number;
  group_name: string;
  sport_icon: string;
  status: TournamentStatus;
  tournament_period: string;
  venue_name: string;
  logo_blob_url: string | null;
  organization_name: string | null;
}

interface TournamentSearchSectionProps {
  sportTypes: SportType[];
  initialTournaments: SearchTournament[];
  organizers: Organizer[];
}

function getStatusBadgeVariant(
  status: TournamentStatus,
): "muted" | "info" | "warning" | "success" | "error" {
  switch (status) {
    case "planning":
      return "muted";
    case "recruiting":
      return "info";
    case "before_event":
      return "warning";
    case "ongoing":
      return "success";
    case "completed":
      return "error";
    default:
      return "muted";
  }
}

export default function TournamentSearchSection({
  sportTypes,
  initialTournaments,
  organizers,
}: TournamentSearchSectionProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeSportType, setActiveSportType] = useState<number | null>(null);
  const [selectedPrefecture, setSelectedPrefecture] = useState<number | null>(null);
  const [prefectures, setPrefectures] = useState<Prefecture[]>([]);
  const [tournaments, setTournaments] = useState<SearchTournament[]>(initialTournaments);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [activeOrganizerId, setActiveOrganizerId] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/prefectures")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setPrefectures(data.prefectures);
      })
      .catch(() => {});
  }, []);

  const fetchResults = useCallback(
    async (
      keyword: string,
      prefectureId?: number | null,
      organizerId?: number | null,
      sportTypeId?: number | null,
    ) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (keyword) params.set("tournament_name", keyword);
        if (prefectureId) params.set("prefecture_id", String(prefectureId));
        if (organizerId) params.set("organizer_id", String(organizerId));
        if (sportTypeId) params.set("sport_type_id", String(sportTypeId));
        const res = await fetch(`/api/tournaments/search?${params}`);
        if (!res.ok) return;
        const result = await res.json();
        if (result.success) {
          setTournaments(result.data.tournaments);
        }
      } catch (err) {
        console.error("検索エラー:", err);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const handleSearch = useCallback(() => {
    setHasSearched(true);
    setActiveSportType(null);
    setActiveOrganizerId(null);
    fetchResults(searchTerm.trim(), selectedPrefecture);
  }, [searchTerm, selectedPrefecture, fetchResults]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleSearch();
  };

  const handlePrefectureChange = (prefectureId: number | null) => {
    setSelectedPrefecture(prefectureId);
    setActiveOrganizerId(null);
    if (prefectureId) {
      setHasSearched(true);
      fetchResults(searchTerm.trim(), prefectureId);
    } else if (!searchTerm.trim()) {
      setHasSearched(false);
      setTournaments(initialTournaments);
    } else {
      fetchResults(searchTerm.trim(), null);
    }
  };

  const handleOrganizerClick = (organizerId: number) => {
    setActiveOrganizerId(organizerId);
    setHasSearched(true);
    setActiveSportType(null);
    fetchResults("", null, organizerId);
    // 検索結果エリアにスクロール
    setTimeout(() => {
      document
        .getElementById("tournament-results")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  const handleSportTypeClick = (sportTypeId: number | null) => {
    if (activeSportType === sportTypeId || sportTypeId === null) {
      setActiveSportType(null);
      if (!searchTerm.trim() && !selectedPrefecture) {
        setHasSearched(false);
        setTournaments(initialTournaments);
      } else {
        fetchResults(searchTerm.trim(), selectedPrefecture);
      }
    } else {
      setActiveSportType(sportTypeId);
      setHasSearched(true);
      setActiveOrganizerId(null);
      fetchResults(searchTerm.trim(), selectedPrefecture, null, sportTypeId);
    }
    setTimeout(() => {
      document
        .getElementById("tournament-results")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  const handleClear = () => {
    setSearchTerm("");
    setActiveSportType(null);
    setSelectedPrefecture(null);
    setActiveOrganizerId(null);
    setHasSearched(false);
    setTournaments(initialTournaments);
  };

  // 部門を大会（グループ）単位に集約
  const groupMap = new Map<number, GroupedTournament>();
  const groupDivisionStatuses = new Map<number, TournamentStatus[]>();
  const groupVenueNames = new Map<number, string[]>();
  tournaments.forEach((t) => {
    const gid = t.group_id;
    if (!gid) return;
    if (!groupDivisionStatuses.has(gid)) {
      groupDivisionStatuses.set(gid, []);
    }
    groupDivisionStatuses.get(gid)!.push(t.status);
    // 会場名を収集（「/」区切りの場合は分割して個別に追加）
    if (t.venue_name && t.venue_name !== "未設定") {
      if (!groupVenueNames.has(gid)) {
        groupVenueNames.set(gid, []);
      }
      const venues = t.venue_name
        .split(" / ")
        .map((v: string) => v.trim())
        .filter(Boolean);
      groupVenueNames.get(gid)!.push(...venues);
    }
    if (!groupMap.has(gid)) {
      groupMap.set(gid, {
        group_id: gid,
        group_name: t.group_name || t.tournament_name,
        sport_icon: t.sport_icon || "🏆",
        status: t.status, // 仮設定（後で集約）
        tournament_period: t.tournament_period,
        venue_name: t.venue_name, // 仮設定（後で集約）
        logo_blob_url: t.logo_blob_url,
        organization_name: t.organization_name,
      });
    }
  });
  // グループ内の全部門ステータスを集約（ダッシュボードと同じロジック）
  groupMap.forEach((group, gid) => {
    const statuses = groupDivisionStatuses.get(gid) || [];
    if (statuses.some((s) => s === "ongoing")) group.status = "ongoing";
    else if (statuses.some((s) => s === "before_event")) group.status = "before_event";
    else if (statuses.some((s) => s === "recruiting")) group.status = "recruiting";
    else if (statuses.some((s) => s === "planning")) group.status = "planning";
    else if (statuses.every((s) => s === "completed")) group.status = "completed";
    // グループ内の全部門の会場名を重複除去して集約
    const venues = groupVenueNames.get(gid) || [];
    const uniqueVenues = [...new Set(venues)];
    group.venue_name = uniqueVenues.length > 0 ? uniqueVenues.join(" / ") : "未設定";
  });
  const groupedTournaments = Array.from(groupMap.values());

  // organization_name別にグループ化
  const grouped = new Map<
    string,
    { logo_blob_url: string | null; tournaments: GroupedTournament[] }
  >();
  groupedTournaments.forEach((t) => {
    const key = t.organization_name || "大会";
    if (!grouped.has(key)) {
      grouped.set(key, { logo_blob_url: t.logo_blob_url, tournaments: [] });
    }
    grouped.get(key)!.tournaments.push(t);
  });

  return (
    <div>
      {/* ======== 検索ボックス ======== */}
      <div
        className="w-full max-w-2xl mx-auto rounded-2xl bg-white shadow-lg p-6 sm:p-8"
        id="search-box"
      >
        {/* Search input */}
        <div className="flex gap-2">
          <Input
            type="text"
            placeholder="チーム名・大会名で検索"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 border-2 border-gray-200 rounded-lg px-4 py-3 text-base"
          />
          <Button onClick={handleSearch} className="shrink-0 rounded-lg px-5 group" size="lg">
            <Search className="h-5 w-5 transition-transform group-hover:scale-110" />
            <span className="ml-1.5 hidden sm:inline">検索</span>
          </Button>
        </div>

        {/* Prefecture dropdown */}
        {prefectures.length > 0 && (
          <div className="mt-4">
            <p className="text-xs text-gray-400 mb-2 font-medium">地域から探す</p>
            <select
              value={selectedPrefecture ?? ""}
              onChange={(e) =>
                handlePrefectureChange(e.target.value ? Number(e.target.value) : null)
              }
              className="w-full border-2 border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-700 bg-white focus:border-primary focus:outline-none transition-colors"
            >
              <option value="">都道府県を選択</option>
              {(() => {
                const grouped = new Map<string, Prefecture[]>();
                prefectures.forEach((p) => {
                  if (!grouped.has(p.region_name)) grouped.set(p.region_name, []);
                  grouped.get(p.region_name)!.push(p);
                });
                return Array.from(grouped.entries()).map(([region, prefs]) => (
                  <optgroup key={region} label={region}>
                    {prefs.map((p) => (
                      <option key={p.prefecture_id} value={p.prefecture_id}>
                        {p.prefecture_name}
                      </option>
                    ))}
                  </optgroup>
                ));
              })()}
            </select>
          </div>
        )}

        {/* Sport type icons */}
        {sportTypes.length > 0 && (
          <div className="mt-5">
            <p className="text-xs text-gray-400 mb-2.5 font-medium">競技から探す</p>
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-3">
              {/* すべてボタン */}
              <button
                onClick={() => handleSportTypeClick(null)}
                className="flex flex-col items-center gap-1.5 group cursor-pointer"
              >
                <div
                  className={`w-[56px] h-[56px] mx-auto flex items-center justify-center rounded-xl border-2 text-2xl transition-colors ${
                    activeSportType === null
                      ? "border-primary bg-primary/10"
                      : "border-gray-200 bg-white group-hover:border-primary group-hover:bg-primary/5"
                  }`}
                >
                  🏆
                </div>
                <span
                  className={`text-xs transition-colors truncate max-w-full ${
                    activeSportType === null
                      ? "text-primary font-medium"
                      : "text-gray-500 group-hover:text-primary"
                  }`}
                >
                  すべて
                </span>
              </button>
              {sportTypes.map((sport) => (
                <button
                  key={sport.sport_type_id}
                  onClick={() => handleSportTypeClick(sport.sport_type_id)}
                  className="flex flex-col items-center gap-1.5 group cursor-pointer"
                >
                  <div
                    className={`w-[56px] h-[56px] mx-auto flex items-center justify-center rounded-xl border-2 text-2xl transition-colors ${
                      activeSportType === sport.sport_type_id
                        ? "border-primary bg-primary/10"
                        : "border-gray-200 bg-white group-hover:border-primary group-hover:bg-primary/5"
                    }`}
                  >
                    {sport.icon || "🏆"}
                  </div>
                  <span
                    className={`text-xs transition-colors truncate max-w-full ${
                      activeSportType === sport.sport_type_id
                        ? "text-primary font-medium"
                        : "text-gray-500 group-hover:text-primary"
                    }`}
                  >
                    {sport.sport_type_name}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 検索条件の説明 */}
        {(searchTerm.trim() || selectedPrefecture || activeSportType) && (
          <p className="mt-3 text-xs text-gray-400">
            ※ 入力した条件すべてに一致する大会を表示します
          </p>
        )}
      </div>

      {/* ======== 大会一覧（検索結果） ======== */}
      <div className="mt-10 max-w-4xl mx-auto" id="tournament-results">
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
            {hasSearched ? "検索結果" : "公開中の大会"}
          </h2>
          {hasSearched && (
            <Button variant="ghost" size="sm" onClick={handleClear} className="text-gray-500">
              <X className="h-3.5 w-3.5 mr-1" />
              クリア
            </Button>
          )}
        </div>

        {hasSearched && searchTerm && !loading && (
          <p className="text-sm text-gray-500 mb-4">
            「{searchTerm}」の検索結果:{" "}
            <span className="font-medium text-gray-900">{groupedTournaments.length}件</span>
          </p>
        )}

        {/* ローディング */}
        {loading ? (
          <div className="text-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
            <p className="text-sm text-gray-500">大会を検索中...</p>
          </div>
        ) : groupedTournaments.length === 0 ? (
          /* 空状態 */
          <div className="text-center py-12">
            <Trophy className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-base font-medium text-gray-900 mb-2">
              {hasSearched ? "該当する大会が見つかりませんでした" : "公開中の大会はありません"}
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              {hasSearched
                ? "検索条件を変更してお試しください"
                : "大会が公開されるとこちらに表示されます"}
            </p>
            {hasSearched && (
              <Button variant="outline" size="sm" onClick={handleClear}>
                検索をクリア
              </Button>
            )}
          </div>
        ) : (
          /* 結果リスト */
          <div className="space-y-5">
            {Array.from(grouped.entries()).map(
              ([orgName, { logo_blob_url, tournaments: orgTournaments }]) => (
                <div key={orgName} className="border border-gray-200 rounded-xl p-5 bg-white">
                  {/* 主催者ヘッダー */}
                  <div className="flex items-center gap-2 mb-4">
                    {logo_blob_url && (
                      <div className="w-7 h-7 relative flex-shrink-0">
                        <Image
                          src={logo_blob_url}
                          alt={orgName}
                          fill
                          className="object-contain rounded"
                          sizes="28px"
                        />
                      </div>
                    )}
                    <span className="text-lg font-semibold text-gray-900">{orgName}</span>
                  </div>

                  {/* 大会カード */}
                  <div className="space-y-3">
                    {orgTournaments.map((t) => (
                      <Link
                        key={t.group_id}
                        href={`/tournaments/groups/${t.group_id}`}
                        className="block"
                      >
                        <div className="flex items-center justify-between p-4 bg-gray-50/50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                              {t.sport_icon && (
                                <span className="text-lg flex-shrink-0">{t.sport_icon}</span>
                              )}
                              <span className="text-base font-semibold text-gray-900 truncate">
                                {t.group_name}
                              </span>
                              <Badge
                                variant={getStatusBadgeVariant(t.status)}
                                className="flex-shrink-0"
                              >
                                {getStatusLabel(t.status)}
                              </Badge>
                            </div>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500">
                              {t.tournament_period && t.tournament_period !== "未設定" && (
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3.5 w-3.5" />
                                  {t.tournament_period}
                                </span>
                              )}
                              {t.venue_name && t.venue_name !== "未設定" && (
                                <span className="flex items-center gap-1">
                                  <MapPin className="h-3.5 w-3.5" />
                                  {t.venue_name}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              ),
            )}
          </div>
        )}
      </div>

      {/* ======== 注目の主催者・公式リーグ ======== */}
      {organizers.length > 0 && (
        <div className="mt-10 max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
              注目の主催者・公式リーグ
            </h2>
            <p className="text-sm text-gray-500">信頼できる協会・イベンターが開催する大会を探す</p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {organizers.map((org) => (
              <button
                key={org.login_user_id}
                onClick={() => handleOrganizerClick(org.login_user_id)}
                className="block w-full text-left"
              >
                <div
                  className={`bg-white border-2 rounded-xl p-5 text-center cursor-pointer transition-all duration-200 hover:border-primary hover:-translate-y-1 hover:shadow-lg ${
                    activeOrganizerId === org.login_user_id
                      ? "border-primary shadow-lg"
                      : "border-gray-200"
                  }`}
                >
                  <div className="w-20 h-14 mx-auto mb-3 flex items-center justify-center rounded-lg bg-gray-50 overflow-hidden">
                    {org.logo_blob_url ? (
                      <Image
                        src={org.logo_blob_url}
                        alt={org.organization_name}
                        width={80}
                        height={56}
                        className="object-contain w-full h-full"
                      />
                    ) : (
                      <Building2 className="h-6 w-6 text-gray-400" />
                    )}
                  </div>
                  <p className="font-semibold text-sm text-gray-900 mb-1 line-clamp-2">
                    {org.organization_name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {org.ongoing_count > 0 && (
                      <span className="text-green-600 font-medium">
                        開催中: {org.ongoing_count}
                      </span>
                    )}
                    {org.ongoing_count > 0 && org.open_count > org.ongoing_count && " / "}
                    {org.open_count > org.ongoing_count && `公開中: ${org.open_count}`}
                    {org.ongoing_count === 0 && org.open_count === 0 && `${org.group_count}大会`}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
