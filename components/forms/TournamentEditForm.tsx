'use client';

import { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tournament, Venue } from '@/lib/types';
import { Loader2, Plus, Trash2, Building2 } from 'lucide-react';
import SchedulePreview from '@/components/features/tournament/SchedulePreview';
import { useRouter } from 'next/navigation';
import { z } from 'zod';

interface TournamentEditFormProps {
  tournament: Tournament & {
    sport_name?: string | null;
    default_match_duration?: number | null;
    default_break_duration?: number | null;
  };
}

interface TournamentDate {
  dayNumber: number;
  date: string;
}

const editTournamentSchema = z.object({
  tournament_name: z.string().min(1, '部門名は必須です').max(100, '部門名は100文字以内で入力してください'),
  format_id: z.number().min(1, 'フォーマットIDが必要です'),
  venue_id: z.number().min(1, '会場を選択してください'),
  team_count: z.number().min(2, 'チーム数は2以上で入力してください').max(128, 'チーム数は128以下で入力してください'),
  court_count: z.number().min(1, 'コート数は1以上で入力してください').max(20, 'コート数は20以下で入力してください'),
  tournament_dates: z.array(z.object({
    dayNumber: z.number(),
    date: z.string()
  })).min(1, '開催日程は必須です'),
  match_duration_minutes: z.number().min(5, '試合時間は5分以上').max(120, '試合時間は120分以下'),
  break_duration_minutes: z.number().min(0, '休憩時間は0分以上').max(60, '休憩時間は60分以下'),
  is_public: z.boolean(),
  show_players_public: z.boolean(),
  public_start_date: z.string().min(1, '公開開始日時は必須です'),
  recruitment_start_date: z.string().min(1, '募集開始日時は必須です'),
  recruitment_end_date: z.string().min(1, '募集終了日時は必須です'),
});

type EditFormData = z.infer<typeof editTournamentSchema>;

