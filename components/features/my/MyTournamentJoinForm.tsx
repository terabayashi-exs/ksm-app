// components/features/my/MyTournamentJoinForm.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Users } from 'lucide-react';

interface TeamPlayer {
  player_id: number;
  player_name: string;
  jersey_number: number | null;
  is_active: number;
}

interface ExistingTournamentPlayer {
  player_id: number;
  player_name: string;
  jersey_number: number | null;
}

interface ExistingTournamentTeamInfo {
  team_name: string;
  team_omission: string;
}

interface Props {
  tournamentId: number;
  teamId: string;
  teamPlayers: TeamPlayer[];
  existingTournamentPlayers?: ExistingTournamentPlayer[];
  existingTournamentTeamInfo?: ExistingTournamentTeamInfo | null;
  isEditMode?: boolean;
  alreadyParticipatingPlayerIds?: number[];
}

const playerSchema = z.object({
  player_id: z.number().optional(),
  player_name: z.string().min(1, '選手名は必須です').max(50, '選手名は50文字以内で入力してください'),
  jersey_number: z.number().min(1, '背番号は1以上で入力してください').max(99, '背番号は99以下で入力してください').optional(),
  is_participating: z.boolean(),
  is_selected: z.boolean().optional(),
});

const formSchema = z.object({
  tournament_team_name: z.string().min(1, '大会参加チーム名は必須です').max(50, 'チーム名は50文字以内で入力してください'),
  tournament_team_omission: z.string().min(1, 'チーム略称は必須です').max(5, 'チーム略称は5文字以内で入力してください'),
  players: z.array(playerSchema)
    .max(30, '選手は最大30人まで登録可能です')
    .refine((players) => {
      if (players.length === 0) return true;
      const participatingPlayers = players.filter(p => p.is_participating);
      const names = participatingPlayers.map(p => p.player_name);
      const uniqueNames = new Set(names);
      return names.length === uniqueNames.size;
    }, {
      message: '同じ名前の選手が重複しています'
    })
    .refine((players) => {
      if (players.length === 0) return true;
      const participatingPlayers = players.filter(p => p.is_participating);
      const numbers = participatingPlayers
        .filter(p => p.jersey_number !== undefined && p.jersey_number !== null)
        .map(p => p.jersey_number);
      const uniqueNumbers = new Set(numbers);
      return numbers.length === uniqueNumbers.size;
    }, {
      message: '背番号が重複しています'
    })
});

type FormData = z.infer<typeof formSchema>;

