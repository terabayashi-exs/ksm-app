// app/admin/tournaments/[id]/match-overrides/page.tsx
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Pencil, AlertCircle, List, RefreshCw } from 'lucide-react';
import { MatchOverrideDialog } from '@/components/features/admin/MatchOverrideDialog';
import { BulkMatchOverrideDialog } from '@/components/features/admin/BulkMatchOverrideDialog';
import { formatTeamSourceDisplay } from '@/lib/team-source-display';

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
  name: string;
  order: number;
  format_type: 'league' | 'tournament';
}

interface MatchDataForSources {
  match_code?: string;
  phase?: string;
  team1_source?: string;
  team2_source?: string;
}

interface TournamentTeam {
  tournament_team_id: number;
  team_name: string;
  team_omission: string;
}

function buildSourceCandidates(
  allMatches: MatchDataForSources[],
  blockTeamCounts: { block_name: string; expected_team_count: number }[]
) {
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

  blockTeamCounts.forEach(block => {
    for (let i = 1; i <= block.expected_team_count; i++) {
      leagueSet.add(`${block.block_name}_${i}`);
    }
  });

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
    tournamentSources: sortSources(Array.from(tournamentSet)),
    leagueSources: sortSources(Array.from(leagueSet)),
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
  const [activePhase, setActivePhase] = useState<string>('');
  const [selectedMatch, setSelectedMatch] = useState<{
    matchCode: string;
    phase: string;
    team1Source: string | null;
    team2Source: string | null;
    originalTeam1Source: string | null;
    originalTeam2Source: string | null;
  } | null>(null);
  const [isBulkDialogOpen, setIsBulkDialogOpen] = useState(false);
  const [isPromoting, setIsPromoting] = useState(false);
  const [tournamentTeams, setTournamentTeams] = useState<TournamentTeam[]>([]);

  const sourceCandidates = useMemo(
    () => buildSourceCandidates(allMatches, blockTeamCounts),
    [allMatches, blockTeamCounts]
  );

  // テンプレートからフェーズ一覧を抽出
  const phasesWithTemplates = useMemo(() => {
    const phaseIds = new Set(templates.map(t => t.phase));
    return phases
      .filter(p => phaseIds.has(p.id))
      .sort((a, b) => a.order - b.order);
  }, [templates, phases]);

  useEffect(() => {
    loadData();
  }, [tournamentId]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [tournamentResponse, matchesResponse, blockCountsResponse, overridesResponse, teamsResponse] = await Promise.all([
        fetch(`/api/tournaments/${tournamentId}`),
        fetch(`/api/tournaments/${tournamentId}/matches`),
        fetch(`/api/tournaments/${tournamentId}/block-team-counts`),
        fetch(`/api/tournaments/${tournamentId}/match-overrides`),
        fetch(`/api/admin/tournaments/${tournamentId}/teams`),
      ]);

      const [tournamentData, matchesData, blockCountsData, overridesData, teamsData] = await Promise.all([
        tournamentResponse.json(),
        matchesResponse.json(),
        blockCountsResponse.json(),
        overridesResponse.json(),
        teamsResponse.json(),
      ]);

      if (tournamentData.success && tournamentData.data?.phases?.phases) {
        setPhases(tournamentData.data.phases.phases);
      }

      if (blockCountsData.success && blockCountsData.data?.block_team_counts) {
        setBlockTeamCounts(blockCountsData.data.block_team_counts);
      }

      if (matchesData.success && Array.isArray(matchesData.data)) {
        setAllMatches(matchesData.data);
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
        setTemplates([]);
        setAllMatches([]);
      }

      if (overridesData.success) {
        setOverrides(overridesData.data);
      }

      if (teamsData.success && teamsData.data?.teams) {
        setTournamentTeams(teamsData.data.teams.map((t: TournamentTeam) => ({
          tournament_team_id: t.tournament_team_id,
          team_name: t.team_name,
          team_omission: t.team_omission || '',
        })));
      }
    } catch (error) {
      console.error('データ取得エラー:', error);
      alert('データの取得に失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  // 初回のアクティブフェーズ設定
  useEffect(() => {
    if (phasesWithTemplates.length > 0 && !activePhase) {
      setActivePhase(phasesWithTemplates[0].id);
    }
  }, [phasesWithTemplates, activePhase]);

  const handleEditMatch = (matchCode: string, phase: string, originalTeam1Source: string | null, originalTeam2Source: string | null) => {
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

  const filteredTemplates = templates.filter(t => t.phase === activePhase);

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
              各試合の進出元チームを個別に設定・変更できます。
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
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setIsBulkDialogOpen(true)}>
              <List className="h-4 w-4 mr-2" />
              一括変更
            </Button>
            <Button
              size="sm"
              disabled={isPromoting}
              onClick={async () => {
                if (!confirm('チーム進出処理を実行しますか？\n現在の順位表に基づいて、決勝トーナメント等の試合にチームを割り当てます。')) return;
                setIsPromoting(true);
                try {
                  const res = await fetch(`/api/tournaments/${tournamentId}/update-rankings`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'promote_only' })
                  });
                  const data = await res.json();
                  if (data.success) {
                    alert('チーム進出処理が完了しました。');
                  } else {
                    alert(`エラー: ${data.error || '進出処理に失敗しました'}`);
                  }
                } catch {
                  alert('進出処理中にエラーが発生しました。');
                } finally {
                  setIsPromoting(false);
                }
              }}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isPromoting ? 'animate-spin' : ''}`} />
              {isPromoting ? '処理中...' : 'チーム進出処理'}
            </Button>
          </div>
        </div>

        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">使い方</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc list-inside space-y-1 text-sm text-gray-700">
              <li>各試合の「編集」ボタンで進出条件を変更できます</li>
              <li>変更後は「チーム進出処理」を実行してください</li>
            </ul>
          </CardContent>
        </Card>

        {/* フェーズタブ */}
        {phasesWithTemplates.length > 1 && (
          <nav className={`grid gap-1 mb-6 grid-cols-${Math.min(phasesWithTemplates.length, 4)}`}>
            {phasesWithTemplates.map(phase => (
              <button
                key={phase.id}
                onClick={() => setActivePhase(phase.id)}
                className={`py-2.5 px-3 text-sm font-medium rounded-md transition-colors whitespace-nowrap
                  ${activePhase === phase.id
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-gray-50 text-gray-500 hover:bg-gray-100 hover:text-gray-900'
                  }`}
              >
                {phase.name}
                <span className="ml-1 text-xs opacity-70">
                  ({templates.filter(t => t.phase === phase.id).length})
                </span>
              </button>
            ))}
          </nav>
        )}

        {filteredTemplates.length === 0 ? (
          <Card>
            <CardContent className="py-8">
              <p className="text-center text-gray-500">選出条件が設定された試合がありません</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredTemplates.map(template => {
              const currentTeam1Source = getCurrentSource(template.match_code, 'team1', template.team1_source);
              const currentTeam2Source = getCurrentSource(template.match_code, 'team2', template.team2_source);
              const isOverridden = hasOverride(template.match_code);
              const override = overrides.find(o => o.match_code === template.match_code);

              return (
                <Card key={template.match_code} className={isOverridden ? 'border-primary/30 bg-primary/5' : ''}>
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="text-base font-semibold">{template.match_code}</h3>
                          <Badge variant="outline" className="text-xs">{template.round_name}</Badge>
                          {isOverridden && <Badge className="bg-primary text-xs">変更済み</Badge>}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                          <div>
                            <p className="text-xs text-gray-500 mb-0.5">チーム1</p>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {isOverridden && currentTeam1Source !== template.team1_source && currentTeam1Source ? (
                                <>
                                  <span className="text-gray-400 line-through text-xs">{template.team1_source ? formatTeamSourceDisplay(template.team1_source) : '未設定'}</span>
                                  <ArrowRight className="h-3 w-3 text-primary" />
                                  <span className="text-primary font-medium">{formatTeamSourceDisplay(currentTeam1Source)}</span>
                                </>
                              ) : (
                                <span className="font-medium">{currentTeam1Source ? formatTeamSourceDisplay(currentTeam1Source) : '未設定'}</span>
                              )}
                            </div>
                            {template.team1_display_name && (
                              <p className="text-xs text-gray-400 mt-0.5">現在: {template.team1_display_name}</p>
                            )}
                          </div>

                          <div>
                            <p className="text-xs text-gray-500 mb-0.5">チーム2</p>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {isOverridden && currentTeam2Source !== template.team2_source && currentTeam2Source ? (
                                <>
                                  <span className="text-gray-400 line-through text-xs">{template.team2_source ? formatTeamSourceDisplay(template.team2_source) : '未設定'}</span>
                                  <ArrowRight className="h-3 w-3 text-primary" />
                                  <span className="text-primary font-medium">{formatTeamSourceDisplay(currentTeam2Source)}</span>
                                </>
                              ) : (
                                <span className="font-medium">{currentTeam2Source ? formatTeamSourceDisplay(currentTeam2Source) : '未設定'}</span>
                              )}
                            </div>
                            {template.team2_display_name && (
                              <p className="text-xs text-gray-400 mt-0.5">現在: {template.team2_display_name}</p>
                            )}
                          </div>
                        </div>

                        {override?.override_reason && (
                          <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs">
                            <div className="flex items-start gap-1.5">
                              <AlertCircle className="h-3.5 w-3.5 text-yellow-600 mt-0.5 flex-shrink-0" />
                              <span className="text-yellow-700">{override.override_reason}</span>
                            </div>
                          </div>
                        )}
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditMatch(template.match_code, template.phase, template.team1_source, template.team2_source)}
                      >
                        <Pencil className="h-4 w-4 mr-1" />
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
            onOpenChange={(open) => { if (!open) setSelectedMatch(null); }}
            tournamentId={tournamentId}
            matchCode={selectedMatch.matchCode}
            leagueSources={sourceCandidates.leagueSources}
            tournamentSources={sourceCandidates.tournamentSources}
            blockTeamCounts={blockTeamCounts}
            tournamentTeams={tournamentTeams}
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
          blockTeamCounts={blockTeamCounts}
          tournamentTeams={tournamentTeams}
          onSave={loadData}
        />
      </div>
    </div>
  );
}
