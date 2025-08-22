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

interface FinalMatch {
  match_id: number;
  match_code: string;
  team1_id: string | null;
  team2_id: string | null;
  team1_display_name: string;
  team2_display_name: string;
  team1_scores: number | null;
  team2_scores: number | null;
  winner_team_id: string | null;
  is_draw: boolean;
  is_walkover: boolean;
  is_confirmed: boolean;
  match_status: string;
  start_time: string | null;
  court_number: number | null;
}

interface FinalRanking {
  team_id: string;
  team_name: string;
  position: number;
  is_confirmed: boolean;
  points?: number; // 決勝トーナメントでは使用しないが、統一のため
  matches_played?: number;
  wins?: number;
  draws?: number;
  losses?: number;
  goals_for?: number;
  goals_against?: number;
  goal_difference?: number;
}

interface FinalTournamentBlock {
  block_name: string; // "決勝トーナメント"
  team_rankings: FinalRanking[];
  remarks?: string | null;
}

interface ManualRankingsEditorProps {
  tournamentId: number;
  blocks: Block[];
  finalMatches?: FinalMatch[];
}

export default function ManualRankingsEditor({ tournamentId, blocks, finalMatches = [] }: ManualRankingsEditorProps) {
  const [editedBlocks, setEditedBlocks] = useState<Block[]>(
    blocks.map(block => ({
      ...block,
      team_rankings: [...block.team_rankings], // 深いコピー
      remarks: block.remarks || '' // 備考のデフォルト値（nullを空文字に変換）
    }))
  );

  // 決勝トーナメントの順位を自動計算
  const calculateFinalRankings = (): FinalRanking[] => {
    const rankings: FinalRanking[] = [];
    const teamSet = new Set<string>();
    
    // 全てのチームを収集
    finalMatches.forEach(match => {
      if (match.team1_id && !match.team1_id.includes('_winner') && !match.team1_id.includes('_loser')) {
        teamSet.add(match.team1_id);
      }
      if (match.team2_id && !match.team2_id.includes('_winner') && !match.team2_id.includes('_loser')) {
        teamSet.add(match.team2_id);
      }
    });

    // 決勝（T8）から順位を判定
    const finalMatch = finalMatches.find(m => m.match_code === 'T8');
    const thirdPlaceMatch = finalMatches.find(m => m.match_code === 'T7');
    const semiFinalMatches = finalMatches.filter(m => ['T5', 'T6'].includes(m.match_code));
    const quarterFinalMatches = finalMatches.filter(m => ['T1', 'T2', 'T3', 'T4'].includes(m.match_code));

    // 1位・2位（決勝戦）
    if (finalMatch?.is_confirmed && finalMatch.winner_team_id) {
      const winnerId = finalMatch.winner_team_id;
      const loserId = finalMatch.team1_id === winnerId ? finalMatch.team2_id : finalMatch.team1_id;
      
      if (winnerId) {
        rankings.push({
          team_id: winnerId,
          team_name: finalMatch.team1_id === winnerId ? finalMatch.team1_display_name : finalMatch.team2_display_name,
          position: 1,
          is_confirmed: true
        });
      }
      
      if (loserId) {
        rankings.push({
          team_id: loserId,
          team_name: finalMatch.team1_id === loserId ? finalMatch.team1_display_name : finalMatch.team2_display_name,
          position: 2,
          is_confirmed: true
        });
      }
    }

    // 3位・4位（3位決定戦）
    if (thirdPlaceMatch?.is_confirmed && thirdPlaceMatch.winner_team_id) {
      const winnerId = thirdPlaceMatch.winner_team_id;
      const loserId = thirdPlaceMatch.team1_id === winnerId ? thirdPlaceMatch.team2_id : thirdPlaceMatch.team1_id;
      
      if (winnerId) {
        rankings.push({
          team_id: winnerId,
          team_name: thirdPlaceMatch.team1_id === winnerId ? thirdPlaceMatch.team1_display_name : thirdPlaceMatch.team2_display_name,
          position: 3,
          is_confirmed: true
        });
      }
      
      if (loserId) {
        rankings.push({
          team_id: loserId,
          team_name: thirdPlaceMatch.team1_id === loserId ? thirdPlaceMatch.team1_display_name : thirdPlaceMatch.team2_display_name,
          position: 4,
          is_confirmed: true
        });
      }
    }

    // 5位（準々決勝敗者は全て5位、準決勝敗者は5位または3位決定戦に応じて）
    const rankedTeamIds = new Set(rankings.map(r => r.team_id));
    
    // 準決勝敗者（3位決定戦がない場合は3位、ある場合は後で5位）
    const semiFinalLosers: string[] = [];
    semiFinalMatches.forEach(match => {
      if (match.is_confirmed && match.winner_team_id) {
        const loserId = match.team1_id === match.winner_team_id ? match.team2_id : match.team1_id;
        if (loserId && !rankedTeamIds.has(loserId)) {
          semiFinalLosers.push(loserId);
        }
      }
    });
    
    // 3位決定戦がない場合、準決勝敗者は同着3位
    if (!thirdPlaceMatch?.is_confirmed && semiFinalLosers.length > 0) {
      semiFinalLosers.forEach(loserId => {
        const match = semiFinalMatches.find(m => 
          (m.team1_id === loserId || m.team2_id === loserId) && m.winner_team_id
        );
        if (match) {
          rankings.push({
            team_id: loserId,
            team_name: match.team1_id === loserId ? match.team1_display_name : match.team2_display_name,
            position: 3, // 同着3位
            is_confirmed: true
          });
          rankedTeamIds.add(loserId);
        }
      });
    } else if (thirdPlaceMatch?.is_confirmed && semiFinalLosers.length > 0) {
      // 3位決定戦がある場合、敗者は5位
      semiFinalLosers.forEach(loserId => {
        const match = semiFinalMatches.find(m => 
          (m.team1_id === loserId || m.team2_id === loserId) && m.winner_team_id
        );
        if (match && !rankedTeamIds.has(loserId)) {
          rankings.push({
            team_id: loserId,
            team_name: match.team1_id === loserId ? match.team1_display_name : match.team2_display_name,
            position: 5, // 5位
            is_confirmed: true
          });
          rankedTeamIds.add(loserId);
        }
      });
    }

    // 準々決勝敗者（全て5位）
    quarterFinalMatches.forEach(match => {
      if (match.is_confirmed && match.winner_team_id) {
        const loserId = match.team1_id === match.winner_team_id ? match.team2_id : match.team1_id;
        if (loserId && !rankedTeamIds.has(loserId)) {
          rankings.push({
            team_id: loserId,
            team_name: match.team1_id === loserId ? match.team1_display_name : match.team2_display_name,
            position: 5, // 全て5位
            is_confirmed: true
          });
          rankedTeamIds.add(loserId);
        }
      }
    });

    // 未確定のチーム（決勝・準決勝の未確定チームは適切な順位、それ以外は5位）
    teamSet.forEach(teamId => {
      if (!rankedTeamIds.has(teamId)) {
        const teamMatch = finalMatches.find(m => 
          (m.team1_id === teamId || m.team2_id === teamId)
        );
        const displayName = teamMatch?.team1_id === teamId ? teamMatch.team1_display_name : teamMatch?.team2_display_name;
        
        // どの試合に参加しているかで順位を決定
        let defaultPosition = 5; // デフォルトは5位
        
        if (finalMatch && (finalMatch.team1_id === teamId || finalMatch.team2_id === teamId)) {
          defaultPosition = 1; // 決勝参加者は1位から
        } else if (thirdPlaceMatch && (thirdPlaceMatch.team1_id === teamId || thirdPlaceMatch.team2_id === teamId)) {
          defaultPosition = 3; // 3位決定戦参加者は3位から
        } else if (semiFinalMatches.some(m => m.team1_id === teamId || m.team2_id === teamId)) {
          defaultPosition = 3; // 準決勝参加者は3位から
        }
        
        rankings.push({
          team_id: teamId,
          team_name: displayName || '未確定',
          position: defaultPosition,
          is_confirmed: false
        });
      }
    });

    return rankings.sort((a, b) => a.position - b.position);
  };

  const [finalTournamentBlock, setFinalTournamentBlock] = useState<FinalTournamentBlock>({
    block_name: '決勝トーナメント',
    team_rankings: calculateFinalRankings(),
    remarks: ''
  });

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


  // 順位の変更（予選ブロック）
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

  // 決勝トーナメントの順位変更
  const updateFinalPosition = (teamIndex: number, newPosition: number) => {
    if (newPosition >= 1 && newPosition <= finalTournamentBlock.team_rankings.length) {
      setFinalTournamentBlock(prev => ({
        ...prev,
        team_rankings: prev.team_rankings.map((team, index) => 
          index === teamIndex ? { ...team, position: newPosition } : team
        )
      }));
    }
  };

  // 備考の変更（予選ブロック）
  const updateBlockRemarks = (blockIndex: number, remarks: string) => {
    const updatedBlocks = [...editedBlocks];
    updatedBlocks[blockIndex] = {
      ...updatedBlocks[blockIndex],
      remarks: remarks
    };
    setEditedBlocks(updatedBlocks);
  };

  // 決勝トーナメントの備考変更
  const updateFinalRemarks = (remarks: string) => {
    setFinalTournamentBlock(prev => ({
      ...prev,
      remarks: remarks
    }));
  };

  // 元の順位にリセット（予選ブロック）
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

  // 決勝トーナメントをリセット
  const resetFinalTournament = () => {
    setFinalTournamentBlock({
      block_name: '決勝トーナメント',
      team_rankings: calculateFinalRankings(),
      remarks: ''
    });
    setMessage({ type: 'success', text: '決勝トーナメント順位をリセットしました' });
  };

  // 全て元に戻す
  const resetAll = () => {
    setEditedBlocks(blocks.map(block => ({
      ...block,
      team_rankings: [...block.team_rankings],
      remarks: block.remarks || '' // 備考もリセット（nullを空文字に変換）
    })));
    setFinalTournamentBlock({
      block_name: '決勝トーナメント',
      team_rankings: calculateFinalRankings(),
      remarks: ''
    });
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
          })),
          finalTournament: finalMatches.length > 0 ? {
            team_rankings: finalTournamentBlock.team_rankings,
            remarks: finalTournamentBlock.remarks || ''
          } : null
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
  ) || (
    // 決勝トーナメントの変更もチェック
    finalTournamentBlock.team_rankings.some((team, index) => {
      const original = calculateFinalRankings()[index];
      return !original || team.position !== original.position;
    }) || finalTournamentBlock.remarks !== ''
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

      {/* 決勝トーナメント順位調整 */}
      {finalMatches.length > 0 && (
        <div className="space-y-4">
          <div className="border-t border-gray-200 pt-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">決勝トーナメント順位調整</h2>
            <p className="text-sm text-gray-600 mb-4">
              決勝トーナメントの結果に基づいて自動計算された順位を手動で調整できます
            </p>
          </div>

          <Card className="h-fit">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="px-3 py-1 rounded-full text-sm font-medium mr-3 bg-red-100 text-red-800 border-red-200">
                    {finalTournamentBlock.block_name}
                  </div>
                  <Trophy className="w-4 h-4" />
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={resetFinalTournament}
                  disabled={saving}
                  className="text-xs"
                >
                  リセット
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {finalTournamentBlock.team_rankings.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Trophy className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>決勝トーナメントが開始されていません</p>
                  <p className="text-xs">チームが進出した後に表示されます</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {finalTournamentBlock.team_rankings
                    .sort((a, b) => a.position - b.position)
                    .map((team, teamIndex) => (
                    <div key={team.team_id} className={`flex items-center gap-3 p-3 rounded-lg ${
                      team.is_confirmed ? 'bg-gray-50' : 'bg-yellow-50 border border-yellow-200'
                    }`}>
                      <div className="flex items-center gap-2">
                        <Label htmlFor={`final-position-${team.team_id}`} className="text-sm font-medium">
                          順位:
                        </Label>
                        <Input
                          id={`final-position-${team.team_id}`}
                          type="number"
                          min="1"
                          max={finalTournamentBlock.team_rankings.length}
                          value={team.position}
                          onChange={(e) => updateFinalPosition(teamIndex, parseInt(e.target.value) || 1)}
                          className="w-16 h-8 text-center"
                          disabled={saving}
                        />
                      </div>
                      <div className="flex-1">
                        <div className="font-medium text-sm">{team.team_name}</div>
                        <div className="text-xs text-gray-600">
                          {team.is_confirmed ? '結果確定' : '未確定'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 備考欄 */}
              <div className="mt-4 pt-4 border-t border-gray-200">
                <Label htmlFor="final-remarks" className="flex items-center text-sm font-medium text-gray-700 mb-2">
                  <MessageSquare className="w-4 h-4 mr-1" />
                  決勝トーナメント順位設定の備考
                </Label>
                <Textarea
                  id="final-remarks"
                  placeholder="順位決定の理由や特記事項を入力してください（例：3位決定戦なしのため同着3位など）"
                  value={finalTournamentBlock.remarks || ''}
                  onChange={(e) => updateFinalRemarks(e.target.value)}
                  disabled={saving}
                  rows={3}
                  className="text-sm"
                />
                {finalTournamentBlock.remarks && (
                  <p className="text-xs text-gray-500 mt-1">
                    {finalTournamentBlock.remarks.length} / 500文字
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

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