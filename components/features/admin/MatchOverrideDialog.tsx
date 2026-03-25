'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AlertCircle, ArrowRight } from 'lucide-react';
import { formatTeamSourceDisplay } from '@/lib/team-source-display';

interface TournamentTeam {
  tournament_team_id: number;
  team_name: string;
  team_omission: string;
}

type SourceCategory = 'original' | 'block' | 'best' | 'match_result' | 'team_direct';

interface MatchOverrideDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tournamentId: number;
  matchCode: string;
  leagueSources: string[];
  tournamentSources: string[];
  blockTeamCounts: { block_name: string; expected_team_count: number }[];
  tournamentTeams?: TournamentTeam[];
  currentTeam1Source: string | null;
  currentTeam2Source: string | null;
  originalTeam1Source: string | null;
  originalTeam2Source: string | null;
  onSave: () => void;
}

function detectCategory(source: string | null): SourceCategory {
  if (!source) return 'original';
  if (source.match(/^TEAM:\d+$/)) return 'team_direct';
  if (source.match(/^BEST_\d+_\d+$/)) return 'best';
  if (source.match(/^[A-Z]_\d+$/)) return 'block';
  if (source.match(/_(winner|loser)$/)) return 'match_result';
  return 'original';
}

function buildBestSources(blockTeamCounts: { block_name: string; expected_team_count: number }[]): string[] {
  if (blockTeamCounts.length === 0) return [];
  const maxTeams = Math.max(...blockTeamCounts.map(b => b.expected_team_count));
  const blockCount = blockTeamCounts.length;
  const sources: string[] = [];
  // M位中N位: 各順位について、ブロック数分のBESTパターンを生成
  for (let pos = 1; pos <= maxTeams; pos++) {
    for (let rank = 1; rank <= blockCount; rank++) {
      sources.push(`BEST_${pos}_${rank}`);
    }
  }
  return sources;
}

