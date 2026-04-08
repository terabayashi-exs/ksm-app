"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Building2, Check, ChevronsUpDown, Info, Loader2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";

interface Venue {
  venue_id: number;
  venue_name: string;
  available_courts: number;
}

interface TournamentData {
  tournament_id: number;
  tournament_name: string;
  format_id: number;
  format_name: string;
  sport_type_id: number;
  sport_name: string;
  team_count: number;
  match_duration_minutes: number;
  break_duration_minutes: number;
  status: string;
  visibility: string;
  show_players_public: boolean;
  public_start_date: string;
  recruitment_start_date: string;
  recruitment_end_date: string;
  group_id: number;
  group_name: string;
  default_match_duration: number | null;
  default_break_duration: number | null;
  venue_id: string | null;
}

interface MatchItem {
  match_code: string;
  match_type: string;
  matchday: number;
  cycle: number;
  team1_display_name: string;
  team2_display_name: string;
}

interface Props {
  tournamentId: string;
}

const leagueEditSchema = z.object({
  tournament_name: z
    .string()
    .min(1, "部門名は必須です")
    .max(100, "部門名は100文字以内で入力してください"),
  venue_ids: z.array(z.number()).min(1, "会場を1つ以上選択してください"),
  match_duration_minutes: z.number().min(5, "試合時間は5分以上").max(120, "試合時間は120分以下"),
  break_duration_minutes: z.number().min(0).max(60),
  display_match_duration: z.string().max(50),
  is_public: z.boolean(),
  show_players_public: z.boolean(),
  public_start_date: z.string().min(1, "公開開始日時は必須です"),
  recruitment_start_date: z.string().min(1, "募集開始日時は必須です"),
  recruitment_end_date: z.string().min(1, "募集終了日時は必須です"),
});

type LeagueEditForm = z.infer<typeof leagueEditSchema>;

function parseVenueIds(venueId: string | null | undefined): number[] {
  if (!venueId) return [];
  try {
    const parsed = JSON.parse(venueId);
    if (Array.isArray(parsed)) return parsed.map(Number).filter((n) => !isNaN(n));
    const num = Number(venueId);
    return isNaN(num) ? [] : [num];
  } catch {
    const num = Number(venueId);
    return isNaN(num) ? [] : [num];
  }
}

