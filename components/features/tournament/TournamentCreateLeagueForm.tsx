"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar, Loader2, Info, Building2, X, ChevronsUpDown, Check } from "lucide-react";

interface Venue {
  venue_id: number;
  venue_name: string;
  available_courts: number;
}

interface TemplateItem {
  match_code: string;
  match_type: string;
  team1_display_name: string;
  team2_display_name: string;
  matchday?: number;
  cycle?: number;
}

interface LeagueContext {
  sport_type_id: number;
  sport_name: string;
  team_count: number;
  format_id: number;
  format_name: string;
  default_match_duration?: number | null;
  default_break_duration?: number | null;
  group_id: number | null;
  group_name: string;
  matchday_count: number;
  matches_by_matchday: { matchday: number; matchCount: number }[];
  templates: TemplateItem[];
}

const leagueCreateSchema = z.object({
  group_id: z.number().min(1, "所属する大会が必要です"),
  tournament_name: z.string().min(1, "部門名は必須です").max(100, "部門名は100文字以内で入力してください"),
  venue_ids: z.array(z.number()).min(1, "会場を1つ以上選択してください"),
  match_duration_minutes: z.number().min(5, "試合時間は5分以上").max(120, "試合時間は120分以下"),
  break_duration_minutes: z.number().min(0, "休憩時間は0分以上").max(60, "休憩時間は60分以下"),
  is_public: z.boolean(),
  show_players_public: z.boolean(),
  public_start_date: z.string().min(1, "公開開始日時は必須です"),
  recruitment_start_date: z.string().min(1, "募集開始日時は必須です"),
  recruitment_end_date: z.string().min(1, "募集終了日時は必須です"),
});

type LeagueCreateForm = z.infer<typeof leagueCreateSchema>;

