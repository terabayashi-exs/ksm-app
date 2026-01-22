'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MoveHorizontal } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface Team {
  tournament_team_id?: number;
  team_name: string;
  position: string;
}

interface FirstRoundSlot {
  match_code: string;
  match_id: number;
  is_bye_match: boolean;
  team1: Team | null;
  team2: Team | null;
  isDraggable: boolean;
}

interface TournamentBracketEditorProps {
  blockName: string;
  slots: FirstRoundSlot[];
  allSlots?: FirstRoundSlot[][]; // 他のブロックのスロット情報（ブロック間移動用）
  blockNames?: string[]; // 全ブロック名
  currentBlockIndex: number; // 現在のブロックのインデックス
  onMoveTeam?: (fromSlotIndex: number, fromTeamPosition: 'team1' | 'team2', toBlockIndex: number, toSlotIndex: number, toTeamPosition: 'team1' | 'team2') => void;
}

export default function TournamentBracketEditor({
  slots,
  allSlots,
  blockNames,
  currentBlockIndex,
  onMoveTeam
}: TournamentBracketEditorProps) {
  return (
    <div className="space-y-4">
      <div className="text-sm font-semibold text-gray-700 bg-blue-50 px-4 py-2 rounded-md border border-blue-200">
        第1ラウンド（組合せ編集可能）
      </div>

      {slots.map((slot, slotIndex) => (
        <SlotCard
          key={slot.match_code}
          slot={slot}
          slotIndex={slotIndex}
          allSlots={allSlots}
          blockNames={blockNames}
          currentBlockIndex={currentBlockIndex}
          onMoveTeam={onMoveTeam}
        />
      ))}
    </div>
  );
}

interface SlotCardProps {
  slot: FirstRoundSlot;
  slotIndex: number;
  allSlots?: FirstRoundSlot[][];
  blockNames?: string[];
  currentBlockIndex: number;
  onMoveTeam?: (fromSlotIndex: number, fromTeamPosition: 'team1' | 'team2', toBlockIndex: number, toSlotIndex: number, toTeamPosition: 'team1' | 'team2') => void;
}

