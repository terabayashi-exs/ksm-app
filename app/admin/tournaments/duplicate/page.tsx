'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Copy, Search, ChevronRight, ChevronLeft, CheckCircle, XCircle, Users, X, Plus, Building2, Trash2, Home } from 'lucide-react';
import Link from 'next/link';

interface SportType {
  sport_type_id: number;
  sport_name: string;
  sport_code: string;
}

interface Prefecture {
  prefecture_id: number;
  prefecture_name: string;
}

interface Division {
  tournament_id: number;
  tournament_name: string;
  format_name: string | null;
  sport_type_id: number | null;
  sport_name: string | null;
  sport_code: string | null;
  team_count: number;
  registered_teams: number;
  status: string;
  tournament_dates: string | null;
}

interface SearchGroup {
  group_id: number;
  group_name: string;
  organizer: string | null;
  event_start_date: string | null;
  event_end_date: string | null;
  divisions: Division[];
}

interface TournamentGroup {
  group_id: number;
  group_name: string;
  organizer: string | null;
  event_start_date: string | null;
  event_end_date: string | null;
}

interface DuplicateResult {
  success: boolean;
  message: string;
  details?: {
    original_tournament_id: number;
    new_tournament_id: number;
    new_tournament_name: string;
    group_id: number;
    new_group_created: boolean;
  };
  error?: string;
}

interface TournamentDateEntry {
  dayNumber: number;
  date: string;
}

const getSportIcon = (sportCode: string | null) => {
  switch (sportCode) {
    case 'soccer': return '\u26BD';
    case 'futsal': return '\u{1F3C3}';
    case 'basketball': return '\u{1F3C0}';
    default: return '\u{1F3C6}';
  }
};

const getStatusLabel = (status: string) => {
  switch (status) {
    case 'planning': return '準備中';
    case 'recruiting': return '募集中';
    case 'ongoing': return '開催中';
    case 'completed': return '完了';
    default: return status;
  }
};

/**
 * 複製元のtournament_datesが節設定（複数Day）を持つか判定
 */
function hasMultipleDays(tournamentDatesJson: string | null): boolean {
  if (!tournamentDatesJson) return false;
  try {
    const parsed = JSON.parse(tournamentDatesJson);
    if (typeof parsed === 'object' && !Array.isArray(parsed)) {
      return Object.keys(parsed).length > 1;
    }
    return false;
  } catch {
    return false;
  }
}

