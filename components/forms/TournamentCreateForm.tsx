'use client';

import { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
// import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { tournamentCreateSchema, tournamentCreateDefaults } from '@/lib/validations';
import type { TournamentCreateForm } from '@/lib/validations';
import { TournamentFormat, Venue } from '@/lib/types';
import { Loader2, Users, Trophy, Calendar, Settings, Target, Plus, Trash2, Eye } from 'lucide-react';
import { useRouter } from 'next/navigation';
import SchedulePreview from '@/components/features/tournament/SchedulePreview';

interface RecommendedFormat extends TournamentFormat {
  recommendationReason: string;
  matchType: 'exact' | 'close' | 'alternative';
}

interface FormatRecommendation {
  teamCount: number;
  recommendedFormats: RecommendedFormat[];
  allFormats: (TournamentFormat & { isRecommended: boolean })[];
}

export default function TournamentCreateForm() {
  const router = useRouter();
  const [step, setStep] = useState<'team-count' | 'format-selection' | 'details'>('team-count');
  const [teamCount, setTeamCount] = useState<number>(2);
  const [recommendation, setRecommendation] = useState<FormatRecommendation | null>(null);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formatStatistics, setFormatStatistics] = useState<{
    maxDayNumber: number;
    minDayNumber: number;
    requiredDays: number;
  } | null>(null);
  const [customSchedule, setCustomSchedule] = useState<Array<{
    match_number: number;
    start_time: string;
    court_number: number;
  }>>([]);

  const form = useForm({
    resolver: zodResolver(tournamentCreateSchema),
    defaultValues: {
      ...tournamentCreateDefaults,
      team_count: 2,
      is_public: true
    }
  });

  // onScheduleChangeコールバックを安定化
  const handleScheduleChange = useCallback((customMatches: Array<{
    match_id: number;
    start_time: string;
    court_number: number;
  }>) => {
    // Received custom schedule changes for tournament creation
    // 新規作成時はmatch_idをmatch_numberとして扱う
    const newCustomSchedule = customMatches.map(match => ({
      match_number: match.match_id,
      start_time: match.start_time,
      court_number: match.court_number
    }));
    setCustomSchedule(newCustomSchedule);
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

  // teamCountの変化を監視
  useEffect(() => {
    console.log('teamCount state changed to:', teamCount, 'type:', typeof teamCount, 'condition (>=2):', teamCount >= 2);
  }, [teamCount]);

  // フォーマット推奨の取得
  const fetchRecommendation = async (count: number) => {
    console.log('fetchRecommendation called with count:', count);
    setLoading(true);
    try {
      const url = `/api/tournaments/formats/recommend?teamCount=${count}`;
      console.log('Fetching from URL:', url);
      const response = await fetch(url);
      console.log('Response status:', response.status);
      const result = await response.json();
      console.log('API response:', result);
      if (result.success) {
        console.log('Setting recommendation with data:', result.data);
        setRecommendation(result.data);
        form.setValue('team_count', count);
      } else {
        console.error('API returned error:', result.error);
        alert(`エラー: ${result.error}`);
      }
    } catch (error) {
      console.error('推奨取得エラー:', error);
      alert(`ネットワークエラー: ${error instanceof Error ? error.message : '不明なエラー'}`);
    } finally {
      setLoading(false);
    }
  };

  // チーム数確定ボタン
  const handleTeamCountSubmit = () => {
    console.log('handleTeamCountSubmit called, teamCount:', teamCount, 'condition check:', teamCount >= 2);
    
    // teamCountが2未満の場合は強制的に2に設定
    const actualTeamCount = teamCount < 2 ? 2 : teamCount;
    console.log('Using teamCount:', actualTeamCount);
    
    console.log('Calling fetchRecommendation and setting step');
    fetchRecommendation(actualTeamCount);
    setStep('format-selection');
  };

  // フォーマット選択
  const handleFormatSelect = async (formatId: number) => {
    form.setValue('format_id', formatId);
    
    // フォーマットのテンプレート情報を取得
    try {
      const response = await fetch(`/api/tournaments/formats/${formatId}/templates`);
      const result = await response.json();
      
      if (result.success) {
        const stats = result.data.statistics;
        setFormatStatistics({
          maxDayNumber: stats.maxDayNumber,
          minDayNumber: stats.minDayNumber,
          requiredDays: stats.requiredDays
        });
        
        // 開催日を自動設定
        const baseDates = [];
        const baseDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 1週間後から開始
        
        for (let i = stats.minDayNumber; i <= stats.maxDayNumber; i++) {
          const dateOffset = i - stats.minDayNumber;
          const date = new Date(baseDate);
          date.setDate(baseDate.getDate() + dateOffset);
          
          baseDates.push({
            dayNumber: i,
            date: date.toISOString().split('T')[0]
          });
        }
        
        form.setValue('tournament_dates', baseDates);
      }
    } catch (error) {
      console.error('フォーマット情報取得エラー:', error);
    }
    
    setStep('details');
  };

  // フォーム送信
  const onSubmit = async (data: TournamentCreateForm) => {
    setSubmitting(true);
    try {
      const requestData = {
        ...data,
        customSchedule: customSchedule.length > 0 ? customSchedule : undefined
      };
      
      const response = await fetch('/api/tournaments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      const result = await response.json();
      if (result.success) {
        router.push('/admin');
      } else {
        console.error('大会作成エラー:', result.error);
        alert(`大会作成に失敗しました: ${result.error || '不明なエラー'}`);
      }
    } catch (error) {
      console.error('大会作成エラー:', error);
      alert(`大会作成に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* ステップインジケーター */}
      <div className="flex items-center justify-center space-x-4 mb-8">
        <div className={`flex items-center space-x-2 ${step === 'team-count' ? 'text-blue-600' : 'text-green-600'}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === 'team-count' ? 'bg-blue-600 text-white' : 'bg-green-600 text-white'}`}>
            <Users className="w-4 h-4" />
          </div>
          <span className="font-medium">チーム数</span>
        </div>
        
        <div className={`w-12 h-0.5 ${step !== 'team-count' ? 'bg-green-600' : 'bg-gray-200'}`} />
        
        <div className={`flex items-center space-x-2 ${step === 'format-selection' ? 'text-blue-600' : step === 'details' ? 'text-green-600' : 'text-gray-400'}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === 'format-selection' ? 'bg-blue-600 text-white' : step === 'details' ? 'bg-green-600 text-white' : 'bg-gray-200'}`}>
            <Trophy className="w-4 h-4" />
          </div>
          <span className="font-medium">フォーマット</span>
        </div>
        
        <div className={`w-12 h-0.5 ${step === 'details' ? 'bg-green-600' : 'bg-gray-200'}`} />
        
        <div className={`flex items-center space-x-2 ${step === 'details' ? 'text-blue-600' : 'text-gray-400'}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === 'details' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>
            <Settings className="w-4 h-4" />
          </div>
          <span className="font-medium">詳細設定</span>
        </div>
      </div>

      {/* ステップ1: チーム数入力 */}
      {step === 'team-count' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Users className="w-5 h-5 mr-2" />
              参加チーム数を入力してください
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-center space-x-4">
              <Label htmlFor="teamCount" className="text-lg">参加予定チーム数:</Label>
              <input
                id="teamCount"
                type="number"
                min="2"
                max="128"
                value={teamCount}
                onChange={(e) => {
                  const inputValue = e.target.value;
                  console.log('Input changed to:', inputValue);
                  
                  // 空文字の場合は最小値を設定
                  if (inputValue === '') {
                    console.log('Empty input, setting to 2');
                    setTeamCount(2);
                    return;
                  }
                  
                  const numValue = parseInt(inputValue, 10);
                  console.log('Parsed value:', numValue, 'isNaN:', isNaN(numValue));
                  
                  if (!isNaN(numValue)) {
                    console.log('Setting teamCount to:', numValue);
                    setTeamCount(numValue);
                  } else {
                    console.log('Invalid number, keeping current value');
                  }
                }}
                onInput={(e) => {
                  console.log('Input event triggered:', e.currentTarget.value);
                }}
                onFocus={() => console.log('Input focused')}
                onBlur={() => console.log('Input blurred')}
                className="flex h-10 w-24 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background text-center text-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                style={{ width: '96px' }}
              />
              <span className="text-lg">チーム</span>
            </div>
            
            <div className="text-center">
              <div className="mb-2 text-sm text-gray-600">
                現在のチーム数: {teamCount} (型: {typeof teamCount})
                {teamCount < 2 && <span className="text-red-600"> - ボタン無効</span>}
              </div>
              <Button 
                onClick={() => {
                  console.log('Button clicked, teamCount:', teamCount, 'type:', typeof teamCount);
                  // 強制的にteamCountを2に設定して進む
                  if (teamCount < 2) {
                    console.log('Force setting teamCount to 2');
                    setTeamCount(2);
                  }
                  handleTeamCountSubmit();
                }}
                disabled={false}
                size="lg"
              >
                おすすめフォーマットを表示
              </Button>
              
              <Button 
                onClick={() => {
                  console.log('Debug: Force setting teamCount to 2 and step to format-selection');
                  setTeamCount(2);
                  setStep('format-selection');
                  // 2チーム用のフォーマットデータを手動で設定
                  setRecommendation({
                    teamCount: 2,
                    recommendedFormats: [{
                      format_id: 14,
                      format_name: "2チーム2回戦制リーグ",
                      target_team_count: 2,
                      format_description: "2チームによる2回戦制のリーグ戦。同じ対戦カードを2回行い、総合成績で順位を決定。",
                      created_at: "",
                      updated_at: "",
                      recommendationReason: "2チームに最適化されたフォーマットです",
                      matchType: 'exact'
                    }],
                    allFormats: [{
                      format_id: 14,
                      format_name: "2チーム2回戦制リーグ",
                      target_team_count: 2,
                      format_description: "2チームによる2回戦制のリーグ戦。同じ対戦カードを2回行い、総合成績で順位を決定。",
                      created_at: "",
                      updated_at: "",
                      isRecommended: true
                    }]
                  });
                }}
                variant="outline"
                size="sm"
                className="mt-2"
              >
                🐛 デバッグ: 強制進行
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ステップ2: フォーマット選択 */}
      {step === 'format-selection' && (
        <div className="space-y-6">
          {loading ? (
            <Card>
              <CardContent className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin mr-2" />
                フォーマットを分析中...
              </CardContent>
            </Card>
          ) : recommendation && (
            <>
              {/* 推奨フォーマット */}
              {recommendation.recommendedFormats.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center text-green-700">
                      <Target className="w-5 h-5 mr-2" />
                      {recommendation.teamCount}チームにおすすめのフォーマット
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {recommendation.recommendedFormats.map((format) => (
                      <div
                        key={format.format_id}
                        className="border-2 border-green-200 rounded-lg p-4 hover:border-green-400 cursor-pointer transition-colors"
                        onClick={() => handleFormatSelect(format.format_id)}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="font-semibold text-lg">{format.format_name}</h4>
                          <div className={`px-3 py-1 rounded-full text-xs font-medium ${
                            format.matchType === 'exact' ? 'bg-green-100 text-green-800' :
                            format.matchType === 'close' ? 'bg-blue-100 text-blue-800' :
                            'bg-yellow-100 text-yellow-800'
                          }`}>
                            {format.matchType === 'exact' ? '完全一致' :
                             format.matchType === 'close' ? '近似' : '代替案'}
                          </div>
                        </div>
                        
                        <p className="text-sm text-gray-600 mb-2">{format.format_description}</p>
                        <p className="text-sm text-green-600 font-medium">{format.recommendationReason}</p>
                        
                        <div className="mt-3">
                          <Button variant="outline">このフォーマットを選択</Button>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* その他のフォーマット */}
              <Card>
                <CardHeader>
                  <CardTitle>その他のフォーマット</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {recommendation.allFormats
                    .filter(format => !format.isRecommended)
                    .map((format) => (
                      <div
                        key={format.format_id}
                        className="border rounded-lg p-4 hover:border-gray-400 cursor-pointer transition-colors"
                        onClick={() => handleFormatSelect(format.format_id)}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="font-medium">{format.format_name}</h4>
                          <span className="text-sm text-gray-500">{format.target_team_count}チーム想定</span>
                        </div>
                        <p className="text-sm text-gray-600 mb-2">{format.format_description}</p>
                        <Button variant="outline" size="sm">選択</Button>
                      </div>
                    ))}
                </CardContent>
              </Card>

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep('team-count')}>
                  戻る
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ステップ3: 詳細設定 */}
      {step === 'details' && (
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* 基本情報 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Trophy className="w-5 h-5 mr-2" />
                基本情報
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="tournament_name">大会名 *</Label>
                <Input
                  id="tournament_name"
                  {...form.register('tournament_name')}
                  placeholder="例: 第1回PK選手権大会"
                />
                {form.formState.errors.tournament_name && (
                  <p className="text-sm text-red-600 mt-1">{form.formState.errors.tournament_name.message}</p>
                )}
              </div>

              <div>
                <Label htmlFor="venue_id">会場 *</Label>
                <Select onValueChange={(value) => form.setValue('venue_id', parseInt(value))}>
                  <SelectTrigger>
                    <SelectValue placeholder="会場を選択してください" />
                  </SelectTrigger>
                  <SelectContent>
                    {venues.map((venue) => (
                      <SelectItem key={venue.venue_id} value={venue.venue_id.toString()}>
                        {venue.venue_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.formState.errors.venue_id && (
                  <p className="text-sm text-red-600 mt-1">{form.formState.errors.venue_id.message}</p>
                )}
              </div>
            </CardContent>
          </Card>


          {/* 得点設定 */}
          <Card>
            <CardHeader>
              <CardTitle>得点・勝ち点設定</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="win_points">勝利時勝ち点</Label>
                <Input
                  id="win_points"
                  type="number"
                  min="0"
                  max="10"
                  {...form.register('win_points', { valueAsNumber: true })}
                />
              </div>

              <div>
                <Label htmlFor="draw_points">引分時勝ち点</Label>
                <Input
                  id="draw_points"
                  type="number"
                  min="0"
                  max="10"
                  {...form.register('draw_points', { valueAsNumber: true })}
                />
              </div>

              <div>
                <Label htmlFor="loss_points">敗北時勝ち点</Label>
                <Input
                  id="loss_points"
                  type="number"
                  min="0"
                  max="10"
                  {...form.register('loss_points', { valueAsNumber: true })}
                />
              </div>

              <div>
                <Label htmlFor="walkover_winner_goals">不戦勝時勝者得点</Label>
                <Input
                  id="walkover_winner_goals"
                  type="number"
                  min="0"
                  max="20"
                  {...form.register('walkover_winner_goals', { valueAsNumber: true })}
                />
              </div>

              <div>
                <Label htmlFor="walkover_loser_goals">不戦勝時敗者得点</Label>
                <Input
                  id="walkover_loser_goals"
                  type="number"
                  min="0"
                  max="20"
                  {...form.register('walkover_loser_goals', { valueAsNumber: true })}
                />
              </div>
            </CardContent>
          </Card>

          {/* 日程設定 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center">
                  <Calendar className="w-5 h-5 mr-2" />
                  開催日程
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const currentDates = form.getValues('tournament_dates') || [];
                    
                    // 既存の最大日番号を取得、ただしテンプレートの最大値も考慮
                    const currentMaxDay = Math.max(...currentDates.map(d => d.dayNumber), 0);
                    const templateMaxDay = formatStatistics?.maxDayNumber || 0;
                    const nextDayNumber = Math.max(currentMaxDay, templateMaxDay) + 1;
                    
                    // 最後の日付から1日後をデフォルトに設定
                    const lastDate = currentDates.length > 0 
                      ? new Date(Math.max(...currentDates.map(d => new Date(d.date).getTime())))
                      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
                    
                    const nextDate = new Date(lastDate);
                    nextDate.setDate(lastDate.getDate() + 1);
                    
                    form.setValue('tournament_dates', [
                      ...currentDates,
                      { 
                        dayNumber: nextDayNumber, 
                        date: nextDate.toISOString().split('T')[0] 
                      }
                    ]);
                  }}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  日程追加
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {(form.watch('tournament_dates') || []).map((_, index) => (
                <div key={index} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <Label className="text-base font-medium">
                      開催日 {index + 1}
                    </Label>
                    {(form.watch('tournament_dates')?.length || 0) > 1 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const currentDates = form.getValues('tournament_dates') || [];
                          const newDates = currentDates.filter((_, i) => i !== index);
                          form.setValue('tournament_dates', newDates);
                        }}
                      >
                        <Trash2 className="w-4 h-4 mr-1" />
                        削除
                      </Button>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor={`tournament_dates.${index}.dayNumber`}>
                        開催日番号 *
                      </Label>
                      <Input
                        id={`tournament_dates.${index}.dayNumber`}
                        type="number"
                        min="1"
                        max="10"
                        {...form.register(`tournament_dates.${index}.dayNumber`, { 
                          valueAsNumber: true 
                        })}
                        placeholder="1"
                      />
                      {form.formState.errors.tournament_dates?.[index]?.dayNumber && (
                        <p className="text-sm text-red-600 mt-1">
                          {form.formState.errors.tournament_dates[index]?.dayNumber?.message}
                        </p>
                      )}
                    </div>

                    <div>
                      <Label htmlFor={`tournament_dates.${index}.date`}>
                        開催日 *
                      </Label>
                      <Input
                        id={`tournament_dates.${index}.date`}
                        type="date"
                        {...form.register(`tournament_dates.${index}.date`)}
                      />
                      {form.formState.errors.tournament_dates?.[index]?.date && (
                        <p className="text-sm text-red-600 mt-1">
                          {form.formState.errors.tournament_dates[index]?.date?.message}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              
              {form.formState.errors.tournament_dates && typeof form.formState.errors.tournament_dates.message === 'string' && (
                <p className="text-sm text-red-600 mt-1">
                  {form.formState.errors.tournament_dates.message}
                </p>
              )}
              
              <div className="text-sm text-gray-600 bg-blue-50 p-3 rounded-lg">
                <p className="font-medium mb-1">💡ヒント:</p>
                <ul className="space-y-1 text-xs">
                  <li>• 開催日番号は試合テンプレートの日程割り当てに使用されます</li>
                  <li>• 連続していない日付でも設定可能です（例：2/1, 2/3, 2/5）</li>
                  <li>• 最大7日まで設定できます</li>
                </ul>
              </div>
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
                  />
                  {form.formState.errors.court_count && (
                    <p className="text-sm text-red-600 mt-1">{form.formState.errors.court_count.message}</p>
                  )}
                </div>

                <div>
                  <Label htmlFor="available_courts">使用コート番号（任意）</Label>
                  <Input
                    id="available_courts"
                    placeholder="例: 1,3,4,7"
                    {...form.register('available_courts')}
                  />
                  {form.formState.errors.available_courts && (
                    <p className="text-sm text-red-600 mt-1">{form.formState.errors.available_courts.message}</p>
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
                  />
                  {form.formState.errors.match_duration_minutes && (
                    <p className="text-sm text-red-600 mt-1">{form.formState.errors.match_duration_minutes.message}</p>
                  )}
                </div>

                <div>
                  <Label htmlFor="break_duration_minutes">試合間休憩（分）</Label>
                  <Input
                    id="break_duration_minutes"
                    type="number"
                    min="0"
                    max="60"
                    {...form.register('break_duration_minutes', { valueAsNumber: true })}
                  />
                  {form.formState.errors.break_duration_minutes && (
                    <p className="text-sm text-red-600 mt-1">{form.formState.errors.break_duration_minutes.message}</p>
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
              <div className="mb-4 p-4 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-800 font-medium mb-2">💡 リアルタイムプレビュー機能</p>
                <p className="text-xs text-blue-700">
                  上記の運営設定を変更すると、自動的にスケジュールが更新されます。
                  試合時間をクリックして個別に調整することも可能です。
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
                  startTime: '09:00',
                  tournamentDates: form.watch('tournament_dates') || []
                }}
                editMode={false}
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
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="public_start_date">公開開始日 *</Label>
                  <Input
                    id="public_start_date"
                    type="date"
                    {...form.register('public_start_date')}
                    className={form.formState.errors.public_start_date ? 'border-red-500' : ''}
                  />
                  {form.formState.errors.public_start_date && (
                    <p className="text-sm text-red-600">
                      {form.formState.errors.public_start_date.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="recruitment_start_date">募集開始日 *</Label>
                  <Input
                    id="recruitment_start_date"
                    type="date"
                    {...form.register('recruitment_start_date')}
                    className={form.formState.errors.recruitment_start_date ? 'border-red-500' : ''}
                  />
                  {form.formState.errors.recruitment_start_date && (
                    <p className="text-sm text-red-600">
                      {form.formState.errors.recruitment_start_date.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="recruitment_end_date">募集終了日 *</Label>
                  <Input
                    id="recruitment_end_date"
                    type="date"
                    {...form.register('recruitment_end_date')}
                    className={form.formState.errors.recruitment_end_date ? 'border-red-500' : ''}
                  />
                  {form.formState.errors.recruitment_end_date && (
                    <p className="text-sm text-red-600">
                      {form.formState.errors.recruitment_end_date.message}
                    </p>
                  )}
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-medium text-blue-900 mb-2">日程設定について</h4>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• 公開開始日: 一般ユーザーが大会情報を閲覧できるようになる日</li>
                  <li>• 募集開始日: チームが大会への参加申込みを開始できる日</li>
                  <li>• 募集終了日: チームの参加申込みを締め切る日</li>
                </ul>
              </div>

              {/* 公開フラグは自動的にtrueに設定 */}
              <input type="hidden" {...form.register('is_public')} value="true" />
            </CardContent>
          </Card>

          {/* アクションボタン */}
          <div className="flex justify-between">
            <Button 
              type="button"
              variant="outline"
              onClick={() => setStep('format-selection')}
            >
              戻る
            </Button>
            
            <Button 
              type="submit"
              disabled={submitting}
            >
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              大会を作成
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}