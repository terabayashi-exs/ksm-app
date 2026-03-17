"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Users, Sparkles, Plus, Trash2, Info, Loader2, Building2, X, ChevronsUpDown, Check, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import SchedulePreview from "@/components/features/tournament/SchedulePreview";
import FormatDetailBadges, { getSportIcon } from "@/components/features/tournament-format/FormatDetailBadges";
import React from "react";

// 型定義
interface TournamentGroup {
  group_id: number;
  group_name: string;
  organizer: string | null;
  event_start_date: string | null;
  event_end_date: string | null;
}

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
  sport_type_id?: number;
  sport_code?: string;
  default_match_duration?: number | null;
  default_break_duration?: number | null;
  matchday_count?: number;
  phase_stats?: Array<{ phase: string; phase_name: string; order: number; block_count: number; max_court_number: number | null }>;
  visibility?: string;
  isAccessible?: boolean;
}

interface SportType {
  sport_type_id: number;
  sport_name: string;
  sport_code: string;
  max_period_count: number;
  regular_period_count: number;
  score_type: string;
  default_match_duration: number;
  score_unit: string;
  period_definitions: string;
  result_format: string;
}

interface RecommendedFormat extends Format {
  recommendationReason: string;
  matchType: 'exact' | 'close' | 'alternative';
}

interface FormatRecommendation {
  teamCount: number;
  sportTypeId: number;
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
  group_id: z.number().min(1, "所属する大会を選択してください"),
  tournament_name: z.string().min(1, "部門名は必須です").max(100, "部門名は100文字以内で入力してください"),
  sport_type_id: z.number().min(1, "競技種別を選択してください"),
  format_id: z.number().min(1, "大会フォーマットを選択してください"),
  venue_ids: z.array(z.number()).min(1, "会場を1つ以上選択してください"),
  team_count: z.number().min(2, "チーム数は2以上で入力してください").max(128, "チーム数は128以下で入力してください"),
  tournament_dates: z.array(z.object({
    dayNumber: z.number(),
    date: z.string()
  })).min(1, "開催日程は必須です"),
  match_duration_minutes: z.number().min(5, "試合時間は5分以上").max(120, "試合時間は120分以下"),
  break_duration_minutes: z.number().min(0, "休憩時間は0分以上").max(30, "休憩時間は30分以下"),
  is_public: z.boolean(),
  show_players_public: z.boolean(),
  public_start_date: z.string().min(1, "公開開始日時は必須です"),
  recruitment_start_date: z.string().min(1, "募集開始日時は必須です"),
  recruitment_end_date: z.string().min(1, "募集終了日時は必須です"),
});

type TournamentCreateForm = z.infer<typeof tournamentCreateSchema>;

