'use client';

import { useState, useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Users, Edit, Save, Plus, Trash2, Trophy, Calendar, MapPin, AlertCircle, CheckCircle } from 'lucide-react';

interface Player {
  player_id?: number;
  player_name: string;
  jersey_number?: number;
  is_active: boolean;
}

interface Team {
  team_id: string;
  team_name: string;
  team_omission?: string;
  contact_person: string;
  contact_email: string;
  contact_phone?: string;
  is_active: boolean;
}

interface Tournament {
  tournament_id: number;
  tournament_name: string;
  status: 'planning' | 'ongoing' | 'completed';
  assigned_block?: string;
  block_position?: number;
  venue_name?: string;
  event_start_date?: string;
}

interface TeamProfileData {
  team: Team;
  players: Player[];
  tournaments: Tournament[];
}

interface PlayersFormData {
  players: {
    player_id?: number;
    player_name: string;
    jersey_number?: number;
    is_active: boolean;
  }[];
}

export default function TeamProfile() {
  const [profileData, setProfileData] = useState<TeamProfileData | null>(null);
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

  // チーム情報とメンバーを取得
  const fetchTeamProfile = async () => {
    try {
      const response = await fetch('/api/teams/profile');
      const result = await response.json();
      
      if (result.success) {
        setProfileData(result.data);
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
        setError(result.error || 'チーム情報の取得に失敗しました');
      }
    } catch (error) {
      console.error('Team profile fetch error:', error);
      setError('ネットワークエラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTeamProfile();
  }, []);

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
        await fetchTeamProfile();
      } else {
        setError(result.error || '更新に失敗しました');
        if (result.details && Array.isArray(result.details)) {
          const errorMessages = result.details.map((detail: any) => `${detail.field}: ${detail.message}`).join(', ');
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

  const formatDate = (dateString?: string) => {
    if (!dateString) return '日程未定';
    const date = new Date(dateString);
    return date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ongoing':
        return <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">開催中</span>;
      case 'completed':
        return <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">完了</span>;
      case 'planning':
      default:
        return <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">準備中</span>;
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
        <p className="text-gray-600">チーム情報を読み込み中...</p>
      </div>
    );
  }

  if (!profileData) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="p-6">
          <p className="text-red-600 text-center">チーム情報が見つかりません</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
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

      {/* チーム基本情報 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Users className="w-5 h-5 mr-2" />
            チーム情報
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-medium text-gray-700">チーム名</Label>
              <p className="text-lg font-semibold">{profileData.team.team_name}</p>
            </div>
            {profileData.team.team_omission && (
              <div>
                <Label className="text-sm font-medium text-gray-700">チーム略称</Label>
                <p className="text-lg">{profileData.team.team_omission}</p>
              </div>
            )}
            <div>
              <Label className="text-sm font-medium text-gray-700">代表者名</Label>
              <p className="text-lg">{profileData.team.contact_person}</p>
            </div>
            <div>
              <Label className="text-sm font-medium text-gray-700">連絡先メール</Label>
              <p className="text-lg">{profileData.team.contact_email}</p>
            </div>
            {profileData.team.contact_phone && (
              <div>
                <Label className="text-sm font-medium text-gray-700">電話番号</Label>
                <p className="text-lg">{profileData.team.contact_phone}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

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
                    players: profileData.players.map(player => ({
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
                      players: profileData.players.map(player => ({
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
              {profileData.players.length > 0 ? (
                <div className="grid gap-4">
                  {profileData.players.map((player, index) => (
                    <div key={player.player_id || index} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center space-x-4">
                        <div className="flex-shrink-0">
                          {player.jersey_number ? (
                            <div className="w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">
                              {player.jersey_number}
                            </div>
                          ) : (
                            <div className="w-10 h-10 bg-gray-300 text-gray-600 rounded-full flex items-center justify-center">
                              -
                            </div>
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{player.player_name}</p>
                          <p className="text-sm text-gray-500">
                            {player.jersey_number ? `背番号 ${player.jersey_number}` : '背番号未設定'}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-8">登録されている選手がいません</p>
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