export default function TournamentDuplicatePage() {
  const [step, setStep] = useState(1);

  // Step 1: 検索・選択
  const [searchKeyword, setSearchKeyword] = useState('');
  const [selectedPrefecture, setSelectedPrefecture] = useState('');
  const [selectedSportType, setSelectedSportType] = useState('');
  const [prefectures, setPrefectures] = useState<Prefecture[]>([]);
  const [sportTypes, setSportTypes] = useState<SportType[]>([]);
  const [searchResults, setSearchResults] = useState<SearchGroup[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedDivision, setSelectedDivision] = useState<Division | null>(null);
  const [selectedGroupName, setSelectedGroupName] = useState('');

  // Step 2: 複製先設定
  const [destinationType, setDestinationType] = useState<'new' | 'existing'>('new');
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupOrganizer, setNewGroupOrganizer] = useState('');
  const [existingGroupId, setExistingGroupId] = useState<number | null>(null);
  const [existingGroups, setExistingGroups] = useState<TournamentGroup[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [newTournamentName, setNewTournamentName] = useState('');

  // 開催日程
  const [tournamentDates, setTournamentDates] = useState<TournamentDateEntry[]>([
    { dayNumber: 1, date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] }
  ]);

  // 公開設定
  const [publicStartDate, setPublicStartDate] = useState(
    new Date().toISOString().split('T')[0] + 'T00:00'
  );
  const [recruitmentStartDate, setRecruitmentStartDate] = useState(
    new Date().toISOString().split('T')[0] + 'T00:00'
  );
  const [recruitmentEndDate, setRecruitmentEndDate] = useState(
    new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] + 'T00:00'
  );
  const [isPublic, setIsPublic] = useState(false);
  const [showPlayersPublic, setShowPlayersPublic] = useState(false);

  // Step 3: 確認・実行
  const [duplicating, setDuplicating] = useState(false);
  const [duplicateResult, setDuplicateResult] = useState<DuplicateResult | null>(null);

  // 複製元が節設定を持つかどうか
  const sourceHasMultipleDays = selectedDivision ? hasMultipleDays(selectedDivision.tournament_dates) : false;

  // マスタデータ取得
  useEffect(() => {
    const fetchMasters = async () => {
      try {
        const [prefRes, sportRes] = await Promise.all([
          fetch('/api/prefectures'),
          fetch('/api/sport-types'),
        ]);
        const prefData = await prefRes.json();
        const sportData = await sportRes.json();
        if (prefData.success) setPrefectures(prefData.prefectures || []);
        if (sportData.success) setSportTypes(sportData.data || sportData.sport_types || []);
      } catch (error) {
        console.error('マスタデータ取得エラー:', error);
      }
    };
    fetchMasters();
  }, []);

  // 検索実行
  const handleSearch = useCallback(async () => {
    setSearching(true);
    setHasSearched(true);
    try {
      const params = new URLSearchParams();
      if (searchKeyword) params.set('keyword', searchKeyword);
      if (selectedPrefecture) params.set('prefecture_id', selectedPrefecture);
      if (selectedSportType) params.set('sport_type_id', selectedSportType);

      const res = await fetch(`/api/admin/tournaments/search?${params}`);
      const data = await res.json();
      if (data.success) {
        setSearchResults(data.data || []);
      }
    } catch (error) {
      console.error('検索エラー:', error);
    } finally {
      setSearching(false);
    }
  }, [searchKeyword, selectedPrefecture, selectedSportType]);

  // 検索クリア
  const handleClearSearch = () => {
    setSearchKeyword('');
    setSelectedPrefecture('');
    setSelectedSportType('');
    setSearchResults([]);
    setHasSearched(false);
  };

  // 部門選択 → Step 2 へ
  const handleSelectDivision = (division: Division, groupName: string) => {
    setSelectedDivision(division);
    setSelectedGroupName(groupName);
    setNewTournamentName(`${division.tournament_name} (複製)`);
    setStep(2);
  };

  // 既存大会グループ取得
  const fetchExistingGroups = useCallback(async () => {
    setLoadingGroups(true);
    try {
      const res = await fetch('/api/tournament-groups?include_inactive=true');
      const data = await res.json();
      if (data.success) {
        setExistingGroups(data.data || []);
      }
    } catch (error) {
      console.error('大会グループ取得エラー:', error);
    } finally {
      setLoadingGroups(false);
    }
  }, []);

  useEffect(() => {
    if (step === 2 && destinationType === 'existing') {
      fetchExistingGroups();
    }
  }, [step, destinationType, fetchExistingGroups]);

  // 日程追加
  const addTournamentDate = () => {
    const nextDayNumber = Math.max(...tournamentDates.map(d => d.dayNumber), 0) + 1;
    const lastDate = tournamentDates.length > 0
      ? new Date(Math.max(...tournamentDates.map(d => new Date(d.date).getTime())))
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const nextDate = new Date(lastDate);
    nextDate.setDate(lastDate.getDate() + 1);
    setTournamentDates([...tournamentDates, { dayNumber: nextDayNumber, date: nextDate.toISOString().split('T')[0] }]);
  };

  // 日程削除
  const removeTournamentDate = (index: number) => {
    setTournamentDates(tournamentDates.filter((_, i) => i !== index));
  };

  // 日程更新
  const updateTournamentDate = (index: number, field: 'date' | 'dayNumber', value: string | number) => {
    const updated = [...tournamentDates];
    if (field === 'date') {
      updated[index] = { ...updated[index], date: value as string };
    } else {
      updated[index] = { ...updated[index], dayNumber: value as number };
    }
    setTournamentDates(updated);
  };

  // tournament_datesをJSON形式に変換
  const buildTournamentDatesJson = (): string => {
    const json: Record<string, string> = {};
    tournamentDates.forEach((entry) => {
      json[entry.dayNumber.toString()] = entry.date;
    });
    return JSON.stringify(json);
  };

  // 複製実行
  const handleDuplicate = async () => {
    if (!selectedDivision) return;

    setDuplicating(true);
    try {
      const sortedDates = [...tournamentDates].sort((a, b) => a.date.localeCompare(b.date));
      const eventStartDate = sortedDates[0]?.date || undefined;
      const eventEndDate = sortedDates[sortedDates.length - 1]?.date || undefined;

      const body: Record<string, unknown> = {
        source_tournament_id: selectedDivision.tournament_id,
        new_tournament_name: newTournamentName.trim(),
        is_public: isPublic,
        show_players_public: showPlayersPublic,
        public_start_date: publicStartDate,
        recruitment_start_date: recruitmentStartDate,
        recruitment_end_date: recruitmentEndDate,
      };

      // 節設定がない場合のみ日程を送信
      if (!sourceHasMultipleDays) {
        body.tournament_dates = buildTournamentDatesJson();
        body.event_start_date = eventStartDate;
        body.event_end_date = eventEndDate;
      }

      if (destinationType === 'new') {
        body.new_group = {
          group_name: newGroupName.trim(),
          organizer: newGroupOrganizer.trim() || undefined,
          event_start_date: eventStartDate,
          event_end_date: eventEndDate,
        };
      } else {
        body.group_id = existingGroupId;
      }

      const res = await fetch('/api/admin/tournaments/duplicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const result = await res.json();
      setDuplicateResult(result);
      if (result.success) {
        setStep(3);
      }
    } catch (error) {
      console.error('複製エラー:', error);
      setDuplicateResult({
        success: false,
        message: '複製処理中にエラーが発生しました',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setDuplicating(false);
    }
  };

  // バリデーション
  const canProceedToStep3 =
    selectedDivision &&
    newTournamentName.trim() &&
    (destinationType === 'new' ? newGroupName.trim() : existingGroupId) &&
    publicStartDate &&
    recruitmentStartDate &&
    recruitmentEndDate &&
    (sourceHasMultipleDays || tournamentDates.every(d => d.date && d.dayNumber > 0));

  return (
    <div className="min-h-screen bg-white">
      {/* ヘッダー */}
      <div className="bg-base-800 border-b-[3px] border-primary">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
            <h1 className="text-2xl font-bold text-white">大会・部門複製</h1>
            <p className="text-sm text-white/70 mt-1">
              既存の部門設定を複製して、新しい大会や部門を効率的に作成できます
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <nav className="flex flex-wrap items-center gap-1.5 text-sm mb-6">
          <Link href="/" className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 transition-colors whitespace-nowrap">
            <Home className="h-3.5 w-3.5" />
            <span>Home</span>
          </Link>
          <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <Link href="/my?tab=admin" className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 transition-colors whitespace-nowrap">
            マイダッシュボード
          </Link>
          <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <span className="inline-flex items-center px-2.5 py-1.5 rounded-md bg-primary/10 text-primary font-medium">
            大会・部門複製
          </span>
        </nav>
        {/* ステップインジケーター */}
        <div className="flex items-center justify-center mb-8 gap-2">
          {[
            { num: 1, label: '複製元を選択' },
            { num: 2, label: '複製先と設定' },
            { num: 3, label: '確認・完了' },
          ].map((s, i) => (
            <div key={s.num} className="flex items-center">
              {i > 0 && <ChevronRight className="w-4 h-4 text-gray-500 mx-1" />}
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
                step === s.num
                  ? 'bg-primary text-primary-foreground'
                  : step > s.num
                    ? 'bg-green-100 text-green-800'
                    : 'bg-gray-50 text-gray-500'
              }`}>
                <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-xs">
                  {step > s.num ? <CheckCircle className="w-4 h-4" /> : s.num}
                </span>
                <span className="hidden sm:inline">{s.label}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Step 1: 複製元の部門を検索・選択 */}
        {step === 1 && (
          <div className="space-y-6">
            {/* 検索フォーム */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Search className="w-5 h-5" />
                  複製元の部門を検索
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* フリーワード検索 */}
                <div>
                  <Label className="text-sm font-medium mb-2 block">フリーワード検索</Label>
                  <Input
                    type="text"
                    placeholder="大会名・部門名で検索"
                    value={searchKeyword}
                    onChange={(e) => setSearchKeyword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  />
                </div>

                {/* 地域 */}
                <div>
                  <Label className="text-sm font-medium mb-2 block">地域で絞り込み</Label>
                  <Select value={selectedPrefecture || 'all'} onValueChange={(value) => setSelectedPrefecture(value === 'all' ? '' : value)}>
                    <SelectTrigger className="bg-white">
                      <SelectValue placeholder="都道府県を選択" />
                    </SelectTrigger>
                    <SelectContent className="bg-white">
                      <SelectItem value="all">指定しない</SelectItem>
                      {prefectures.map((pref) => (
                        <SelectItem key={pref.prefecture_id} value={String(pref.prefecture_id)}>
                          {pref.prefecture_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* 競技種別 */}
                {sportTypes.length > 0 && (
                  <div>
                    <Label className="text-sm font-medium mb-2 block">競技から絞り込み</Label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => setSelectedSportType('')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 transition-all text-sm ${
                          selectedSportType === ''
                            ? 'border-blue-600 bg-blue-50 text-blue-700'
                            : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/50'
                        }`}
                      >
                        <span>&#x1F3C6;</span>
                        <span>全て</span>
                      </button>
                      {sportTypes.map((sport) => (
                        <button
                          key={sport.sport_type_id}
                          onClick={() => setSelectedSportType(String(sport.sport_type_id))}
                          className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 transition-all text-sm ${
                            selectedSportType === String(sport.sport_type_id)
                              ? 'border-blue-600 bg-blue-50 text-blue-700'
                              : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/50'
                          }`}
                        >
                          <span>{getSportIcon(sport.sport_code)}</span>
                          <span>{sport.sport_name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 検索・クリアボタン */}
                <div className="flex gap-2 pt-2">
                  <Button onClick={handleSearch} disabled={searching} className="flex-1">
                    <Search className="w-4 h-4 mr-1" />
                    {searching ? '検索中...' : '検索'}
                  </Button>
                  <Button variant="outline" onClick={handleClearSearch} className="flex-1">
                    <X className="w-4 h-4 mr-1" />
                    クリア
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* 検索結果 */}
            {hasSearched && (
              <div className="space-y-4">
                {searchResults.length === 0 ? (
                  <Card>
                    <CardContent className="py-8 text-center text-gray-500">
                      検索条件に一致する部門が見つかりませんでした
                    </CardContent>
                  </Card>
                ) : (
                  searchResults.map((group) => (
                    <Card key={group.group_id}>
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between">
                          <div>
                            <CardTitle className="text-base">{group.group_name}</CardTitle>
                            {group.organizer && (
                              <p className="text-sm text-gray-500 mt-0.5">主催: {group.organizer}</p>
                            )}
                          </div>
                          {group.event_start_date && (
                            <Badge variant="outline" className="text-xs">
                              {group.event_start_date}
                              {group.event_end_date && group.event_end_date !== group.event_start_date && ` 〜 ${group.event_end_date}`}
                            </Badge>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent className="pt-2">
                        <div className="space-y-2">
                          {group.divisions.map((division) => (
                            <button
                              key={division.tournament_id}
                              onClick={() => handleSelectDivision(division, group.group_name)}
                              className={`w-full text-left p-3 border rounded-lg transition-colors hover:border-primary hover:bg-primary/5 ${
                                selectedDivision?.tournament_id === division.tournament_id
                                  ? 'border-primary bg-primary/5'
                                  : 'border-gray-200'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span>{getSportIcon(division.sport_code)}</span>
                                  <span className="font-medium">{division.tournament_name}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge variant="secondary" className="text-xs">
                                    {getStatusLabel(division.status)}
                                  </Badge>
                                  <ChevronRight className="w-4 h-4 text-gray-500" />
                                </div>
                              </div>
                              <div className="flex items-center gap-4 mt-1.5 text-xs text-gray-500">
                                {division.format_name && <span>{division.format_name}</span>}
                                {division.sport_name && <span>{division.sport_name}</span>}
                                <span className="flex items-center gap-1">
                                  <Users className="w-3 h-3" />
                                  {division.registered_teams}/{division.team_count}チーム
                                </span>
                              </div>
                            </button>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* Step 2: 複製先と設定 */}
        {step === 2 && selectedDivision && (
          <div className="space-y-6">
            {/* 選択中の複製元 */}
            <Card className="border-blue-200 bg-blue-50/50">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">複製元</p>
                    <p className="font-medium">{selectedDivision.tournament_name}</p>
                    <p className="text-sm text-gray-500">{selectedGroupName}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setStep(1)}>
                    変更
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* 複製先選択 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">複製先 <span className="text-destructive">*</span></CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setDestinationType('new')}
                    className={`p-3 rounded-lg border-2 text-left transition-all ${
                      destinationType === 'new'
                        ? 'border-primary bg-primary/5'
                        : 'border-gray-200 hover:border-primary/50'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Plus className="w-4 h-4" />
                      <span className="font-medium text-sm">新しい大会を作成</span>
                    </div>
                    <p className="text-xs text-gray-500">新しい大会グループを作成して複製</p>
                  </button>
                  <button
                    onClick={() => {
                      setDestinationType('existing');
                      fetchExistingGroups();
                    }}
                    className={`p-3 rounded-lg border-2 text-left transition-all ${
                      destinationType === 'existing'
                        ? 'border-primary bg-primary/5'
                        : 'border-gray-200 hover:border-primary/50'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Building2 className="w-4 h-4" />
                      <span className="font-medium text-sm">既存の大会に追加</span>
                    </div>
                    <p className="text-xs text-gray-500">既存の大会に部門を追加</p>
                  </button>
                </div>

                {/* 新規大会の場合 */}
                {destinationType === 'new' && (
                  <div className="space-y-3 pt-2">
                    <div>
                      <Label htmlFor="new-group-name">大会名 <span className="text-destructive">*</span></Label>
                      <Input
                        id="new-group-name"
                        value={newGroupName}
                        onChange={(e) => setNewGroupName(e.target.value)}
                        placeholder="例: 第2回 PK選手権大会"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="new-group-organizer">主催者</Label>
                      <Input
                        id="new-group-organizer"
                        value={newGroupOrganizer}
                        onChange={(e) => setNewGroupOrganizer(e.target.value)}
                        placeholder="例: PK選手権実行委員会"
                        className="mt-1"
                      />
                    </div>
                  </div>
                )}

                {/* 既存大会の場合 */}
                {destinationType === 'existing' && (
                  <div className="pt-2">
                    {loadingGroups ? (
                      <p className="text-sm text-gray-500 text-center py-4">読込中...</p>
                    ) : existingGroups.length === 0 ? (
                      <p className="text-sm text-gray-500 text-center py-4">既存の大会がありません</p>
                    ) : (
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {existingGroups.map((group) => (
                          <button
                            key={group.group_id}
                            onClick={() => setExistingGroupId(group.group_id)}
                            className={`w-full text-left p-3 border rounded-lg transition-colors ${
                              existingGroupId === group.group_id
                                ? 'border-primary bg-primary/5'
                                : 'border-gray-200 hover:border-primary/50'
                            }`}
                          >
                            <p className="font-medium text-sm">{group.group_name}</p>
                            <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                              {group.organizer && <span>主催: {group.organizer}</span>}
                              {group.event_start_date && <span>{group.event_start_date}</span>}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 部門設定 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">部門設定</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="new-tournament-name">部門名 <span className="text-destructive">*</span></Label>
                  <Input
                    id="new-tournament-name"
                    value={newTournamentName}
                    onChange={(e) => setNewTournamentName(e.target.value)}
                    placeholder="例: U-12部門"
                    className="mt-1"
                  />
                </div>

                <div className="bg-gray-50/50 rounded-lg p-3 text-sm text-gray-500">
                  <p className="font-medium mb-1">複製元から引き継がれる設定:</p>
                  <ul className="list-disc list-inside space-y-0.5 text-xs">
                    <li>フォーマット設定（{selectedDivision.format_name || '未設定'}）</li>
                    <li>競技種別（{selectedDivision.sport_name || '未設定'}）</li>
                    <li>チーム数、コート数、試合時間等</li>
                    <li>ルール設定（ポイントシステム、タイブレーク等）</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            {/* 開催日程（節設定がない場合のみ表示） */}
            {!sourceHasMultipleDays && (
              <Card>
                <CardContent className="pt-6">
                  <div className="border rounded-lg p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold">開催日程 <span className="text-destructive">*</span></h3>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={addTournamentDate}
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        日程追加
                      </Button>
                    </div>
                    {tournamentDates.map((entry, index) => (
                      <div key={index} className="flex items-end gap-3">
                        <div className="flex-1 space-y-1">
                          <Label className="text-xs text-gray-500">開催日 {index + 1}</Label>
                          <Input
                            type="date"
                            value={entry.date}
                            onChange={(e) => updateTournamentDate(index, 'date', e.target.value)}
                          />
                        </div>
                        <div className="w-24 space-y-1">
                          <Label className="text-xs text-gray-500">Day番号</Label>
                          <Input
                            type="number"
                            min="1"
                            value={entry.dayNumber}
                            onChange={(e) => updateTournamentDate(index, 'dayNumber', parseInt(e.target.value) || 1)}
                          />
                        </div>
                        {tournamentDates.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-9 px-2"
                            onClick={() => removeTournamentDate(index)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {sourceHasMultipleDays && (
              <Card>
                <CardContent className="pt-6">
                  <div className="bg-gray-50/50 rounded-lg p-3 text-sm text-gray-500">
                    複製元の部門は節（複数Day）設定を持つため、開催日程は複製元からそのまま引き継がれます。
                  </div>
                </CardContent>
              </Card>
            )}

            {/* 公開設定 */}
            <Card>
              <CardContent className="pt-6">
                <div className="border rounded-lg p-4 space-y-4">
                  <h3 className="text-sm font-semibold">公開設定</h3>

                  <div className="space-y-2">
                    <Label htmlFor="public_start_date">公開開始日時 <span className="text-destructive">*</span></Label>
                    <Input
                      id="public_start_date"
                      type="datetime-local"
                      value={publicStartDate}
                      onChange={(e) => setPublicStartDate(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="recruitment_start_date">募集開始日時 <span className="text-destructive">*</span></Label>
                    <Input
                      id="recruitment_start_date"
                      type="datetime-local"
                      value={recruitmentStartDate}
                      onChange={(e) => setRecruitmentStartDate(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="recruitment_end_date">募集終了日時 <span className="text-destructive">*</span></Label>
                    <Input
                      id="recruitment_end_date"
                      type="datetime-local"
                      value={recruitmentEndDate}
                      onChange={(e) => setRecruitmentEndDate(e.target.value)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label htmlFor="is_public" className="cursor-pointer">公開する</Label>
                    <Switch
                      id="is_public"
                      checked={isPublic}
                      onCheckedChange={setIsPublic}
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="show_players_public" className="cursor-pointer">選手情報を一般公開する</Label>
                      <Switch
                        id="show_players_public"
                        checked={showPlayersPublic}
                        onCheckedChange={setShowPlayersPublic}
                      />
                    </div>
                    <p className="text-xs text-gray-500">
                      チェックを入れると、一般ユーザーも部門詳細画面の「参加チーム」タブで選手名・背番号を閲覧できるようになります。
                      チェックを外すと、大会運営者のみが閲覧可能になります。
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* ナビゲーションボタン */}
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
                <ChevronLeft className="w-4 h-4 mr-1" />
                戻る
              </Button>
              <Button
                onClick={() => setStep(3)}
                disabled={!canProceedToStep3}
                className="flex-1"
              >
                確認へ
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: 確認・実行 */}
        {step === 3 && selectedDivision && !duplicateResult && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">複製内容の確認</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-sm text-gray-500">複製元の部門</span>
                    <span className="text-sm font-medium">{selectedDivision.tournament_name}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-sm text-gray-500">複製元の大会</span>
                    <span className="text-sm font-medium">{selectedGroupName}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-sm text-gray-500">複製先</span>
                    <span className="text-sm font-medium">
                      {destinationType === 'new'
                        ? `${newGroupName}（新規作成）`
                        : existingGroups.find(g => g.group_id === existingGroupId)?.group_name || ''
                      }
                    </span>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-sm text-gray-500">新しい部門名</span>
                    <span className="text-sm font-medium">{newTournamentName}</span>
                  </div>
                  {!sourceHasMultipleDays && (
                    <div className="flex justify-between py-2 border-b">
                      <span className="text-sm text-gray-500">開催日程</span>
                      <span className="text-sm font-medium">
                        {tournamentDates.map(d => `Day${d.dayNumber}: ${d.date}`).join('、')}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-sm text-gray-500">公開開始日時</span>
                    <span className="text-sm font-medium">{publicStartDate.replace('T', ' ')}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-sm text-gray-500">募集開始日時</span>
                    <span className="text-sm font-medium">{recruitmentStartDate.replace('T', ' ')}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-sm text-gray-500">募集終了日時</span>
                    <span className="text-sm font-medium">{recruitmentEndDate.replace('T', ' ')}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-sm text-gray-500">公開設定</span>
                    <Badge variant={isPublic ? 'default' : 'secondary'}>
                      {isPublic ? '公開' : '非公開'}
                    </Badge>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-sm text-gray-500">選手情報の一般公開</span>
                    <Badge variant={showPlayersPublic ? 'default' : 'secondary'}>
                      {showPlayersPublic ? '公開' : '非公開'}
                    </Badge>
                  </div>
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-4 text-sm text-amber-800">
                  チーム・選手データ、試合データは複製されません。基本設定とルールのみが複製されます。
                </div>
              </CardContent>
            </Card>

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(2)} className="flex-1">
                <ChevronLeft className="w-4 h-4 mr-1" />
                戻る
              </Button>
              <Button
                onClick={handleDuplicate}
                disabled={duplicating}
                className="flex-1"
              >
                <Copy className="w-4 h-4 mr-1" />
                {duplicating ? '複製中...' : '複製を実行'}
              </Button>
            </div>
          </div>
        )}

        {/* 結果表示 */}
        {duplicateResult && (
          <Card className={`${duplicateResult.success ? 'border-green-200 bg-green-50' : 'border-destructive/20 bg-destructive/5'}`}>
            <CardHeader>
              <CardTitle className={`flex items-center gap-2 ${duplicateResult.success ? 'text-green-800' : 'text-destructive'}`}>
                {duplicateResult.success ? <CheckCircle className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                {duplicateResult.success ? '複製完了' : '複製失敗'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className={`mb-4 ${duplicateResult.success ? 'text-green-700' : 'text-destructive'}`}>
                {duplicateResult.message}
              </p>
              {duplicateResult.success && duplicateResult.details && (
                <div className="space-y-3">
                  <div className="text-sm text-green-700 space-y-1">
                    <p>新しい部門ID: {duplicateResult.details.new_tournament_id}</p>
                    <p>部門名: {duplicateResult.details.new_tournament_name}</p>
                    {duplicateResult.details.new_group_created && (
                      <p>新しい大会グループも作成されました</p>
                    )}
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/admin/tournaments/${duplicateResult.details.new_tournament_id}`}>
                        新しい部門を開く
                      </Link>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setDuplicateResult(null);
                        setSelectedDivision(null);
                        setNewTournamentName('');
                        setNewGroupName('');
                        setNewGroupOrganizer('');
                        setExistingGroupId(null);
                        setTournamentDates([
                          { dayNumber: 1, date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] }
                        ]);
                        setPublicStartDate(new Date().toISOString().split('T')[0] + 'T00:00');
                        setRecruitmentStartDate(new Date().toISOString().split('T')[0] + 'T00:00');
                        setRecruitmentEndDate(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] + 'T00:00');
                        setIsPublic(false);
                        setShowPlayersPublic(false);
                        setStep(1);
                      }}
                    >
                      続けて複製する
                    </Button>
                  </div>
                </div>
              )}
              {duplicateResult.error && (
                <p className="mt-2 text-sm text-destructive">エラー詳細: {duplicateResult.error}</p>
              )}
              {!duplicateResult.success && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => {
                    setDuplicateResult(null);
                    setStep(3);
                  }}
                >
                  やり直す
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
