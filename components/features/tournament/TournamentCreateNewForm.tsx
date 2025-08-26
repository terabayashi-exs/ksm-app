"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Calendar, Clock, Users, MapPin, Settings, Sparkles, Target, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import SchedulePreview from "@/components/features/tournament/SchedulePreview";
import React from "react";

// 型定義
interface Venue {
  venue_id: number;
  venue_name: string;
  available_courts: number;
}

interface Format {
  format_id: number;
  format_name: string;
  target_team_count: number;
  format_description?: string;
}

interface RecommendedFormat extends Format {
  recommendationReason: string;
  matchType: 'exact' | 'close' | 'alternative';
}

interface FormatRecommendation {
  teamCount: number;
  recommendedFormats: RecommendedFormat[];
  allFormats: (Format & { isRecommended: boolean })[];
}

interface CustomScheduleMatch {
  match_id: number;
  match_code: string;
  start_time: string;
  court_number: number;
  team1_display_name: string;
  team2_display_name: string;
}

// フォームスキーマ定義
const tournamentCreateSchema = z.object({
  tournament_name: z.string().min(1, "大会名は必須です").max(100, "大会名は100文字以内で入力してください"),
  format_id: z.number().min(1, "大会フォーマットを選択してください"),
  venue_id: z.number().min(1, "会場を選択してください"),
  team_count: z.number().min(4, "チーム数は4以上で入力してください").max(32, "チーム数は32以下で入力してください"),
  court_count: z.number().min(1, "コート数は1以上で入力してください").max(8, "コート数は8以下で入力してください"),
  tournament_dates: z.array(z.object({
    dayNumber: z.number(),
    date: z.string()
  })).min(1, "開催日程は必須です"),
  match_duration_minutes: z.number().min(5, "試合時間は5分以上で入力してください").max(60, "試合時間は60分以下で入力してください"),
  break_duration_minutes: z.number().min(0, "休憩時間は0分以上で入力してください").max(30, "休憩時間は30分以下で入力してください"),
  start_time: z.string().min(1, "開始時刻は必須です"),
  win_points: z.number().min(0).max(10),
  draw_points: z.number().min(0).max(10),
  loss_points: z.number().min(0).max(10),
  walkover_winner_goals: z.number().min(0).max(20),
  walkover_loser_goals: z.number().min(0).max(20),
  is_public: z.boolean(),
  public_start_date: z.string().min(1, "公開開始日は必須です"),
  recruitment_start_date: z.string().min(1, "募集開始日は必須です"),
  recruitment_end_date: z.string().min(1, "募集終了日は必須です"),
  description: z.string().optional(),
});

type TournamentCreateForm = z.infer<typeof tournamentCreateSchema>;

