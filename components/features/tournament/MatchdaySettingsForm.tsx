"use client";

import { AlertTriangle, Calendar, ChevronDown, ChevronUp, Copy, Loader2, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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

/** 手動入力可能なコンボボックス */
function ComboInput({
  value,
  onChange,
  suggestions,
  placeholder,
  className,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  suggestions: string[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <Popover open={open && !disabled} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <Input
          ref={inputRef}
          className={className}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          disabled={disabled}
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
  available_courts: number;
}

interface MatchItem {
  match_id: number;
  match_number: number;
  match_code: string;
  match_type: string;
  matchday: number;
  cycle: number;
  tournament_date: string;
  start_time: string;
  court_number: number | null;
  court_name: string;
  venue_name: string;
  team1_display_name: string;
  team2_display_name: string;
  block_name: string;
}

interface TournamentInfo {
  tournament_id: number;
  tournament_name: string;
  format_name: string;
  match_duration_minutes: number;
}

interface Conflict {
  matchIdA: number;
  matchIdB: number;
  matchCodeA: string;
  matchCodeB: string;
  date: string;
  time: string;
  court: string;
}

interface Props {
  tournamentId: string;
}

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

export default function MatchdaySettingsForm({ tournamentId }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tournament, setTournament] = useState<TournamentInfo | null>(null);
  const [matches, setMatches] = useState<MatchItem[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [showBulk, setShowBulk] = useState(false);
  const [collapsedMatchdays, setCollapsedMatchdays] = useState<Set<number>>(new Set());

  // 一括設定用
  const [bulkVenueName, setBulkVenueName] = useState<string>("");
  const [bulkStartTime, setBulkStartTime] = useState<string>("09:00");
  const [bulkCourtName, setBulkCourtName] = useState<string>("");
  const [bulkInterval, setBulkInterval] = useState<string>("7");
  const [bulkStartDate, setBulkStartDate] = useState<string>("");
  const [bulkTimeInterval, setBulkTimeInterval] = useState<string>("0"); // 試合間隔（分）: 0=なし
  const [bulkTargetMode, setBulkTargetMode] = useState<"all" | "selected">("all");
  const [bulkSelectedMatchdays, setBulkSelectedMatchdays] = useState<Set<number>>(new Set());
  // 項目ごとの適用ON/OFF
  const [bulkApplyVenue, setBulkApplyVenue] = useState(true);
  const [bulkApplyCourt, setBulkApplyCourt] = useState(true);
  const [bulkApplyDate, setBulkApplyDate] = useState(true);
  const [bulkApplyStartTime, setBulkApplyStartTime] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`/api/tournaments/${tournamentId}/matchday-settings`);
        const data = await res.json();
        if (data.success) {
          setTournament(data.tournament);
          setMatches(data.matches);
          setVenues(data.venues);
        }
      } catch (err) {
        console.error("データ取得エラー:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [tournamentId]);

  // 節ごとにグループ化
  const matchesByMatchday = useMemo(() => {
    const grouped: Record<number, MatchItem[]> = {};
    matches.forEach((m) => {
      if (!grouped[m.matchday]) grouped[m.matchday] = [];
      grouped[m.matchday].push(m);
    });
    return Object.entries(grouped)
      .map(([md, ms]) => ({ matchday: Number(md), matches: ms }))
      .sort((a, b) => a.matchday - b.matchday);
  }, [matches]);

  // 使用済みコート名を収集（プリセット候補に追加）
  const usedCourtNames = useMemo(() => {
    const names = new Set<string>();
    matches.forEach((m) => {
      if (m.court_name) names.add(m.court_name);
    });
    return Array.from(names);
  }, [matches]);

  // 日時・コート重複チェック
  const conflicts = useMemo(() => {
    const matchDuration = tournament?.match_duration_minutes || 10;
    const result: Conflict[] = [];

    for (let i = 0; i < matches.length; i++) {
      const a = matches[i];
      if (!a.tournament_date || !a.start_time) continue;

      for (let j = i + 1; j < matches.length; j++) {
        const b = matches[j];
        if (!b.tournament_date || !b.start_time) continue;
        if (a.tournament_date !== b.tournament_date) continue;

        const courtA = (a.court_name || "").trim();
        const courtB = (b.court_name || "").trim();
        if (courtA && courtB && courtA !== courtB) continue;

        const [aH, aM] = a.start_time.split(":").map(Number);
        const [bH, bM] = b.start_time.split(":").map(Number);
        const aStart = aH * 60 + aM;
        const aEnd = aStart + matchDuration;
        const bStart = bH * 60 + bM;
        const bEnd = bStart + matchDuration;

        if (aStart < bEnd && bStart < aEnd) {
          result.push({
            matchIdA: a.match_id,
            matchIdB: b.match_id,
            matchCodeA: a.match_code,
            matchCodeB: b.match_code,
            date: a.tournament_date,
            time: a.start_time,
            court: courtA || courtB || "コート未設定",
          });
        }
      }
    }
    return result;
  }, [matches, tournament?.match_duration_minutes]);

  // 重複がある試合IDのSet
  const conflictMatchIds = useMemo(() => {
    const ids = new Set<number>();
    conflicts.forEach((c) => {
      ids.add(c.matchIdA);
      ids.add(c.matchIdB);
    });
    return ids;
  }, [conflicts]);

  const updateMatch = useCallback(
    (matchId: number, field: string, value: string | number | null) => {
      setMatches((prev) =>
        prev.map((m) => (m.match_id === matchId ? { ...m, [field]: value } : m)),
      );
    },
    [],
  );

  const updateMatchFields = useCallback((matchId: number, fields: Partial<MatchItem>) => {
    setMatches((prev) => prev.map((m) => (m.match_id === matchId ? { ...m, ...fields } : m)));
  }, []);

  const toggleMatchday = (matchday: number) => {
    setCollapsedMatchdays((prev) => {
      const next = new Set(prev);
      if (next.has(matchday)) next.delete(matchday);
      else next.add(matchday);
      return next;
    });
  };

  // 前節の設定をコピー
  const copyFromPreviousMatchday = (matchday: number) => {
    const prevMatches = matches.filter((m) => m.matchday === matchday - 1);
    if (prevMatches.length === 0) return;

    // 前節の最初の試合の日付から+7日
    const prevDate = prevMatches[0]?.tournament_date;
    let nextDate = "";
    if (prevDate) {
      const d = new Date(prevDate);
      d.setDate(d.getDate() + 7);
      nextDate = d.toISOString().split("T")[0];
    }

    setMatches((prev) =>
      prev.map((m) => {
        if (m.matchday !== matchday) return m;
        // 同じ節内のインデックスで前節からコピー
        const idx = prev.filter((p) => p.matchday === matchday).indexOf(m);
        const prevMatch = prevMatches[idx];
        if (!prevMatch) return { ...m, tournament_date: nextDate };
        return {
          ...m,
          tournament_date: nextDate || prevMatch.tournament_date,
          start_time: prevMatch.start_time,
          court_name: prevMatch.court_name,
          court_number: prevMatch.court_number,
          venue_name: prevMatch.venue_name,
        };
      }),
    );
  };

  // 一括設定の適用対象の節を取得
  const getTargetMatchdays = useCallback((): number[] => {
    if (bulkTargetMode === "all") {
      return matchesByMatchday.map(({ matchday }) => matchday);
    }
    return matchesByMatchday
      .filter(({ matchday }) => bulkSelectedMatchdays.has(matchday))
      .map(({ matchday }) => matchday);
  }, [bulkTargetMode, bulkSelectedMatchdays, matchesByMatchday]);

  const toggleBulkMatchday = (matchday: number) => {
    setBulkSelectedMatchdays((prev) => {
      const next = new Set(prev);
      if (next.has(matchday)) next.delete(matchday);
      else next.add(matchday);
      return next;
    });
  };

  const selectAllBulkMatchdays = () => {
    setBulkSelectedMatchdays(new Set(matchesByMatchday.map(({ matchday }) => matchday)));
  };

  const deselectAllBulkMatchdays = () => {
    setBulkSelectedMatchdays(new Set());
  };

  // 一括設定を適用
  const applyBulkSettings = () => {
    const targetMatchdays = getTargetMatchdays();
    if (targetMatchdays.length === 0) {
      alert("適用する節を選択してください");
      return;
    }

    if (!bulkApplyVenue && !bulkApplyCourt && !bulkApplyDate && !bulkApplyStartTime) {
      alert("適用する項目を1つ以上選択してください");
      return;
    }

    const targetSet = new Set(targetMatchdays);
    const startDate = bulkApplyDate && bulkStartDate ? new Date(bulkStartDate) : null;
    const intervalDays = parseInt(bulkInterval) || 7;
    const timeIntervalMinutes = parseInt(bulkTimeInterval) || 0;

    // 対象節のみ日付を計算
    const matchdayDates: Record<number, string> = {};
    targetMatchdays.forEach((matchday, index) => {
      if (startDate) {
        const d = new Date(startDate);
        d.setDate(d.getDate() + index * intervalDays);
        matchdayDates[matchday] = d.toISOString().split("T")[0];
      }
    });

    setMatches((prev) => {
      // 節ごとの試合インデックスを管理（時刻の連番計算用）
      const matchdayIndexMap = new Map<number, number>();

      return prev.map((m) => {
        if (!targetSet.has(m.matchday)) return m;

        const updated = { ...m };

        if (bulkApplyDate && matchdayDates[m.matchday]) {
          updated.tournament_date = matchdayDates[m.matchday];
        }

        if (bulkApplyStartTime) {
          if (timeIntervalMinutes > 0) {
            // 節内の試合順に開始時刻をずらす
            const idx = matchdayIndexMap.get(m.matchday) || 0;
            matchdayIndexMap.set(m.matchday, idx + 1);
            const [h, min] = bulkStartTime.split(":").map(Number);
            const totalMin = h * 60 + min + idx * timeIntervalMinutes;
            const newH = Math.floor(totalMin / 60) % 24;
            const newM = totalMin % 60;
            updated.start_time = `${String(newH).padStart(2, "0")}:${String(newM).padStart(2, "0")}`;
          } else {
            updated.start_time = bulkStartTime;
          }
        }

        if (bulkApplyVenue && bulkVenueName) {
          updated.venue_name = bulkVenueName;
          // 会場設定時はコート名にも同名を自動セット
          updated.court_name = bulkVenueName;
        }

        if (bulkApplyCourt && bulkCourtName) {
          updated.court_name = bulkCourtName;
        }

        return updated;
      });
    });
  };

  const handleSave = async () => {
    if (conflicts.length > 0) {
      alert("日時・コートの重複があるため保存できません。重複を解消してください。");
      return;
    }

    setSaving(true);
    try {
      const matchPayload = matches.map((m) => ({
        match_id: m.match_id,
        tournament_date: m.tournament_date,
        start_time: m.start_time,
        court_number: m.court_number,
        court_name: m.court_name,
        venue_name: m.venue_name,
      }));

      const res = await fetch(`/api/tournaments/${tournamentId}/matchday-settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matches: matchPayload }),
      });

      const result = await res.json();
      if (result.success) {
        alert("日程・会場設定を保存しました");
        router.refresh();
        router.push("/my");
      } else if (result.conflicts) {
        alert("日時・コートの重複があります:\n\n" + result.conflicts.join("\n"));
      } else {
        alert(result.error || "保存に失敗しました");
      }
    } catch (err) {
      console.error("保存エラー:", err);
      alert("保存中にエラーが発生しました");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (!tournament) {
    return <p className="text-destructive">部門情報が見つかりません</p>;
  }

  const matchDuration = tournament.match_duration_minutes || 10;
  const configuredMatchCount = matches.filter((m) => m.tournament_date).length;
  const totalMatchCount = matches.length;

  // コート名候補リスト（プリセット + 使用済み、重複除去）
  const courtNameSuggestions = Array.from(new Set([...usedCourtNames, ...COURT_NAME_PRESETS]));

  return (
    <div className="space-y-6 pb-20">
      {/* ヘッダー情報 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">{tournament.tournament_name}</CardTitle>
          <p className="text-sm text-gray-500">
            {tournament.format_name} / {matchesByMatchday.length}節 / 全{totalMatchCount}試合
          </p>
          {configuredMatchCount < totalMatchCount && (
            <p className="text-sm text-amber-600">
              未設定の試合: {totalMatchCount - configuredMatchCount}試合
            </p>
          )}
        </CardHeader>
      </Card>

      {/* 一括設定 */}
      <Card>
        <CardHeader className="pb-2 cursor-pointer" onClick={() => setShowBulk(!showBulk)}>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">一括設定</CardTitle>
            {showBulk ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </CardHeader>
        {showBulk && (
          <CardContent className="pt-0 space-y-3">
            <p className="text-xs text-gray-500">
              チェックを入れた項目のみ一括適用します。試合時間: {matchDuration}分
            </p>
            <div className="space-y-3">
              {/* 日付 */}
              <div className="flex items-start gap-2">
                <Checkbox
                  checked={bulkApplyDate}
                  onCheckedChange={(v) => setBulkApplyDate(!!v)}
                  className="mt-1.5"
                />
                <div className="flex-1 grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">開始日</Label>
                    <Input
                      className="h-9"
                      type="date"
                      value={bulkStartDate}
                      onChange={(e) => setBulkStartDate(e.target.value)}
                      disabled={!bulkApplyDate}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">日付間隔</Label>
                    <Select
                      value={bulkInterval}
                      onValueChange={setBulkInterval}
                      disabled={!bulkApplyDate}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="7">1週間</SelectItem>
                        <SelectItem value="14">2週間</SelectItem>
                        <SelectItem value="21">3週間</SelectItem>
                        <SelectItem value="28">4週間</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              {/* 開始時刻 */}
              <div className="flex items-start gap-2">
                <Checkbox
                  checked={bulkApplyStartTime}
                  onCheckedChange={(v) => setBulkApplyStartTime(!!v)}
                  className="mt-1.5"
                />
                <div className="flex-1 grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">開始時刻</Label>
                    <Input
                      className="h-9"
                      type="time"
                      value={bulkStartTime}
                      onChange={(e) => setBulkStartTime(e.target.value)}
                      disabled={!bulkApplyStartTime}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">試合間隔</Label>
                    <Select
                      value={bulkTimeInterval}
                      onValueChange={setBulkTimeInterval}
                      disabled={!bulkApplyStartTime}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">なし（全試合同じ時刻）</SelectItem>
                        <SelectItem value={String(matchDuration)}>
                          {matchDuration}分（試合時間のみ）
                        </SelectItem>
                        <SelectItem value={String(matchDuration + 5)}>
                          {matchDuration + 5}分（試合時間+休憩5分）
                        </SelectItem>
                        <SelectItem value={String(matchDuration + 10)}>
                          {matchDuration + 10}分（試合時間+休憩10分）
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              {/* 会場 */}
              <div className="flex items-start gap-2">
                <Checkbox
                  checked={bulkApplyVenue}
                  onCheckedChange={(v) => setBulkApplyVenue(!!v)}
                  className="mt-1.5"
                />
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">会場</Label>
                  <Input
                    className="h-9"
                    value={bulkVenueName}
                    onChange={(e) => setBulkVenueName(e.target.value)}
                    placeholder="例: ○○グラウンド"
                    list="bulk-venue-presets"
                    disabled={!bulkApplyVenue}
                  />
                  <datalist id="bulk-venue-presets">
                    {venues.map((v) => (
                      <option key={v.venue_id} value={v.venue_name} />
                    ))}
                  </datalist>
                  <p className="text-xs text-gray-500">
                    ※ 会場を設定するとコート名にも同じ名称が自動設定されます
                  </p>
                </div>
              </div>
              {/* コート名 */}
              <div className="flex items-start gap-2">
                <Checkbox
                  checked={bulkApplyCourt}
                  onCheckedChange={(v) => setBulkApplyCourt(!!v)}
                  className="mt-1.5"
                />
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">コート名</Label>
                  <ComboInput
                    className="h-9"
                    value={bulkCourtName}
                    onChange={setBulkCourtName}
                    suggestions={courtNameSuggestions}
                    placeholder="例: メインコート"
                    disabled={!bulkApplyCourt}
                  />
                </div>
              </div>
            </div>

            {/* 適用対象 */}
            <div className="space-y-2 pt-1 border-t">
              <Label className="text-xs font-medium">適用対象</Label>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="bulkTarget"
                    checked={bulkTargetMode === "all"}
                    onChange={() => setBulkTargetMode("all")}
                    className="accent-primary"
                  />
                  全節
                </label>
                <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="bulkTarget"
                    checked={bulkTargetMode === "selected"}
                    onChange={() => setBulkTargetMode("selected")}
                    className="accent-primary"
                  />
                  選択した節のみ
                </label>
              </div>
              {bulkTargetMode === "selected" && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="text-xs text-primary hover:underline"
                      onClick={selectAllBulkMatchdays}
                    >
                      全選択
                    </button>
                    <span className="text-xs text-gray-500">/</span>
                    <button
                      type="button"
                      className="text-xs text-primary hover:underline"
                      onClick={deselectAllBulkMatchdays}
                    >
                      全解除
                    </button>
                    <span className="text-xs text-gray-500 ml-1">
                      ({bulkSelectedMatchdays.size}/{matchesByMatchday.length}節選択中)
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {matchesByMatchday.map(({ matchday }) => (
                      <label
                        key={matchday}
                        className="flex items-center gap-1 text-sm cursor-pointer"
                      >
                        <Checkbox
                          checked={bulkSelectedMatchdays.has(matchday)}
                          onCheckedChange={() => toggleBulkMatchday(matchday)}
                        />
                        <span className="text-xs">第{matchday}節</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <Button variant="outline" size="sm" onClick={applyBulkSettings}>
              {bulkTargetMode === "all"
                ? "全節に適用"
                : `選択した${bulkSelectedMatchdays.size}節に適用`}
            </Button>
          </CardContent>
        )}
      </Card>

      {/* 重複警告 */}
      {conflicts.length > 0 && (
        <Card className="border-destructive bg-destructive/5">
          <CardContent className="py-3 space-y-1.5">
            <div className="flex items-center gap-2 text-destructive font-medium text-sm">
              <AlertTriangle className="w-4 h-4" />
              日時・コートの重複が{conflicts.length}件あります（保存できません）
            </div>
            <ul className="text-xs text-destructive/80 space-y-0.5 ml-6 list-disc">
              {conflicts.map((c, i) => (
                <li key={i}>
                  {c.date} {c.time} [{c.court}]: {c.matchCodeA} と {c.matchCodeB}
                </li>
              ))}
            </ul>
            <p className="text-xs text-gray-500 ml-6">
              同じコートでは{matchDuration}
              分以上の間隔が必要です。時刻またはコート名を変更してください。
            </p>
          </CardContent>
        </Card>
      )}

      {/* 各節の試合設定 */}
      <div className="space-y-4">
        {matchesByMatchday.map(({ matchday, matches: mdMatches }) => {
          const isCollapsed = collapsedMatchdays.has(matchday);
          const allConfigured = mdMatches.every((m) => m.tournament_date);
          const noneConfigured = mdMatches.every((m) => !m.tournament_date);

          return (
            <Card
              key={matchday}
              className={noneConfigured ? "border-dashed border-amber-300 bg-amber-50/30" : ""}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <button
                    className="flex items-center gap-2 text-left"
                    onClick={() => toggleMatchday(matchday)}
                  >
                    <Calendar className="w-4 h-4" />
                    <CardTitle className="text-sm font-medium">
                      第{matchday}節
                      <span className="text-xs text-gray-500 font-normal ml-2">
                        ({mdMatches.length}試合)
                      </span>
                    </CardTitle>
                    {noneConfigured && <span className="text-xs text-amber-600">未設定</span>}
                    {allConfigured && <span className="text-xs text-green-600">設定済</span>}
                    {isCollapsed ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronUp className="w-4 h-4" />
                    )}
                  </button>
                  <div className="flex items-center gap-1">
                    {matchday > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs h-7"
                        onClick={() => copyFromPreviousMatchday(matchday)}
                      >
                        <Copy className="w-3 h-3 mr-1" />
                        前節コピー
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              {!isCollapsed && (
                <CardContent className="pt-0 space-y-2">
                  {mdMatches.map((match) => {
                    const hasDate = !!match.tournament_date;
                    const hasConflict = conflictMatchIds.has(match.match_id);
                    return (
                      <div
                        key={match.match_id}
                        className={`rounded-md border p-3 space-y-2 ${hasConflict ? "border-destructive bg-destructive/5" : !hasDate ? "border-dashed border-amber-200" : "border-gray-200"}`}
                      >
                        {/* 試合情報ヘッダー */}
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-medium text-sm">{match.match_code}</span>
                            <span className="text-xs text-gray-500 ml-2">{match.match_type}</span>
                          </div>
                          <span className="text-sm">
                            {match.team1_display_name}
                            <span className="text-gray-500 mx-1.5">vs</span>
                            {match.team2_display_name}
                          </span>
                        </div>
                        {/* 設定フィールド */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs text-gray-500">日付</Label>
                            <Input
                              className="h-8 text-sm"
                              type="date"
                              value={match.tournament_date}
                              onChange={(e) =>
                                updateMatch(match.match_id, "tournament_date", e.target.value)
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-gray-500">時刻</Label>
                            <Input
                              className="h-8 text-sm"
                              type="time"
                              value={match.start_time}
                              onChange={(e) =>
                                updateMatch(match.match_id, "start_time", e.target.value)
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-gray-500">会場</Label>
                            <Select
                              value={match.venue_name || "__empty__"}
                              onValueChange={(v) => {
                                const venueName = v === "__empty__" ? "" : v;
                                updateMatchFields(match.match_id, {
                                  venue_name: venueName,
                                  court_name: venueName,
                                });
                              }}
                            >
                              <SelectTrigger className="h-8 text-sm">
                                <SelectValue placeholder="選択してください" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__empty__">未選択</SelectItem>
                                {venues.map((v) => (
                                  <SelectItem key={v.venue_id} value={v.venue_name}>
                                    {v.venue_name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-gray-500">コート名</Label>
                            <ComboInput
                              className="h-8 text-sm"
                              value={match.court_name}
                              onChange={(v) => updateMatch(match.match_id, "court_name", v)}
                              suggestions={courtNameSuggestions}
                              placeholder="空欄可"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      {/* 保存ボタン（画面下部固定） */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex justify-end gap-3">
          <Button variant="outline" onClick={() => router.push("/my")}>
            キャンセル
          </Button>
          <Button onClick={handleSave} disabled={saving || conflicts.length > 0}>
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                保存中...
              </>
            ) : conflicts.length > 0 ? (
              <>
                <AlertTriangle className="w-4 h-4 mr-2" />
                重複あり
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