export default function TournamentEditLeagueForm({ tournamentId }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tournament, setTournament] = useState<TournamentData | null>(null);
  const [matches, setMatches] = useState<MatchItem[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [selectedVenues, setSelectedVenues] = useState<Venue[]>([]);
  const [loadingVenues, setLoadingVenues] = useState(true);
  const [venuePopoverOpen, setVenuePopoverOpen] = useState(false);
  const [venueSearchQuery, setVenueSearchQuery] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
    reset,
  } = useForm<LeagueEditForm>({
    resolver: zodResolver(leagueEditSchema),
  });

  const isPublic = watch("is_public");

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`/api/tournaments/${tournamentId}/edit-league`);
        const data = await res.json();
        if (data.success) {
          setTournament(data.tournament);
          setMatches(data.matches || []);

          const venueIds = parseVenueIds(data.tournament.venue_id);

          reset({
            tournament_name: data.tournament.tournament_name,
            venue_ids: venueIds,
            match_duration_minutes: data.tournament.match_duration_minutes,
            break_duration_minutes: data.tournament.break_duration_minutes || 0,
            display_match_duration: data.tournament.display_match_duration || "",
            is_public: data.tournament.visibility === "open",
            show_players_public: data.tournament.show_players_public,
            public_start_date: data.tournament.public_start_date,
            recruitment_start_date: data.tournament.recruitment_start_date,
            recruitment_end_date: data.tournament.recruitment_end_date,
          });

          // 会場データの取得
          try {
            const venueRes = await fetch("/api/venues?scope=available");
            const venueData = await venueRes.json();
            if (venueData.success) {
              const venueList: Venue[] = (venueData.data || []).map(
                (v: Record<string, unknown>) => ({
                  venue_id: Number(v.venue_id),
                  venue_name: String(v.venue_name),
                  available_courts: Number(v.available_courts ?? 0),
                }),
              );
              setVenues(venueList);
              const currentVenues = venueList.filter((v) => venueIds.includes(v.venue_id));
              setSelectedVenues(currentVenues);
            }
          } catch (err) {
            console.error("会場取得エラー:", err);
          } finally {
            setLoadingVenues(false);
          }
        }
      } catch (err) {
        console.error("データ取得エラー:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [tournamentId, reset]);

  const onSubmit = async (data: LeagueEditForm) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/edit-league`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (result.success) {
        alert("部門情報を更新しました");
        router.refresh();
        router.push("/my");
      } else {
        alert(result.error || "更新に失敗しました");
      }
    } catch (err) {
      console.error("更新エラー:", err);
      alert("更新中にエラーが発生しました");
    } finally {
      setSaving(false);
    }
  };

  // 試合を節ごとにグループ化
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

  const totalMatches = matches.length;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* 読み取り専用情報 */}
      <div className="rounded-lg border bg-gray-50/50 p-4 space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-500 mb-2">
          <Info className="w-4 h-4" />
          フォーマット情報
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-gray-500">競技種別:</span>{" "}
            <span className="font-medium">{tournament.sport_name}</span>
          </div>
          <div>
            <span className="text-gray-500">フォーマット:</span>{" "}
            <span className="font-medium">{tournament.format_name}</span>
          </div>
          <div>
            <span className="text-gray-500">チーム数:</span>{" "}
            <span className="font-medium">{tournament.team_count}チーム</span>
          </div>
          <div>
            <span className="text-gray-500">節数:</span>{" "}
            <span className="font-medium">
              {matchesByMatchday.length}節（全{totalMatches}試合）
            </span>
          </div>
        </div>
      </div>

      {/* 所属する大会（読み取り専用） */}
      <div className="space-y-2">
        <Label>所属する大会</Label>
        <div className="flex items-center gap-2 rounded-md border bg-gray-50/30 px-3 py-2 text-sm">
          <Building2 className="w-4 h-4 text-gray-500" />
          <span className="font-medium">{tournament.group_name || "未設定"}</span>
        </div>
      </div>

      {/* 部門名 */}
      <div className="space-y-2">
        <Label htmlFor="tournament_name">
          部門名 <span className="text-destructive">*</span>
        </Label>
        <Input
          id="tournament_name"
          placeholder="例: U-12リーグ前期"
          {...register("tournament_name")}
        />
        {errors.tournament_name && (
          <p className="text-sm text-destructive">{errors.tournament_name.message}</p>
        )}
      </div>

      {/* 会場（複数選択） */}
      <div className="space-y-2">
        <Label>
          会場 <span className="text-destructive">*</span>
        </Label>
        {loadingVenues ? (
          <div className="flex items-center gap-2 rounded-md border bg-gray-50/30 px-3 py-2 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-gray-500">読み込み中...</span>
          </div>
        ) : (
          <div className="space-y-2">
            {selectedVenues.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedVenues.map((venue) => (
                  <Badge
                    key={venue.venue_id}
                    variant="secondary"
                    className="text-sm py-1 px-2 gap-1"
                  >
                    {venue.venue_name}（{venue.available_courts}コート）
                    <button
                      type="button"
                      className="ml-1 hover:text-destructive"
                      onClick={() => {
                        const newVenues = selectedVenues.filter(
                          (v) => v.venue_id !== venue.venue_id,
                        );
                        setSelectedVenues(newVenues);
                        setValue(
                          "venue_ids",
                          newVenues.map((v) => v.venue_id),
                        );
                      }}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}

            <Popover open={venuePopoverOpen} onOpenChange={setVenuePopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={venuePopoverOpen}
                  className="w-full justify-between"
                >
                  {selectedVenues.length === 0
                    ? "会場を選択..."
                    : `${selectedVenues.length}件の会場を選択中`}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-2" align="start">
                <Input
                  placeholder="会場名で検索..."
                  value={venueSearchQuery}
                  onChange={(e) => setVenueSearchQuery(e.target.value)}
                  className="mb-2"
                />
                <div className="max-h-60 overflow-y-auto space-y-1">
                  {venues
                    .filter((v) =>
                      v.venue_name.toLowerCase().includes(venueSearchQuery.toLowerCase()),
                    )
                    .map((venue) => {
                      const isSelected = selectedVenues.some(
                        (sv) => sv.venue_id === venue.venue_id,
                      );
                      return (
                        <button
                          key={venue.venue_id}
                          type="button"
                          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left hover:bg-gray-100 ${isSelected ? "bg-gray-100/50" : ""}`}
                          onClick={() => {
                            let newVenues: Venue[];
                            if (isSelected) {
                              newVenues = selectedVenues.filter(
                                (v) => v.venue_id !== venue.venue_id,
                              );
                            } else {
                              newVenues = [...selectedVenues, venue];
                            }
                            setSelectedVenues(newVenues);
                            setValue(
                              "venue_ids",
                              newVenues.map((v) => v.venue_id),
                            );
                          }}
                        >
                          <Check
                            className={`h-4 w-4 ${isSelected ? "opacity-100" : "opacity-0"}`}
                          />
                          <span>{venue.venue_name}</span>
                          <span className="text-gray-500 ml-auto text-xs">
                            {venue.available_courts}コート
                          </span>
                        </button>
                      );
                    })}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        )}
        {errors.venue_ids && <p className="text-sm text-destructive">{errors.venue_ids.message}</p>}
        <p className="text-xs text-gray-500">
          ここで選択した会場が、日程・会場設定の会場プルダウンに表示されます
        </p>
      </div>

      {/* 試合時間 */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="match_duration_minutes">
            試合時間(分) <span className="text-destructive">*</span>
          </Label>
          <Input
            id="match_duration_minutes"
            type="number"
            className={`max-w-[200px] ${tournament?.default_match_duration != null ? "bg-gray-50" : ""}`}
            {...register("match_duration_minutes", { valueAsNumber: true })}
            disabled={tournament?.default_match_duration != null}
          />
          {tournament?.default_match_duration != null ? (
            <p className="text-xs text-gray-500">フォーマットで設定済み</p>
          ) : (
            <p className="text-xs text-gray-500">節設定で日時の重複チェックに使用されます</p>
          )}
          {errors.match_duration_minutes && (
            <p className="text-sm text-destructive">{errors.match_duration_minutes.message}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="display_match_duration">表示用試合時間</Label>
          <Input
            id="display_match_duration"
            type="text"
            className="max-w-[200px]"
            placeholder="例: 80, 40-10-40"
            {...register("display_match_duration")}
          />
          <p className="text-xs text-gray-500">
            概要ページに表示する試合時間（未入力時はシステム値を表示）
          </p>
        </div>
      </div>

      {/* 公開設定 */}
      <div className="border rounded-lg p-4 space-y-4">
        <h3 className="text-sm font-semibold">公開設定</h3>

        <div className="space-y-2">
          <Label htmlFor="public_start_date">
            公開開始日時 <span className="text-destructive">*</span>
          </Label>
          <Input id="public_start_date" type="datetime-local" {...register("public_start_date")} />
          {errors.public_start_date && (
            <p className="text-sm text-destructive">{errors.public_start_date.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="recruitment_start_date">
            募集開始日時 <span className="text-destructive">*</span>
          </Label>
          <Input
            id="recruitment_start_date"
            type="datetime-local"
            {...register("recruitment_start_date")}
          />
          {errors.recruitment_start_date && (
            <p className="text-sm text-destructive">{errors.recruitment_start_date.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="recruitment_end_date">
            募集終了日時 <span className="text-destructive">*</span>
          </Label>
          <Input
            id="recruitment_end_date"
            type="datetime-local"
            {...register("recruitment_end_date")}
          />
          {errors.recruitment_end_date && (
            <p className="text-sm text-destructive">{errors.recruitment_end_date.message}</p>
          )}
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="is_public" className="cursor-pointer">
            公開する
          </Label>
          <Switch
            id="is_public"
            checked={isPublic}
            onCheckedChange={(checked) => setValue("is_public", checked)}
          />
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label htmlFor="show_players_public" className="cursor-pointer">
              選手情報を一般公開する
            </Label>
            <Switch
              id="show_players_public"
              checked={watch("show_players_public")}
              onCheckedChange={(checked) => setValue("show_players_public", checked)}
            />
          </div>
          <p className="text-xs text-gray-500">
            チェックを入れると、一般ユーザーも部門詳細画面の「参加チーム」タブで選手名・背番号を閲覧できるようになります。
            チェックを外すと、大会運営者のみが閲覧可能になります。
          </p>
        </div>
      </div>

      {/* スケジュールプレビュー */}
      {matchesByMatchday.length > 0 && (
        <div className="border rounded-lg p-4 space-y-4">
          <h3 className="text-sm font-semibold">スケジュールプレビュー</h3>
          {matchesByMatchday.map(({ matchday, matches: mdMatches }) => (
            <div key={matchday} className="space-y-2">
              <p className="font-medium text-primary">
                第{matchday}節
                {mdMatches[0]?.cycle > 1 && (
                  <span className="text-sm text-gray-500 ml-1">（{mdMatches[0].cycle}巡目）</span>
                )}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-3 font-medium">試合</th>
                      <th className="text-left py-2 px-3 font-medium">対戦</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mdMatches.map((m) => (
                      <tr key={m.match_code} className="border-b hover:bg-gray-50">
                        <td className="py-2 px-3">
                          <div className="font-medium">{m.match_code}</div>
                          <div className="text-xs text-gray-500">{m.match_type}</div>
                        </td>
                        <td className="py-2 px-3 text-sm">
                          {m.team1_display_name} vs {m.team2_display_name}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 固定ボタン分のスペーサー */}
      <div className="h-16" />

      {/* 保存ボタン（画面下部固定） */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <Button type="submit" disabled={saving} className="w-full">
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                保存中...
              </>
            ) : (
              "保存する"
            )}
          </Button>
        </div>
      </div>
    </form>
  );
}
