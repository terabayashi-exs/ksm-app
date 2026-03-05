// app/admin/tournaments/[id]/match-overrides/page.tsx
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { ArrowLeft, Pencil, AlertCircle, List } from 'lucide-react';
import { MatchOverrideDialog } from '@/components/features/admin/MatchOverrideDialog';
import { BulkMatchOverrideDialog } from '@/components/features/admin/BulkMatchOverrideDialog';

interface MatchTemplate {
  match_code: string;
  phase: string;
  round_name: string;
  team1_source: string | null;
  team2_source: string | null;
  team1_display_name: string;
  team2_display_name: string;
}

interface MatchOverride {
  override_id: number;
  match_code: string;
  team1_source_override: string | null;
  team2_source_override: string | null;
  override_reason: string | null;
  round_name: string | null;
  original_team1_source: string | null;
  original_team2_source: string | null;
}

interface PhaseConfig {
  id: string;
  format_type: 'league' | 'tournament';
}

interface MatchDataForSources {
  match_code?: string;
  phase?: string;
  team1_source?: string;
  team2_source?: string;
}

// ソース候補を事前計算するユーティリティ
function buildSourceCandidates(
  allMatches: MatchDataForSources[],
  phases: PhaseConfig[],
  blockTeamCounts: { block_name: string; expected_team_count: number }[]
): {
  // フェーズのformat_typeごとのソース候補
  tournamentSources: string[];
  leagueSources: string[];
  // format_type判定用マップ
  phaseFormatMap: Map<string, 'league' | 'tournament'>;
} {
  const phaseFormatMap = new Map<string, 'league' | 'tournament'>();
  phases.forEach(p => phaseFormatMap.set(p.id, p.format_type));

  // トーナメント用: 登録済みsourceから参照されているmatch_codeを抽出し、winner/loserの両方を生成
  const referencedMatchCodes = new Set<string>();
  const leagueSet = new Set<string>();

  allMatches.forEach(match => {
    [match.team1_source, match.team2_source].forEach(source => {
      if (!source) return;
      const m = source.match(/^([A-Z]+\d+)_(winner|loser)$/);
      if (m) {
        referencedMatchCodes.add(m[1]);
      } else if (/^[A-Z]_\d+$/.test(source)) {
        leagueSet.add(source);
      }
    });
  });

  const tournamentSet = new Set<string>();
  referencedMatchCodes.forEach(code => {
    tournamentSet.add(`${code}_winner`);
    tournamentSet.add(`${code}_loser`);
  });

  // block-team-countsからブロック順位パターンを生成（リーグ用）
  blockTeamCounts.forEach(block => {
    for (let i = 1; i <= block.expected_team_count; i++) {
      leagueSet.add(`${block.block_name}_${i}`);
    }
  });

  // 実際に存在するformat_typeを判定
  const hasLeaguePhase = phases.some(p => p.format_type === 'league');
  const hasTournamentPhase = phases.some(p => p.format_type === 'tournament');

  const sortSources = (sources: string[]) => sources.sort((a, b) => {
    const blockA = a.match(/^([A-Z])_(\d+)$/);
    const blockB = b.match(/^([A-Z])_(\d+)$/);
    if (blockA && blockB) {
      if (blockA[1] !== blockB[1]) return blockA[1].localeCompare(blockB[1]);
      return parseInt(blockA[2]) - parseInt(blockB[2]);
    }
    if (blockA) return -1;
    if (blockB) return 1;
    return a.localeCompare(b);
  });

  return {
    tournamentSources: hasTournamentPhase ? sortSources(Array.from(tournamentSet)) : [],
    leagueSources: hasLeaguePhase ? sortSources(Array.from(leagueSet)) : [],
    phaseFormatMap,
  };
}