export default function MyTournamentJoinForm({
  tournamentId,
  teamId,
  teamPlayers,
  existingTournamentPlayers = [],
  existingTournamentTeamInfo = null,
  isEditMode = false,
  alreadyParticipatingPlayerIds = [],
}: Props) {

  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const uniqueTeamPlayers = Array.from(
    new Map(teamPlayers.map(p => [p.player_id, p])).values()
  );

  const { control, handleSubmit, formState: { errors }, reset } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      tournament_team_name: existingTournamentTeamInfo?.team_name || '',
      tournament_team_omission: existingTournamentTeamInfo?.team_omission || '',
      players: []
    }
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'players'
  });

  const [selectedExistingPlayers, setSelectedExistingPlayers] = useState<Set<number>>(new Set());
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    setInitialized(false);
    setSelectedExistingPlayers(new Set());

    reset({
      tournament_team_name: existingTournamentTeamInfo?.team_name || '',
      tournament_team_omission: existingTournamentTeamInfo?.team_omission || '',
      players: []
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId]);

  useEffect(() => {
    if (initialized) return;

    if (isEditMode && existingTournamentPlayers.length > 0) {
      const existingPlayerIds = new Set<number>();
      const uniquePlayers = Array.from(
        new Map(existingTournamentPlayers.map(p => [p.player_id, p])).values()
      );

      uniquePlayers.forEach(player => {
        existingPlayerIds.add(player.player_id);
        append({
          player_id: player.player_id,
          player_name: player.player_name,
          jersey_number: player.jersey_number || undefined,
          is_participating: true,
          is_selected: true
        });
      });

      setSelectedExistingPlayers(existingPlayerIds);
      setInitialized(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode, existingTournamentPlayers, initialized]);

  const handleExistingPlayerToggle = (player: TeamPlayer, checked: boolean) => {
    const newSelected = new Set(selectedExistingPlayers);

    if (checked) {
      newSelected.add(player.player_id);

      const existingIndex = fields.findIndex(f => f.player_id === player.player_id);
      if (existingIndex === -1) {
        append({
          player_id: player.player_id,
          player_name: player.player_name,
          jersey_number: player.jersey_number || undefined,
          is_participating: true,
          is_selected: true
        });
      }
    } else {
      newSelected.delete(player.player_id);
      const index = fields.findIndex(f => f.player_id === player.player_id);
      if (index !== -1) {
        remove(index);
      }
    }

    setSelectedExistingPlayers(newSelected);
  };

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    setError('');

    try {
      const apiUrl = `/api/my/tournaments/${tournamentId}/apply`;
      const requestBody = {
        teamId,
        tournament_team_name: data.tournament_team_name,
        tournament_team_omission: data.tournament_team_omission,
        players: data.players.map(p => ({
          player_id: p.player_id,
          player_name: p.player_name,
          jersey_number: p.jersey_number,
          is_participating: p.is_participating
        })),
        isEditMode: isEditMode,
      };

      const response = await fetch(apiUrl, {
        method: isEditMode ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const result = await response.json();

      if (result.success) {
        router.refresh();
        router.push(`/my?tab=team&teamId=${teamId}&teamTab=joined&${isEditMode ? 'updated' : 'joined'}=${tournamentId}`);
      } else {
        let errorMessage = result.error || (isEditMode ? '参加選手の変更に失敗しました' : '参加申し込みに失敗しました');

        if (result.details && Array.isArray(result.details)) {
          const detailMessages = result.details.map((detail: { message?: string }) => detail.message).filter(Boolean);
          if (detailMessages.length > 0) {
            errorMessage = detailMessages.join('\n');
          }
        }

        setError(errorMessage);
      }
    } catch (error) {
      setError('通信エラーが発生しました');
      console.error('Tournament join error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Users className="h-5 w-5 mr-2" />
            大会参加チーム情報
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-500 mb-4">
            この大会での参加チーム名と略称を入力してください。既存のチームと重複しない名前を指定する必要があります。
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="tournament_team_name">大会参加チーム名 <span className="text-destructive">*</span></Label>
              <Input
                id="tournament_team_name"
                {...control.register('tournament_team_name')}
                placeholder="例: サンプルチームA"
              />
              {errors.tournament_team_name && (
                <p className="text-sm text-red-600 mt-1">{errors.tournament_team_name.message}</p>
              )}
            </div>

            <div>
              <Label htmlFor="tournament_team_omission">チーム略称 <span className="text-destructive">*</span></Label>
              <Input
                id="tournament_team_omission"
                maxLength={5}
                {...control.register('tournament_team_omission')}
                placeholder="例: SPA"
              />
              <p className="text-xs text-gray-500 mt-1">
                全角4文字以内で入力してください
              </p>
              {errors.tournament_team_omission && (
                <p className="text-sm text-red-600 mt-1">{errors.tournament_team_omission.message}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Users className="h-5 w-5 mr-2" />
            参加選手の選択
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-500">
            登録済みの選手から、この大会に参加する選手を選択してください。
          </p>
          {alreadyParticipatingPlayerIds.length > 0 && (
            <div className="p-3 bg-orange-50 border border-orange-200 rounded-md">
              <p className="text-sm text-orange-800">
                ⚠️ 既に他のチームで参加登録済みの選手は選択できません
              </p>
            </div>
          )}

          {uniqueTeamPlayers.length === 0 ? (
            <div className="bg-gray-50 p-4 rounded-md text-sm text-gray-600">
              登録済みの選手がいません。先にチームに選手を登録してください。
            </div>
          ) : (
            <div className="space-y-2">
              {uniqueTeamPlayers.map(player => {
                const isAlreadyParticipating = alreadyParticipatingPlayerIds.includes(player.player_id);
                return (
                  <div
                    key={player.player_id}
                    className={`flex items-center space-x-3 p-3 border rounded-md ${
                      isAlreadyParticipating
                        ? 'bg-gray-100 opacity-60 cursor-not-allowed'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    <Checkbox
                      id={`player-${player.player_id}`}
                      checked={selectedExistingPlayers.has(player.player_id)}
                      onCheckedChange={(checked) => handleExistingPlayerToggle(player, checked as boolean)}
                      disabled={isAlreadyParticipating}
                    />
                    <label
                      htmlFor={`player-${player.player_id}`}
                      className={`flex-1 flex items-center justify-between ${
                        isAlreadyParticipating ? 'cursor-not-allowed' : 'cursor-pointer'
                      }`}
                    >
                      <span className={`font-medium ${isAlreadyParticipating ? 'text-gray-500' : ''}`}>
                        {player.player_name}
                      </span>
                      <div className="flex items-center gap-2">
                        {player.jersey_number && (
                          <span className="text-sm text-gray-500">背番号: {player.jersey_number}</span>
                        )}
                        {isAlreadyParticipating && (
                          <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">
                            既に参加登録済み
                          </span>
                        )}
                      </div>
                    </label>
                  </div>
                );
              })}
            </div>
          )}

          {selectedExistingPlayers.size > 0 && (
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
              <p className="text-sm text-blue-800">
                {selectedExistingPlayers.size}名の選手を選択しています
              </p>
            </div>
          )}

          {errors.players && (
            <p className="text-sm text-red-600">{errors.players.message}</p>
          )}
        </CardContent>
      </Card>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-md">
          <p className="text-sm whitespace-pre-line">{error}</p>
        </div>
      )}

      <div className="flex gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push('/my?tab=team&teamTab=search')}
          disabled={loading}
          className="flex-1"
        >
          キャンセル
        </Button>
        <Button
          type="submit"
          disabled={loading}
          className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          {loading ? '処理中...' : (isEditMode ? '変更を保存' : '参加を申し込む')}
        </Button>
      </div>
    </form>
  );
}