export default function TournamentEditForm({ tournament }: TournamentEditFormProps) {
  const router = useRouter();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loadingVenues, setLoadingVenues] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [customSchedule, setCustomSchedule] = useState<Array<{
    match_id: number;
    match_code: string;
    start_time: string;
    court_number: number;
    team1_display_name: string;
    team2_display_name: string;
  }>>([]);
  const [currentMatches, setCurrentMatches] = useState<Array<{
    match_id: number;
    start_time: string;
    court_number: number;
  }>>([]);
  const [earliestMatchTime, setEarliestMatchTime] = useState<string>('09:00');

  // 既存のtournament_datesをパース
  const parseTournamentDates = (datesJson?: string): TournamentDate[] => {
    if (!datesJson) return [{ dayNumber: 1, date: '' }];
    try {
      const dates = JSON.parse(datesJson);
      return Object.entries(dates).map(([dayNumber, date]) => ({
        dayNumber: parseInt(dayNumber),
        date: date as string
      })).sort((a, b) => a.dayNumber - b.dayNumber);
    } catch {
      return [{ dayNumber: 1, date: '' }];
    }
  };

  const formatDateTimeLocal = (dateStr?: string): string => {
    if (!dateStr) return new Date().toISOString().slice(0, 16);
    if (dateStr.includes('T') || dateStr.includes(' ')) {
      return dateStr.replace(' ', 'T').slice(0, 16);
    }
    return `${dateStr}T00:00`;
  };

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
    getValues,
  } = useForm<EditFormData>({
    resolver: zodResolver(editTournamentSchema),
    defaultValues: {
      tournament_name: tournament.tournament_name,
      format_id: tournament.format_id,
      venue_id: tournament.venue_id,
      team_count: tournament.team_count,
      court_count: tournament.court_count,
      tournament_dates: parseTournamentDates(tournament.tournament_dates),
      match_duration_minutes: tournament.match_duration_minutes,
      break_duration_minutes: tournament.break_duration_minutes,
      is_public: tournament.visibility === 1,
      show_players_public: tournament.show_players_public || false,
      public_start_date: formatDateTimeLocal(tournament.public_start_date),
      recruitment_start_date: formatDateTimeLocal(tournament.recruitment_start_date),
      recruitment_end_date: formatDateTimeLocal(tournament.recruitment_end_date),
    },
  });

  const isPublic = watch("is_public");

  const handleScheduleChange = useCallback((matches: Array<{
    match_id: number;
    start_time: string;
    court_number: number;
  }>) => {
    const extended = matches.map(m => ({
      match_id: m.match_id,
      match_code: `M${m.match_id}`,
      start_time: m.start_time,
      court_number: m.court_number,
      team1_display_name: '',
      team2_display_name: '',
    }));
    setCustomSchedule(extended);
  }, []);

  // 既存試合データから現在の時間設定を取得
  const fetchCurrentMatchSchedule = useCallback(async () => {
    try {
      const response = await fetch(`/api/tournaments/${tournament.tournament_id}/matches`);
      const result = await response.json();
      if (result.success && result.data.length > 0) {
        const schedule = result.data
          .filter((m: { scheduled_time: string | null }) => m.scheduled_time !== null)
          .map((m: { match_id: number; scheduled_time: string; court_number: number | null }) => ({
            match_id: m.match_id,
            start_time: m.scheduled_time,
            court_number: m.court_number || 1,
          }));
        setCurrentMatches(schedule);
        if (schedule.length > 0) {
          const earliest = schedule.reduce((min: string, m: { start_time: string }) =>
            m.start_time < min ? m.start_time : min, schedule[0].start_time);
          setEarliestMatchTime(earliest);
        }
      }
    } catch (error) {
      console.error('試合スケジュール取得エラー:', error);
    }
  }, [tournament.tournament_id]);

  // 会場データの取得
  useEffect(() => {
    const fetchVenues = async () => {
      try {
        const response = await fetch('/api/venues');
        const result = await response.json();
        if (result.success) {
          const rawList = result.data || result.venues;
          // APIはavailable_courtsで返すが、Venue型はcourt_countを使用
          const venueList: Venue[] = rawList.map((v: Record<string, unknown>) => ({
            ...v,
            court_count: Number(v.court_count ?? v.available_courts ?? 0),
          }));
          setVenues(venueList);
          const current = venueList.find((v: Venue) => v.venue_id === tournament.venue_id);
          setSelectedVenue(current || null);
        }
      } catch (error) {
        console.error('会場取得エラー:', error);
      } finally {
        setLoadingVenues(false);
      }
    };
    fetchVenues();
    fetchCurrentMatchSchedule();
  }, [tournament.venue_id, fetchCurrentMatchSchedule]);

  const onSubmit = async (data: EditFormData) => {
    setIsSubmitting(true);

    // 日程バリデーション
    const hasEmptyDate = data.tournament_dates.some(d => !d.date);
    if (hasEmptyDate) {
      alert('すべての開催日を入力してください');
      setIsSubmitting(false);
      return;
    }

    // フォーマットに必要な開催日数チェック
    try {
      const templateResponse = await fetch(`/api/tournaments/formats/${tournament.format_id}/templates`);
      const templateResult = await templateResponse.json();
      if (templateResult.success && templateResult.data.statistics) {
        const maxDayNumber = templateResult.data.statistics.maxDayNumber || 1;
        const requiredDays = templateResult.data.statistics.requiredDays || 1;
        const providedDayNumbers = data.tournament_dates.map(d => d.dayNumber);
        const maxProvidedDay = Math.max(...providedDayNumbers);

        if (maxProvidedDay < maxDayNumber) {
          const proceed = confirm(
            `現在のフォーマットは${requiredDays}日間の開催が必要です（day ${maxDayNumber}まで）。\n` +
            `開催日程は${maxProvidedDay}日分しか登録されていません。\n\n` +
            `このまま保存すると、day ${maxProvidedDay + 1}以降の試合が最終日に配置されます。\n\n続行しますか？`
          );
          if (!proceed) { setIsSubmitting(false); return; }
        }
      }
    } catch { /* テンプレート取得失敗は続行 */ }

    try {
      const finalCustomMatches = customSchedule.length > 0
        ? customSchedule.map(m => ({ match_id: m.match_id, start_time: m.start_time, court_number: m.court_number }))
        : currentMatches;

      const response = await fetch(`/api/tournaments/${tournament.tournament_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          customMatches: finalCustomMatches.length > 0 ? finalCustomMatches : undefined,
        }),
      });

      const result = await response.json();
      if (result.success) {
        router.push('/my');
      } else {
        alert(`エラー: ${result.error || result.message || '更新に失敗しました'}`);
      }
    } catch {
      alert('更新中にエラーが発生しました');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* 選択済み情報 */}
      <div className="border rounded-lg p-4 bg-muted/30 space-y-3">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">編集中</Badge>
          <span className="text-sm font-medium">{tournament.format_name || 'フォーマット未設定'}</span>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-muted-foreground">競技種別:</span>{" "}
            <span className="font-medium">{tournament.sport_name || '未設定'}</span>
          </div>
          <div>
            <span className="text-muted-foreground">フォーマット:</span>{" "}
            <span className="font-medium">{tournament.format_name || '未設定'}</span>
          </div>
          <div>
            <span className="text-muted-foreground">チーム数:</span>{" "}
            <span className="font-medium">{tournament.team_count}チーム</span>
          </div>
        </div>
      </div>

      {/* 所属する大会 */}
      <div className="space-y-2">
        <Label>所属する大会</Label>
        <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
          <Building2 className="w-4 h-4 text-muted-foreground" />
          <span>{tournament.group_name || '未設定'}</span>
        </div>
      </div>

      {/* 部門名 */}
      <div className="space-y-2">
        <Label htmlFor="tournament_name">部門名 <span className="text-destructive">*</span></Label>
        <Input
          id="tournament_name"
          {...register("tournament_name")}
          placeholder="例: 小学2年生の部"
        />
        {errors.tournament_name && <p className="text-sm text-destructive">{errors.tournament_name.message}</p>}
      </div>

      {/* 会場 */}
      <div className="space-y-2">
        <Label>会場 <span className="text-destructive">*</span></Label>
        {loadingVenues ? (
          <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-muted-foreground">読み込み中...</span>
          </div>
        ) : (
          <Select
            value={watch('venue_id')?.toString()}
            onValueChange={(value) => {
              const venueId = parseInt(value);
              setValue("venue_id", venueId);
              const venue = venues.find(v => v.venue_id === venueId);
              setSelectedVenue(venue || null);
              if (venue && venue.court_count) {
                const currentCourtCount = watch('court_count') || 4;
                if (currentCourtCount > venue.court_count) {
                  setValue('court_count', venue.court_count);
                }
              }
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="会場を選択" />
            </SelectTrigger>
            <SelectContent>
              {venues.map((venue: Venue) => (
                <SelectItem key={venue.venue_id} value={venue.venue_id.toString()}>
                  {venue.venue_name}（{venue.court_count}コート）
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {errors.venue_id && <p className="text-sm text-destructive">{errors.venue_id.message}</p>}
      </div>

      {/* コート数 */}
      <div className="space-y-2">
        <Label htmlFor="court_count">使用コート数 <span className="text-destructive">*</span></Label>
        <Input
          id="court_count"
          type="number"
          className="max-w-[200px]"
          {...register("court_count", { valueAsNumber: true })}
          min={1}
          max={selectedVenue ? selectedVenue.court_count : 20}
        />
        {selectedVenue && (
          <p className="text-xs text-muted-foreground">
            {selectedVenue.venue_name}は最大{selectedVenue.court_count}コート利用可能
          </p>
        )}
        {errors.court_count && <p className="text-sm text-destructive">{errors.court_count.message}</p>}
      </div>

      {/* 開催日程 */}
      <div className="border rounded-lg p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">開催日程</h3>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              const currentDates = getValues('tournament_dates') || [];
              const nextDayNumber = Math.max(...currentDates.map(d => d.dayNumber), 0) + 1;
              const lastDate = currentDates.length > 0 && currentDates[currentDates.length - 1].date
                ? new Date(currentDates[currentDates.length - 1].date)
                : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
              const nextDate = new Date(lastDate);
              nextDate.setDate(lastDate.getDate() + 1);
              setValue('tournament_dates', [
                ...currentDates,
                { dayNumber: nextDayNumber, date: nextDate.toISOString().split('T')[0] }
              ]);
            }}
          >
            <Plus className="w-4 h-4 mr-1" />
            日程追加
          </Button>
        </div>
        {(watch('tournament_dates') || []).map((_, index) => (
          <div key={index} className="flex items-end gap-3">
            <div className="flex-1 space-y-1">
              <Label className="text-xs text-muted-foreground">開催日 {index + 1}</Label>
              <Input
                type="date"
                {...register(`tournament_dates.${index}.date`)}
              />
            </div>
            <div className="w-24 space-y-1">
              <Label className="text-xs text-muted-foreground">Day番号</Label>
              <Input
                type="number"
                min="1"
                {...register(`tournament_dates.${index}.dayNumber`, { valueAsNumber: true })}
              />
            </div>
            {(watch('tournament_dates')?.length || 0) > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9 px-2"
                onClick={() => {
                  const dates = getValues('tournament_dates') || [];
                  setValue('tournament_dates', dates.filter((_, i) => i !== index));
                }}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        ))}
        {errors.tournament_dates && <p className="text-sm text-destructive">{errors.tournament_dates.message}</p>}
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
          </p>
        </div>
      </div>

      {/* 時間設定 */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="match_duration_minutes">試合時間(分) <span className="text-destructive">*</span></Label>
          <Input
            id="match_duration_minutes"
            type="number"
            {...register("match_duration_minutes", { valueAsNumber: true })}
            min={5}
            max={120}
            disabled={tournament.default_match_duration != null}
            className={tournament.default_match_duration != null ? "bg-muted" : ""}
          />
          {tournament.default_match_duration != null && (
            <p className="text-xs text-muted-foreground">フォーマットで設定済み</p>
          )}
          {errors.match_duration_minutes && <p className="text-sm text-destructive">{errors.match_duration_minutes.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="break_duration_minutes">休憩時間(分) <span className="text-destructive">*</span></Label>
          <Input
            id="break_duration_minutes"
            type="number"
            {...register("break_duration_minutes", { valueAsNumber: true })}
            min={0}
            max={60}
            disabled={tournament.default_break_duration != null}
            className={tournament.default_break_duration != null ? "bg-muted" : ""}
          />
          {tournament.default_break_duration != null && (
            <p className="text-xs text-muted-foreground">フォーマットで設定済み</p>
          )}
          {errors.break_duration_minutes && <p className="text-sm text-destructive">{errors.break_duration_minutes.message}</p>}
        </div>
      </div>

      {/* スケジュールプレビュー */}
      <div className="border rounded-lg p-4 space-y-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">スケジュールプレビュー</h3>
          <Badge variant="secondary" className="text-xs">個別編集可能</Badge>
        </div>
        <p className="text-xs text-muted-foreground">各試合の時間とコート番号を個別に調整できます</p>
        <SchedulePreview
          formatId={watch('format_id') || null}
          settings={{
            courtCount: watch('court_count') || 4,
            availableCourts: selectedVenue ? Array.from({length: selectedVenue.court_count}, (_, i) => i + 1) : undefined,
            matchDurationMinutes: watch('match_duration_minutes') || 15,
            breakDurationMinutes: watch('break_duration_minutes') || 5,
            startTime: earliestMatchTime,
            tournamentDates: watch('tournament_dates') || [],
          }}
          tournamentId={tournament.tournament_id}
          editMode={true}
          onScheduleChange={handleScheduleChange}
        />
      </div>

      {/* 送信ボタン */}
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? (
          <><Loader2 className="w-4 h-4 animate-spin mr-2" />更新中...</>
        ) : (
          "更新する"
        )}
      </Button>
    </form>
  );
}