export default function MatchOverridesPage() {
  const params = useParams();
  const tournamentId = parseInt(params.id as string);

  const [templates, setTemplates] = useState<MatchTemplate[]>([]);
  const [overrides, setOverrides] = useState<MatchOverride[]>([]);
  const [allMatches, setAllMatches] = useState<MatchDataForSources[]>([]);
  const [phases, setPhases] = useState<PhaseConfig[]>([]);
  const [blockTeamCounts, setBlockTeamCounts] = useState<{ block_name: string; expected_team_count: number }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedMatch, setSelectedMatch] = useState<{
    matchCode: string;
    phase: string;
    team1Source: string | null;
    team2Source: string | null;
    originalTeam1Source: string | null;
    originalTeam2Source: string | null;
  } | null>(null);
  const [isBulkDialogOpen, setIsBulkDialogOpen] = useState(false);

  // ソース候補を事前計算（メモ化）
  const sourceCandidates = useMemo(
    () => buildSourceCandidates(allMatches, phases, blockTeamCounts),
    [allMatches, phases, blockTeamCounts]
  );

  useEffect(() => {
    loadData();
  }, [tournamentId]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadData = async () => {
    setIsLoading(true);
    try {
      // 大会情報・試合データ・ブロック別チーム数・オーバーライド情報を並列取得
      const [tournamentResponse, matchesResponse, blockCountsResponse, overridesResponse] = await Promise.all([
        fetch(`/api/tournaments/${tournamentId}`),
        fetch(`/api/tournaments/${tournamentId}/matches`),
        fetch(`/api/tournaments/${tournamentId}/block-team-counts`),
        fetch(`/api/tournaments/${tournamentId}/match-overrides`),
      ]);

      const [tournamentData, matchesData, blockCountsData, overridesData] = await Promise.all([
        tournamentResponse.json(),
        matchesResponse.json(),
        blockCountsResponse.json(),
        overridesResponse.json(),
      ]);

      // phases設定
      if (tournamentData.success && tournamentData.data?.phases?.phases) {
        setPhases(tournamentData.data.phases.phases);
      }

      // block-team-counts
      if (blockCountsData.success && blockCountsData.data?.block_team_counts) {
        setBlockTeamCounts(blockCountsData.data.block_team_counts);
      }

      if (matchesData.success && Array.isArray(matchesData.data)) {
        // 全試合データを保存（ソース候補計算用）
        setAllMatches(matchesData.data);

        // team1_source または team2_source が存在する試合のみフィルタリング（一覧表示用）
        const matchesWithSource = matchesData.data
          .filter((m: MatchTemplate & { round_name?: string; display_round_name?: string }) => m.team1_source || m.team2_source)
          .map((m: MatchTemplate & { round_name?: string; display_round_name?: string }) => ({
            match_code: m.match_code,
            phase: m.phase,
            round_name: m.round_name || m.display_round_name || '',
            team1_source: m.team1_source,
            team2_source: m.team2_source,
            team1_display_name: m.team1_display_name || '',
            team2_display_name: m.team2_display_name || '',
          }));
        setTemplates(matchesWithSource);
      } else {
        console.error('試合データの取得に失敗:', matchesData);
        setTemplates([]);
        setAllMatches([]);
      }

      if (overridesData.success) {
        setOverrides(overridesData.data);
      }
    } catch (error) {
      console.error('データ取得エラー:', error);
      alert('データの取得に失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditMatch = (matchCode: string, phase: string, originalTeam1Source: string | null, originalTeam2Source: string | null) => {
    // オーバーライドがあればその値を、なければ元の値を使用
    const override = overrides.find(o => o.match_code === matchCode);

    setSelectedMatch({
      matchCode,
      phase,
      team1Source: override?.team1_source_override || originalTeam1Source,
      team2Source: override?.team2_source_override || originalTeam2Source,
      originalTeam1Source,
      originalTeam2Source,
    });
  };

  const getCurrentSource = (matchCode: string, position: 'team1' | 'team2', originalSource: string | null): string | null => {
    const override = overrides.find(o => o.match_code === matchCode);
    if (override) {
      return position === 'team1' ? override.team1_source_override : override.team2_source_override;
    }
    return originalSource;
  };

  const hasOverride = (matchCode: string): boolean => {
    return overrides.some(o => o.match_code === matchCode);
  };

  // 選択中の試合のformat_typeに応じたソース候補
  const getAvailableSourcesForMatch = (phase: string): string[] => {
    const formatType = sourceCandidates.phaseFormatMap.get(phase);
    if (formatType === 'tournament') return sourceCandidates.tournamentSources;
    if (formatType === 'league') return sourceCandidates.leagueSources;
    // フォールバック: 全候補
    return [...sourceCandidates.leagueSources, ...sourceCandidates.tournamentSources];
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-8">
        <p className="text-center text-gray-500">読み込み中...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="bg-base-800 border-b-[3px] border-primary">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
            <h1 className="text-3xl font-bold text-white">試合進出条件の設定</h1>
            <p className="text-sm text-white/70 mt-1">
              トーナメント形式の各試合について、進出元チームを個別に設定できます。
            </p>
          </div>
        </div>
      </div>
      <div className="container mx-auto py-8 max-w-6xl">
        <div className="flex items-center justify-between mb-6">
          <Button asChild variant="outline" size="sm">
            <Link href="/my?tab=admin">
              <ArrowLeft className="h-4 w-4 mr-1" />
              ダッシュボードに戻る
            </Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsBulkDialogOpen(true)}
          >
            <List className="h-4 w-4 mr-2" />
            一括変更
          </Button>
        </div>
        <Card className="mb-6">
        <CardHeader>
          <CardTitle>使い方</CardTitle>
          <CardDescription>
            チーム辞退などにより進出条件を変更する必要がある場合に使用します
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="list-disc list-inside space-y-2 text-sm text-gray-700">
            <li><strong>個別変更</strong>: 各試合の「編集」ボタンをクリックして進出条件を変更できます</li>
            <li><strong>一括変更</strong>: 「一括変更」ボタンで複数の試合の進出条件を一度に変更できます（例: Aブロック3位→Bブロック4位）</li>
            <li>オーバーライドが設定されていない場合は、元のテンプレート条件が使用されます</li>
            <li>変更を削除すると元の条件に戻ります</li>
            <li>
              変更後は、「チーム進出処理」を実行してトーナメント試合にチームを割り当ててください
            </li>
          </ul>
        </CardContent>
      </Card>

      {templates.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-gray-500">選出条件が設定された試合が見つかりません</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {templates.map(template => {
            const currentTeam1Source = getCurrentSource(template.match_code, 'team1', template.team1_source);
            const currentTeam2Source = getCurrentSource(template.match_code, 'team2', template.team2_source);
            const isOverridden = hasOverride(template.match_code);
            const override = overrides.find(o => o.match_code === template.match_code);

            return (
              <Card key={template.match_code} className={isOverridden ? 'border-primary/30 bg-primary/5' : ''}>
                <CardContent className="py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-lg font-semibold">{template.match_code}</h3>
                        <Badge variant="outline">{template.round_name}</Badge>
                        {isOverridden && <Badge className="bg-primary">オーバーライド設定済み</Badge>}
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-gray-500 mb-1">チーム1 進出元</p>
                          <div className="flex items-center gap-2">
                            {isOverridden && currentTeam1Source !== template.team1_source && (
                              <>
                                <span className="text-gray-400 line-through">{template.team1_source}</span>
                                <span className="text-primary font-semibold">→ {currentTeam1Source}</span>
                              </>
                            )}
                            {(!isOverridden || currentTeam1Source === template.team1_source) && (
                              <span className="font-medium">{currentTeam1Source || '未設定'}</span>
                            )}
                          </div>
                          <p className="text-xs text-gray-400 mt-1">表示名: {template.team1_display_name}</p>
                        </div>

                        <div>
                          <p className="text-gray-500 mb-1">チーム2 進出元</p>
                          <div className="flex items-center gap-2">
                            {isOverridden && currentTeam2Source !== template.team2_source && (
                              <>
                                <span className="text-gray-400 line-through">{template.team2_source}</span>
                                <span className="text-primary font-semibold">→ {currentTeam2Source}</span>
                              </>
                            )}
                            {(!isOverridden || currentTeam2Source === template.team2_source) && (
                              <span className="font-medium">{currentTeam2Source || '未設定'}</span>
                            )}
                          </div>
                          <p className="text-xs text-gray-400 mt-1">表示名: {template.team2_display_name}</p>
                        </div>
                      </div>

                      {override?.override_reason && (
                        <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-sm">
                          <div className="flex items-start gap-2">
                            <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5" />
                            <div>
                              <p className="font-semibold text-yellow-800">変更理由</p>
                              <p className="text-yellow-700">{override.override_reason}</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditMatch(template.match_code, template.phase, template.team1_source, template.team2_source)}
                    >
                      <Pencil className="h-4 w-4 mr-2" />
                      編集
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {selectedMatch && (
        <MatchOverrideDialog
          open={!!selectedMatch}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedMatch(null);
            }
          }}
          tournamentId={tournamentId}
          matchCode={selectedMatch.matchCode}
          availableSources={getAvailableSourcesForMatch(selectedMatch.phase)}
          currentTeam1Source={selectedMatch.team1Source}
          currentTeam2Source={selectedMatch.team2Source}
          originalTeam1Source={selectedMatch.originalTeam1Source}
          originalTeam2Source={selectedMatch.originalTeam2Source}
          onSave={loadData}
        />
      )}

        <BulkMatchOverrideDialog
          open={isBulkDialogOpen}
          onOpenChange={setIsBulkDialogOpen}
          tournamentId={tournamentId}
          leagueSources={sourceCandidates.leagueSources}
          tournamentSources={sourceCandidates.tournamentSources}
          onSave={loadData}
        />
      </div>
    </div>
  );
}
