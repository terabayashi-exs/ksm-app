'use client';

import { useState, useEffect, useCallback } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Users, Edit, Save, Plus, Trash2, AlertCircle, CheckCircle } from 'lucide-react';

interface Player {
  player_id?: number;
  player_name: string;
  jersey_number?: number;
  is_active: boolean;
}

interface PlayersFormData {
  players: {
    player_id?: number;
    player_name: string;
    jersey_number?: number;
    is_active: boolean;
  }[];
}

export default function TeamMembers() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');

  const form = useForm<PlayersFormData>({
    defaultValues: {
      players: []
    }
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'players'
  });

  // チームメンバーを取得
  const fetchTeamMembers = useCallback(async () => {
    try {
      const response = await fetch('/api/teams/profile');
      const result = await response.json();
      
      if (result.success) {
        setPlayers(result.data.players);
        // フォームにデータを設定
        form.reset({
          players: result.data.players.map((player: Player) => ({
            player_id: player.player_id,
            player_name: player.player_name,
            jersey_number: player.jersey_number,
            is_active: player.is_active
          }))
        });
      } else {
        setError(result.error || 'メンバー情報の取得に失敗しました');
      }
    } catch (error) {
      console.error('Team members fetch error:', error);
      setError('ネットワークエラーが発生しました');
    } finally {
      setLoading(false);
    }
  }, [form]);

  useEffect(() => {
    fetchTeamMembers();
  }, [fetchTeamMembers]);

  // 選手情報の更新
  const onSubmit = async (data: PlayersFormData) => {
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      // データをクリーンアップ（undefinedやNaNを除去）
      const cleanData = {
        players: data.players.map(player => ({
          player_id: player.player_id || undefined,
          player_name: player.player_name.trim(),
          jersey_number: player.jersey_number && !isNaN(player.jersey_number) ? player.jersey_number : undefined,
          is_active: Boolean(player.is_active)
        }))
      };
      
      console.log('Sending player update request:', cleanData);
      const response = await fetch('/api/teams/players', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(cleanData),
      });

      console.log('Response status:', response.status);
      const result = await response.json();
      console.log('Response result:', result);

      if (result.success) {
        setSuccess('選手情報が正常に更新されました');
        setEditMode(false);
        // データを再取得
        await fetchTeamMembers();
      } else {
        setError(result.error || '更新に失敗しました');
        if (result.details && Array.isArray(result.details)) {
          const errorMessages = (result.details as Array<{field: string; message: string}>).map((detail) => `${detail.field}: ${detail.message}`).join(', ');
          setError(`${result.error}: ${errorMessages}`);
        }
      }
    } catch (error) {
      console.error('Players update error:', error);
      setError('ネットワークエラーが発生しました');
    } finally {
      setSaving(false);
    }
  };

  // 選手を追加
  const addPlayer = () => {
    append({
      player_name: '',
      jersey_number: undefined,
      is_active: true
    });
  };

  // 選手を削除
  const removePlayer = (index: number) => {
    if (fields.length > 1) {
      remove(index);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="text-center py-12">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">メンバー情報を読み込み中...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* エラー・成功メッセージ */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">{success}</AlertDescription>
        </Alert>
      )}

      {/* メンバー管理 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center">
              <Users className="w-5 h-5 mr-2" />
              メンバー管理
            </CardTitle>
            {!editMode ? (
              <Button
                variant="outline"
                onClick={() => {
                  setEditMode(true);
                  // フォームを現在のデータで初期化
                  form.reset({
                    players: players.map(player => ({
                      player_id: player.player_id,
                      player_name: player.player_name,
                      jersey_number: player.jersey_number,
                      is_active: true
                    }))
                  });
                }}
                className="flex items-center"
              >
                <Edit className="w-4 h-4 mr-2" />
                編集
              </Button>
            ) : (
              <div className="flex space-x-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditMode(false);
                    setError('');
                    setSuccess('');
                    // フォームをリセット
                    form.reset({
                      players: players.map(player => ({
                        player_id: player.player_id,
                        player_name: player.player_name,
                        jersey_number: player.jersey_number,
                        is_active: player.is_active
                      }))
                    });
                  }}
                >
                  キャンセル
                </Button>
                <Button
                  onClick={form.handleSubmit(onSubmit)}
                  disabled={saving}
                  className="flex items-center"
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  保存
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {!editMode ? (
            // 表示モード
            <div className="space-y-4">
              {players.length > 0 ? (
                <div className="grid gap-4">
                  {players.map((player, index) => (
                    <div key={player.player_id || index} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center space-x-4">
                        <div className="flex-shrink-0">
                          {player.jersey_number ? (
                            <div className="w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">
                              {player.jersey_number}
                            </div>
                          ) : (
                            <div className="w-10 h-10 bg-muted text-muted-foreground rounded-full flex items-center justify-center">
                              -
                            </div>
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{player.player_name}</p>
                          <p className="text-sm text-muted-foreground">
                            {player.jersey_number ? `背番号 ${player.jersey_number}` : '背番号未設定'}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-8">登録されている選手がいません</p>
              )}
            </div>
          ) : (
            // 編集モード
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="flex items-center justify-between">
                <Label className="text-base font-medium">選手一覧</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addPlayer}
                  className="flex items-center"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  選手追加
                </Button>
              </div>

              <div className="space-y-4">
                {fields.map((field, index) => (
                  <Card key={field.id} className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-medium text-sm">選手 {index + 1}</h4>
                      {fields.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removePlayer(index)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label htmlFor={`player_name_${index}`}>選手名 *</Label>
                        <Input
                          id={`player_name_${index}`}
                          {...form.register(`players.${index}.player_name`)}
                          placeholder="例: 山田太郎"
                          className={form.formState.errors.players?.[index]?.player_name ? 'border-red-500' : ''}
                        />
                        {form.formState.errors.players?.[index]?.player_name && (
                          <p className="text-xs text-red-600">
                            {form.formState.errors.players[index]?.player_name?.message}
                          </p>
                        )}
                      </div>

                      <div className="space-y-1">
                        <Label htmlFor={`jersey_number_${index}`}>背番号</Label>
                        <Input
                          id={`jersey_number_${index}`}
                          type="number"
                          min="1"
                          max="99"
                          {...form.register(`players.${index}.jersey_number`, {
                            setValueAs: (value) => {
                              if (value === '' || value === null || value === undefined) {
                                return undefined;
                              }
                              const num = parseInt(value, 10);
                              return isNaN(num) ? undefined : num;
                            }
                          })}
                          placeholder="例: 10"
                          className={form.formState.errors.players?.[index]?.jersey_number ? 'border-red-500' : ''}
                        />
                        {form.formState.errors.players?.[index]?.jersey_number && (
                          <p className="text-xs text-red-600">
                            {form.formState.errors.players[index]?.jersey_number?.message}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* 隠しフィールド */}
                    <input type="hidden" {...form.register(`players.${index}.player_id`)} />
                    <input type="hidden" {...form.register(`players.${index}.is_active`)} value="true" />
                  </Card>
                ))}
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm text-blue-800">
                  📝 背番号は任意ですが、設定する場合は重複しないようにしてください。
                </p>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}