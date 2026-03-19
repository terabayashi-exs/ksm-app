'use client';

import { useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Trophy, Save, RotateCcw, AlertTriangle, MessageSquare } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

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
  team1_tournament_team_id: number | null;
  team2_tournament_team_id: number | null;
  team1_display_name: string;
  team2_display_name: string;
  team1_scores: number | null;
  team2_scores: number | null;
  winner_tournament_team_id: number | null;
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
  phases?: string | null; // phases JSON文字列
  finalMatches?: FinalMatch[];
  finalRankings?: {
    match_block_id: number;
    team_rankings: FinalRanking[];
    remarks: string | null;
  } | null;
  promotionRequirements?: string[]; // e.g., ["A_1", "A_2", "B_1", "B_2"]
}

export default function ManualRankingsEditor({ tournamentId, blocks, phases, finalMatches = [], finalRankings = null, promotionRequirements = [] }: ManualRankingsEditorProps) {
  // phasesからフェーズリスト・format_typeマップ・nameマップを構築
  const { phaseList, phaseFormatMap, phaseNameMap } = useMemo(() => {
    const list: { id: string; name: string; format_type: string; order: number }[] = [];
    const fmtMap = new Map<string, string>();
    const nameMap = new Map<string, string>();
    if (phases) {
      try {
        const data = typeof phases === 'string' ? JSON.parse(phases) : phases;
        if (data?.phases && Array.isArray(data.phases)) {
          for (const p of data.phases) {
            if (p.id && p.format_type) {
              fmtMap.set(p.id, p.format_type);
              nameMap.set(p.id, p.name || p.id);
              list.push({ id: p.id, name: p.name || p.id, format_type: p.format_type, order: p.order || 0 });
            }
          }
          list.sort((a, b) => a.order - b.order);
        }
      } catch { /* ignore */ }
    }
    return { phaseList: list, phaseFormatMap: fmtMap, phaseNameMap: nameMap };
  }, [phases]);

  // フェーズのformat_typeを取得するヘルパー
  const getPhaseFormatType = useCallback((phase: string): string | null => {
    return phaseFormatMap.get(phase) || null;
  }, [phaseFormatMap]);

  // タブの状態管理（フェーズIDで動的に管理）
  const [activeTab, setActiveTab] = useState<string>(() => {
    return phaseList.length > 0 ? phaseList[0].id : '';
  });

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

    // 全てのチームを収集（tournament_team_idを文字列として扱う）
    finalMatches.forEach(match => {
      if (match.team1_tournament_team_id) {
        const team1IdStr = String(match.team1_tournament_team_id);
        if (!team1IdStr.includes('_winner') && !team1IdStr.includes('_loser')) {
          teamSet.add(team1IdStr);
        }
      }
      if (match.team2_tournament_team_id) {
        const team2IdStr = String(match.team2_tournament_team_id);
        if (!team2IdStr.includes('_winner') && !team2IdStr.includes('_loser')) {
          teamSet.add(team2IdStr);
        }
      }
    });

    // 決勝（T8）から順位を判定
    const finalMatch = finalMatches.find(m => m.match_code === 'T8');
    const thirdPlaceMatch = finalMatches.find(m => m.match_code === 'T7');
    const semiFinalMatches = finalMatches.filter(m => ['T5', 'T6'].includes(m.match_code));
    const quarterFinalMatches = finalMatches.filter(m => ['T1', 'T2', 'T3', 'T4'].includes(m.match_code));

    // 1位・2位（決勝戦）
    if (finalMatch?.is_confirmed && finalMatch.winner_tournament_team_id) {
      const winnerId = String(finalMatch.winner_tournament_team_id);
      const team1IdStr = finalMatch.team1_tournament_team_id ? String(finalMatch.team1_tournament_team_id) : null;
      const team2IdStr = finalMatch.team2_tournament_team_id ? String(finalMatch.team2_tournament_team_id) : null;
      const loserId = team1IdStr === winnerId ? team2IdStr : team1IdStr;

      if (winnerId) {
        rankings.push({
          team_id: winnerId,
          team_name: team1IdStr === winnerId ? finalMatch.team1_display_name : finalMatch.team2_display_name,
          position: 1,
          is_confirmed: true
        });
      }

      if (loserId) {
        rankings.push({
          team_id: loserId,
          team_name: team1IdStr === loserId ? finalMatch.team1_display_name : finalMatch.team2_display_name,
          position: 2,
          is_confirmed: true
        });
      }
    }

    // 3位・4位（3位決定戦）
    if (thirdPlaceMatch?.is_confirmed && thirdPlaceMatch.winner_tournament_team_id) {
      const winnerId = String(thirdPlaceMatch.winner_tournament_team_id);
      const team1IdStr = thirdPlaceMatch.team1_tournament_team_id ? String(thirdPlaceMatch.team1_tournament_team_id) : null;
      const team2IdStr = thirdPlaceMatch.team2_tournament_team_id ? String(thirdPlaceMatch.team2_tournament_team_id) : null;
      const loserId = team1IdStr === winnerId ? team2IdStr : team1IdStr;

      if (winnerId) {
        rankings.push({
          team_id: winnerId,
          team_name: team1IdStr === winnerId ? thirdPlaceMatch.team1_display_name : thirdPlaceMatch.team2_display_name,
          position: 3,
          is_confirmed: true
        });
      }

      if (loserId) {
        rankings.push({
          team_id: loserId,
          team_name: team1IdStr === loserId ? thirdPlaceMatch.team1_display_name : thirdPlaceMatch.team2_display_name,
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
      if (match.is_confirmed && match.winner_tournament_team_id) {
        const winnerIdStr = String(match.winner_tournament_team_id);
        const team1IdStr = match.team1_tournament_team_id ? String(match.team1_tournament_team_id) : null;
        const team2IdStr = match.team2_tournament_team_id ? String(match.team2_tournament_team_id) : null;
        const loserId = team1IdStr === winnerIdStr ? team2IdStr : team1IdStr;
        if (loserId && !rankedTeamIds.has(loserId)) {
          semiFinalLosers.push(loserId);
        }
      }
    });

    // 3位決定戦がない場合、準決勝敗者は同着3位
    if (!thirdPlaceMatch?.is_confirmed && semiFinalLosers.length > 0) {
      semiFinalLosers.forEach(loserId => {
        const match = semiFinalMatches.find(m => {
          const team1IdStr = m.team1_tournament_team_id ? String(m.team1_tournament_team_id) : null;
          const team2IdStr = m.team2_tournament_team_id ? String(m.team2_tournament_team_id) : null;
          return (team1IdStr === loserId || team2IdStr === loserId) && m.winner_tournament_team_id;
        });
        if (match) {
          const team1IdStr = match.team1_tournament_team_id ? String(match.team1_tournament_team_id) : null;
          rankings.push({
            team_id: loserId,
            team_name: team1IdStr === loserId ? match.team1_display_name : match.team2_display_name,
            position: 3, // 同着3位
            is_confirmed: true
          });
          rankedTeamIds.add(loserId);
        }
      });
    } else if (thirdPlaceMatch?.is_confirmed && semiFinalLosers.length > 0) {
      // 3位決定戦がある場合、敗者は5位
      semiFinalLosers.forEach(loserId => {
        const match = semiFinalMatches.find(m => {
          const team1IdStr = m.team1_tournament_team_id ? String(m.team1_tournament_team_id) : null;
          const team2IdStr = m.team2_tournament_team_id ? String(m.team2_tournament_team_id) : null;
          return (team1IdStr === loserId || team2IdStr === loserId) && m.winner_tournament_team_id;
        });
        if (match && !rankedTeamIds.has(loserId)) {
          const team1IdStr = match.team1_tournament_team_id ? String(match.team1_tournament_team_id) : null;
          rankings.push({
            team_id: loserId,
            team_name: team1IdStr === loserId ? match.team1_display_name : match.team2_display_name,
            position: 5, // 5位
            is_confirmed: true
          });
          rankedTeamIds.add(loserId);
        }
      });
    }

    // 準々決勝敗者（全て5位）
    quarterFinalMatches.forEach(match => {
      if (match.is_confirmed && match.winner_tournament_team_id) {
        const winnerIdStr = String(match.winner_tournament_team_id);
        const team1IdStr = match.team1_tournament_team_id ? String(match.team1_tournament_team_id) : null;
        const team2IdStr = match.team2_tournament_team_id ? String(match.team2_tournament_team_id) : null;
        const loserId = team1IdStr === winnerIdStr ? team2IdStr : team1IdStr;
        if (loserId && !rankedTeamIds.has(loserId)) {
          rankings.push({
            team_id: loserId,
            team_name: team1IdStr === loserId ? match.team1_display_name : match.team2_display_name,
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
        const teamMatch = finalMatches.find(m => {
          const team1IdStr = m.team1_tournament_team_id ? String(m.team1_tournament_team_id) : null;
          const team2IdStr = m.team2_tournament_team_id ? String(m.team2_tournament_team_id) : null;
          return team1IdStr === teamId || team2IdStr === teamId;
        });
        const team1IdStr = teamMatch?.team1_tournament_team_id ? String(teamMatch.team1_tournament_team_id) : null;
        const displayName = teamMatch ? (team1IdStr === teamId ? teamMatch.team1_display_name : teamMatch.team2_display_name) : '未確定';

        // どの試合に参加しているかで順位を決定
        let defaultPosition = 5; // デフォルトは5位

        if (finalMatch) {
          const finalTeam1IdStr = finalMatch.team1_tournament_team_id ? String(finalMatch.team1_tournament_team_id) : null;
          const finalTeam2IdStr = finalMatch.team2_tournament_team_id ? String(finalMatch.team2_tournament_team_id) : null;
          if (finalTeam1IdStr === teamId || finalTeam2IdStr === teamId) {
            defaultPosition = 1; // 決勝参加者は1位から
          }
        }

        if (defaultPosition === 5 && thirdPlaceMatch) {
          const thirdTeam1IdStr = thirdPlaceMatch.team1_tournament_team_id ? String(thirdPlaceMatch.team1_tournament_team_id) : null;
          const thirdTeam2IdStr = thirdPlaceMatch.team2_tournament_team_id ? String(thirdPlaceMatch.team2_tournament_team_id) : null;
          if (thirdTeam1IdStr === teamId || thirdTeam2IdStr === teamId) {
            defaultPosition = 3; // 3位決定戦参加者は3位から
          }
        }

        if (defaultPosition === 5 && semiFinalMatches.some(m => {
          const team1IdStr = m.team1_tournament_team_id ? String(m.team1_tournament_team_id) : null;
          const team2IdStr = m.team2_tournament_team_id ? String(m.team2_tournament_team_id) : null;
          return team1IdStr === teamId || team2IdStr === teamId;
        })) {
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

  // トーナメント形式フェーズのブロック名を動的に取得
  const tournamentPhase = phaseList.find(p => p.format_type === 'tournament');
  const tournamentBlockName = tournamentPhase?.name || 'トーナメント';

  const [finalTournamentBlock, setFinalTournamentBlock] = useState<FinalTournamentBlock>(() => {
    if (finalRankings && finalRankings.team_rankings.length > 0) {
      return {
        block_name: tournamentBlockName,
        team_rankings: finalRankings.team_rankings,
        remarks: finalRankings.remarks || ''
      };
    } else {
      return {
        block_name: tournamentBlockName,
        team_rankings: calculateFinalRankings(),
        remarks: ''
      };
    }
  });

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // ブロック表示名を取得
  const getBlockDisplayName = (block: Block): string => {
    // _unifiedブロックの場合はdisplay_round_nameまたはフェーズ名
    if (block.block_name && block.block_name.endsWith('_unified')) {
      if (block.display_round_name) return block.display_round_name;
      return phaseNameMap.get(block.phase) || 'トーナメント';
    }
    // 1文字のブロック名（A, B, C...）は「Xブロック」形式
    if (block.block_name && block.block_name.length === 1) {
      return `${block.block_name}ブロック`;
    }
    // それ以外（1位リーグ等）はそのまま
    if (block.block_name && block.block_name !== 'default') {
      return block.block_name;
    }
    if (block.display_round_name) return block.display_round_name;
    return phaseNameMap.get(block.phase) || block.phase;
  };

  // ブロック色分けヘルパー
  const blockColors = [
    'bg-blue-100 text-blue-800 border-blue-200',
    'bg-green-100 text-green-800 border-green-200',
    'bg-yellow-100 text-yellow-800 border-yellow-200',
    'bg-purple-100 text-purple-800 border-purple-200',
    'bg-orange-100 text-orange-800 border-orange-200',
    'bg-cyan-100 text-cyan-800 border-cyan-200',
    'bg-rose-100 text-rose-800 border-rose-200',
    'bg-teal-100 text-teal-800 border-teal-200',
    'bg-indigo-100 text-indigo-800 border-indigo-200',
    'bg-lime-100 text-lime-800 border-lime-200',
    'bg-amber-100 text-amber-800 border-amber-200',
    'bg-sky-100 text-sky-800 border-sky-200',
    'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200',
    'bg-emerald-100 text-emerald-800 border-emerald-200',
    'bg-violet-100 text-violet-800 border-violet-200',
    'bg-red-100 text-red-800 border-red-200',
  ];
  const getBlockColor = (blockName: string): string => {
    // 1文字のブロック名（A～Z）はアルファベット順で色分け
    if (blockName.length === 1 && blockName >= 'A' && blockName <= 'Z') {
      const index = blockName.charCodeAt(0) - 'A'.charCodeAt(0);
      return blockColors[index % blockColors.length];
    }
    // X位リーグ等
    if (blockName.includes('1位')) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    if (blockName.includes('2位')) return 'bg-blue-100 text-blue-800 border-blue-200';
    if (blockName.includes('3位')) return 'bg-green-100 text-green-800 border-green-200';
    if (blockName.includes('4位')) return 'bg-purple-100 text-purple-800 border-purple-200';
    return 'bg-gray-100 text-gray-800 border-gray-200';
  };

  // 手動調整が必要なブロックかチェック（決勝進出に影響する順位で同順位が存在するか）
  const hasManualAdjustmentNeeded = (teamRankings: TeamRanking[], block: Block): boolean => {
    if (teamRankings.length === 0) return false;

    // トーナメント形式の場合は「要調整」タグを表示しない
    if (getPhaseFormatType(block.phase) === 'tournament') {
      return false;
    }
    if (getPhaseFormatType(block.phase) === 'tournament') {
      return false;
    }

    // promotionRequirementsが設定されていないフェーズは全順位で同順位チェック
    // promotionRequirementsから当該ブロックの必要順位を抽出
    // 例: block_name = "A" の場合、"A_1", "A_2", "A_3" などから順位を抽出
    const blockPrefix = block.block_name;
    const requiredPositions = new Set<number>();

    promotionRequirements.forEach(requirement => {
      // "A_1", "B_2", "C_3" などの形式を想定
      const match = requirement.match(/^([A-Z]+)_(\d+)$/);
      if (match) {
        const [, reqBlock, posStr] = match;
        if (reqBlock === blockPrefix) {
          requiredPositions.add(parseInt(posStr, 10));
        }
      }
    });

    // 必要な順位が指定されていない場合は、従来のロジック（全順位で同順位チェック）
    if (requiredPositions.size === 0) {
      const positions = teamRankings.map(team => team.position);
      const uniquePositions = new Set(positions);
      return positions.length !== uniquePositions.size;
    }

    // 決勝進出に必要な順位のみチェック
    const teamsInRequiredPositions = teamRankings.filter(team => requiredPositions.has(team.position));
    const positionsInRequired = teamsInRequiredPositions.map(team => team.position);
    const uniquePositionsInRequired = new Set(positionsInRequired);

    // 必要順位内で同じ順位が複数存在する場合、手動調整が必要
    return positionsInRequired.length !== uniquePositionsInRequired.size;
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
    // データベースから取得した初期状態があればそれに戻す、なければ自動計算
    if (finalRankings && finalRankings.team_rankings.length > 0) {
      setFinalTournamentBlock({
        block_name: tournamentBlockName,
        team_rankings: finalRankings.team_rankings,
        remarks: finalRankings.remarks || ''
      });
    } else {
      setFinalTournamentBlock({
        block_name: tournamentBlockName,
        team_rankings: calculateFinalRankings(),
        remarks: ''
      });
    }
    setMessage({ type: 'success', text: `${tournamentBlockName}順位をリセットしました` });
  };

  // 全て元に戻す
  const resetAll = () => {
    setEditedBlocks(blocks.map(block => ({
      ...block,
      team_rankings: [...block.team_rankings],
      remarks: block.remarks || '' // 備考もリセット（nullを空文字に変換）
    })));
    
    // 決勝トーナメントもリセット
    if (finalRankings && finalRankings.team_rankings.length > 0) {
      setFinalTournamentBlock({
        block_name: tournamentBlockName,
        team_rankings: finalRankings.team_rankings,
        remarks: finalRankings.remarks || ''
      });
    } else {
      setFinalTournamentBlock({
        block_name: tournamentBlockName,
        team_rankings: calculateFinalRankings(),
        remarks: ''
      });
    }
    setMessage({ type: 'success', text: '全ての変更をリセットしました' });
  };

  // 変更を保存（アクティブなタブのブロックのみ）
  const saveChanges = async () => {
    setSaving(true);
    setMessage(null);

    // アクティブなタブのブロックのみを抽出
    const blocksToSave = editedBlocks.filter(block => block.phase === activeTab);

    // デバッグ用：送信データの詳細ログ
    const requestData = {
      blocks: blocksToSave.map(block => ({
        match_block_id: block.match_block_id,
        team_rankings: block.team_rankings,
        remarks: block.remarks || ''
      })),
      finalTournament: (getPhaseFormatType(activeTab) === 'tournament' && finalMatches.length > 0) ? {
        team_rankings: finalTournamentBlock.team_rankings,
        remarks: finalTournamentBlock.remarks || ''
      } : null
    };

    console.log(`[MANUAL_RANKINGS_FRONTEND] ${phaseNameMap.get(activeTab) || activeTab}タブの送信データ:`, JSON.stringify(requestData, null, 2));

    // デバッグ用：変更内容の詳細ログ
    blocksToSave.forEach((block) => {
      const originalBlock = blocks.find(b => b.match_block_id === block.match_block_id);
      console.log(`[MANUAL_RANKINGS_FRONTEND] ${block.block_name}ブロック変更状況:`);

      // 順位変更のチェック
      block.team_rankings.forEach((editedTeam) => {
        const originalTeam = originalBlock?.team_rankings.find(t => t.team_id === editedTeam.team_id);
        if (originalTeam && editedTeam.position !== originalTeam.position) {
          console.log(`  順位変更: ${editedTeam.team_name} ${originalTeam.position}位 → ${editedTeam.position}位`);
        }
      });

      // 備考変更のチェック
      if (block.remarks !== (originalBlock?.remarks || '')) {
        console.log(`  備考変更: "${originalBlock?.remarks || ''}" → "${block.remarks}"`);
      }
    });
    
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/manual-rankings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData),
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

  // 変更があるかチェック（チームIDベースの正確な比較、アクティブタブのみ）
  const hasChanges = (() => {
    const formatType = getPhaseFormatType(activeTab);

    // リーグ形式またはformat_type不明: ブロックの変更をチェック
    const blockChanges = editedBlocks
      .filter(block => block.phase === activeTab)
      .some((block) => {
        const originalBlock = blocks.find(b => b.match_block_id === block.match_block_id);

        const hasPositionChanges = block.team_rankings.some((editedTeam) => {
          const originalTeam = originalBlock?.team_rankings.find(t => t.team_id === editedTeam.team_id);
          return originalTeam && editedTeam.position !== originalTeam.position;
        });

        const hasRemarksChanges = block.remarks !== (originalBlock?.remarks || '');

        return hasPositionChanges || hasRemarksChanges;
      });

    if (blockChanges) return true;

    // トーナメント形式: トーナメント順位の変更もチェック
    if (formatType === 'tournament' && finalMatches.length > 0) {
      return finalTournamentBlock.remarks !== '' ||
        finalTournamentBlock.team_rankings.some((team, index) => {
          return team.position !== (index + 1);
        });
    }

    return false;
  })();

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div>
        <p className="text-sm text-gray-600">
          同着順位を設定する場合は、同じ順位番号を入力してください（例：1位、2位、2位、4位）
        </p>
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

      {/* タブ：フェーズの切り替え */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full max-w-md" style={{ gridTemplateColumns: `repeat(${phaseList.length}, minmax(0, 1fr))` }}>
          {phaseList.map((phase) => (
            <TabsTrigger key={phase.id} value={phase.id}>{phase.name}</TabsTrigger>
          ))}
        </TabsList>

        {/* フェーズごとのタブコンテンツ */}
        {phaseList.map((phase) => (
          <TabsContent key={phase.id} value={phase.id} className="space-y-6 mt-6">
            {/* リーグ形式のブロック一覧 */}
            {editedBlocks.filter(block => block.phase === phase.id && !block.block_name.endsWith('_unified')).length > 0 && (
              <div className="grid gap-6 lg:grid-cols-2">
                {editedBlocks
                  .filter(block => block.phase === phase.id && !block.block_name.endsWith('_unified'))
                  .sort((a, b) => a.block_name.localeCompare(b.block_name))
                  .map((block) => {
                    const blockIndex = editedBlocks.findIndex(b => b.match_block_id === block.match_block_id);
                    const needsAdjustment = hasManualAdjustmentNeeded(block.team_rankings, block);
                    return (
                      <Card key={block.match_block_id} className={`h-fit ${needsAdjustment ? 'border-2 border-yellow-400 shadow-lg' : ''}`}>
                        <CardHeader className={needsAdjustment ? 'bg-yellow-50' : ''}>
                          <CardTitle className="flex items-center justify-between">
                            <div className="flex items-center">
                              <div className={`px-3 py-1 rounded-full text-sm font-medium mr-3 ${getBlockColor(block.block_name)}`}>
                                {getBlockDisplayName(block)}
                              </div>
                              <Trophy className="w-4 h-4" />
                              {needsAdjustment && (
                                <span className="ml-2 px-2 py-1 text-xs font-medium bg-yellow-500 text-white rounded-full animate-pulse">
                                  要調整
                                </span>
                              )}
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
                                <div key={`${block.block_name}-${team.team_id}-${teamIndex}`} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
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
                                    {getPhaseFormatType(block.phase) === 'league' && (
                                      <div className="text-xs text-gray-600">
                                        {team.points}pt ({team.wins}W {team.draws}D {team.losses}L)
                                        得失点差: {team.goal_difference > 0 ? '+' : ''}{team.goal_difference}
                                      </div>
                                    )}
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
                    );
                  })}
              </div>
            )}

            {/* トーナメント形式の順位調整 */}
            {getPhaseFormatType(phase.id) === 'tournament' && finalMatches.length > 0 && (
              <div className="space-y-4">
                <Card className="h-fit">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <div className="flex items-center">
                        <div className="px-3 py-1 rounded-full text-sm font-medium mr-3 bg-gray-100 text-gray-800 border-gray-200">
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
                        <p>トーナメントが開始されていません</p>
                        <p className="text-xs">チームが進出した後に表示されます</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {finalTournamentBlock.team_rankings
                          .sort((a, b) => a.position - b.position)
                          .map((team, teamIndex) => (
                          <div key={`tournament-${team.team_id}-${teamIndex}`} className={`flex items-center gap-3 p-3 rounded-lg ${
                            team.is_confirmed ? 'bg-gray-50' : 'bg-yellow-50 border border-yellow-200'
                          }`}>
                            <div className="flex items-center gap-2">
                              <Label htmlFor={`tournament-position-${team.team_id}`} className="text-sm font-medium">
                                順位:
                              </Label>
                              <Input
                                id={`tournament-position-${team.team_id}`}
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
                      <Label htmlFor={`tournament-remarks-${phase.id}`} className="flex items-center text-sm font-medium text-gray-700 mb-2">
                        <MessageSquare className="w-4 h-4 mr-1" />
                        トーナメント順位設定の備考
                      </Label>
                      <Textarea
                        id={`tournament-remarks-${phase.id}`}
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
          </TabsContent>
        ))}
      </Tabs>

      {/* 注意事項 */}
      <Card className="border-yellow-200 bg-yellow-50">
        <CardContent className="p-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-yellow-600 mt-0.5" />
            <div className="text-sm text-yellow-800">
              <p className="font-medium mb-1">手動順位設定の注意事項:</p>
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li>同着順位を設定する場合は、同じ順位番号を入力してください</li>
                <li>順位変更後は自動的に次のフェーズの進出チームが更新されます</li>
                <li>備考欄に順位決定の理由や特記事項を記録できます</li>
                <li>変更は保存ボタンを押すまで反映されません</li>
                <li>元の順位は各ブロックの成績に基づいて自動計算されています</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 固定ボタン分のスペーサー */}
      <div className="h-16" />

      {/* ボタン（画面下部固定） */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex gap-3">
          <Button
            variant="outline"
            onClick={resetAll}
            disabled={saving || !hasChanges}
            className="flex-shrink-0"
          >
            <RotateCcw className="w-4 h-4 mr-1" />
            全てリセット
          </Button>
          <Button
            onClick={saveChanges}
            disabled={saving || !hasChanges}
            className="flex-1"
          >
            <Save className="w-4 h-4 mr-1" />
            {saving ? '保存中...' : '変更を保存'}
          </Button>
        </div>
      </div>
    </div>
  );
}