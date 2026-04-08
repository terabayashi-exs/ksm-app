"use client";

import { Calendar, ChevronRight, Home, Loader2, MapPin, Save } from "lucide-react";
import Link from "next/link";
import { use, useEffect, useMemo, useRef, useState } from "react";
import Header from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// コート名プリセット
const COURT_NAME_PRESETS = [
  "メインコート",
  "サブコート",
  "第1コート",
  "第2コート",
  "Aピッチ",
  "Bピッチ",
  "Cピッチ",
  "第1グラウンド",
  "第2グラウンド",
];

/** 手動入力可能なコンボボックス */
function ComboInput({
  value,
  onChange,
  suggestions,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  suggestions: string[];
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <Input
          ref={inputRef}
          className={className}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
        />
      </PopoverAnchor>
      {suggestions.length > 0 && (
        <PopoverContent
          className="p-1 w-[var(--radix-popover-trigger-width)]"
          align="start"
          sideOffset={2}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="max-h-40 overflow-y-auto">
            {suggestions.map((name) => (
              <button
                key={name}
                type="button"
                className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-gray-100 cursor-pointer"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(name);
                  setOpen(false);
                }}
              >
                {name}
              </button>
            ))}
          </div>
        </PopoverContent>
      )}
    </Popover>
  );
}

interface Venue {
  venue_id: number;
  venue_name: string;
  address: string | null;
  available_courts: number;
}

// 日付×コート番号ごとの設定
interface DateCourtSetting {
  date: string;
  court_number: number;
  court_name: string;
  venue_id: number | null;
}

interface Match {
  match_id: number;
  match_code: string;
  court_number: number | null;
  start_time: string | null;
  court_name: string | null;
  venue_id: number | null;
  venue_name: string | null;
  team1_display_name: string;
  team2_display_name: string;
  match_status: string;
  tournament_date: string;
}

interface TournamentInfo {
  tournament_id: number;
  tournament_name: string;
  venue_id: string | null;
  court_count: number;
}

function formatDateLabel(date: string): string {
  if (date === "未設定") return "日付未設定";
  const d = new Date(date);
  const dayOfWeek = ["日", "月", "火", "水", "木", "金", "土"][d.getDay()];
  return `${d.getMonth() + 1}月${d.getDate()}日(${dayOfWeek})`;
}

