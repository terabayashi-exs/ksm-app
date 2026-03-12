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
  leagueSources: string[];
  tournamentSources: string[];
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
  leagueSources,
  tournamentSources,
  onSave,
}: BulkMatchOverrideDialogProps) {
  const [fromSource, setFromSource] = useState<string>('');
  const [toSource, setToSource] = useState<string>('');
  const [reason, setReason] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [affectedMatches, setAffectedMatches] = useState<AffectedMatch[]>([]);
  const [isSelectOpen, setIsSelectOpen] = useState(false);

  // sourceがリーグ形式（ブロック順位: A_1等）かを判定
  const isLeagueSource = (source: string): boolean => {
    return /^[A-Z]_\d+$/.test(source);
  };

  // 選択中のfromSourceと同じ種別のソースリストを返す
  const getFilteredToSources = (): string[] => {
    if (!fromSource) return [...leagueSources, ...tournamentSources];
    if (isLeagueSource(fromSource)) return leagueSources;
    return tournamentSources;
  };

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
          override_reason: reason || `${fromSource}を${toSource}に一括変更`,
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
              onValueChange={(value) => {
                setFromSource(value);
                setToSource('');
              }}
              onOpenChange={setIsSelectOpen}
            >
              <SelectTrigger id="from-source">
                <SelectValue placeholder="変更元を選択" />
              </SelectTrigger>
              <SelectContent className="max-h-60" position="popper" sideOffset={5}>
                {leagueSources.length > 0 && tournamentSources.length > 0 && (
                  <SelectItem value="__league_header__" disabled className="text-xs text-gray-400 font-semibold">
                    ── ブロック順位 ──
                  </SelectItem>
                )}
                {leagueSources.map(source => (
                  <SelectItem key={source} value={source}>
                    {source}
                  </SelectItem>
                ))}
                {leagueSources.length > 0 && tournamentSources.length > 0 && (
                  <SelectItem value="__tournament_header__" disabled className="text-xs text-gray-400 font-semibold">
                    ── 試合結果 ──
                  </SelectItem>
                )}
                {tournamentSources.map(source => (
                  <SelectItem key={source} value={source}>
                    {source}
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
                {getFilteredToSources().map(source => (
                  <SelectItem key={source} value={source}>
                    {source}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 変更内容プレビュー */}
          {fromSource && toSource && (
            <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded">
              <span className="font-semibold text-blue-800">{fromSource}</span>
              <ArrowRight className="h-5 w-5 text-blue-600" />
              <span className="font-semibold text-blue-800">{toSource}</span>
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
                      {match.team1_source} vs {match.team2_source}
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
