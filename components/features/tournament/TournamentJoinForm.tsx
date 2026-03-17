// components/features/tournament/TournamentJoinForm.tsx
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
import { Plus, Trash2, Users, UserPlus } from 'lucide-react';

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
  teamPlayers: TeamPlayer[];
  existingTournamentPlayers?: ExistingTournamentPlayer[];
  existingTournamentTeamInfo?: ExistingTournamentTeamInfo | null;
  isEditMode?: boolean;
  isNewTeamMode?: boolean;
  specificTeamId?: number;
}

const playerSchema = z.object({
  player_id: z.number().optional(),
  player_name: z.string().min(1, '選手名は必須です').max(50, '選手名は50文字以内で入力してください'),
  jersey_number: z.number().min(1, '背番号は1以上で入力してください').max(99, '背番号は99以下で入力してください').optional(),
  is_participating: z.boolean(),
  is_selected: z.boolean().optional(), // UI用：既存選手の選択状態
});

const formSchema = z.object({
  tournament_team_name: z.string().min(1, '大会参加チーム名は必須です').max(50, 'チーム名は50文字以内で入力してください'),
  tournament_team_omission: z.string().min(1, 'チーム略称は必須です').max(5, 'チーム略称は5文字以内で入力してください'),
  players: z.array(playerSchema)
    .max(20, '選手は最大20人まで登録可能です')
    .refine((players) => {
      // 選手名の重複チェック（参加する選手のみ）
      const participatingPlayers = players.filter(p => p.is_participating);
      const names = participatingPlayers.map(p => p.player_name);
      const uniqueNames = new Set(names);
      return names.length === uniqueNames.size;
    }, {
      message: '同じ名前の選手が重複しています'
    })
    .refine((players) => {
      // 背番号の重複チェック（参加する選手で番号が設定されている選手のみ）
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

export default function TournamentJoinForm({
  tournamentId,
  teamPlayers,
  existingTournamentPlayers = [],
  existingTournamentTeamInfo = null,
  isEditMode = false,
  isNewTeamMode = false,
  specificTeamId
}: Props) {

  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // teamPlayersから重複を除外（念のため）
  const uniqueTeamPlayers = Array.from(
    new Map(teamPlayers.map(p => [p.player_id, p])).values()
  );

  const { control, handleSubmit, formState: { errors }, reset } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      tournament_team_name: (isNewTeamMode || !existingTournamentTeamInfo) ? '' : existingTournamentTeamInfo.team_name,
      tournament_team_omission: (isNewTeamMode || !existingTournamentTeamInfo) ? '' : existingTournamentTeamInfo.team_omission,
      players: []
    }
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'players'
  });


  // 既存選手の選択状態を管理
  const [selectedExistingPlayers, setSelectedExistingPlayers] = useState<Set<number>>(new Set());
  const [initialized, setInitialized] = useState(false);

  // specificTeamIdやtournamentIdが変わったら初期化フラグと選手データをリセット
  useEffect(() => {
    console.log('Resetting form due to parameter change');
    setInitialized(false);
    setSelectedExistingPlayers(new Set());

    // フォームの選手データをクリア
    reset({
      tournament_team_name: (isNewTeamMode || !existingTournamentTeamInfo) ? '' : existingTournamentTeamInfo.team_name,
      tournament_team_omission: (isNewTeamMode || !existingTournamentTeamInfo) ? '' : existingTournamentTeamInfo.team_omission,
      players: []
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId, specificTeamId]);

  // 編集モードの場合、既存の参加選手情報でフォームを初期化
  useEffect(() => {
    // 初期化済みの場合はスキップ
    if (initialized) return;

    // 編集モードで既存選手データがある場合のみ初期化
    if (isEditMode && existingTournamentPlayers.length > 0) {
      console.log('Initializing form with existing players:', existingTournamentPlayers);

      const existingPlayerIds = new Set<number>();

      // 重複を除外しながら追加
      const uniquePlayers = Array.from(
        new Map(existingTournamentPlayers.map(p => [p.player_id, p])).values()
      );

      console.log('Unique players to add:', uniquePlayers);

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

      console.log('Form initialization complete, total fields:', uniquePlayers.length);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode, existingTournamentPlayers, initialized]);

  // 既存選手の選択/非選択を処理
  const handleExistingPlayerToggle = (player: TeamPlayer, checked: boolean) => {
    const newSelected = new Set(selectedExistingPlayers);

    if (checked) {
      newSelected.add(player.player_id);

      // 既にフォームに存在するかチェック
      const existingIndex = fields.findIndex(f => f.player_id === player.player_id);
      if (existingIndex === -1) {
        // フォームに追加（存在しない場合のみ）
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
      // フォームから削除
      const index = fields.findIndex(f => f.player_id === player.player_id);
      if (index !== -1) {
        remove(index);
      }
    }

    setSelectedExistingPlayers(newSelected);
  };

  // 新規選手を追加
  const addNewPlayer = () => {
    append({
      player_name: '',
      jersey_number: undefined,
      is_participating: true
    });
  };

  // 新規選手を削除
  const removeNewPlayer = (index: number) => {
    remove(index);
  };


  // フォーム送信
  const onSubmit = async (data: FormData) => {
    setLoading(true);
    setError('');

    // デバッグ: 送信データをログ出力
    console.log('Form submission data:', {
      players: data.players,
      participatingPlayers: data.players.filter(p => p.is_participating),
      playerNames: data.players.filter(p => p.is_participating).map(p => p.player_name),
      duplicateCheck: {
        total: data.players.filter(p => p.is_participating).length,
        unique: new Set(data.players.filter(p => p.is_participating).map(p => p.player_name)).size
      }
    });

    try {
      const apiUrl = `/api/tournaments/${tournamentId}/join`;
      const requestBody = {
        tournament_team_name: data.tournament_team_name,
        tournament_team_omission: data.tournament_team_omission,
        players: data.players.map(p => ({
          player_id: p.player_id,
          player_name: p.player_name,
          jersey_number: p.jersey_number,
          is_participating: p.is_participating
        })),
        isEditMode: isEditMode,
        isNewTeamMode: isNewTeamMode,
        specificTeamId: specificTeamId
      };

      console.log('Submitting tournament join form:', {
        tournamentId,
        apiUrl,
        tournamentIdType: typeof tournamentId,
        method: isEditMode ? 'PUT' : 'POST',
        playersCount: data.players.length,
        requestBody
      });

      let response;
      let result;
      
      try {
        console.log('About to fetch:', apiUrl);
        response = await fetch(apiUrl, {
          method: isEditMode ? 'PUT' : 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });

        console.log('Response received:', {
          status: response.status,
          statusText: response.statusText,
          url: response.url,
          ok: response.ok
        });

        console.log('About to parse JSON...');
        result = await response.json();
        console.log('JSON parsed successfully:', result);
        
      } catch (fetchError) {
        console.error('Fetch or JSON parsing error:', fetchError);
        throw new Error(`ネットワークエラー: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`);
      }

      if (result.success) {
        router.push(`/team?${isEditMode ? 'updated' : 'joined'}=${tournamentId}`);
      } else {
        // エラーメッセージの組み立て
        let errorMessage = result.error || (isEditMode ? '参加選手の変更に失敗しました' : '参加申し込みに失敗しました');

        // detailsがある場合、より分かりやすく表示
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
      {/* 大会参加チーム情報セクション */}
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
            {isNewTeamMode && <span className="block mt-2 text-green-700 font-medium">複数チーム参加モード: 既存参加チームとは異なる名前・略称を入力してください。</span>}
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="tournament_team_name">大会参加チーム名 *</Label>
              <Input
                id="tournament_team_name"
                {...control.register('tournament_team_name')}
                placeholder={isNewTeamMode ? "例: サンプルチームB" : "例: サンプルチームA"}
              />
              {errors.tournament_team_name && (
                <p className="text-sm text-red-600 mt-1">{errors.tournament_team_name.message}</p>
              )}
            </div>

            <div>
              <Label htmlFor="tournament_team_omission">チーム略称 *</Label>
              <Input
                id="tournament_team_omission"
                maxLength={5}
                {...control.register('tournament_team_omission')}
                placeholder={isNewTeamMode ? "例: SPB" : "例: SPA"}
              />
              <p className="text-xs text-gray-500 mt-1">
                全角4文字以内で入力してください
              </p>
              {errors.tournament_team_omission && (
                <p className="text-sm text-red-600 mt-1">{errors.tournament_team_omission.message}</p>
              )}
            </div>
          </div>
          
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm text-blue-800">
              💡 <strong>重要:</strong> 同じマスターチームから複数エントリーする場合は、それぞれ異なるチーム名・略称を使用してください。
              星取表などではチーム略称が表示されます。
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 既存選手選択セクション */}
      {uniqueTeamPlayers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Users className="h-5 w-5 mr-2" />
              登録済み選手から選択
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500 mb-4">
              チームに登録済みの選手から参加者を選択してください
            </p>
            <div className="space-y-3">
              {uniqueTeamPlayers.map((player) => {
                const isSelected = selectedExistingPlayers.has(player.player_id);
                const fieldIndex = fields.findIndex(f => f.player_id === player.player_id);
                
                return (
                  <div key={player.player_id} className="flex items-center space-x-4 p-3 border rounded-lg">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={(checked) => handleExistingPlayerToggle(player, checked as boolean)}
                    />
                    <div className="flex-1">
                      <p className="font-medium">{player.player_name}</p>
                      {player.jersey_number && (
                        <p className="text-sm text-gray-500">背番号: {player.jersey_number}</p>
                      )}
                    </div>
                    {isSelected && fieldIndex !== -1 && (
                      <div className="flex items-center space-x-2">
                        <Label htmlFor={`jersey-${player.player_id}`} className="text-sm">
                          背番号:
                        </Label>
                        <Input
                          id={`jersey-${player.player_id}`}
                          type="number"
                          min="1"
                          max="99"
                          className="w-20"
                          {...control.register(`players.${fieldIndex}.jersey_number`, {
                            setValueAs: (value) => {
                              if (value === '' || value === null || value === undefined) {
                                return undefined;
                              }
                              const num = parseInt(value, 10);
                              return isNaN(num) ? undefined : num;
                            }
                          })}
                          placeholder="番号"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 新規選手追加セクション（新規登録時のみ表示） */}
      {!isEditMode && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center">
                <UserPlus className="h-5 w-5 mr-2" />
                新規選手追加
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addNewPlayer}
                disabled={loading}
              >
                <Plus className="h-4 w-4 mr-1" />
                選手を追加
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500 mb-4">
              新しい選手を手動で追加できます
            </p>

            {fields.filter(f => !f.player_id).length > 0 ? (
              <div className="space-y-4">
                {fields.map((field, index) => {
                  if (field.player_id) return null; // 既存選手はスキップ

                  return (
                    <div key={field.id} className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-medium">新規選手 {index + 1}</h4>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => removeNewPlayer(index)}
                          disabled={loading}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor={`player-name-${index}`}>選手名 *</Label>
                          <Input
                            id={`player-name-${index}`}
                            {...control.register(`players.${index}.player_name`)}
                            placeholder="選手名を入力"
                            disabled={loading}
                          />
                          {errors.players?.[index]?.player_name && (
                            <p className="text-red-500 text-sm mt-1">
                              {errors.players[index]?.player_name?.message}
                            </p>
                          )}
                        </div>

                        <div>
                          <Label htmlFor={`jersey-${index}`}>背番号</Label>
                          <Input
                            id={`jersey-${index}`}
                            type="number"
                            min="1"
                            max="99"
                            {...control.register(`players.${index}.jersey_number`, {
                              setValueAs: (value) => {
                                if (value === '' || value === null || value === undefined) {
                                  return undefined;
                                }
                                const num = parseInt(value, 10);
                                return isNaN(num) ? undefined : num;
                              }
                            })}
                            placeholder="1-99"
                            disabled={loading}
                          />
                          {errors.players?.[index]?.jersey_number && (
                            <p className="text-red-500 text-sm mt-1">
                              {errors.players[index]?.jersey_number?.message}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-4">
                新規選手を追加するには上の「選手を追加」ボタンをクリックしてください
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* エラー表示 */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}

      {/* フォームエラー表示 */}
      {(errors.players?.message || errors.players?.root?.message) && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-600 text-sm">
            {String(errors.players?.message || errors.players?.root?.message)}
          </p>
        </div>
      )}

      {/* 送信ボタン */}
      <div className="flex justify-end space-x-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push('/my')}
          disabled={loading}
        >
          キャンセル
        </Button>
        <Button
          type="submit"
          variant="outline"
          disabled={loading}
        >
          {loading
            ? (isEditMode ? '保存中...' : (isNewTeamMode ? '追加申し込み中...' : '申し込み中...'))
            : (isEditMode ? '保存' : (isNewTeamMode ? '追加チームで参加申し込み' : '大会に参加申し込み'))
          }
        </Button>
      </div>
    </form>
  );
}