export default function CourtVenueSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const tournamentId = resolvedParams.id;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tournament, setTournament] = useState<TournamentInfo | null>(null);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [dateCourtSettings, setDateCourtSettings] = useState<DateCourtSetting[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [matchOverrides, setMatchOverrides] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // 使用済みコート名を収集（プリセット候補に追加）
  const courtNameSuggestions = useMemo(() => {
    const names = new Set<string>();
    dateCourtSettings.forEach((cs) => {
      if (cs.court_name) names.add(cs.court_name);
    });
    matches.forEach((m) => {
      if (m.court_name) names.add(m.court_name);
    });
    return Array.from(new Set([...names, ...COURT_NAME_PRESETS]));
  }, [dateCourtSettings, matches]);

  // 日程→コート番号の2段階でグループ化
  const dateCourtGroups = useMemo(() => {
    const byDate: Record<string, Record<number, Match[]>> = {};
    matches.forEach((m) => {
      const date = m.tournament_date || "未設定";
      const cn = m.court_number || 0;
      if (!byDate[date]) byDate[date] = {};
      if (!byDate[date][cn]) byDate[date][cn] = [];
      byDate[date][cn].push(m);
    });
    return Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, courts]) => ({
        date,
        courts: Object.entries(courts)
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([courtKey, courtMatches]) => ({
            court_number: Number(courtKey),
            matches: courtMatches,
          })),
      }));
  }, [matches]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`/api/tournaments/${tournamentId}/court-venue-settings`);
        const result = await res.json();
        if (!result.success) {
          setError(result.error || "取得に失敗しました");
          return;
        }

        const data = result.data;
        setTournament(data.tournament);
        setVenues(data.venues);
        setMatches(data.matches);

        const venueList = data.venues as Venue[];
        const autoVenue = venueList.length === 1 ? venueList[0] : null;
        const matchList = data.matches as Match[];

        // 試合データから日付×コート番号の組み合わせを取得し、設定を生成
        const dateCourtMap = new Map<string, DateCourtSetting>();
        matchList.forEach((m) => {
          const date = m.tournament_date || "未設定";
          const cn = m.court_number || 0;
          const key = `${date}__${cn}`;
          if (!dateCourtMap.has(key)) {
            const venueId = m.venue_id;
            const courtName = m.court_name || (autoVenue ? autoVenue.venue_name : `コート${cn}`);
            dateCourtMap.set(key, {
              date,
              court_number: cn,
              court_name: courtName,
              venue_id: venueId ?? (autoVenue ? autoVenue.venue_id : null),
            });
          }
        });

        setDateCourtSettings(
          Array.from(dateCourtMap.values()).sort(
            (a, b) => a.date.localeCompare(b.date) || a.court_number - b.court_number,
          ),
        );
      } catch (err) {
        console.error("データ取得エラー:", err);
        setError("データの取得に失敗しました");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [tournamentId]);

  const getDateCourtSetting = (date: string, courtNumber: number): DateCourtSetting | undefined => {
    return dateCourtSettings.find((s) => s.date === date && s.court_number === courtNumber);
  };

  const handleVenueChange = (date: string, courtNumber: number, venueIdStr: string) => {
    const venueId = venueIdStr === "none" ? null : Number(venueIdStr);
    const venue = venues.find((v) => v.venue_id === venueId);

    setDateCourtSettings((prev) =>
      prev.map((cs) =>
        cs.date === date && cs.court_number === courtNumber
          ? {
              ...cs,
              venue_id: venueId,
              court_name: venue ? venue.venue_name : cs.court_name,
            }
          : cs,
      ),
    );
  };

  const handleCourtNameChange = (date: string, courtNumber: number, value: string) => {
    setDateCourtSettings((prev) =>
      prev.map((cs) =>
        cs.date === date && cs.court_number === courtNumber ? { ...cs, court_name: value } : cs,
      ),
    );
  };

  const handleMatchOverride = (matchId: number, courtName: string) => {
    setMatchOverrides((prev) => ({ ...prev, [matchId]: courtName }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const overrides = Object.entries(matchOverrides)
        .filter(([, name]) => name !== "")
        .map(([id, name]) => ({ match_id: Number(id), court_name: name }));

      const res = await fetch(`/api/tournaments/${tournamentId}/court-venue-settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dateCourtSettings, matchOverrides: overrides }),
      });

      const result = await res.json();
      if (result.success) {
        setSuccessMessage("設定を保存しました");
        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        setError(result.error || "保存に失敗しました");
      }
    } catch (err) {
      console.error("保存エラー:", err);
      setError("保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-16">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        <span>読み込み中...</span>
      </div>
    );
  }

  if (!tournament) {
    return <div className="text-center py-16 text-gray-500">部門が見つかりません</div>;
  }

  return (
    <div className="min-h-screen bg-white pb-20">
      <Header />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <nav className="flex flex-wrap items-center gap-1.5 text-sm">
          <Link
            href="/"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 transition-colors whitespace-nowrap"
          >
            <Home className="h-3.5 w-3.5" />
            <span>Home</span>
          </Link>
          <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <Link
            href="/my?tab=admin"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 transition-colors whitespace-nowrap"
          >
            マイダッシュボード
          </Link>
          <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <span className="inline-flex items-center px-2.5 py-1.5 rounded-md bg-primary/10 text-primary font-medium">
            会場・コート設定
          </span>
        </nav>
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">会場・コート設定</h1>
          <p className="text-sm text-gray-500 mt-1">
            開催日ごとに各コートの会場・コート名を設定します
          </p>
        </div>

        {/* メッセージ */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
            {error}
          </div>
        )}
        {successMessage && (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 text-sm">
            {successMessage}
          </div>
        )}

        {/* 日程×コート設定 + 試合一覧 */}
        {dateCourtGroups.map(({ date, courts }) => (
          <div key={date} className="space-y-3">
            {/* 日付見出し */}
            <div className="flex items-center gap-2 pt-2">
              <Calendar className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-semibold">{formatDateLabel(date)}</h3>
            </div>

            {/* コート設定 */}
            <Card className="ml-2">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <MapPin className="w-4 h-4" />
                  コート設定
                </CardTitle>
                <p className="text-xs text-gray-500">
                  ※ 会場を選択するとコート名にも同じ名称が自動設定されます
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                {courts.map(({ court_number }) => {
                  const setting = getDateCourtSetting(date, court_number);
                  return (
                    <div key={court_number} className="p-3 border rounded-lg space-y-2">
                      <span className="text-xs font-medium text-gray-500">
                        コート {court_number}
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs">会場</Label>
                          <Select
                            value={setting?.venue_id?.toString() || "none"}
                            onValueChange={(value) => handleVenueChange(date, court_number, value)}
                          >
                            <SelectTrigger className="bg-white h-9">
                              <SelectValue placeholder="会場を選択" />
                            </SelectTrigger>
                            <SelectContent className="bg-white border border-gray-200">
                              <SelectItem value="none">未設定</SelectItem>
                              {venues.map((v) => (
                                <SelectItem key={v.venue_id} value={v.venue_id.toString()}>
                                  {v.venue_name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">コート名</Label>
                          <ComboInput
                            className="h-9"
                            value={setting?.court_name || ""}
                            onChange={(v) => handleCourtNameChange(date, court_number, v)}
                            suggestions={courtNameSuggestions}
                            placeholder={`コート${court_number}`}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* コート別試合一覧 */}
            {courts.map(({ court_number, matches: courtMatches }) => (
              <Card key={court_number} className="ml-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">
                    コート {court_number} の試合 ({courtMatches.length}件)
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  {/* PC表示 */}
                  <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 px-2">試合コード</th>
                          <th className="text-left py-2 px-2">時間</th>
                          <th className="text-left py-2 px-2">対戦</th>
                          <th className="text-left py-2 px-2">コート名（個別変更）</th>
                        </tr>
                      </thead>
                      <tbody>
                        {courtMatches.map((match) => (
                          <tr key={match.match_id} className="border-b hover:bg-gray-50/50">
                            <td className="py-2 px-2 font-medium">{match.match_code}</td>
                            <td className="py-2 px-2">{match.start_time || "-"}</td>
                            <td className="py-2 px-2">
                              {match.team1_display_name} vs {match.team2_display_name}
                            </td>
                            <td className="py-2 px-2">
                              <ComboInput
                                className="h-7 text-xs w-32"
                                value={matchOverrides[match.match_id] || ""}
                                onChange={(v) => handleMatchOverride(match.match_id, v)}
                                suggestions={courtNameSuggestions}
                                placeholder={
                                  getDateCourtSetting(date, court_number)?.court_name ||
                                  `コート${court_number}`
                                }
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {/* スマホ表示 */}
                  <div className="sm:hidden space-y-2">
                    {courtMatches.map((match) => (
                      <div key={match.match_id} className="border rounded-md p-2.5 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm">{match.match_code}</span>
                          <span className="text-xs text-gray-500">{match.start_time || "-"}</span>
                        </div>
                        <div className="text-sm">
                          {match.team1_display_name} vs {match.team2_display_name}
                        </div>
                        <ComboInput
                          className="h-7 text-xs"
                          value={matchOverrides[match.match_id] || ""}
                          onChange={(v) => handleMatchOverride(match.match_id, v)}
                          suggestions={courtNameSuggestions}
                          placeholder={
                            getDateCourtSetting(date, court_number)?.court_name ||
                            `コート${court_number}`
                          }
                        />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ))}
      </div>

      {/* 保存ボタン（画面下部固定） */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex justify-end gap-3">
          <Button variant="outline" asChild>
            <Link href="/my">キャンセル</Link>
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                保存中...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                保存する
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
