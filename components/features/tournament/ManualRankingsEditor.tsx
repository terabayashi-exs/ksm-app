'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Trophy, Save, RotateCcw, AlertTriangle, MessageSquare } from 'lucide-react';
import Link from 'next/link';

interface TeamRanking {
  team_id: string;
  team_name: string;
  team_omission?: string;
  position: number;
  points: number;
  matches_played: number;
  wins: number;
  draws: number;
  losses: number;
  goals_for: number;
  goals_against: number;
  goal_difference: number;
}

interface Block {
  match_block_id: number;
  phase: string;
  display_round_name: string;
  block_name: string;
  team_rankings: TeamRanking[];
  remarks?: string | null;
}

interface ManualRankingsEditorProps {
  tournamentId: number;
  blocks: Block[];
}

export default function ManualRankingsEditor({ tournamentId, blocks }: ManualRankingsEditorProps) {
  const [editedBlocks, setEditedBlocks] = useState<Block[]>(
    blocks.map(block => ({
      ...block,
      team_rankings: [...block.team_rankings], // 深いコピー
      remarks: block.remarks || '' // 備考のデフォルト値（nullを空文字に変換）
    }))
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // ブロック色分けヘルパー
  const getBlockColor = (blockName: string): string => {
    switch (blockName) {
      case 'A': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'B': return 'bg-green-100 text-green-800 border-green-200';
      case 'C': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'D': return 'bg-purple-100 text-purple-800 border-purple-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  // 順位の変更
  const updateTeamPosition = (blockIndex: number, teamIndex: number, newPosition: number) => {
    const updatedBlocks = [...editedBlocks];
    const block = updatedBlocks[blockIndex];
    
    if (newPosition >= 1 && newPosition <= block.team_rankings.length) {
      updatedBlocks[blockIndex] = {
        ...block,
        team_rankings: block.team_rankings.map((team, index) => 
          index === teamIndex ? { ...team, position: newPosition } : team
        )
      };
      
      setEditedBlocks(updatedBlocks);
    }
  };

  // 備考の変更
  const updateBlockRemarks = (blockIndex: number, remarks: string) => {
    const updatedBlocks = [...editedBlocks];
    updatedBlocks[blockIndex] = {
      ...updatedBlocks[blockIndex],
      remarks: remarks
    };
    setEditedBlocks(updatedBlocks);
  };

  // 元の順位にリセット
  const resetBlock = (blockIndex: number) => {
    const updatedBlocks = [...editedBlocks];
    updatedBlocks[blockIndex] = {
      ...updatedBlocks[blockIndex],
      team_rankings: [...blocks[blockIndex].team_rankings],
      remarks: blocks[blockIndex].remarks || '' // 備考もリセット（nullを空文字に変換）
    };
    setEditedBlocks(updatedBlocks);
    setMessage({ type: 'success', text: `${blocks[blockIndex].block_name}ブロックをリセットしました` });
  };

  // 全て元に戻す
  const resetAll = () => {
    setEditedBlocks(blocks.map(block => ({
      ...block,
      team_rankings: [...block.team_rankings],
      remarks: block.remarks || '' // 備考もリセット（nullを空文字に変換）
    })));
    setMessage({ type: 'success', text: '全ての変更をリセットしました' });
  };

  // 変更を保存
  const saveChanges = async () => {
    setSaving(true);
    setMessage(null);
    
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/manual-rankings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          blocks: editedBlocks.map(block => ({
            match_block_id: block.match_block_id,
            team_rankings: block.team_rankings,
            remarks: block.remarks || ''
          }))
        }),
      });

      const result = await response.json();

      if (result.success) {
        setMessage({ type: 'success', text: '順位表を更新しました' });
        // 決勝トーナメント進出処理もトリガー
        setTimeout(() => {
          setMessage(null);
        }, 3000);
      } else {
        setMessage({ type: 'error', text: result.error || '更新に失敗しました' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'ネットワークエラーが発生しました' });
      console.error('手動順位更新エラー:', error);
    } finally {
      setSaving(false);
    }
  };

  // 変更があるかチェック
  const hasChanges = editedBlocks.some((block, blockIndex) => 
    block.team_rankings.some((team, teamIndex) => 
      team.position !== blocks[blockIndex]?.team_rankings[teamIndex]?.position
    ) || block.remarks !== (blocks[blockIndex]?.remarks || '')
  );

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">予選ブロック順位調整</h2>
          <p className="text-sm text-gray-600">
            同着順位を設定する場合は、同じ順位番号を入力してください（例：1位、2位、2位、4位）
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={resetAll}
            disabled={saving || !hasChanges}
          >
            <RotateCcw className="w-4 h-4 mr-1" />
            全てリセット
          </Button>
          <Button 
            onClick={saveChanges}
            disabled={saving || !hasChanges}
            className="border-2 border-blue-600 bg-blue-600 hover:bg-blue-700 hover:border-blue-700 text-white"
          >
            <Save className="w-4 h-4 mr-1" />
            {saving ? '保存中...' : '変更を保存'}
          </Button>
          <Button asChild variant="outline">
            <Link href="/admin">戻る</Link>
          </Button>
        </div>
      </div>

      {/* メッセージ */}
      {message && (
        <div className={`p-4 rounded-md ${
          message.type === 'success' 
            ? 'bg-green-50 border border-green-200 text-green-800' 
            : 'bg-red-50 border border-red-200 text-red-800'
        }`}>
          <div className="flex items-center">
            {message.type === 'error' && <AlertTriangle className="w-4 h-4 mr-2" />}
            {message.text}
          </div>
        </div>
      )}

      {/* ブロック一覧 */}
      <div className="grid gap-6 lg:grid-cols-2">
        {editedBlocks.map((block, blockIndex) => (
          <Card key={block.match_block_id} className="h-fit">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className={`px-3 py-1 rounded-full text-sm font-medium mr-3 ${getBlockColor(block.block_name)}`}>
                    {block.display_round_name}
                  </div>
                  <Trophy className="w-4 h-4" />
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => resetBlock(blockIndex)}
                  disabled={saving}
                  className="text-xs"
                >
                  リセット
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {block.team_rankings.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Trophy className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>まだ順位が決まっていません</p>
                  <p className="text-xs">試合結果を確定してください</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {block.team_rankings
                    .sort((a, b) => a.position - b.position)
                    .map((team, teamIndex) => (
                    <div key={team.team_id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <Label htmlFor={`position-${block.match_block_id}-${team.team_id}`} className="text-sm font-medium">
                          順位:
                        </Label>
                        <Input
                          id={`position-${block.match_block_id}-${team.team_id}`}
                          type="number"
                          min="1"
                          max={block.team_rankings.length}
                          value={team.position}
                          onChange={(e) => updateTeamPosition(blockIndex, teamIndex, parseInt(e.target.value) || 1)}
                          className="w-16 h-8 text-center"
                          disabled={saving}
                        />
                      </div>
                      <div className="flex-1">
                        <div className="font-medium text-sm">{team.team_name}</div>
                        <div className="text-xs text-gray-600">
                          {team.points}pt ({team.wins}W {team.draws}D {team.losses}L) 
                          得失点差: {team.goal_difference > 0 ? '+' : ''}{team.goal_difference}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 備考欄 */}
              <div className="mt-4 pt-4 border-t border-gray-200">
                <Label htmlFor={`remarks-${block.match_block_id}`} className="flex items-center text-sm font-medium text-gray-700 mb-2">
                  <MessageSquare className="w-4 h-4 mr-1" />
                  順位設定の備考
                </Label>
                <Textarea
                  id={`remarks-${block.match_block_id}`}
                  placeholder="順位決定の理由や特記事項を入力してください（例：同着1位のため抽選で決定、3位決定戦なしのため同着3位など）"
                  value={block.remarks || ''}
                  onChange={(e) => updateBlockRemarks(blockIndex, e.target.value)}
                  disabled={saving}
                  rows={3}
                  className="text-sm"
                />
                {block.remarks && (
                  <p className="text-xs text-gray-500 mt-1">
                    {block.remarks.length} / 500文字
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 注意事項 */}
      <Card className="border-yellow-200 bg-yellow-50">
        <CardContent className="p-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-yellow-600 mt-0.5" />
            <div className="text-sm text-yellow-800">
              <p className="font-medium mb-1">手動順位設定の注意事項:</p>
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li>同着順位を設定する場合は、同じ順位番号を入力してください</li>
                <li>順位変更後は自動的に決勝トーナメントの進出チームが更新されます</li>
                <li>備考欄に順位決定の理由や特記事項を記録できます</li>
                <li>変更は保存ボタンを押すまで反映されません</li>
                <li>元の順位は各ブロックの成績に基づいて自動計算されています</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}