'use client';

import { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tournament, Venue, TournamentDate } from '@/lib/types';
import { Loader2, Save, AlertCircle, Calendar, Plus, Trash2, Eye, Settings } from 'lucide-react';
import SchedulePreview from '@/components/features/tournament/SchedulePreview';
import { useRouter } from 'next/navigation';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { z } from 'zod';

interface TournamentEditFormProps {
  tournament: Tournament;
}

// 編集用のバリデーションスキーマ
const editTournamentSchema = z.object({
  tournament_name: z.string().min(1, '部門名は必須です').max(100, '部門名は100文字以内で入力してください'),
  format_id: z.number().min(1, 'フォーマットIDが必要です'),
  venue_id: z.number().min(1, '会場IDが必要です'),
  team_count: z.number().min(2, 'チーム数は2以上で入力してください').max(128, 'チーム数は128以下で入力してください'),
  court_count: z.number().min(1, 'コート数は1以上で入力してください').max(20, 'コート数は20以下で入力してください'),
  available_courts: z.string().optional().refine((val) => {
    if (!val || val.trim() === '') return true;
    const courts = val.split(',').map(s => s.trim());
    return courts.every(court => /^\d+$/.test(court) && parseInt(court) >= 1 && parseInt(court) <= 99);
  }, '使用コート番号は1-99の数字をカンマ区切りで入力してください'),
  tournament_dates: z.array(z.object({
    dayNumber: z.number().min(1).max(10),
    date: z.string().min(1, '日付は必須です')
  })).min(1, '最低1つの開催日を指定してください').max(7, '開催日は最大7日まで指定可能です'),
  match_duration_minutes: z.number().min(5, '試合時間は5分以上で入力してください').max(120, '試合時間は120分以下で入力してください'),
  break_duration_minutes: z.number().min(0, '休憩時間は0分以上で入力してください').max(60, '休憩時間は60分以下で入力してください'),
  is_public: z.boolean(),
  show_players_public: z.boolean(),
  public_start_date: z.string().min(1, '公開開始日時は必須です'),
  recruitment_start_date: z.string().min(1, '募集開始日時は必須です'),
  recruitment_end_date: z.string().min(1, '募集終了日時は必須です')
}).refine((data) => {
  // 使用コート番号とコート数の整合性チェック
  if (!data.available_courts || data.available_courts.trim() === '') {
    return true; // 未指定の場合はOK
  }
  const courts = data.available_courts.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
  const uniqueCourts = new Set(courts);
  return courts.length === uniqueCourts.size && uniqueCourts.size >= data.court_count;
}, {
  message: 'コート番号に重複があるか、使用コート数より指定されたコート番号が少ないです',
  path: ['available_courts']
}).refine((data) => {
  // 募集開始日時 >= 公開開始日時のチェック
  return new Date(data.recruitment_start_date) >= new Date(data.public_start_date);
}, {
  message: '募集開始日時は公開開始日時以降で設定してください',
  path: ['recruitment_start_date']
}).refine((data) => {
  // 募集終了日時 >= 募集開始日時のチェック
  return new Date(data.recruitment_end_date) >= new Date(data.recruitment_start_date);
}, {
  message: '募集終了日時は募集開始日時以降で設定してください',
  path: ['recruitment_end_date']
});

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
    available_courts?: string;
    tournament_dates: TournamentDate[];
    match_duration_minutes: number;
    break_duration_minutes: number;
    is_public: boolean;
    show_players_public: boolean;
    public_start_date: string;
    recruitment_start_date: string;
    recruitment_end_date: string;
  }

  // 日付を datetime-local フォーマット (YYYY-MM-DDTHH:mm) に変換
  const formatDateTimeLocal = (dateStr?: string): string => {
    if (!dateStr) return new Date().toISOString().slice(0, 16);
    // すでに時刻が含まれている場合はそのまま使用
    if (dateStr.includes('T') || dateStr.includes(' ')) {
      return dateStr.replace(' ', 'T').slice(0, 16);
    }
    // 日付のみの場合は00:00を追加
    return `${dateStr}T00:00`;
  };

  const form = useForm<EditFormData>({
    resolver: zodResolver(editTournamentSchema),
    defaultValues: {
      tournament_name: tournament.tournament_name,
      format_id: tournament.format_id,
      venue_id: tournament.venue_id,
      team_count: tournament.team_count,
      court_count: tournament.court_count,
      available_courts: '', // 動的に設定される
      tournament_dates: parseTournamentDates(tournament.tournament_dates),
      match_duration_minutes: tournament.match_duration_minutes,
      break_duration_minutes: tournament.break_duration_minutes,
      is_public: tournament.visibility === 1,
      show_players_public: tournament.show_players_public || false,
      public_start_date: formatDateTimeLocal(tournament.public_start_date),
      recruitment_start_date: formatDateTimeLocal(tournament.recruitment_start_date),
      recruitment_end_date: formatDateTimeLocal(tournament.recruitment_end_date)
    }
  });

  const watchedDates = form.watch('tournament_dates');

  // 既存試合データから使用コート番号を取得
  const fetchUsedCourts = useCallback(async () => {
    try {
      const response = await fetch(`/api/tournaments/${tournament.tournament_id}/matches`);
      const result = await response.json();
      
      if (result.success && result.data.length > 0) {
        // 使用されているコート番号を重複なく取得
        const usedCourts = [...new Set(
          result.data
            .filter((match: {court_number: number | null}) => match.court_number !== null)
            .map((match: {court_number: number}) => match.court_number)
        )].sort((a, b) => (a as number) - (b as number));
        
        if (usedCourts.length > 0) {
          const courtsString = usedCourts.join(',');
          form.setValue('available_courts', courtsString);
        }
      }
    } catch (error) {
      console.error('使用コート情報取得エラー:', error);
      // エラーの場合はデフォルト値を使用
      const defaultCourts = Array.from({length: tournament.court_count}, (_, i) => i + 1).join(',');
      form.setValue('available_courts', defaultCourts);
    }
  }, [tournament.tournament_id, tournament.court_count, form]);

  // onScheduleChangeコールバックを安定化
  const handleScheduleChange = useCallback((customMatches: Array<{
    match_id: number;
    start_time: string;
    court_number: number;
  }>) => {
    // Received custom schedule changes for tournament edit
    setCustomMatches(customMatches);
  }, []);

  // 現在の試合時間を保持するためのstate
  const [currentMatches, setCurrentMatches] = useState<Array<{
    match_id: number;
    start_time: string;
    court_number: number;
  }>>([]);
  const [earliestMatchTime, setEarliestMatchTime] = useState<string>('09:00');

  // 既存試合データから現在の時間設定を取得
  const fetchCurrentMatchSchedule = useCallback(async () => {
    try {
      const response = await fetch(`/api/tournaments/${tournament.tournament_id}/matches`);
      const result = await response.json();
      
      if (result.success && result.data.length > 0) {
        const currentSchedule = result.data
          .filter((match: { scheduled_time: string | null }) => match.scheduled_time !== null)
          .map((match: { match_id: number; scheduled_time: string; court_number: number | null }) => ({
            match_id: match.match_id,
            start_time: match.scheduled_time,
            court_number: match.court_number || 1
          }));
        setCurrentMatches(currentSchedule);
        
        // 最も早い試合時刻を検出
        if (currentSchedule.length > 0) {
          const earliestTime = currentSchedule.reduce((earliest: string, match: { match_id: number; start_time: string; court_number: number; }) => {
            return match.start_time < earliest ? match.start_time : earliest;
          }, currentSchedule[0].start_time);
          setEarliestMatchTime(earliestTime);
          console.log('[TOURNAMENT_EDIT] 既存の最早試合時刻:', earliestTime);
        }
      }
    } catch (error) {
      console.error('現在の試合スケジュール取得エラー:', error);
    }
  }, [tournament.tournament_id]);

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

  // 使用コート番号と現在の試合スケジュールの初期化
  useEffect(() => {
    fetchUsedCourts();
    fetchCurrentMatchSchedule();
  }, [fetchUsedCourts, fetchCurrentMatchSchedule]);

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
      setError('部門名を入力してください');
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

    // フォーマットに必要な開催日数をチェック（警告のみ、保存は許可）
    try {
      const templateResponse = await fetch(`/api/tournaments/formats/${tournament.format_id}/templates`);
      const templateResult = await templateResponse.json();

      if (templateResult.success && templateResult.data.statistics) {
        const maxDayNumber = templateResult.data.statistics.maxDayNumber || 1;
        const requiredDays = templateResult.data.statistics.requiredDays || 1;

        // 開催日数の検証（警告のみ）
        const providedDayNumbers = data.tournament_dates.map(d => d.dayNumber);
        const maxProvidedDay = Math.max(...providedDayNumbers);

        if (maxProvidedDay < maxDayNumber) {
          // 警告を表示するが、保存は許可する
          const proceed = confirm(
            `⚠️ 警告\n\n` +
            `現在のフォーマットは${requiredDays}日間の開催が必要です（day ${maxDayNumber}まで）。\n` +
            `開催日程は${maxProvidedDay}日分しか登録されていません。\n\n` +
            `このまま保存すると、day ${maxProvidedDay + 1}以降の試合が最終日（day ${maxProvidedDay}）に配置されます。\n\n` +
            `続行しますか？`
          );

          if (!proceed) {
            setLoading(false);
            return;
          }
        }

        // day_numberに抜けがある場合も警告（保存は許可）
        const missingDays = [];
        for (let i = 1; i <= maxDayNumber; i++) {
          if (!providedDayNumbers.includes(i)) {
            missingDays.push(i);
          }
        }

        if (missingDays.length > 0) {
          const proceed = confirm(
            `⚠️ 警告\n\n` +
            `開催日程にday ${missingDays.join(', ')}が登録されていません。\n` +
            `フォーマットに必要な全ての日程（day 1〜${maxDayNumber}）を登録することを推奨します。\n\n` +
            `このまま保存すると、不足している日の試合が他の日に配置される可能性があります。\n\n` +
            `続行しますか？`
          );

          if (!proceed) {
            setLoading(false);
            return;
          }
        }

        // 余分な開催日がある場合も警告（保存は許可）
        const extraDays = providedDayNumbers.filter(day => day > maxDayNumber);
        if (extraDays.length > 0) {
          const proceed = confirm(
            `⚠️ 警告\n\n` +
            `現在のフォーマットは${requiredDays}日間（day ${maxDayNumber}まで）の開催ですが、\n` +
            `day ${extraDays.join(', ')}が登録されています。\n\n` +
            `これらの日には試合が配置されません（余分な開催日）。\n\n` +
            `続行しますか？`
          );

          if (!proceed) {
            setLoading(false);
            return;
          }
        }
      }
    } catch (templateError) {
      console.error('テンプレート情報の取得に失敗:', templateError);
      // テンプレート情報の取得に失敗しても処理は続行（警告のみ）
    }

    try {
      // カスタムスケジュールが設定されていない場合は既存の試合時間を保持
      const finalCustomMatches = customMatches.length > 0 ? customMatches : currentMatches;
      
      const requestData = {
        ...data,
        customMatches: finalCustomMatches.length > 0 ? finalCustomMatches : undefined
      };
      
      // Sending tournament update with custom schedule
      console.log('[TOURNAMENT_EDIT] 送信データ:', {
        hasCustomMatches: !!requestData.customMatches,
        customMatchesCount: requestData.customMatches?.length || 0,
        preservingExistingTimes: customMatches.length === 0 && currentMatches.length > 0
      });
      
      const response = await fetch(`/api/tournaments/${tournament.tournament_id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData),
      });

      const result = await response.json();

      if (result.success) {
        setSuccess('部門情報が正常に更新されました');
        // 少し待ってから管理画面に戻る
        setTimeout(() => {
          router.push('/admin');
        }, 2000);
      } else {
        // より詳細なエラーメッセージを表示
        if (result.message) {
          // バリデーションエラーの詳細メッセージを表示
          setError(result.message);
        } else if (result.details && Array.isArray(result.details)) {
          // Zodバリデーションエラーの場合
          const detailMessages = result.details.map((detail: { path?: string[]; message: string }) => 
            `${detail.path?.join('.') || '項目'}: ${detail.message}`
          ).join('\n');
          setError(`入力内容を確認してください:\n${detailMessages}`);
        } else {
          // デフォルトのエラーメッセージ
          setError(result.error || '更新に失敗しました');
        }
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
          <AlertDescription className="whitespace-pre-line">{error}</AlertDescription>
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
            {/* 部門名 */}
            <div className="space-y-2">
              <Label htmlFor="tournament_name">部門名 *</Label>
              <Input
                id="tournament_name"
                {...form.register('tournament_name')}
                placeholder="例: 第1回PKトーナメント"
                className={form.formState.errors.tournament_name ? 'border-destructive' : ''}
              />
              {form.formState.errors.tournament_name && (
                <p className="text-sm text-destructive">
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
                <SelectTrigger className={form.formState.errors.venue_id ? 'border-destructive' : ''}>
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
                <p className="text-sm text-destructive">
                  {form.formState.errors.venue_id.message}
                </p>
              )}
            </div>

            {/* チーム数・コート数 */}
            <div className="space-y-2">
              <Label htmlFor="team_count">参加チーム数 *</Label>
              <Input
                id="team_count"
                type="number"
                min="2"
                max="128"
                {...form.register('team_count', { valueAsNumber: true })}
                className={form.formState.errors.team_count ? 'border-destructive' : ''}
              />
              {form.formState.errors.team_count && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.team_count.message}
                </p>
              )}
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

        {/* 運営設定 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Settings className="w-5 h-5 mr-2" />
              運営設定（スケジュール調整）
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="court_count">使用コート数</Label>
                <Input
                  id="court_count"
                  type="number"
                  min="1"
                  max="20"
                  {...form.register('court_count', { valueAsNumber: true })}
                  className={form.formState.errors.court_count ? 'border-destructive' : ''}
                />
                {form.formState.errors.court_count && (
                  <p className="text-sm text-destructive mt-1">
                    {form.formState.errors.court_count.message}
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="available_courts">使用コート番号（任意）</Label>
                <Input
                  id="available_courts"
                  placeholder="例: 1,3,4,7"
                  {...form.register('available_courts')}
                  className={form.formState.errors.available_courts ? 'border-destructive' : ''}
                />
                {form.formState.errors.available_courts && (
                  <p className="text-sm text-destructive mt-1">
                    {form.formState.errors.available_courts.message}
                  </p>
                )}
                <p className="text-xs text-gray-600 mt-1">
                  利用可能なコート番号をカンマ区切りで指定してください。未指定の場合は1から連番で使用されます。
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="match_duration_minutes">1試合時間（分）</Label>
                <Input
                  id="match_duration_minutes"
                  type="number"
                  min="5"
                  max="120"
                  {...form.register('match_duration_minutes', { valueAsNumber: true })}
                  className={form.formState.errors.match_duration_minutes ? 'border-destructive' : ''}
                />
                {form.formState.errors.match_duration_minutes && (
                  <p className="text-sm text-destructive mt-1">
                    {form.formState.errors.match_duration_minutes.message}
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="break_duration_minutes">試合間休憩時間（分）</Label>
                <Input
                  id="break_duration_minutes"
                  type="number"
                  min="0"
                  max="60"
                  {...form.register('break_duration_minutes', { valueAsNumber: true })}
                  className={form.formState.errors.break_duration_minutes ? 'border-destructive' : ''}
                />
                {form.formState.errors.break_duration_minutes && (
                  <p className="text-sm text-destructive mt-1">
                    {form.formState.errors.break_duration_minutes.message}
                  </p>
                )}
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
            <div className="mb-4 p-4 bg-primary/5 rounded-lg">
              <p className="text-sm text-primary font-medium mb-2">💡 リアルタイムプレビュー機能</p>
              <p className="text-xs text-primary">
                上記の運営設定を変更すると、自動的にスケジュールが更新されます。
                試合時間をクリックして個別に調整したり、コート番号を変更することも可能です。
                時間重複エラーやコート数不足がある場合は警告が表示されるので、設定を調整して最適なスケジュールを作成してください。
              </p>
            </div>
            
            <SchedulePreview
              formatId={form.watch('format_id') || null}
              settings={{
                courtCount: form.watch('court_count') ?? 4,
                availableCourts: form.watch('available_courts') 
                  ? form.watch('available_courts')?.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n))
                  : undefined,
                matchDurationMinutes: form.watch('match_duration_minutes') ?? 15,
                breakDurationMinutes: form.watch('break_duration_minutes') ?? 5,
                startTime: earliestMatchTime, // 既存の最早試合時刻を使用
                tournamentDates: form.watch('tournament_dates') || []
              }}
              tournamentId={tournament.tournament_id}
              editMode={true}
              onScheduleChange={handleScheduleChange}
            />
          </CardContent>
        </Card>

        {/* 公開・募集設定 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Calendar className="w-5 h-5 mr-2" />
              公開・募集設定
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center space-x-2">
              <input
                id="is_public"
                type="checkbox"
                {...form.register('is_public')}
                className="rounded border-gray-300"
              />
              <Label htmlFor="is_public">一般に公開する</Label>
            </div>
            <p className="text-sm text-gray-500">
              チェックを入れると、一般ユーザーが大会情報を閲覧できるようになります
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="public_start_date">公開開始日時 *</Label>
                <Input
                  id="public_start_date"
                  type="datetime-local"
                  {...form.register('public_start_date')}
                  className={form.formState.errors.public_start_date ? 'border-destructive' : ''}
                />
                {form.formState.errors.public_start_date && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.public_start_date.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="recruitment_start_date">募集開始日時 *</Label>
                <Input
                  id="recruitment_start_date"
                  type="datetime-local"
                  {...form.register('recruitment_start_date')}
                  className={form.formState.errors.recruitment_start_date ? 'border-destructive' : ''}
                />
                {form.formState.errors.recruitment_start_date && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.recruitment_start_date.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="recruitment_end_date">募集終了日時 *</Label>
                <Input
                  id="recruitment_end_date"
                  type="datetime-local"
                  {...form.register('recruitment_end_date')}
                  className={form.formState.errors.recruitment_end_date ? 'border-destructive' : ''}
                />
                {form.formState.errors.recruitment_end_date && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.recruitment_end_date.message}
                  </p>
                )}
              </div>
            </div>

            <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
              <h4 className="font-medium text-primary mb-2">日程設定について</h4>
              <ul className="text-sm text-primary space-y-1">
                <li>• 公開開始日時: 一般ユーザーが大会情報を閲覧できるようになる日時</li>
                <li>• 募集開始日時: チームが大会への参加申込みを開始できる日時</li>
                <li>• 募集終了日時: チームの参加申込みを締め切る日時</li>
              </ul>
            </div>

            {/* 選手情報公開設定 */}
            <div className="flex items-start space-x-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <input
                type="checkbox"
                id="show_players_public"
                {...form.register('show_players_public')}
                className="mt-1 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <div className="flex-1">
                <Label htmlFor="show_players_public" className="cursor-pointer font-medium">
                  参加選手情報を一般公開する
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  チェックを入れると、一般ユーザーも部門詳細画面の「参加チーム」タブで選手名・背番号を閲覧できるようになります。
                  チェックを外すと、大会運営者のみが閲覧可能になります。
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* エラーサマリー */}
        {Object.keys(form.formState.errors).length > 0 && (
          <Card className="border-destructive/20 bg-destructive/5">
            <CardContent className="pt-6">
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-destructive" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-destructive mb-2">入力内容にエラーがあります</h3>
                  <ul className="list-disc list-inside text-sm text-destructive space-y-1">
                    {form.formState.errors.tournament_name && <li>{form.formState.errors.tournament_name.message}</li>}
                    {form.formState.errors.venue_id && <li>{form.formState.errors.venue_id.message}</li>}
                    {form.formState.errors.team_count && <li>{form.formState.errors.team_count.message}</li>}
                    {form.formState.errors.court_count && <li>{form.formState.errors.court_count.message}</li>}
                    {form.formState.errors.tournament_dates && <li>{form.formState.errors.tournament_dates.message}</li>}
                    {form.formState.errors.match_duration_minutes && <li>{form.formState.errors.match_duration_minutes.message}</li>}
                    {form.formState.errors.break_duration_minutes && <li>{form.formState.errors.break_duration_minutes.message}</li>}
                    {form.formState.errors.public_start_date && <li>{form.formState.errors.public_start_date.message}</li>}
                    {form.formState.errors.recruitment_start_date && <li>{form.formState.errors.recruitment_start_date.message}</li>}
                    {form.formState.errors.recruitment_end_date && <li>{form.formState.errors.recruitment_end_date.message}</li>}
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

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
                部門を更新
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}