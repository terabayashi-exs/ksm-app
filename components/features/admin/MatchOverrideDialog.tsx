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

interface MatchOverrideDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tournamentId: number;
  matchCode: string;
  currentTeam1Source: string | null;
  currentTeam2Source: string | null;
  originalTeam1Source: string | null;
  originalTeam2Source: string | null;
  onSave: () => void;
}

export function MatchOverrideDialog({
  open,
  onOpenChange,
  tournamentId,
  matchCode,
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
  const [availableSources, setAvailableSources] = useState<string[]>([]);
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

    return source; // 変換できない場合はそのまま返す
  };

  // 進出元候補を大会テンプレートと実際の参加チーム数から動的に生成
  useEffect(() => {
    const fetchAvailableSources = async () => {
      try {
        // 大会情報とテンプレートを取得
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

        // 実際の大会参加チーム情報を取得してブロック別のチーム数を計算
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

        // テンプレートから実際に存在する進出元を抽出
        templates.forEach((template: TemplateData) => {
          // 試合コードから進出元パターンを抽出（M1_winner, T5_winner等）
          if (template.match_code) {
            const code = template.match_code;
            // M試合やT試合の場合、winner/loserパターンを追加
            if (code.match(/^[MT]\d+$/)) {
              sourcesSet.add(`${code}_winner`);
              sourcesSet.add(`${code}_loser`);
            }
          }

          // team1_source, team2_sourceから実際に使用されている進出元を抽出
          if (template.team1_source) {
            sourcesSet.add(template.team1_source);
          }
          if (template.team2_source) {
            sourcesSet.add(template.team2_source);
          }
        });

        // 実際の大会参加チームからブロック別チーム数を計算
        const blockTeamCounts = new Map<string, number>();

        interface MatchData {
          phase?: string;
          block_name?: string;
          team1_id?: string;
          team2_id?: string;
        }

        if (matchesData.success && matchesData.data) {
          // 予選ブロックの試合からチーム数を集計
          const preliminaryMatches = matchesData.data.filter(
            (match: MatchData) => match.phase === 'preliminary'
          );

          preliminaryMatches.forEach((match: MatchData) => {
            if (match.block_name) {
              const blockName = match.block_name;
              const teams = new Set<string>();

              // そのブロックの全試合からユニークなチームIDを収集
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

        // ブロック順位パターンを実際のチーム数に基づいて生成
        blockTeamCounts.forEach((teamCount, blockName) => {
          // 実際のチーム数分の順位を生成
          for (let i = 1; i <= teamCount; i++) {
            sourcesSet.add(`${blockName}_${i}`);
          }
        });

        const sortedSources = Array.from(sourcesSet).sort((a, b) => {
          // ブロック順位を優先
          const blockA = a.match(/^([A-L])_(\d+)$/);
          const blockB = b.match(/^([A-L])_(\d+)$/);
          if (blockA && blockB) {
            if (blockA[1] !== blockB[1]) return blockA[1].localeCompare(blockB[1]);
            return parseInt(blockA[2]) - parseInt(blockB[2]);
          }
          if (blockA) return -1;
          if (blockB) return 1;

          // 試合結果パターンをソート
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

  // ダイアログが開かれたときに現在の設定値をセット
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
      // オーバーライドが元の値と同じ場合はスキップ
      const hasTeam1Change = team1Override !== (originalTeam1Source || '');
      const hasTeam2Change = team2Override !== (originalTeam2Source || '');

      if (!hasTeam1Change && !hasTeam2Change) {
        alert('変更がありません');
        setIsLoading(false);
        return;
      }

      // オーバーライドが既に存在するかチェック
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
        // 既存のオーバーライドを更新
        response = await fetch(
          `/api/tournaments/${tournamentId}/match-overrides/${existingOverride.override_id}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          }
        );
      } else {
        // 新規オーバーライドを作成
        response = await fetch(`/api/tournaments/${tournamentId}/match-overrides`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'オーバーライドの保存に失敗しました');
      }

      alert('オーバーライドを保存しました');
      onSave();
      onOpenChange(false);
    } catch (error) {
      console.error('オーバーライド保存エラー:', error);
      alert(error instanceof Error ? error.message : 'エラーが発生しました');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('オーバーライドを削除して元の設定に戻しますか？')) {
      return;
    }

    setIsLoading(true);

    try {
      // オーバーライドを取得
      const checkResponse = await fetch(`/api/tournaments/${tournamentId}/match-overrides`);
      const checkData = await checkResponse.json();

      const existingOverride = checkData.data?.find(
        (o: { match_code: string }) => o.match_code === matchCode
      );

      if (!existingOverride) {
        alert('削除するオーバーライドがありません');
        setIsLoading(false);
        return;
      }

      // オーバーライドを削除
      const response = await fetch(
        `/api/tournaments/${tournamentId}/match-overrides/${existingOverride.override_id}`,
        {
          method: 'DELETE',
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'オーバーライドの削除に失敗しました');
      }

      alert('オーバーライドを削除しました');
      onSave();
      onOpenChange(false);
    } catch (error) {
      console.error('オーバーライド削除エラー:', error);
      alert(error instanceof Error ? error.message : 'エラーが発生しました');
    } finally {
      setIsLoading(false);
    }
  };

  const hasOverride = currentTeam1Source !== originalTeam1Source || currentTeam2Source !== originalTeam2Source;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl"
        onInteractOutside={(e) => {
          // Selectが開いている場合は外側クリックを無視
          if (isSelectOpen) {
            e.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>試合進出条件の設定 - {matchCode}</DialogTitle>
          <DialogDescription>
            この試合の進出元チームを変更できます。設定しない場合は元のテンプレート条件が使用されます。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Team1 設定 */}
          <div className="space-y-2">
            <Label htmlFor="team1-override">チーム1 進出元</Label>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <p className="text-sm text-gray-500 mb-1">元の設定: {originalTeam1Source ? formatSourceDisplay(originalTeam1Source) : '未設定'}</p>
                <Select
                  value={team1Override || '__ORIGINAL__'}
                  onValueChange={(value) => setTeam1Override(value === '__ORIGINAL__' ? '' : value)}
                  onOpenChange={setIsSelectOpen}
                >
                  <SelectTrigger id="team1-override">
                    <SelectValue placeholder="進出元を選択" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60" position="popper" sideOffset={5}>
                    <SelectItem value="__ORIGINAL__">（元の設定を使用）</SelectItem>
                    {availableSources.map(source => (
                      <SelectItem key={source} value={source}>
                        {formatSourceDisplay(source)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {team1Override !== (originalTeam1Source || '') && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-500">{originalTeam1Source ? formatSourceDisplay(originalTeam1Source) : '未設定'}</span>
                  <ArrowRight className="h-4 w-4 text-blue-500" />
                  <span className="font-semibold text-blue-600">{team1Override ? formatSourceDisplay(team1Override) : '元の設定'}</span>
                </div>
              )}
            </div>
          </div>

          {/* Team2 設定 */}
          <div className="space-y-2">
            <Label htmlFor="team2-override">チーム2 進出元</Label>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <p className="text-sm text-gray-500 mb-1">元の設定: {originalTeam2Source ? formatSourceDisplay(originalTeam2Source) : '未設定'}</p>
                <Select
                  value={team2Override || '__ORIGINAL__'}
                  onValueChange={(value) => setTeam2Override(value === '__ORIGINAL__' ? '' : value)}
                  onOpenChange={setIsSelectOpen}
                >
                  <SelectTrigger id="team2-override">
                    <SelectValue placeholder="進出元を選択" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60" position="popper" sideOffset={5}>
                    <SelectItem value="__ORIGINAL__">（元の設定を使用）</SelectItem>
                    {availableSources.map(source => (
                      <SelectItem key={source} value={source}>
                        {formatSourceDisplay(source)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {team2Override !== (originalTeam2Source || '') && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-500">{originalTeam2Source ? formatSourceDisplay(originalTeam2Source) : '未設定'}</span>
                  <ArrowRight className="h-4 w-4 text-blue-500" />
                  <span className="font-semibold text-blue-600">{team2Override ? formatSourceDisplay(team2Override) : '元の設定'}</span>
                </div>
              )}
            </div>
          </div>

          {/* 変更理由 */}
          <div className="space-y-2">
            <Label htmlFor="reason">変更理由</Label>
            <Textarea
              id="reason"
              placeholder="例: Aブロック2チーム辞退により進出チーム不足"
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
            />
          </div>

          {/* 警告メッセージ */}
          {team1Override === team2Override && team1Override && (
            <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded">
              <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
              <div className="text-sm text-yellow-800">
                <p className="font-semibold">同じチーム同士の対戦になります</p>
                <p className="text-xs mt-1">本当にこの設定でよろしいですか？</p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          {hasOverride && (
            <Button
              type="button"
              variant="outline"
              onClick={handleDelete}
              disabled={isLoading}
              className="mr-auto"
            >
              オーバーライドを削除
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            キャンセル
          </Button>
          <Button type="button" onClick={handleSave} disabled={isLoading}>
            {isLoading ? '保存中...' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