export default function TournamentCreateNewForm() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [step, setStep] = useState<'team-count' | 'format-selection' | 'details'>('team-count');
  const [teamCount, setTeamCount] = useState<number>(8);
  const [recommendation, setRecommendation] = useState<FormatRecommendation | null>(null);
  const [selectedFormat, setSelectedFormat] = useState<Format | null>(null);
  const [loadingVenues, setLoadingVenues] = useState(true);
  const [loadingRecommendation, setLoadingRecommendation] = useState(false);
  const [customSchedule, setCustomSchedule] = useState<CustomScheduleMatch[]>([]);
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
    getValues
  } = useForm<TournamentCreateForm>({
    resolver: zodResolver(tournamentCreateSchema),
    defaultValues: {
      team_count: 8,
      court_count: 4,
      tournament_dates: [{
        dayNumber: 1,
        date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      }],
      match_duration_minutes: 15,
      break_duration_minutes: 5,
      start_time: "13:00",
      win_points: 3,
      draw_points: 1,
      loss_points: 0,
      walkover_winner_goals: 3,
      walkover_loser_goals: 0,
      is_public: true,
      public_start_date: new Date(Date.now()).toISOString().split('T')[0],
      recruitment_start_date: new Date(Date.now()).toISOString().split('T')[0],
      recruitment_end_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      description: "",
    },
  });

  // スケジュール変更ハンドラ
  const handleScheduleChange = useCallback((customMatches: Array<{
    match_id: number;
    start_time: string;
    court_number: number;
  }>) => {
    // SchedulePreviewから渡される簡略データを拡張データに変換
    const extendedCustomMatches = customMatches.map(match => ({
      match_id: match.match_id,
      match_code: `M${match.match_id}`,
      start_time: match.start_time,
      court_number: match.court_number,
      team1_display_name: '',
      team2_display_name: ''
    }));
    setCustomSchedule(extendedCustomMatches);
  }, []);

  // 会場データの取得
  useEffect(() => {
    const loadVenues = async () => {
      try {
        const res = await fetch("/api/venues");
        const data = await res.json();
        if (data.success) {
          setVenues(data.data || data.venues);
        }
      } catch (error) {
        console.error("会場データ取得エラー:", error);
      } finally {
        setLoadingVenues(false);
      }
    };
    loadVenues();
  }, []);

  // フォーマット推奨の取得
  const fetchRecommendation = async (count: number) => {
    setLoadingRecommendation(true);
    try {
      const response = await fetch(`/api/tournaments/formats/recommend?teamCount=${count}`);
      const result = await response.json();
      if (result.success) {
        setRecommendation(result.data);
        setValue('team_count', count);
      }
    } catch (error) {
      console.error('推奨取得エラー:', error);
    } finally {
      setLoadingRecommendation(false);
    }
  };

  // チーム数確定
  const handleTeamCountSubmit = () => {
    if (teamCount >= 4) {
      fetchRecommendation(teamCount);
      setStep('format-selection');
    }
  };

  // フォーマット選択
  const handleFormatSelect = async (formatId: number) => {
    const allFormats = [...(recommendation?.recommendedFormats || []), ...(recommendation?.allFormats || [])];
    const format = allFormats.find(f => f.format_id === formatId);
    
    setSelectedFormat(format || null);
    setValue("format_id", formatId);
    
    // 開催日を自動設定
    const baseDates = [{
      dayNumber: 1,
      date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    }];
    setValue('tournament_dates', baseDates);
    
    setStep('details');
  };

  // フォーム送信処理
  const onSubmit = async (data: TournamentCreateForm) => {
    setIsSubmitting(true);
    
    try {
      // tournament_datesをJSON形式に変換
      const tournamentDatesJson: Record<string, string> = {};
      data.tournament_dates.forEach((dateInfo) => {
        tournamentDatesJson[dateInfo.dayNumber.toString()] = dateInfo.date;
      });

      const response = await fetch("/api/tournaments/create-new", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...data,
          tournament_dates: JSON.stringify(tournamentDatesJson),
          event_start_date: data.tournament_dates[0]?.date,
          custom_schedule: customSchedule,
        }),
      });

      const result = await response.json();

      if (result.success) {
        router.push("/admin");
      } else {
        alert(`エラー: ${result.error}`);
      }
    } catch (error) {
      alert("大会作成中にエラーが発生しました");
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // チーム数入力ステップ
  if (step === 'team-count') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2 text-lg">
            <Users className="h-5 w-5 text-blue-600" />
            <span>参加チーム数を入力</span>
          </CardTitle>
          <p className="text-sm text-gray-600">
            参加予定のチーム数を入力してください。おすすめの大会フォーマットを提案します。
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="team_count_input">参加チーム数</Label>
            <Input
              id="team_count_input"
              type="number"
              min={4}
              max={32}
              value={teamCount}
              onChange={(e) => setTeamCount(parseInt(e.target.value) || 4)}
              placeholder="例: 16"
              className="text-center text-xl font-semibold"
            />
            <p className="text-xs text-gray-500">
              4チーム以上、32チーム以下で入力してください
            </p>
          </div>
          
          <Button
            type="button"
            onClick={handleTeamCountSubmit}
            disabled={teamCount < 4 || teamCount > 32}
            className="w-full"
          >
            おすすめフォーマットを表示
          </Button>
        </CardContent>
      </Card>
    );
  }

  // フォーマット選択ステップ
  if (step === 'format-selection') {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">{teamCount}チーム向けのおすすめフォーマット</h2>
            <p className="text-sm text-gray-600">参加チーム数に最適な大会フォーマットを選択してください</p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => setStep('team-count')}
          >
            チーム数を変更
          </Button>
        </div>

        {loadingRecommendation ? (
          <div className="flex justify-center py-12">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
              <p className="text-sm text-gray-600">フォーマットを検索中...</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {recommendation?.recommendedFormats && recommendation.recommendedFormats.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-lg font-medium text-green-700 flex items-center">
                  <Sparkles className="h-4 w-4 mr-2" />
                  おすすめフォーマット
                </h3>
                {recommendation.recommendedFormats.map((format) => (
                  <Card key={format.format_id} className="border-green-200 hover:border-green-300 cursor-pointer" onClick={() => handleFormatSelect(format.format_id)}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-2">
                            <h4 className="font-medium">{format.format_name}</h4>
                            <Badge className="bg-green-100 text-green-800 text-xs">
                              {format.matchType === 'exact' ? '完全一致' : format.matchType === 'close' ? '近似' : '代替案'}
                            </Badge>
                          </div>
                          <p className="text-sm text-gray-600">{format.format_description}</p>
                          <p className="text-xs text-green-600 mt-1">{format.recommendationReason}</p>
                        </div>
                        <Button size="sm" className="ml-4">
                          選択
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {recommendation?.allFormats && recommendation.allFormats.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-lg font-medium text-gray-700">その他のフォーマット</h3>
                {recommendation.allFormats.filter(f => !f.isRecommended).map((format) => (
                  <Card key={format.format_id} className="hover:border-gray-300 cursor-pointer" onClick={() => handleFormatSelect(format.format_id)}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <h4 className="font-medium">{format.format_name}</h4>
                          <p className="text-sm text-gray-600">{format.format_description}</p>
                        </div>
                        <Button variant="outline" size="sm" className="ml-4">
                          選択
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // 詳細入力ステップ
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold">大会詳細情報の入力</h2>
          <p className="text-sm text-gray-600">選択されたフォーマット: {selectedFormat?.format_name}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => setStep('format-selection')}
        >
          フォーマットを変更
        </Button>
      </div>
      {/* 基本情報セクション */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center space-x-2 text-lg">
            <Settings className="h-5 w-5 text-blue-600" />
            <span>基本情報</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 大会名 */}
            <div className="space-y-2">
              <Label htmlFor="tournament_name">大会名 *</Label>
              <Input
                id="tournament_name"
                {...register("tournament_name")}
                placeholder="例: 第1回PK選手権大会"
                className={errors.tournament_name ? "border-red-500" : ""}
              />
              {errors.tournament_name && (
                <p className="text-sm text-red-600">{errors.tournament_name.message}</p>
              )}
            </div>

            {/* 会場選択 */}
            <div className="space-y-2">
              <Label htmlFor="venue_id">会場 *</Label>
              <Select onValueChange={(value) => {
                if (value !== "no-venues") {
                  const venueId = parseInt(value);
                  setValue("venue_id", venueId);
                  
                  // 選択された会場情報を保存
                  const venue = venues.find(v => v.venue_id === venueId);
                  setSelectedVenue(venue || null);
                  
                  // 会場のコート数に合わせてコート数を調整
                  if (venue && venue.available_courts) {
                    const currentCourtCount = watch('court_count') || 4;
                    // 現在のコート数が会場のコート数を超えている場合は調整
                    if (currentCourtCount > venue.available_courts) {
                      setValue('court_count', venue.available_courts);
                    }
                  }
                }
              }}>
                <SelectTrigger className={errors.venue_id ? "border-red-500" : ""}>
                  <SelectValue placeholder={loadingVenues ? "読み込み中..." : "会場を選択"} />
                </SelectTrigger>
                <SelectContent>
                  {venues && venues.length > 0 ? (
                    venues.map((venue: Venue) => (
                      <SelectItem key={venue.venue_id} value={venue.venue_id.toString()}>
                        <div className="flex items-center space-x-2">
                          <MapPin className="h-4 w-4" />
                          <span>{venue.venue_name}</span>
                          <Badge variant="secondary" className="text-xs">
                            {venue.available_courts}コート
                          </Badge>
                        </div>
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="no-venues" disabled>
                      {loadingVenues ? "読み込み中..." : "会場がありません"}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              {errors.venue_id && (
                <p className="text-sm text-red-600">{errors.venue_id.message}</p>
              )}
            </div>
          </div>

          {/* 説明 */}
          <div className="space-y-2">
            <Label htmlFor="description">大会説明</Label>
            <Textarea
              id="description"
              {...register("description")}
              placeholder="大会の詳細や注意事項などを記載してください"
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {/* フォーマット・参加設定 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center space-x-2 text-lg">
            <Users className="h-5 w-5 text-green-600" />
            <span>参加設定</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* チーム数 */}
            <div className="space-y-2">
              <Label htmlFor="team_count">参加チーム数 *</Label>
              <Input
                id="team_count"
                type="number"
                {...register("team_count", { valueAsNumber: true })}
                min={4}
                max={32}
                className={errors.team_count ? "border-red-500" : ""}
                readOnly
              />
              {errors.team_count && (
                <p className="text-sm text-red-600">{errors.team_count.message}</p>
              )}
            </div>

            {/* コート数 */}
            <div className="space-y-2">
              <Label htmlFor="court_count">使用コート数 *</Label>
              <Input
                id="court_count"
                type="number"
                {...register("court_count", { valueAsNumber: true })}
                min={1}
                max={selectedVenue ? selectedVenue.available_courts : 8}
                className={errors.court_count ? "border-red-500" : ""}
              />
              {selectedVenue && (
                <p className="text-xs text-gray-500">
                  選択した会場（{selectedVenue.venue_name}）は最大{selectedVenue.available_courts}コートまで利用可能です
                </p>
              )}
              {errors.court_count && (
                <p className="text-sm text-red-600">{errors.court_count.message}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 得点・勝ち点設定 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center space-x-2 text-lg">
            <Target className="h-5 w-5 text-yellow-600" />
            <span>得点・勝ち点設定</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="win_points">勝利時勝ち点</Label>
              <Input
                id="win_points"
                type="number"
                min="0"
                max="10"
                {...register('win_points', { valueAsNumber: true })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="draw_points">引分時勝ち点</Label>
              <Input
                id="draw_points"
                type="number"
                min="0"
                max="10"
                {...register('draw_points', { valueAsNumber: true })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="loss_points">敗北時勝ち点</Label>
              <Input
                id="loss_points"
                type="number"
                min="0"
                max="10"
                {...register('loss_points', { valueAsNumber: true })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="walkover_winner_goals">不戦勝時勝者得点</Label>
              <Input
                id="walkover_winner_goals"
                type="number"
                min="0"
                max="20"
                {...register('walkover_winner_goals', { valueAsNumber: true })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="walkover_loser_goals">不戦勝時敗者得点</Label>
              <Input
                id="walkover_loser_goals"
                type="number"
                min="0"
                max="20"
                {...register('walkover_loser_goals', { valueAsNumber: true })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 開催日程 */}
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
                const currentDates = getValues('tournament_dates') || [];
                const nextDayNumber = Math.max(...currentDates.map(d => d.dayNumber), 0) + 1;
                const lastDate = currentDates.length > 0 
                  ? new Date(Math.max(...currentDates.map(d => new Date(d.date).getTime())))
                  : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
                
                const nextDate = new Date(lastDate);
                nextDate.setDate(lastDate.getDate() + 1);
                
                setValue('tournament_dates', [
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
          {(watch('tournament_dates') || []).map((_, index) => (
            <div key={index} className="border rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <Label className="text-base font-medium">
                  開催日 {index + 1}
                </Label>
                {(watch('tournament_dates')?.length || 0) > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const dates = getValues('tournament_dates') || [];
                      setValue('tournament_dates', dates.filter((_, i) => i !== index));
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>開催日</Label>
                  <Input
                    type="date"
                    {...register(`tournament_dates.${index}.date`)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>日程番号</Label>
                  <Input
                    type="number"
                    min="1"
                    {...register(`tournament_dates.${index}.dayNumber`, { valueAsNumber: true })}
                  />
                </div>
              </div>
            </div>
          ))}
          {errors.tournament_dates && (
            <p className="text-sm text-red-600">{errors.tournament_dates.message}</p>
          )}
        </CardContent>
      </Card>

      {/* 公開・募集設定 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center space-x-2 text-lg">
            <Calendar className="h-5 w-5 text-orange-600" />
            <span>公開・募集設定</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="public_start_date">公開開始日 *</Label>
              <Input
                id="public_start_date"
                type="date"
                {...register("public_start_date")}
                className={errors.public_start_date ? "border-red-500" : ""}
              />
              {errors.public_start_date && (
                <p className="text-sm text-red-600">{errors.public_start_date.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="recruitment_start_date">募集開始日 *</Label>
              <Input
                id="recruitment_start_date"
                type="date"
                {...register("recruitment_start_date")}
                className={errors.recruitment_start_date ? "border-red-500" : ""}
              />
              {errors.recruitment_start_date && (
                <p className="text-sm text-red-600">{errors.recruitment_start_date.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="recruitment_end_date">募集終了日 *</Label>
              <Input
                id="recruitment_end_date"
                type="date"
                {...register("recruitment_end_date")}
                className={errors.recruitment_end_date ? "border-red-500" : ""}
              />
              {errors.recruitment_end_date && (
                <p className="text-sm text-red-600">{errors.recruitment_end_date.message}</p>
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
          <input type="hidden" {...register("is_public")} value="true" />
        </CardContent>
      </Card>

      {/* 時間設定 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center space-x-2 text-lg">
            <Clock className="h-5 w-5 text-purple-600" />
            <span>時間設定</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 開始時刻 */}
            <div className="space-y-2">
              <Label htmlFor="start_time">開始時刻 *</Label>
              <Input
                id="start_time"
                type="time"
                {...register("start_time")}
                className={errors.start_time ? "border-red-500" : ""}
              />
              {errors.start_time && (
                <p className="text-sm text-red-600">{errors.start_time.message}</p>
              )}
            </div>

            {/* 試合時間 */}
            <div className="space-y-2">
              <Label htmlFor="match_duration_minutes">試合時間（分） *</Label>
              <Input
                id="match_duration_minutes"
                type="number"
                {...register("match_duration_minutes", { valueAsNumber: true })}
                min={5}
                max={60}
                className={errors.match_duration_minutes ? "border-red-500" : ""}
              />
              {errors.match_duration_minutes && (
                <p className="text-sm text-red-600">{errors.match_duration_minutes.message}</p>
              )}
            </div>

            {/* 休憩時間 */}
            <div className="space-y-2">
              <Label htmlFor="break_duration_minutes">休憩時間（分） *</Label>
              <Input
                id="break_duration_minutes"
                type="number"
                {...register("break_duration_minutes", { valueAsNumber: true })}
                min={0}
                max={30}
                className={errors.break_duration_minutes ? "border-red-500" : ""}
              />
              {errors.break_duration_minutes && (
                <p className="text-sm text-red-600">{errors.break_duration_minutes.message}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* スケジュールプレビュー */}
      {selectedFormat && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Calendar className="h-5 w-5 text-blue-600" />
              <span>スケジュールプレビュー</span>
              <Badge className="bg-blue-100 text-blue-800">
                個別編集可能
              </Badge>
            </CardTitle>
            <p className="text-sm text-gray-600">
              各試合の時間とコート番号を個別に調整できます
            </p>
          </CardHeader>
          <CardContent>
            <div className="mt-4">
              <SchedulePreview
                settings={{
                  courtCount: watch('court_count') || 4,
                  availableCourts: selectedVenue ? Array.from({length: selectedVenue.available_courts}, (_, i) => i + 1) : undefined,
                  matchDurationMinutes: watch('match_duration_minutes') || 15,
                  breakDurationMinutes: watch('break_duration_minutes') || 5,
                  startTime: watch('start_time') || '13:00',
                  tournamentDates: watch('tournament_dates') || []
                }}
                formatId={selectedFormat.format_id}
                editMode={false}
                onScheduleChange={handleScheduleChange}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* 送信ボタン */}
      <div className="flex justify-end space-x-4 pt-6">
        <Button type="button" variant="outline" onClick={() => setStep('format-selection')}>
          フォーマット選択に戻る
        </Button>
        <Button type="submit" disabled={isSubmitting} className="bg-green-600 hover:bg-green-700">
          {isSubmitting ? "作成中..." : "🏆 大会を作成"}
        </Button>
      </div>
    </form>
  );
}