function SlotCard({ slot, slotIndex, allSlots, blockNames, currentBlockIndex, onMoveTeam }: SlotCardProps) {
  const isByeMatch = slot.is_bye_match;

  return (
    <Card className={isByeMatch ? 'bg-gray-50 border-gray-300' : 'bg-white'}>
      <CardContent className="p-4">
        {/* 試合コードヘッダー */}
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold text-gray-600">
            {slot.match_code}
          </div>
          <Badge variant={isByeMatch ? 'secondary' : 'default'} className="text-xs">
            {isByeMatch ? '不戦勝枠' : '対戦試合'}
          </Badge>
        </div>

        {/* チーム表示エリア */}
        <div className="space-y-2">
          {/* チーム1 */}
          {slot.team1 ? (
            <TeamSlot
              team={slot.team1}
              isDraggable={!isByeMatch}
              isByeMatch={false}
              isEmptyByeSlot={false}
              slotIndex={slotIndex}
              teamPosition="team1"
              currentBlockIndex={currentBlockIndex}
              allSlots={allSlots}
              blockNames={blockNames}
              onMoveTeam={onMoveTeam}
            />
          ) : (
            <TeamSlot
              team={{ team_name: '（割り当てなし）', position: '' }}
              isDraggable={false}
              isByeMatch={false}
              isEmptyByeSlot={isByeMatch}
              slotIndex={slotIndex}
              teamPosition="team1"
              currentBlockIndex={currentBlockIndex}
              allSlots={allSlots}
              blockNames={blockNames}
              onMoveTeam={onMoveTeam}
            />
          )}

          {/* vs表示 */}
          <div className="text-center text-sm font-medium text-gray-400 py-1">
            vs
          </div>

          {/* チーム2 */}
          {slot.team2 ? (
            <TeamSlot
              team={slot.team2}
              isDraggable={!isByeMatch}
              isByeMatch={false}
              isEmptyByeSlot={false}
              slotIndex={slotIndex}
              teamPosition="team2"
              currentBlockIndex={currentBlockIndex}
              allSlots={allSlots}
              blockNames={blockNames}
              onMoveTeam={onMoveTeam}
            />
          ) : (
            <TeamSlot
              team={{ team_name: '（割り当てなし）', position: '' }}
              isDraggable={false}
              isByeMatch={false}
              isEmptyByeSlot={isByeMatch}
              slotIndex={slotIndex}
              teamPosition="team2"
              currentBlockIndex={currentBlockIndex}
              allSlots={allSlots}
              blockNames={blockNames}
              onMoveTeam={onMoveTeam}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface TeamSlotProps {
  team: Team;
  isDraggable: boolean;
  isByeMatch: boolean;
  isEmptyByeSlot: boolean;
  slotIndex: number;
  teamPosition: 'team1' | 'team2';
  currentBlockIndex: number;
  allSlots?: FirstRoundSlot[][];
  blockNames?: string[];
  onMoveTeam?: (fromSlotIndex: number, fromTeamPosition: 'team1' | 'team2', toBlockIndex: number, toSlotIndex: number, toTeamPosition: 'team1' | 'team2') => void;
}

function TeamSlot({
  team,
  isEmptyByeSlot,
  slotIndex,
  teamPosition,
  currentBlockIndex,
  allSlots,
  blockNames,
  onMoveTeam
}: TeamSlotProps) {
  const hasAssignment = team.tournament_team_id !== undefined;

  // 移動可能な場所のリストを生成
  const getMoveOptions = () => {
    if (!allSlots || !blockNames || !onMoveTeam || !hasAssignment) return [];

    const options: Array<{
      blockIndex: number;
      blockName: string;
      slotIndex: number;
      slotCode: string;
      teamPosition: 'team1' | 'team2';
      targetTeam: string | null;
    }> = [];

    allSlots.forEach((blockSlots, blockIndex) => {
      blockSlots.forEach((slot, sIndex) => {
        // team1の移動先
        if (!(blockIndex === currentBlockIndex && sIndex === slotIndex && teamPosition === 'team1')) {
          const targetTeam = slot.team1?.team_name || null;
          options.push({
            blockIndex,
            blockName: blockNames[blockIndex] || `Block ${blockIndex + 1}`,
            slotIndex: sIndex,
            slotCode: slot.match_code,
            teamPosition: 'team1',
            targetTeam
          });
        }

        // team2の移動先（不戦勝試合でなければ）
        if (!slot.is_bye_match && !(blockIndex === currentBlockIndex && sIndex === slotIndex && teamPosition === 'team2')) {
          const targetTeam = slot.team2?.team_name || null;
          options.push({
            blockIndex,
            blockName: blockNames[blockIndex] || `Block ${blockIndex + 1}`,
            slotIndex: sIndex,
            slotCode: slot.match_code,
            teamPosition: 'team2',
            targetTeam
          });
        }
      });
    });

    return options;
  };

  const moveOptions = getMoveOptions();

  return (
    <div
      className={`
        p-3 rounded-lg border-2 transition-colors
        ${
          isEmptyByeSlot
            ? 'bg-gray-100 border-gray-300 cursor-not-allowed'
            : hasAssignment
            ? 'bg-blue-50 border-blue-300'
            : 'bg-white border-gray-300'
        }
        ${!isEmptyByeSlot && !hasAssignment ? 'border-dashed' : ''}
      `}
    >
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div
            className={`
              text-sm font-medium
              ${
                isEmptyByeSlot
                  ? 'text-gray-500'
                  : hasAssignment
                  ? 'text-blue-900'
                  : 'text-gray-400'
              }
            `}
          >
            {team.team_name}
          </div>
          {hasAssignment && team.position && (
            <div className="text-xs text-gray-500 mt-1">位置: {team.position}</div>
          )}
        </div>

        {isEmptyByeSlot && (
          <Badge variant="outline" className="text-xs bg-gray-200 text-gray-600">
            割り当て不可
          </Badge>
        )}

        {/* チーム移動ボタン */}
        {hasAssignment && moveOptions.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="ml-2">
                <MoveHorizontal className="w-3 h-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 max-h-96 overflow-y-auto bg-white">
              <DropdownMenuLabel>移動先を選択</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {moveOptions.map((option, index) => (
                <DropdownMenuItem
                  key={index}
                  onClick={() => onMoveTeam?.(slotIndex, teamPosition, option.blockIndex, option.slotIndex, option.teamPosition)}
                  className="text-xs"
                >
                  <div className="flex flex-col">
                    <div className="font-medium">
                      {option.blockName} - {option.slotCode} ({option.teamPosition === 'team1' ? '上' : '下'})
                    </div>
                    {option.targetTeam && (
                      <div className="text-gray-500 text-xs">
                        現在: {option.targetTeam} (入れ替え)
                      </div>
                    )}
                    {!option.targetTeam && (
                      <div className="text-gray-500 text-xs">
                        (空き)
                      </div>
                    )}
                  </div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}
