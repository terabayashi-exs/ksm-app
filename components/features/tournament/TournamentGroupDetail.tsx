'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Plus, Loader2, Save, X, GripVertical, Trash2,
  Calendar, MapPin, Users, Trophy 
} from 'lucide-react';
import Link from 'next/link';

interface Tournament {
  tournament_id: number;
  tournament_name: string;
  category_name?: string;
  group_order: number;
  status: string;
  team_count: number;
  tournament_dates?: string;
  venue_name?: string;
  format_name?: string;
}

interface TournamentGroupDetailProps {
  groupId: number;
}

export default function TournamentGroupDetail({ groupId }: TournamentGroupDetailProps) {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [availableTournaments, setAvailableTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedTournamentIds, setSelectedTournamentIds] = useState<number[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [editedTournaments, setEditedTournaments] = useState<Tournament[]>([]);

  useEffect(() => {
    fetchGroupTournaments();
    fetchAvailableTournaments();
  }, [groupId]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchGroupTournaments = async () => {
    try {
      const response = await fetch(`/api/tournament-groups/${groupId}/tournaments`);
      const result = await response.json();

      if (result.success) {
        setTournaments(result.data);
        setEditedTournaments(result.data);
      }
    } catch (err) {
      console.error('グループ内大会取得エラー:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableTournaments = async () => {
    try {
      const response = await fetch('/api/tournaments');
      const result = await response.json();

      if (result.success) {
        // 現在のグループに属する大会のIDを取得
        const currentGroupTournamentIds = tournaments.map(t => t.tournament_id);
        
        // グループに属していない大会のみ（現在のグループに属する大会も除外）
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ungrouped = result.data.filter((t: any) => {
          // group_idがnullまたは未定義で、かつ現在のグループに属していない大会のみ
          const isNotInAnyGroup = !t.group_id || t.group_id === null || t.group_id === undefined;
          const isNotInCurrentGroup = !currentGroupTournamentIds.includes(t.tournament_id);
          return isNotInAnyGroup && isNotInCurrentGroup;
        });
        setAvailableTournaments(ungrouped);
      }
    } catch (err) {
      console.error('利用可能大会取得エラー:', err);
    }
  };

  const handleAddTournaments = async () => {
    if (selectedTournamentIds.length === 0) {
      alert('大会を選択してください');
      return;
    }

    setSaving(true);

    try {
      // 複数の大会を順次追加
      for (let i = 0; i < selectedTournamentIds.length; i++) {
        const tournamentId = selectedTournamentIds[i];
        const response = await fetch(`/api/tournament-groups/${groupId}/tournaments`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'add',
            tournamentId: tournamentId,
            groupOrder: tournaments.length + i
          })
        });

        const result = await response.json();
        if (!result.success) {
          throw new Error(result.error || '大会の追加に失敗しました');
        }
      }

      setShowAddModal(false);
      setSelectedTournamentIds([]);
      fetchGroupTournaments();
      fetchAvailableTournaments();
      alert(`${selectedTournamentIds.length}個の大会を追加しました`);
    } catch (err) {
      console.error('大会追加エラー:', err);
      alert(err instanceof Error ? err.message : '大会の追加に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveTournament = async (tournamentId: number, tournamentName: string) => {
    if (!confirm(`「${tournamentName}」をグループから削除しますか？`)) {
      return;
    }

    try {
      const response = await fetch(
        `/api/tournament-groups/${groupId}/tournaments/${tournamentId}`,
        { method: 'DELETE' }
      );

      const result = await response.json();

      if (result.success) {
        fetchGroupTournaments();
        fetchAvailableTournaments();
      } else {
        alert(`エラー: ${result.error}`);
      }
    } catch (err) {
      console.error('大会削除エラー:', err);
      alert('大会の削除に失敗しました');
    }
  };

  const handleSaveChanges = async () => {
    setSaving(true);

    try {
      // 順序を更新
      const reorderResponse = await fetch(`/api/tournament-groups/${groupId}/tournaments`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reorder',
          tournaments: editedTournaments.map((t, index) => ({
            tournament_id: t.tournament_id,
            group_order: index
          }))
        })
      });

      if (!reorderResponse.ok) {
        throw new Error('順序更新に失敗しました');
      }

      // カテゴリー名を更新
      const categoryResponse = await fetch(`/api/tournament-groups/${groupId}/tournaments`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_categories',
          tournaments: editedTournaments.map(t => ({
            tournament_id: t.tournament_id,
            category_name: t.category_name
          }))
        })
      });

      if (!categoryResponse.ok) {
        throw new Error('カテゴリー名更新に失敗しました');
      }

      setEditMode(false);
      fetchGroupTournaments();
      alert('変更を保存しました');
    } catch (err) {
      console.error('保存エラー:', err);
      alert('保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const moveItem = (fromIndex: number, toIndex: number) => {
    const items = [...editedTournaments];
    const [removed] = items.splice(fromIndex, 1);
    items.splice(toIndex, 0, removed);
    setEditedTournaments(items);
  };

  if (loading) {
    return (
      <div className="text-center py-8">
        <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-600" />
        <p className="mt-2 text-gray-600">読み込み中...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex justify-between items-center">
        <p className="text-gray-600">
          このグループには{tournaments.length}個の大会が登録されています
        </p>
        <div className="flex gap-2">
          {editMode ? (
            <>
              <Button
                onClick={handleSaveChanges}
                disabled={saving}
                className="bg-green-600 hover:bg-green-700"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                変更を保存
              </Button>
              <Button
                onClick={() => {
                  setEditMode(false);
                  setEditedTournaments(tournaments);
                }}
                variant="outline"
              >
                <X className="h-4 w-4 mr-2" />
                キャンセル
              </Button>
            </>
          ) : (
            <>
              <Button onClick={() => setShowAddModal(true)} variant="outline">
                <Plus className="h-4 w-4 mr-2" />
                大会を追加
              </Button>
              {tournaments.length > 0 && (
                <Button onClick={() => setEditMode(true)} variant="outline">
                  編集モード
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {tournaments.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <p className="text-gray-600">
            まだ大会が登録されていません
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {(editMode ? editedTournaments : tournaments).map((tournament, index) => (
            <div
              key={tournament.tournament_id}
              className="border rounded-lg p-4 hover:shadow-md transition-shadow"
              draggable={editMode}
              onDragStart={(e) => e.dataTransfer.setData('index', index.toString())}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const fromIndex = parseInt(e.dataTransfer.getData('index'));
                moveItem(fromIndex, index);
              }}
            >
              <div className="flex items-start gap-4">
                {editMode && (
                  <div className="mt-2 cursor-move">
                    <GripVertical className="h-5 w-5 text-gray-400" />
                  </div>
                )}
                
                <div className="flex-1">
                  {editMode ? (
                    <div className="mb-3">
                      <Label htmlFor={`category-${tournament.tournament_id}`}>
                        カテゴリー名
                      </Label>
                      <Input
                        id={`category-${tournament.tournament_id}`}
                        value={tournament.category_name || ''}
                        onChange={(e) => {
                          const updated = editedTournaments.map(t =>
                            t.tournament_id === tournament.tournament_id
                              ? { ...t, category_name: e.target.value }
                              : t
                          );
                          setEditedTournaments(updated);
                        }}
                        placeholder="例: U-10の部"
                        className="mt-1"
                      />
                    </div>
                  ) : (
                    <h4 className="font-semibold text-lg mb-2">
                      {tournament.category_name || tournament.tournament_name}
                    </h4>
                  )}
                  
                  <p className="text-sm text-gray-600 mb-2">{tournament.tournament_name}</p>
                  
                  <div className="flex flex-wrap gap-3 text-sm text-gray-600">
                    <span className="flex items-center gap-1">
                      <Trophy className="h-4 w-4" />
                      {tournament.format_name}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="h-4 w-4" />
                      {tournament.team_count || 0}チーム
                    </span>
                    {tournament.tournament_dates && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        {(() => {
                          try {
                            const dates = JSON.parse(tournament.tournament_dates);
                            if (Array.isArray(dates)) {
                              return dates.map((d: { date: string }) => d.date).join(', ');
                            } else if (typeof dates === 'object' && dates !== null) {
                              return Object.values(dates).join(', ');
                            }
                            return tournament.tournament_dates;
                          } catch {
                            return tournament.tournament_dates;
                          }
                        })()}
                      </span>
                    )}
                    {tournament.venue_name && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-4 w-4" />
                        {tournament.venue_name}
                      </span>
                    )}
                  </div>
                </div>

                {!editMode && (
                  <div className="flex items-center gap-2">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/admin/tournaments/${tournament.tournament_id}`}>
                        詳細
                      </Link>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleRemoveTournament(
                        tournament.tournament_id,
                        tournament.tournament_name
                      )}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 大会追加モーダル */}
      {showAddModal && (
        <div className="fixed inset-0 bg-white bg-opacity-80 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 max-w-4xl w-full mx-4 shadow-2xl border border-gray-200">
            <h3 className="text-xl font-semibold mb-6">大会をグループに追加</h3>
            
            {availableTournaments.length === 0 ? (
              <p className="text-gray-600 mb-4">
                グループに追加可能な大会がありません
              </p>
            ) : (
              <>
                <div className="mb-4">
                  <Label>追加する大会を選択（複数選択可能）</Label>
                  <div className="mt-2 max-h-80 overflow-y-auto border border-gray-300 rounded-md p-3 space-y-2">
                    {availableTournaments.map(tournament => (
                      <label
                        key={tournament.tournament_id}
                        className="flex items-start gap-3 p-3 rounded border hover:bg-gray-50 hover:border-blue-300 cursor-pointer transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={selectedTournamentIds.includes(tournament.tournament_id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedTournamentIds([...selectedTournamentIds, tournament.tournament_id]);
                            } else {
                              setSelectedTournamentIds(selectedTournamentIds.filter(id => id !== tournament.tournament_id));
                            }
                          }}
                          className="mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <div className="flex-1">
                          <div className="font-medium text-base">{tournament.tournament_name}</div>
                          <div className="text-sm text-gray-500 mt-1">
                            <span className="inline-flex items-center gap-1">
                              <span>{tournament.format_name}</span>
                              <span>•</span>
                              <span>{tournament.team_count}チーム</span>
                              {tournament.venue_name && (
                                <>
                                  <span>•</span>
                                  <span>{tournament.venue_name}</span>
                                </>
                              )}
                            </span>
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                  {selectedTournamentIds.length > 0 && (
                    <p className="mt-2 text-sm text-blue-600">
                      {selectedTournamentIds.length}個の大会が選択されています
                    </p>
                  )}
                </div>
              </>
            )}

            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setShowAddModal(false);
                  setSelectedTournamentIds([]);
                }}
              >
                キャンセル
              </Button>
              {availableTournaments.length > 0 && (
                <Button
                  onClick={handleAddTournaments}
                  disabled={selectedTournamentIds.length === 0 || saving}
                  variant="outline"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4 mr-2" />
                  )}
                  {selectedTournamentIds.length > 0 ? `${selectedTournamentIds.length}個追加` : '追加'}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}