// ソース選択UI（カテゴリ→具体値の2段階）
function SourceSelector({
  label,
  originalSource,
  value,
  onChange,
  leagueSources,
  tournamentSources,
  bestSources,
  tournamentTeams,
}: {
  label: string;
  originalSource: string | null;
  value: string;
  onChange: (val: string) => void;
  leagueSources: string[];
  tournamentSources: string[];
  bestSources: string[];
  tournamentTeams: TournamentTeam[];
}) {
  const [category, setCategory] = useState<SourceCategory>('original');
  const [isSelectOpen, setIsSelectOpen] = useState(false);

  // 値が変わったらカテゴリを自動検出
  useEffect(() => {
    setCategory(detectCategory(value || originalSource));
  }, [value, originalSource]);

  const handleCategoryChange = (cat: SourceCategory) => {
    setCategory(cat);
    if (cat === 'original') {
      onChange('');
    }
  };

  // 元のソースのパターンから、適切なカテゴリ選択肢を決定
  // A_1, BEST_3_1 → リーグ戦からの進出（ブロック順位ベース）
  // T1_winner, T1_loser → トーナメント戦からの進出（試合結果ベース）
  const originalCategory = detectCategory(originalSource);
  const isFromLeague = originalCategory === 'block' || originalCategory === 'best';
  const isFromTournament = originalCategory === 'match_result';

  const categories: { value: SourceCategory; label: string }[] = [
    { value: 'original', label: '元の設定を使用' },
  ];
  if (isFromLeague || (!isFromLeague && !isFromTournament)) {
    categories.push({ value: 'block', label: '単一ブロックから選択' });
    categories.push({ value: 'best', label: '複数ブロックのM位中N位' });
  }
  if (isFromTournament || (!isFromLeague && !isFromTournament)) {
    categories.push({ value: 'match_result', label: '試合の勝者/敗者' });
  }
  categories.push({ value: 'team_direct', label: 'チーム直接指定' });

  return (
    <div className="space-y-2 p-3 bg-gray-50 rounded-lg">
      <Label className="font-semibold">{label}</Label>
      <p className="text-xs text-gray-500">
        現在の設定: <span className="font-medium text-gray-700">{originalSource ? formatTeamSourceDisplay(originalSource) : '未設定'}</span>
      </p>

      {/* カテゴリ選択 */}
      <Select value={category} onValueChange={(v) => handleCategoryChange(v as SourceCategory)}>
        <SelectTrigger className="bg-white">
          <SelectValue placeholder="変更方法を選択" />
        </SelectTrigger>
        <SelectContent position="popper" sideOffset={5}>
          {categories.map(c => (
            <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* カテゴリに応じた具体値選択 */}
      {category === 'block' && (
        <Select
          value={value && value.match(/^[A-Z]_\d+$/) ? value : ''}
          onValueChange={onChange}
          onOpenChange={setIsSelectOpen}
        >
          <SelectTrigger className="bg-white">
            <SelectValue placeholder="ブロック・順位を選択" />
          </SelectTrigger>
          <SelectContent className="max-h-60" position="popper" sideOffset={5}>
            {leagueSources.filter(s => s.match(/^[A-Z]_\d+$/)).map(source => (
              <SelectItem key={source} value={source}>
                {formatTeamSourceDisplay(source)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {category === 'best' && (
        <Select
          value={value && value.match(/^BEST_\d+_\d+$/) ? value : ''}
          onValueChange={onChange}
          onOpenChange={setIsSelectOpen}
        >
          <SelectTrigger className="bg-white">
            <SelectValue placeholder="M位中N位を選択" />
          </SelectTrigger>
          <SelectContent className="max-h-60" position="popper" sideOffset={5}>
            {bestSources.map(source => (
              <SelectItem key={source} value={source}>
                {formatTeamSourceDisplay(source)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {category === 'match_result' && (
        <Select
          value={value && value.match(/_(winner|loser)$/) ? value : ''}
          onValueChange={onChange}
          onOpenChange={setIsSelectOpen}
        >
          <SelectTrigger className="bg-white">
            <SelectValue placeholder="試合の勝者/敗者を選択" />
          </SelectTrigger>
          <SelectContent className="max-h-60" position="popper" sideOffset={5}>
            {tournamentSources.map(source => (
              <SelectItem key={source} value={source}>
                {formatTeamSourceDisplay(source)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {category === 'team_direct' && (
        <Select
          value={value && value.match(/^TEAM:\d+$/) ? value : ''}
          onValueChange={onChange}
          onOpenChange={setIsSelectOpen}
        >
          <SelectTrigger className="bg-white">
            <SelectValue placeholder="チームを選択" />
          </SelectTrigger>
          <SelectContent className="max-h-60" position="popper" sideOffset={5}>
            {tournamentTeams.map(team => (
              <SelectItem key={`TEAM:${team.tournament_team_id}`} value={`TEAM:${team.tournament_team_id}`}>
                {team.team_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* 変更プレビュー */}
      {value && value !== (originalSource || '') && (
        <div className="flex items-center gap-2 text-sm pt-1">
          <span className="text-gray-500">{originalSource ? formatTeamSourceDisplay(originalSource) : '未設定'}</span>
          <ArrowRight className="h-4 w-4 text-primary" />
          <span className="font-semibold text-primary">{formatTeamSourceDisplay(value)}</span>
        </div>
      )}

      {/* isSelectOpen を使って Radix UI の競合を防止 */}
      {isSelectOpen && <span className="hidden" />}
    </div>
  );
}

export function MatchOverrideDialog({
  open,
  onOpenChange,
  tournamentId,
  matchCode,
  leagueSources,
  tournamentSources,
  blockTeamCounts,
  tournamentTeams = [],
  currentTeam1Source,
  currentTeam2Source,
  originalTeam1Source,
  originalTeam2Source,
  onSave,
}: MatchOverrideDialogProps) {
  const [team1Override, setTeam1Override] = useState<string>('');
  const [team2Override, setTeam2Override] = useState<string>('');
  const [reason, setReason] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const bestSources = buildBestSources(blockTeamCounts);

  useEffect(() => {
    if (open) {
      setTeam1Override(currentTeam1Source || originalTeam1Source || '');
      setTeam2Override(currentTeam2Source || originalTeam2Source || '');
      setReason('');
    }
  }, [open, currentTeam1Source, currentTeam2Source, originalTeam1Source, originalTeam2Source]);

  const handleSave = async () => {
    setIsLoading(true);
    try {
      const hasTeam1Change = team1Override !== (originalTeam1Source || '');
      const hasTeam2Change = team2Override !== (originalTeam2Source || '');

      if (!hasTeam1Change && !hasTeam2Change) {
        alert('変更がありません');
        setIsLoading(false);
        return;
      }

      const checkResponse = await fetch(`/api/tournaments/${tournamentId}/match-overrides`);
      const checkData = await checkResponse.json();
      const existingOverride = checkData.data?.find(
        (o: { match_code: string }) => o.match_code === matchCode
      );

      const payload = {
        match_code: matchCode,
        team1_source_override: hasTeam1Change ? team1Override : null,
        team2_source_override: hasTeam2Change ? team2Override : null,
        override_reason: reason || `試合${matchCode}の進出条件を変更`,
      };

      let response;
      if (existingOverride) {
        response = await fetch(
          `/api/tournaments/${tournamentId}/match-overrides/${existingOverride.override_id}`,
          { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
        );
      } else {
        response = await fetch(`/api/tournaments/${tournamentId}/match-overrides`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        });
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '保存に失敗しました');
      }

      alert('保存しました');
      onSave();
      onOpenChange(false);
    } catch (error) {
      console.error('保存エラー:', error);
      alert(error instanceof Error ? error.message : 'エラーが発生しました');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('設定を削除して元に戻しますか？')) return;
    setIsLoading(true);
    try {
      const checkResponse = await fetch(`/api/tournaments/${tournamentId}/match-overrides`);
      const checkData = await checkResponse.json();
      const existingOverride = checkData.data?.find(
        (o: { match_code: string }) => o.match_code === matchCode
      );
      if (!existingOverride) {
        alert('削除する設定がありません');
        setIsLoading(false);
        return;
      }
      const response = await fetch(
        `/api/tournaments/${tournamentId}/match-overrides/${existingOverride.override_id}`,
        { method: 'DELETE' }
      );
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '削除に失敗しました');
      }
      alert('設定を削除しました');
      onSave();
      onOpenChange(false);
    } catch (error) {
      console.error('削除エラー:', error);
      alert(error instanceof Error ? error.message : 'エラーが発生しました');
    } finally {
      setIsLoading(false);
    }
  };

  const hasOverride = currentTeam1Source !== originalTeam1Source || currentTeam2Source !== originalTeam2Source;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>試合進出条件の設定 - {matchCode}</DialogTitle>
          <DialogDescription>
            この試合に出場するチームの進出元を変更できます。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <SourceSelector
            label="チーム1 進出元"
            originalSource={originalTeam1Source}
            value={team1Override}
            onChange={setTeam1Override}

            leagueSources={leagueSources}
            tournamentSources={tournamentSources}
            bestSources={bestSources}
            tournamentTeams={tournamentTeams}
          />

          <SourceSelector
            label="チーム2 進出元"
            originalSource={originalTeam2Source}
            value={team2Override}
            onChange={setTeam2Override}

            leagueSources={leagueSources}
            tournamentSources={tournamentSources}
            bestSources={bestSources}
            tournamentTeams={tournamentTeams}
          />

          <div className="space-y-2">
            <Label>変更理由</Label>
            <Textarea
              placeholder="例: チーム辞退により進出条件を変更"
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={2}
            />
          </div>

          {team1Override === team2Override && team1Override && (
            <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded">
              <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
              <p className="text-sm text-yellow-800 font-medium">同じチーム同士の対戦になります</p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          {hasOverride && (
            <Button type="button" variant="outline" onClick={handleDelete} disabled={isLoading} className="mr-auto text-red-600 hover:text-red-700">
              設定を削除
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>キャンセル</Button>
          <Button type="button" onClick={handleSave} disabled={isLoading}>
            {isLoading ? '保存中...' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
