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

interface BulkMatchOverrideDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tournamentId: number;
  onSave: () => void;
}

interface AffectedMatch {
  match_code: string;
  round_name: string;
  team1_source: string | null;
  team2_source: string | null;
  team1_display_name: string;
  team2_display_name: string;
}

export function BulkMatchOverrideDialog({
  open,
  onOpenChange,
  tournamentId,
  onSave,
}: BulkMatchOverrideDialogProps) {
  const [fromSource, setFromSource] = useState<string>('');
  const [toSource, setToSource] = useState<string>('');
  const [reason, setReason] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [availableSources, setAvailableSources] = useState<string[]>([]);
  const [affectedMatches, setAffectedMatches] = useState<AffectedMatch[]>([]);
  const [isSelectOpen, setIsSelectOpen] = useState(false);

  // システム値から表示名に変換する関数
  const formatSourceDisplay = (source: string): string => {
    // ブロック順位パターン（A_1 → Aブロック1位）
    const blockPositionMatch = source.match(/^([A-L])_(\d+)$/);
    if (blockPositionMatch) {
      const block = blockPositionMatch[1];
      const position = blockPositionMatch[2];
      return `${block}ブロック${position}位`;
    }

    // 試合結果パターン（M10_winner → M10試合の勝者）
    const matchResultMatch = source.match(/^([MT])(\d+)_(winner|loser)$/);
    if (matchResultMatch) {
      const matchType = matchResultMatch[1];
      const matchNum = matchResultMatch[2];
      const result = matchResultMatch[3] === 'winner' ? '勝者' : '敗者';
      return `${matchType}${matchNum}試合の${result}`;
    }

    return source;
  };

  // 進出元候補を大会テンプレートと実際の参加チーム数から動的に生成
  useEffect(() => {
    const fetchAvailableSources = async () => {
      try {
        const tournamentResponse = await fetch(`/api/tournaments/${tournamentId}`);
        const tournamentData = await tournamentResponse.json();

        if (!tournamentData.success) {
          console.error('大会情報の取得に失敗しました');
          return;
        }

        const formatId = tournamentData.data.format_id;
        const templatesResponse = await fetch(`/api/tournaments/formats/${formatId}/templates`);
        const templatesData = await templatesResponse.json();

        if (!templatesData.success || !templatesData.data?.templates) {
          console.error('テンプレート情報の取得に失敗しました');
          return;
        }

        const matchesResponse = await fetch(`/api/tournaments/${tournamentId}/matches`);
        const matchesData = await matchesResponse.json();

        const templates = templatesData.data.templates;
        const sourcesSet = new Set<string>();

        interface TemplateData {
          phase?: string;
          block_name?: string;
          match_code?: string;
          team1_source?: string;
          team2_source?: string;
        }

        templates.forEach((template: TemplateData) => {
          if (template.match_code) {
            const code = template.match_code;
            if (code.match(/^[MT]\d+$/)) {
              sourcesSet.add(`${code}_winner`);
              sourcesSet.add(`${code}_loser`);
            }
          }

          if (template.team1_source) {
            sourcesSet.add(template.team1_source);
          }
          if (template.team2_source) {
            sourcesSet.add(template.team2_source);
          }
        });

        const blockTeamCounts = new Map<string, number>();

        interface MatchData {
          phase?: string;
          block_name?: string;
          team1_id?: string;
          team2_id?: string;
        }

        if (matchesData.success && matchesData.data) {
          const preliminaryMatches = matchesData.data.filter(
            (match: MatchData) => match.phase === 'preliminary'
          );

          preliminaryMatches.forEach((match: MatchData) => {
            if (match.block_name) {
              const blockName = match.block_name;
              const teams = new Set<string>();

              preliminaryMatches
                .filter((m: MatchData) => m.block_name === blockName)
                .forEach((m: MatchData) => {
                  if (m.team1_id) teams.add(m.team1_id);
                  if (m.team2_id) teams.add(m.team2_id);
                });

              blockTeamCounts.set(blockName, teams.size);
            }
          });
        }

        blockTeamCounts.forEach((teamCount, blockName) => {
          for (let i = 1; i <= teamCount; i++) {
            sourcesSet.add(`${blockName}_${i}`);
          }
        });

        const sortedSources = Array.from(sourcesSet).sort((a, b) => {
          const blockA = a.match(/^([A-L])_(\d+)$/);
          const blockB = b.match(/^([A-L])_(\d+)$/);
          if (blockA && blockB) {
            if (blockA[1] !== blockB[1]) return blockA[1].localeCompare(blockB[1]);
            return parseInt(blockA[2]) - parseInt(blockB[2]);
          }
          if (blockA) return -1;
          if (blockB) return 1;

          return a.localeCompare(b);
        });

        setAvailableSources(sortedSources);
      } catch (error) {
        console.error('進出元候補の取得エラー:', error);
      }
    };

    if (open && tournamentId) {
      fetchAvailableSources();
    }
  }, [open, tournamentId]);

  // 影響を受ける試合を検索
  useEffect(() => {
    const fetchAffectedMatches = async () => {
      if (!fromSource || !open) {
        setAffectedMatches([]);
        return;
      }

      try {
        const response = await fetch(`/api/tournaments/${tournamentId}/match-overrides/affected?source=${fromSource}`);
        const data = await response.json();

        if (data.success) {
          setAffectedMatches(data.data);
        }
      } catch (error) {
        console.error('影響を受ける試合の取得エラー:', error);
      }
    };

    fetchAffectedMatches();
  }, [fromSource, open, tournamentId]);

  // ダイアログが開かれたときに初期化
  useEffect(() => {
    if (open) {
      setFromSource('');
      setToSource('');
      setReason('');
      setAffectedMatches([]);
    }
  }, [open]);

  const handleBulkUpdate = async () => {
    if (!fromSource || !toSource) {
      alert('変更元と変更先を選択してください');
      return;
    }

    if (affectedMatches.length === 0) {
      alert('影響を受ける試合がありません');
      return;
    }

    if (!confirm(`${affectedMatches.length}件の試合の進出条件を一括変更しますか？`)) {
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/match-overrides/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_source: fromSource,
          to_source: toSource,
          override_reason: reason || `${formatSourceDisplay(fromSource)}を${formatSourceDisplay(toSource)}に一括変更`,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '一括変更に失敗しました');
      }

      alert(`${affectedMatches.length}件の試合の進出条件を変更しました`);
      onSave();
      onOpenChange(false);
    } catch (error) {
      console.error('一括変更エラー:', error);
      alert(error instanceof Error ? error.message : 'エラーが発生しました');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-3xl"
        onInteractOutside={(e) => {
          if (isSelectOpen) {
            e.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>進出条件の一括変更</DialogTitle>
          <DialogDescription>
            特定の進出条件を別の条件に一括で変更できます。影響を受ける試合を確認してから実行してください。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* 変更元 */}
          <div className="space-y-2">
            <Label htmlFor="from-source">変更元の進出条件</Label>
            <Select
              value={fromSource}
              onValueChange={setFromSource}
              onOpenChange={setIsSelectOpen}
            >
              <SelectTrigger id="from-source">
                <SelectValue placeholder="変更元を選択" />
              </SelectTrigger>
              <SelectContent className="max-h-60" position="popper" sideOffset={5}>
                {availableSources.map(source => (
                  <SelectItem key={source} value={source}>
                    {formatSourceDisplay(source)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 変更先 */}
          <div className="space-y-2">
            <Label htmlFor="to-source">変更先の進出条件</Label>
            <Select
              value={toSource}
              onValueChange={setToSource}
              onOpenChange={setIsSelectOpen}
            >
              <SelectTrigger id="to-source">
                <SelectValue placeholder="変更先を選択" />
              </SelectTrigger>
              <SelectContent className="max-h-60" position="popper" sideOffset={5}>
                {availableSources.map(source => (
                  <SelectItem key={source} value={source}>
                    {formatSourceDisplay(source)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 変更内容プレビュー */}
          {fromSource && toSource && (
            <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded">
              <span className="font-semibold text-blue-800">{formatSourceDisplay(fromSource)}</span>
              <ArrowRight className="h-5 w-5 text-blue-600" />
              <span className="font-semibold text-blue-800">{formatSourceDisplay(toSource)}</span>
            </div>
          )}

          {/* 影響を受ける試合 */}
          {affectedMatches.length > 0 && (
            <div className="space-y-2">
              <Label>影響を受ける試合（{affectedMatches.length}件）</Label>
              <div className="max-h-60 overflow-y-auto border rounded p-3 space-y-2">
                {affectedMatches.map(match => (
                  <div key={match.match_code} className="text-sm p-2 bg-gray-50 rounded">
                    <div className="font-semibold">{match.match_code} - {match.round_name}</div>
                    <div className="text-gray-600 text-xs mt-1">
                      {match.team1_source && formatSourceDisplay(match.team1_source)} vs {match.team2_source && formatSourceDisplay(match.team2_source)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {fromSource && affectedMatches.length === 0 && (
            <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded">
              <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
              <div className="text-sm text-yellow-800">
                <p className="font-semibold">該当する試合がありません</p>
                <p className="text-xs mt-1">選択した進出条件を使用している試合が見つかりませんでした。</p>
              </div>
            </div>
          )}

          {/* 変更理由 */}
          <div className="space-y-2">
            <Label htmlFor="bulk-reason">変更理由（任意）</Label>
            <Textarea
              id="bulk-reason"
              placeholder="例: Aブロック2チーム辞退により進出チーム不足"
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            キャンセル
          </Button>
          <Button
            type="button"
            onClick={handleBulkUpdate}
            disabled={isLoading || !fromSource || !toSource || affectedMatches.length === 0}
          >
            {isLoading ? '変更中...' : `${affectedMatches.length}件を一括変更`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
