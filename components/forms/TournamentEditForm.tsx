'use client';

import { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tournament, Venue, TournamentDate } from '@/lib/types';
import { Loader2, Save, AlertCircle, Calendar, Plus, Trash2, Eye } from 'lucide-react';
import SchedulePreview from '@/components/features/tournament/SchedulePreview';
import { useRouter } from 'next/navigation';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface TournamentEditFormProps {
  tournament: Tournament;
}

export default function TournamentEditForm({ tournament }: TournamentEditFormProps) {
  const router = useRouter();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [customMatches, setCustomMatches] = useState<Array<{
    match_id: number;
    start_time: string;
    court_number: number;
  }>>([]);

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

  // 編集用の型を明示的に定義
  interface EditFormData {
    tournament_name: string;
    format_id: number;
    venue_id: number;
    team_count: number;
    court_count: number;
    tournament_dates: TournamentDate[];
    match_duration_minutes: number;
    break_duration_minutes: number;
    win_points: number;
    draw_points: number;
    loss_points: number;
    walkover_winner_goals: number;
    walkover_loser_goals: number;
    is_public: boolean;
  }

  const form = useForm<EditFormData>({
    defaultValues: {
      tournament_name: tournament.tournament_name,
      format_id: tournament.format_id,
      venue_id: tournament.venue_id,
      team_count: tournament.team_count,
      court_count: tournament.court_count,
      tournament_dates: parseTournamentDates(tournament.tournament_dates),
      match_duration_minutes: tournament.match_duration_minutes,
      break_duration_minutes: tournament.break_duration_minutes,
      win_points: tournament.win_points,
      draw_points: tournament.draw_points,
      loss_points: tournament.loss_points,
      walkover_winner_goals: tournament.walkover_winner_goals,
      walkover_loser_goals: tournament.walkover_loser_goals,
      is_public: tournament.visibility === 1
    }
  });

  const watchedDates = form.watch('tournament_dates');

  // onScheduleChangeコールバックを安定化
  const handleScheduleChange = useCallback((customMatches: Array<{
    match_id: number;
    start_time: string;
    court_number: number;
  }>) => {
    // Received custom schedule changes for tournament edit
    setCustomMatches(customMatches);
  }, []);

  // 会場データの取得
  useEffect(() => {
    const fetchVenues = async () => {
      try {
        const response = await fetch('/api/venues');
        const result = await response.json();
        if (result.success) {
          setVenues(result.data);
        }
      } catch (error) {
        console.error('会場取得エラー:', error);
      }
    };
    fetchVenues();
  }, []);

  // 日程の追加
  const addTournamentDate = () => {
    const currentDates = form.getValues('tournament_dates');
    const nextDayNumber = Math.max(...currentDates.map(d => d.dayNumber)) + 1;
    form.setValue('tournament_dates', [
      ...currentDates,
      { dayNumber: nextDayNumber, date: '' }
    ]);
  };

  // 日程の削除
  const removeTournamentDate = (index: number) => {
    const currentDates = form.getValues('tournament_dates');
    if (currentDates.length > 1) {
      form.setValue('tournament_dates', currentDates.filter((_, i) => i !== index));
    }
  };

  // フォーム送信
  const onSubmit = async (data: EditFormData) => {
    // Form submission with custom schedule data
    setLoading(true);
    setError('');
    setSuccess('');

    // 基本的なバリデーション
    if (!data.tournament_name.trim()) {
      setError('大会名を入力してください');
      setLoading(false);
      return;
    }

    if (data.team_count < 2) {
      setError('参加チーム数は2以上で入力してください');
      setLoading(false);
      return;
    }

    if (data.court_count < 1) {
      setError('使用コート数は1以上で入力してください');
      setLoading(false);
      return;
    }

    // 日程のバリデーション
    const hasEmptyDate = data.tournament_dates.some(d => !d.date);
    if (hasEmptyDate) {
      setError('すべての開催日を入力してください');
      setLoading(false);
      return;
    }

    try {
      const requestData = {
        ...data,
        customMatches: customMatches.length > 0 ? customMatches : undefined
      };
      
      // Sending tournament update with custom schedule
      if (customMatches.length > 0) {
        // Custom schedule data being submitted
      }
      
      const response = await fetch(`/api/tournaments/${tournament.tournament_id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData),
      });

      const result = await response.json();

      if (result.success) {
        setSuccess('大会情報が正常に更新されました');
        // 少し待ってから管理画面に戻る
        setTimeout(() => {
          router.push('/admin');
        }, 2000);
      } else {
        setError(result.error || '更新に失敗しました');
      }
    } catch (error) {
      console.error('更新エラー:', error);
      setError('ネットワークエラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* エラー・成功メッセージ */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="border-green-200 bg-green-50">
          <AlertCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">{success}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        {/* 基本情報 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Calendar className="w-5 h-5 mr-2" />
              基本情報
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* 大会名 */}
            <div className="space-y-2">
              <Label htmlFor="tournament_name">大会名 *</Label>
              <Input
                id="tournament_name"
                {...form.register('tournament_name')}
                placeholder="例: 第1回PKトーナメント"
                className={form.formState.errors.tournament_name ? 'border-red-500' : ''}
              />
              {form.formState.errors.tournament_name && (
                <p className="text-sm text-red-600">
                  {form.formState.errors.tournament_name.message}
                </p>
              )}
            </div>

            {/* 会場選択 */}
            <div className="space-y-2">
              <Label htmlFor="venue_id">開催会場 *</Label>
              <Select
                value={form.watch('venue_id')?.toString()}
                onValueChange={(value) => form.setValue('venue_id', parseInt(value))}
              >
                <SelectTrigger className={form.formState.errors.venue_id ? 'border-red-500' : ''}>
                  <SelectValue placeholder="会場を選択してください" />
                </SelectTrigger>
                <SelectContent>
                  {venues.map((venue) => (
                    <SelectItem key={venue.venue_id} value={venue.venue_id.toString()}>
                      {venue.venue_name} (コート数: {venue.court_count})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.venue_id && (
                <p className="text-sm text-red-600">
                  {form.formState.errors.venue_id.message}
                </p>
              )}
            </div>

            {/* チーム数・コート数 */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="team_count">参加チーム数 *</Label>
                <Input
                  id="team_count"
                  type="number"
                  min="2"
                  max="32"
                  {...form.register('team_count', { valueAsNumber: true })}
                  className={form.formState.errors.team_count ? 'border-red-500' : ''}
                />
                {form.formState.errors.team_count && (
                  <p className="text-sm text-red-600">
                    {form.formState.errors.team_count.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="court_count">使用コート数 *</Label>
                <Input
                  id="court_count"
                  type="number"
                  min="1"
                  max="16"
                  {...form.register('court_count', { valueAsNumber: true })}
                  className={form.formState.errors.court_count ? 'border-red-500' : ''}
                />
                {form.formState.errors.court_count && (
                  <p className="text-sm text-red-600">
                    {form.formState.errors.court_count.message}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 開催日程 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center">
                <Calendar className="w-5 h-5 mr-2" />
                開催日程
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addTournamentDate}
                className="flex items-center"
              >
                <Plus className="w-4 h-4 mr-1" />
                日程追加
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {watchedDates?.map((dateItem, index) => (
              <div key={index} className="flex items-center space-x-4">
                <div className="flex-1">
                  <Label htmlFor={`date-${index}`}>
                    {dateItem.dayNumber}日目
                  </Label>
                  <Input
                    id={`date-${index}`}
                    type="date"
                    value={dateItem.date}
                    onChange={(e) => {
                      const updatedDates = [...watchedDates];
                      updatedDates[index] = { ...updatedDates[index], date: e.target.value };
                      form.setValue('tournament_dates', updatedDates);
                    }}
                    className="mt-1"
                  />
                </div>
                {watchedDates.length > 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => removeTournamentDate(index)}
                    className="mt-6"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* 試合設定 */}
        <Card>
          <CardHeader>
            <CardTitle>試合設定</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="match_duration_minutes">試合時間（分）*</Label>
                <Input
                  id="match_duration_minutes"
                  type="number"
                  min="5"
                  max="120"
                  {...form.register('match_duration_minutes', { valueAsNumber: true })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="break_duration_minutes">休憩時間（分）*</Label>
                <Input
                  id="break_duration_minutes"
                  type="number"
                  min="0"
                  max="60"
                  {...form.register('break_duration_minutes', { valueAsNumber: true })}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="win_points">勝利時ポイント *</Label>
                <Input
                  id="win_points"
                  type="number"
                  min="0"
                  max="10"
                  {...form.register('win_points', { valueAsNumber: true })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="draw_points">引分時ポイント *</Label>
                <Input
                  id="draw_points"
                  type="number"
                  min="0"
                  max="10"
                  {...form.register('draw_points', { valueAsNumber: true })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="loss_points">敗戦時ポイント *</Label>
                <Input
                  id="loss_points"
                  type="number"
                  min="0"
                  max="10"
                  {...form.register('loss_points', { valueAsNumber: true })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="walkover_winner_goals">不戦勝時得点 *</Label>
                <Input
                  id="walkover_winner_goals"
                  type="number"
                  min="0"
                  max="10"
                  {...form.register('walkover_winner_goals', { valueAsNumber: true })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="walkover_loser_goals">不戦敗時得点 *</Label>
                <Input
                  id="walkover_loser_goals"
                  type="number"
                  min="0"
                  max="10"
                  {...form.register('walkover_loser_goals', { valueAsNumber: true })}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* スケジュールプレビュー */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Eye className="w-5 h-5 mr-2" />
              スケジュールプレビュー
            </CardTitle>
          </CardHeader>
          <CardContent>
            <SchedulePreview
              formatId={form.watch('format_id') || null}
              settings={{
                courtCount: form.watch('court_count') ?? 4,
                matchDurationMinutes: form.watch('match_duration_minutes') ?? 15,
                breakDurationMinutes: form.watch('break_duration_minutes') ?? 5,
                startTime: '09:00',
                tournamentDates: form.watch('tournament_dates') || []
              }}
              tournamentId={tournament.tournament_id}
              editMode={true}
              onScheduleChange={handleScheduleChange}
            />
          </CardContent>
        </Card>

        {/* 公開設定 */}
        <Card>
          <CardHeader>
            <CardTitle>公開設定</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-2">
              <input
                id="is_public"
                type="checkbox"
                {...form.register('is_public')}
                className="rounded border-gray-300"
              />
              <Label htmlFor="is_public">一般に公開する</Label>
            </div>
            <p className="text-sm text-gray-500 mt-2">
              チェックを入れると、一般ユーザーが大会情報を閲覧できるようになります
            </p>
          </CardContent>
        </Card>

        {/* 送信ボタン */}
        <div className="flex justify-end space-x-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push('/admin')}
            disabled={loading}
          >
            キャンセル
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                更新中...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                大会を更新
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}