export default function TournamentCreateLeagueForm() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [leagueContext, setLeagueContext] = useState<LeagueContext | null>(null);
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
  } = useForm<LeagueCreateForm>({
    resolver: zodResolver(leagueCreateSchema),
    defaultValues: {
      match_duration_minutes: 10,
      break_duration_minutes: 5,
      venue_ids: [],
      is_public: true,
      show_players_public: false,
      public_start_date: new Date().toISOString().split('T')[0] + 'T00:00',
      recruitment_start_date: new Date().toISOString().split('T')[0] + 'T00:00',
      recruitment_end_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] + 'T00:00',
    },
  });

  const isPublic = watch("is_public");

  // マウント時にcontextを読み取り
  useEffect(() => {
    const stored = sessionStorage.getItem('create-league-context');
    if (!stored) {
      router.push('/admin/tournaments/create-new');
      return;
    }
    try {
      const ctx = JSON.parse(stored) as LeagueContext;
      setLeagueContext(ctx);
      // group_idをフォームにセット
      if (ctx.group_id) {
        setValue('group_id', ctx.group_id);
      }
      // フォーマットのデフォルト試合時間・休憩時間をセット
      if (ctx.default_match_duration != null) {
        setValue('match_duration_minutes', ctx.default_match_duration);
      }
      if (ctx.default_break_duration != null) {
        setValue('break_duration_minutes', ctx.default_break_duration);
      }
    } catch {
      router.push('/admin/tournaments/create-new');
    }
  }, [router, setValue]);

  // 会場データの取得
  useEffect(() => {
    const fetchVenues = async () => {
      try {
        const res = await fetch("/api/venues?scope=available");
        const data = await res.json();
        if (data.success) {
          const venueList: Venue[] = (data.data || []).map((v: Record<string, unknown>) => ({
            venue_id: Number(v.venue_id),
            venue_name: String(v.venue_name),
            available_courts: Number(v.available_courts ?? 0),
          }));
          setVenues(venueList);
        }
      } catch (err) {
        console.error("会場取得エラー:", err);
      } finally {
        setLoadingVenues(false);
      }
    };
    fetchVenues();
  }, []);

  // テンプレートを節ごとにグループ化
  const templatesByMatchday = useMemo(() => {
    if (!leagueContext?.templates) return [];
    const grouped: Record<number, TemplateItem[]> = {};
    leagueContext.templates.forEach(t => {
      const md = t.matchday ?? 0;
      if (!grouped[md]) grouped[md] = [];
      grouped[md].push(t);
    });
    return Object.entries(grouped)
      .map(([matchday, templates]) => ({
        matchday: Number(matchday),
        templates,
      }))
      .sort((a, b) => a.matchday - b.matchday);
  }, [leagueContext]);

  const onSubmit = async (data: LeagueCreateForm) => {
    if (!leagueContext) return;
    setIsSubmitting(true);

    try {
      const payload = {
        ...data,
        sport_type_id: leagueContext.sport_type_id,
        format_id: leagueContext.format_id,
        team_count: leagueContext.team_count,
        venue_ids: data.venue_ids,
      };

      const res = await fetch('/api/tournaments/create-league', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await res.json();

      if (result.success && result.tournament) {
        sessionStorage.removeItem('create-league-context');
        const tournamentId = result.tournament.tournament_id;
        router.push(`/admin/tournaments/${tournamentId}/matchday-settings`);
      } else {
        alert(result.error || '部門作成に失敗しました');
      }
    } catch (err) {
      console.error('作成エラー:', err);
      alert('部門作成中にエラーが発生しました');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!leagueContext) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }

  const totalMatches = leagueContext.matches_by_matchday.reduce((sum, m) => sum + m.matchCount, 0);

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
            <span className="font-medium">{leagueContext.sport_name}</span>
          </div>
          <div>
            <span className="text-gray-500">フォーマット:</span>{" "}
            <span className="font-medium">{leagueContext.format_name}</span>
          </div>
          <div>
            <span className="text-gray-500">チーム数:</span>{" "}
            <span className="font-medium">{leagueContext.team_count}チーム</span>
          </div>
          <div>
            <span className="text-gray-500">節数:</span>{" "}
            <span className="font-medium">{leagueContext.matchday_count}節（全{totalMatches}試合）</span>
          </div>
        </div>
      </div>

      {/* 所属する大会（読み取り専用） */}
      <div className="space-y-2">
        <Label>所属する大会</Label>
        <div className="flex items-center gap-2 rounded-md border bg-gray-50/30 px-3 py-2 text-sm">
          <Building2 className="w-4 h-4 text-gray-500" />
          <span className="font-medium">{leagueContext.group_name || '未設定'}</span>
        </div>
        {!leagueContext.group_id && (
          <p className="text-sm text-destructive">大会が選択されていません。部門作成画面からやり直してください。</p>
        )}
      </div>

      {/* 部門名 */}
      <div className="space-y-2">
        <Label htmlFor="tournament_name">部門名 <span className="text-destructive">*</span></Label>
        <Input
          id="tournament_name"
          placeholder="例: U-12リーグ前期"
          {...register("tournament_name")}
        />
        {errors.tournament_name && <p className="text-sm text-destructive">{errors.tournament_name.message}</p>}
      </div>

      {/* 会場（複数選択） */}
      <div className="space-y-2">
        <Label>会場 <span className="text-destructive">*</span></Label>
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
                  <Badge key={venue.venue_id} variant="secondary" className="text-sm py-1 px-2 gap-1">
                    {venue.venue_name}（{venue.available_courts}コート）
                    <button
                      type="button"
                      className="ml-1 hover:text-destructive"
                      onClick={() => {
                        const newVenues = selectedVenues.filter(v => v.venue_id !== venue.venue_id);
                        setSelectedVenues(newVenues);
                        setValue('venue_ids', newVenues.map(v => v.venue_id));
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
                    .filter(v => v.venue_name.toLowerCase().includes(venueSearchQuery.toLowerCase()))
                    .map((venue) => {
                      const isSelected = selectedVenues.some(sv => sv.venue_id === venue.venue_id);
                      return (
                        <button
                          key={venue.venue_id}
                          type="button"
                          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left hover:bg-gray-100 ${isSelected ? 'bg-gray-100/50' : ''}`}
                          onClick={() => {
                            let newVenues: Venue[];
                            if (isSelected) {
                              newVenues = selectedVenues.filter(v => v.venue_id !== venue.venue_id);
                            } else {
                              newVenues = [...selectedVenues, venue];
                            }
                            setSelectedVenues(newVenues);
                            setValue('venue_ids', newVenues.map(v => v.venue_id));
                          }}
                        >
                          <Check className={`h-4 w-4 ${isSelected ? 'opacity-100' : 'opacity-0'}`} />
                          <span>{venue.venue_name}</span>
                          <span className="text-gray-500 ml-auto text-xs">{venue.available_courts}コート</span>
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

      {/* 試合時間・休憩時間 */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="match_duration_minutes">試合時間(分) <span className="text-destructive">*</span></Label>
          <Input
            id="match_duration_minutes"
            type="number"
            className={`max-w-[200px] ${leagueContext?.default_match_duration != null ? "bg-gray-50" : ""}`}
            {...register("match_duration_minutes", { valueAsNumber: true })}
            disabled={leagueContext?.default_match_duration != null}
          />
          {leagueContext?.default_match_duration != null ? (
            <p className="text-xs text-gray-500">フォーマットで設定済み</p>
          ) : (
            <p className="text-xs text-gray-500">節設定で日時の重複チェックに使用されます</p>
          )}
          {errors.match_duration_minutes && <p className="text-sm text-destructive">{errors.match_duration_minutes.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="break_duration_minutes">休憩時間(分) <span className="text-destructive">*</span></Label>
          <Input
            id="break_duration_minutes"
            type="number"
            className={`max-w-[200px] ${leagueContext?.default_break_duration != null ? "bg-gray-50" : ""}`}
            {...register("break_duration_minutes", { valueAsNumber: true })}
            disabled={leagueContext?.default_break_duration != null}
          />
          {leagueContext?.default_break_duration != null ? (
            <p className="text-xs text-gray-500">フォーマットで設定済み</p>
          ) : (
            <p className="text-xs text-gray-500">試合間の休憩時間です</p>
          )}
          {errors.break_duration_minutes && <p className="text-sm text-destructive">{errors.break_duration_minutes.message}</p>}
        </div>
      </div>

      {/* 公開設定 */}
      <div className="border rounded-lg p-4 space-y-4">
        <h3 className="text-sm font-semibold">公開設定</h3>

        <div className="space-y-2">
          <Label htmlFor="public_start_date">公開開始日時 <span className="text-destructive">*</span></Label>
          <Input
            id="public_start_date"
            type="datetime-local"
            {...register("public_start_date")}
          />
          {errors.public_start_date && <p className="text-sm text-destructive">{errors.public_start_date.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="recruitment_start_date">募集開始日時 <span className="text-destructive">*</span></Label>
          <Input
            id="recruitment_start_date"
            type="datetime-local"
            {...register("recruitment_start_date")}
          />
          {errors.recruitment_start_date && <p className="text-sm text-destructive">{errors.recruitment_start_date.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="recruitment_end_date">募集終了日時 <span className="text-destructive">*</span></Label>
          <Input
            id="recruitment_end_date"
            type="datetime-local"
            {...register("recruitment_end_date")}
          />
          {errors.recruitment_end_date && <p className="text-sm text-destructive">{errors.recruitment_end_date.message}</p>}
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="is_public" className="cursor-pointer">公開する</Label>
          <Switch
            id="is_public"
            checked={isPublic}
            onCheckedChange={(checked) => setValue("is_public", checked)}
          />
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label htmlFor="show_players_public" className="cursor-pointer">選手情報を一般公開する</Label>
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
      {templatesByMatchday.length > 0 && (
        <div className="border rounded-lg p-4 space-y-4">
          <h3 className="text-sm font-semibold">スケジュールプレビュー</h3>
          {templatesByMatchday.map(({ matchday, templates }) => (
            <div key={matchday} className="space-y-2">
              <p className="font-medium text-primary">
                第{matchday}節
                {templates[0]?.cycle && templates[0].cycle > 1 && (
                  <span className="text-sm text-gray-500 ml-1">（{templates[0].cycle}巡目）</span>
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
                    {templates.map((t) => (
                      <tr key={t.match_code} className="border-b hover:bg-gray-50">
                        <td className="py-2 px-3">
                          <div className="font-medium">{t.match_code}</div>
                          <div className="text-xs text-gray-500">{t.match_type}</div>
                        </td>
                        <td className="py-2 px-3 text-sm">
                          {t.team1_display_name} vs {t.team2_display_name}
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

      {/* 注記 */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
        <Calendar className="w-4 h-4 inline mr-1" />
        節ごとの会場・コート・日程は、作成後に「日程・会場設定」画面から設定できます
      </div>

      {/* 送信ボタン */}
      <Button type="submit" className="w-full" disabled={isSubmitting || !leagueContext.group_id}>
        {isSubmitting ? (
          <><Loader2 className="w-4 h-4 animate-spin mr-2" />作成中...</>
        ) : (
          "作成する"
        )}
      </Button>
    </form>
  );
}
