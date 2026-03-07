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
import { Loader2, Info, Building2 } from "lucide-react";

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
  tournament_name: z.string().min(1, "部門名は必須です").max(100, "部門名は100文字以内で入力してください"),
  match_duration_minutes: z.number().min(5, "試合時間は5分以上").max(120, "試合時間は120分以下"),
  is_public: z.boolean(),
  show_players_public: z.boolean(),
  public_start_date: z.string().min(1, "公開開始日時は必須です"),
  recruitment_start_date: z.string().min(1, "募集開始日時は必須です"),
  recruitment_end_date: z.string().min(1, "募集終了日時は必須です"),
});

type LeagueEditForm = z.infer<typeof leagueEditSchema>;

export default function TournamentEditLeagueForm({ tournamentId }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tournament, setTournament] = useState<TournamentData | null>(null);
  const [matches, setMatches] = useState<MatchItem[]>([]);

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

          reset({
            tournament_name: data.tournament.tournament_name,
            match_duration_minutes: data.tournament.match_duration_minutes,
            is_public: data.tournament.visibility === "open",
            show_players_public: data.tournament.show_players_public,
            public_start_date: data.tournament.public_start_date,
            recruitment_start_date: data.tournament.recruitment_start_date,
            recruitment_end_date: data.tournament.recruitment_end_date,
          });
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
        router.push("/my");
        router.refresh();
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
    matches.forEach(m => {
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
      <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-2">
          <Info className="w-4 h-4" />
          フォーマット情報
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-muted-foreground">競技種別:</span>{" "}
            <span className="font-medium">{tournament.sport_name}</span>
          </div>
          <div>
            <span className="text-muted-foreground">フォーマット:</span>{" "}
            <span className="font-medium">{tournament.format_name}</span>
          </div>
          <div>
            <span className="text-muted-foreground">チーム数:</span>{" "}
            <span className="font-medium">{tournament.team_count}チーム</span>
          </div>
          <div>
            <span className="text-muted-foreground">節数:</span>{" "}
            <span className="font-medium">{matchesByMatchday.length}節（全{totalMatches}試合）</span>
          </div>
        </div>
      </div>

      {/* 所属する大会（読み取り専用） */}
      <div className="space-y-2">
        <Label>所属する大会</Label>
        <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
          <Building2 className="w-4 h-4 text-muted-foreground" />
          <span className="font-medium">{tournament.group_name || "未設定"}</span>
        </div>
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

      {/* 試合時間 */}
      <div className="space-y-2">
        <Label htmlFor="match_duration_minutes">試合時間(分) <span className="text-destructive">*</span></Label>
        <Input
          id="match_duration_minutes"
          type="number"
          className={`max-w-[200px] ${tournament?.default_match_duration != null ? "bg-muted" : ""}`}
          {...register("match_duration_minutes", { valueAsNumber: true })}
          disabled={tournament?.default_match_duration != null}
        />
        {tournament?.default_match_duration != null ? (
          <p className="text-xs text-muted-foreground">フォーマットで設定済み</p>
        ) : (
          <p className="text-xs text-muted-foreground">節設定で日時の重複チェックに使用されます</p>
        )}
        {errors.match_duration_minutes && <p className="text-sm text-destructive">{errors.match_duration_minutes.message}</p>}
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
          <p className="text-xs text-muted-foreground">
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
                  <span className="text-sm text-muted-foreground ml-1">（{mdMatches[0].cycle}巡目）</span>
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
                      <tr key={m.match_code} className="border-b hover:bg-muted">
                        <td className="py-2 px-3">
                          <div className="font-medium">{m.match_code}</div>
                          <div className="text-xs text-muted-foreground">{m.match_type}</div>
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

      {/* ボタン */}
      <div className="flex gap-3">
        <Button type="button" variant="outline" onClick={() => router.push("/my")} className="flex-1">
          キャンセル
        </Button>
        <Button type="submit" disabled={saving} className="flex-1">
          {saving ? (
            <><Loader2 className="w-4 h-4 animate-spin mr-2" />保存中...</>
          ) : (
            "保存する"
          )}
        </Button>
      </div>
    </form>
  );
}