export default function TournamentCreateNewForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [sportTypes, setSportTypes] = useState<SportType[]>([]);
  const [tournamentGroups, setTournamentGroups] = useState<TournamentGroup[]>([]);
  const [loadingTournamentGroups, setLoadingTournamentGroups] = useState(true);
  const [step, setStep] = useState<'sport-selection' | 'team-count' | 'format-selection' | 'details'>('sport-selection');
  const [selectedSportType, setSelectedSportType] = useState<SportType | null>(null);
  const [teamCount, setTeamCount] = useState<number>(2);
  const [recommendation, setRecommendation] = useState<FormatRecommendation | null>(null);
  const [selectedFormat, setSelectedFormat] = useState<Format | null>(null);
  const [loadingVenues, setLoadingVenues] = useState(true);
  const [loadingSportTypes, setLoadingSportTypes] = useState(true);
  const [loadingRecommendation, setLoadingRecommendation] = useState(false);
  const [customSchedule, setCustomSchedule] = useState<CustomScheduleMatch[]>([]);
  const [selectedVenues, setSelectedVenues] = useState<Venue[]>([]);
  const [derivedCourtCount, setDerivedCourtCount] = useState<number>(4);
  const [venuePopoverOpen, setVenuePopoverOpen] = useState(false);
  const [venueSearchQuery, setVenueSearchQuery] = useState('');

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
      sport_type_id: 1,
      team_count: 8,
      venue_ids: [],
      tournament_dates: [{
        dayNumber: 1,
        date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      }],
      match_duration_minutes: 15,
      break_duration_minutes: 5,
      is_public: true,
      show_players_public: false,
      public_start_date: new Date().toISOString().split('T')[0] + 'T00:00',
      recruitment_start_date: new Date().toISOString().split('T')[0] + 'T00:00',
      recruitment_end_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] + 'T00:00',
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

  // 会場データ、競技種別データ、大会データの取得
  useEffect(() => {
    const loadVenues = async () => {
      try {
        const res = await fetch("/api/venues?scope=available");
        const data = await res.json();
        if (data.success) {
          setVenues(data.data || data.venues);

          // URLパラメータからvenue_idを取得して設定
          const venueIdParam = searchParams.get('venue_id');
          if (venueIdParam) {
            const venueId = parseInt(venueIdParam);
            if (!isNaN(venueId)) {
              setValue('venue_ids', [venueId]);
              const venuesList = data.data || data.venues;
              const venue = venuesList.find((v: Venue) => v.venue_id === venueId);
              if (venue) setSelectedVenues([venue]);
            }
          }
        }
      } catch (error) {
        console.error("会場データ取得エラー:", error);
      } finally {
        setLoadingVenues(false);
      }
    };

    const loadSportTypes = async () => {
      try {
        const res = await fetch("/api/sport-types");
        const data = await res.json();
        if (data.success) {
          setSportTypes(data.data || []);
        }
      } catch (error) {
        console.error("競技種別データ取得エラー:", error);
      } finally {
        setLoadingSportTypes(false);
      }
    };

    const loadTournamentGroups = async () => {
      try {
        const res = await fetch("/api/tournament-groups?include_inactive=true");
        const data = await res.json();
        if (data.success) {
          setTournamentGroups(data.data || []);

          // URLパラメータからgroup_idを取得して設定
          const groupIdParam = searchParams.get('group_id');
          if (groupIdParam) {
            const groupId = parseInt(groupIdParam);
            if (!isNaN(groupId)) {
              setValue('group_id', groupId);
            }
          }
        }
      } catch (error) {
        console.error("大会データ取得エラー:", error);
      } finally {
        setLoadingTournamentGroups(false);
      }
    };

    loadVenues();
    loadSportTypes();
    loadTournamentGroups();
  }, [searchParams, setValue]);

  // フォーマット推奨の取得
  const fetchRecommendation = async (count: number, sportTypeId?: number) => {
    setLoadingRecommendation(true);
    try {
      const currentSportTypeId = sportTypeId || selectedSportType?.sport_type_id || watch('sport_type_id');
      
      if (!currentSportTypeId) {
        console.warn('競技種別が選択されていません');
        setLoadingRecommendation(false);
        return;
      }
      
      const response = await fetch(`/api/tournaments/formats/recommend?teamCount=${count}&sportTypeId=${currentSportTypeId}`);
      const result = await response.json();
      if (result.success) {
        setRecommendation(result.data);
        setValue('team_count', count);
      } else {
        console.error('フォーマット推奨エラー:', result.error);
      }
    } catch (error) {
      console.error('推奨取得エラー:', error);
    } finally {
      setLoadingRecommendation(false);
    }
  };

  // 競技種別選択
  const handleSportTypeSelect = (sportType: SportType) => {
    setSelectedSportType(sportType);
    setValue("sport_type_id", sportType.sport_type_id);
    
    // 競技種別に応じてデフォルト値を設定
    setValue("match_duration_minutes", sportType.default_match_duration);
    
    // 競技がサッカーの場合は試合時間を90分、その他は既存のデフォルト
    if (sportType.sport_code === 'soccer') {
      setValue("match_duration_minutes", 90);
      setValue("break_duration_minutes", 10);
    } else if (sportType.sport_code === 'pk') {
      setValue("match_duration_minutes", 15);
      setValue("break_duration_minutes", 5);
    }
    
    setStep('team-count');
  };

  // チーム数確定
  const handleTeamCountSubmit = () => {
    if (teamCount >= 2) {
      fetchRecommendation(teamCount, selectedSportType?.sport_type_id);
      setStep('format-selection');
    }
  };

  // フォーマット選択
  const handleFormatSelect = async (formatId: number) => {
    const allFormats = [...(recommendation?.recommendedFormats || []), ...(recommendation?.allFormats || [])];
    const format = allFormats.find(f => f.format_id === formatId);

    // アクセス不可のフォーマットは選択不可
    if (format && format.isAccessible === false) return;

    setSelectedFormat(format || null);
    setValue("format_id", formatId);

    // フォーマットにデフォルト値がある場合、試合時間・休憩時間をセット
    if (format?.default_match_duration != null) {
      setValue("match_duration_minutes", format.default_match_duration);
    }
    if (format?.default_break_duration != null) {
      setValue("break_duration_minutes", format.default_break_duration);
    }

    // フォーマットのテンプレート情報を取得して必要な開催日数を確認
    try {
      const response = await fetch(`/api/tournaments/formats/${formatId}/templates`);
      const result = await response.json();

      if (result.success && result.data.statistics) {
        // テンプレートからコート数を自動算出
        if (result.data.templates && result.data.templates.length > 0) {
          const maxCourt = Math.max(...result.data.templates.map((t: { court_number?: number }) => t.court_number || 0), 1);
          setDerivedCourtCount(maxCourt);
        }

        // matchdayがあるフォーマットはリーグ戦作成画面へリダイレクト
        if (result.data.statistics.hasMatchdays) {
          const allFormats = [...(recommendation?.recommendedFormats || []), ...(recommendation?.allFormats || [])];
          const format = allFormats.find(f => f.format_id === formatId);
          const currentGroupId = getValues('group_id');
          const currentGroup = tournamentGroups.find(g => g.group_id === currentGroupId);
          sessionStorage.setItem('create-league-context', JSON.stringify({
            sport_type_id: selectedSportType?.sport_type_id,
            sport_name: selectedSportType?.sport_name,
            team_count: teamCount,
            format_id: formatId,
            format_name: format?.format_name || '',
            default_match_duration: format?.default_match_duration ?? null,
            default_break_duration: format?.default_break_duration ?? null,
            group_id: currentGroupId || null,
            group_name: currentGroup?.group_name || '',
            matchday_count: result.data.statistics.maxMatchday,
            matches_by_matchday: result.data.statistics.matchesByMatchday,
            templates: result.data.templates || [],
          }));
          router.push('/admin/tournaments/create-league');
          return;
        }

        const requiredDays = result.data.statistics.requiredDays || 1;
        const maxDayNumber = result.data.statistics.maxDayNumber || 1;

        // 必要な日数分の開催日を自動生成
        const baseDates = [];
        const baseDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        for (let i = 1; i <= maxDayNumber; i++) {
          const date = new Date(baseDate);
          date.setDate(baseDate.getDate() + (i - 1));
          baseDates.push({
            dayNumber: i,
            date: date.toISOString().split('T')[0]
          });
        }

        setValue('tournament_dates', baseDates);

        if (requiredDays > 1) {
          console.log(`フォーマットID ${formatId} は ${requiredDays}日間の開催が必要です`);
        }
      } else {
        // テンプレート情報が取得できない場合は1日のみ
        const baseDates = [{
          dayNumber: 1,
          date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        }];
        setValue('tournament_dates', baseDates);
      }
    } catch (error) {
      console.error('テンプレート情報の取得に失敗:', error);
      // エラー時は1日のみ
      const baseDates = [{
        dayNumber: 1,
        date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      }];
      setValue('tournament_dates', baseDates);
    }

    setStep('details');
  };

  // フォーム送信処理
  const onSubmit = async (data: TournamentCreateForm) => {
    setIsSubmitting(true);

    try {
      // フォーマットに必要な開催日数をチェック
      const templateResponse = await fetch(`/api/tournaments/formats/${data.format_id}/templates`);
      const templateResult = await templateResponse.json();

      if (templateResult.success && templateResult.data.statistics) {
        const maxDayNumber = templateResult.data.statistics.maxDayNumber || 1;
        const requiredDays = templateResult.data.statistics.requiredDays || 1;

        // 開催日数の検証
        const providedDayNumbers = data.tournament_dates.map(d => d.dayNumber);
        const maxProvidedDay = Math.max(...providedDayNumbers);

        if (maxProvidedDay < maxDayNumber) {
          alert(
            `選択したフォーマットは${requiredDays}日間の開催が必要です（day ${maxDayNumber}まで）。\n` +
            `現在の開催日程は${maxProvidedDay}日分しか登録されていません。\n\n` +
            `開催日程を追加してください。`
          );
          setIsSubmitting(false);
          return;
        }

        // day_numberに抜けがないかチェック
        for (let i = 1; i <= maxDayNumber; i++) {
          if (!providedDayNumbers.includes(i)) {
            alert(
              `開催日程にday ${i}が登録されていません。\n` +
              `フォーマットに必要な全ての日程（day 1〜${maxDayNumber}）を登録してください。`
            );
            setIsSubmitting(false);
            return;
          }
        }
      }

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
          group_id: data.group_id,
          venue_ids: data.venue_ids,
          court_count: derivedCourtCount,
          tournament_dates: JSON.stringify(tournamentDatesJson),
          event_start_date: data.tournament_dates[0]?.date,
          custom_schedule: customSchedule,
        }),
      });

      const result = await response.json();

      if (result.success) {
        // 作成後はマイダッシュボードにリダイレクト
        router.refresh();
        router.push('/my');
      } else {
        alert(`エラー: ${result.error}`);
      }
    } catch (error) {
      alert("部門作成中にエラーが発生しました");
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 競技種別選択ステップ
  if (step === 'sport-selection') {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-gray-900 mb-2">競技種別を選択</h2>
          <p className="text-gray-600">
            大会で実施する競技を選択してください
          </p>
        </div>

        {loadingSportTypes ? (
          <div className="flex justify-center py-12">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
              <p className="text-sm text-gray-600">競技種別を読み込み中...</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sportTypes.map((sportType) => {
              const periods = JSON.parse(sportType.period_definitions);
              const scoreIcon = sportType.sport_code === 'soccer' ? '⚽' :
                               sportType.sport_code === 'baseball' ? '⚾' :
                               sportType.sport_code === 'basketball' ? '🏀' :
                               sportType.sport_code === 'pk' ? '🥅' : '⚽';
              
              return (
                <Card 
                  key={sportType.sport_type_id} 
                  className="cursor-pointer hover:shadow-lg transition-shadow border-2 hover:border-blue-300"
                  onClick={() => handleSportTypeSelect(sportType)}
                >
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center space-x-3">
                        <div className="text-3xl">{scoreIcon}</div>
                        <div>
                          <h3 className="text-lg font-semibold">{sportType.sport_name}</h3>
                          <p className="text-sm text-gray-500">コード: {sportType.sport_code}</p>
                        </div>
                      </div>
                      <Badge variant="secondary" className="text-xs">
                        {sportType.regular_period_count}ピリオド
                      </Badge>
                    </div>

                    <div className="space-y-2 mb-4">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">標準試合時間</span>
                        <span className="font-medium">{sportType.default_match_duration}分</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">スコア単位</span>
                        <span className="font-medium">{sportType.score_unit}</span>
                      </div>
                    </div>

                    <div>
                      <p className="text-xs text-gray-500 mb-1">ピリオド構成:</p>
                      <div className="flex flex-wrap gap-1">
                        {periods.slice(0, 3).map((period: { period_id: number; period_name: string; type: string }) => (
                          <Badge 
                            key={period.period_id}
                            variant={period.type === 'extra' ? 'secondary' : period.type === 'penalty' ? 'destructive' : 'default'}
                            className="text-xs"
                          >
                            {period.period_name}
                          </Badge>
                        ))}
                        {periods.length > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{periods.length - 3}個
                          </Badge>
                        )}
                      </div>
                    </div>

                    <Button className="w-full mt-4" size="sm">
                      この競技で大会を作成
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {sportTypes.length === 0 && !loadingSportTypes && (
          <div className="text-center py-8">
            <p className="text-gray-500">競技種別が見つかりません</p>
          </div>
        )}
      </div>
    );
  }

  // チーム数入力ステップ
  if (step === 'team-count') {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">参加チーム数を入力</h2>
            <p className="text-sm text-gray-600">
              選択した競技: <span className="font-medium text-blue-600">{selectedSportType?.sport_name}</span>
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => setStep('sport-selection')}
          >
            競技種別を変更
          </Button>
        </div>
        
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
              min={2}
              max={128}
              value={teamCount}
              onChange={(e) => setTeamCount(parseInt(e.target.value) || 2)}
              placeholder="例: 16"
              className="text-center text-xl font-semibold"
            />
            <p className="text-xs text-gray-500">
              2チーム以上、128チーム以下で入力してください
            </p>
          </div>
          
          <Button
            type="button"
            onClick={handleTeamCountSubmit}
            disabled={teamCount < 2 || teamCount > 128}
            className="w-full"
          >
            おすすめフォーマットを表示
          </Button>
        </CardContent>
      </Card>
      </div>
    );
  }

  // フォーマット選択ステップ
  if (step === 'format-selection') {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">{teamCount}チーム向けのおすすめフォーマット</h2>
            <p className="text-sm text-gray-600">
              競技: <span className="font-medium text-blue-600">{selectedSportType?.sport_name}</span> | 
              参加チーム数に最適な大会フォーマットを選択してください
            </p>
          </div>
          <div className="space-x-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setStep('sport-selection');
                setRecommendation(null); // 推奨をクリア
              }}
            >
              競技を変更
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setStep('team-count')}
            >
              チーム数を変更
            </Button>
          </div>
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
                {recommendation.recommendedFormats.map((format) => {
                  const locked = format.isAccessible === false;
                  return (
                  <Card key={format.format_id} className={`${locked ? 'opacity-50 cursor-not-allowed' : 'border-green-200 hover:border-green-300 cursor-pointer'}`} onClick={() => !locked && handleFormatSelect(format.format_id)}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-2">
                            <h4 className="font-medium">
                              {format.sport_code && <span className="mr-1.5">{getSportIcon(format.sport_code)}</span>}
                              {format.format_name}
                            </h4>
                            <Badge className="bg-green-100 text-green-800 text-xs">
                              {format.matchType === 'exact' ? '完全一致' : format.matchType === 'close' ? '近似' : '代替案'}
                            </Badge>
                            {locked && (
                              <Badge variant="outline" className="text-orange-600 border-orange-300 text-xs">
                                <Lock className="h-3 w-3 mr-1" />
                                利用するには購入が必要です
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-gray-600">{format.format_description}</p>
                          <p className="text-xs text-green-600 mt-1">{format.recommendationReason}</p>
                          <div className="mt-2">
                            <FormatDetailBadges
                              default_match_duration={format.default_match_duration}
                              default_break_duration={format.default_break_duration}
                              matchday_count={format.matchday_count}
                              phase_stats={format.phase_stats}
                            />
                          </div>
                        </div>
                        {locked ? (
                          <Lock className="h-5 w-5 text-gray-400 ml-4" />
                        ) : (
                          <Button size="sm" className="ml-4">
                            選択
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                  );
                })}
              </div>
            )}

            {recommendation?.allFormats && recommendation.allFormats.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-lg font-medium text-gray-700">その他のフォーマット</h3>
                {recommendation.allFormats.filter(f => !f.isRecommended).map((format) => {
                  const locked = format.isAccessible === false;
                  return (
                  <Card key={format.format_id} className={`${locked ? 'opacity-50 cursor-not-allowed' : 'hover:border-gray-300 cursor-pointer'}`} onClick={() => !locked && handleFormatSelect(format.format_id)}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-1">
                            <h4 className="font-medium">
                              {format.sport_code && <span className="mr-1.5">{getSportIcon(format.sport_code)}</span>}
                              {format.format_name}
                            </h4>
                            {locked && (
                              <Badge variant="outline" className="text-orange-600 border-orange-300 text-xs">
                                <Lock className="h-3 w-3 mr-1" />
                                利用するには購入が必要です
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-gray-600">{format.format_description}</p>
                          <div className="mt-2">
                            <FormatDetailBadges
                              default_match_duration={format.default_match_duration}
                              default_break_duration={format.default_break_duration}
                              matchday_count={format.matchday_count}
                              phase_stats={format.phase_stats}
                            />
                          </div>
                        </div>
                        {locked ? (
                          <Lock className="h-5 w-5 text-gray-400 ml-4" />
                        ) : (
                          <Button variant="outline" size="sm" className="ml-4">
                            選択
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // 詳細入力ステップ
  const isPublic = watch("is_public");

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* フォーマット情報（読み取り専用） */}
      <div className="rounded-lg border bg-gray-50/50 p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-500">
            <Info className="w-4 h-4" />
            フォーマット情報
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setStep('sport-selection')}>
              競技を変更
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setStep('format-selection')}>
              フォーマットを変更
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-gray-500">競技種別:</span>{" "}
            <span className="font-medium">{selectedSportType?.sport_name}</span>
          </div>
          <div>
            <span className="text-gray-500">フォーマット:</span>{" "}
            <span className="font-medium">{selectedFormat?.format_name}</span>
          </div>
          <div>
            <span className="text-gray-500">チーム数:</span>{" "}
            <span className="font-medium">{teamCount}チーム</span>
          </div>
        </div>
      </div>

      {/* 所属する大会 */}
      <div className="space-y-2">
        <Label>所属する大会</Label>
        {loadingTournamentGroups ? (
          <div className="flex items-center gap-2 rounded-md border bg-gray-50/30 px-3 py-2 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-gray-500">読み込み中...</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-md border bg-gray-50/30 px-3 py-2 text-sm">
            <Building2 className="w-4 h-4 text-gray-500" />
            <span>{tournamentGroups.find(g => g.group_id === watch('group_id'))?.group_name || '未選択'}</span>
          </div>
        )}
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
            {/* 選択済み会場をBadgeで表示 */}
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

            {/* 会場選択Popover */}
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
                  {venues.filter(v => v.venue_name.toLowerCase().includes(venueSearchQuery.toLowerCase())).length === 0 && (
                    <p className="text-sm text-gray-500 text-center py-2">会場が見つかりません</p>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        )}
        {errors.venue_ids && <p className="text-sm text-destructive">{errors.venue_ids.message}</p>}
      </div>

      {/* コート数（自動算出・表示のみ） */}
      {selectedFormat && (
        <div className="flex items-center gap-2 rounded-md border bg-gray-50/30 px-3 py-2 text-sm">
          <span className="text-gray-500">使用コート数:</span>
          <span className="font-medium">{derivedCourtCount}コート</span>
          <span className="text-xs text-gray-500">（フォーマットから自動設定）</span>
        </div>
      )}

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
              const lastDate = currentDates.length > 0
                ? new Date(Math.max(...currentDates.map(d => new Date(d.date).getTime())))
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
              <Label className="text-xs text-gray-500">開催日 {index + 1}</Label>
              <Input
                type="date"
                {...register(`tournament_dates.${index}.date`)}
              />
            </div>
            <div className="w-24 space-y-1">
              <Label className="text-xs text-gray-500">Day番号</Label>
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
          <p className="text-xs text-gray-500">
            チェックを入れると、一般ユーザーも部門詳細画面の「参加チーム」タブで選手名・背番号を閲覧できるようになります。
            チェックを外すと、大会運営者のみが閲覧可能になります。
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
            disabled={selectedFormat?.default_match_duration != null}
            className={selectedFormat?.default_match_duration != null ? "bg-gray-50" : ""}
          />
          {selectedFormat?.default_match_duration != null && (
            <p className="text-xs text-gray-500">フォーマットで設定済み</p>
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
            max={30}
            disabled={selectedFormat?.default_break_duration != null}
            className={selectedFormat?.default_break_duration != null ? "bg-gray-50" : ""}
          />
          {selectedFormat?.default_break_duration != null && (
            <p className="text-xs text-gray-500">フォーマットで設定済み</p>
          )}
          {errors.break_duration_minutes && <p className="text-sm text-destructive">{errors.break_duration_minutes.message}</p>}
        </div>
      </div>

      {/* スケジュールプレビュー */}
      {selectedFormat && (
        <div className="border rounded-lg p-4 space-y-4">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">スケジュールプレビュー</h3>
            <Badge variant="secondary" className="text-xs">個別編集可能</Badge>
          </div>
          <p className="text-xs text-gray-500">各試合の時間とコート番号を個別に調整できます</p>
          <SchedulePreview
            settings={{
              courtCount: derivedCourtCount,
              availableCourts: Array.from({length: derivedCourtCount}, (_, i) => i + 1),
              matchDurationMinutes: watch('match_duration_minutes') || 15,
              breakDurationMinutes: watch('break_duration_minutes') || 5,
              startTime: '09:00',
              tournamentDates: watch('tournament_dates') || []
            }}
            formatId={selectedFormat.format_id}
            editMode={false}
            onScheduleChange={handleScheduleChange}
          />
        </div>
      )}

      {/* 送信ボタン */}
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? (
          <><Loader2 className="w-4 h-4 animate-spin mr-2" />作成中...</>
        ) : (
          "作成する"
        )}
      </Button>
    </form>
  );
}