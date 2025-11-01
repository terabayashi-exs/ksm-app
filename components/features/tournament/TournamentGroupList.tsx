'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { Edit, Trash2, FolderOpen, Loader2, ChevronDown, ChevronUp } from 'lucide-react';

interface TournamentGroup {
  group_id: number;
  group_name: string;
  group_description?: string;
  group_color: string;
  display_order: number;
  tournament_count: number;
  ongoing_count: number;
  completed_count: number;
  created_at: string;
  updated_at: string;
}

export default function TournamentGroupList() {
  const [groups, setGroups] = useState<TournamentGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  useEffect(() => {
    fetchGroups();
  }, []);

  const fetchGroups = async () => {
    try {
      const response = await fetch('/api/tournament-groups');
      const result = await response.json();

      if (result.success) {
        setGroups(result.data);
      } else {
        setError(result.error || 'グループの取得に失敗しました');
      }
    } catch (err) {
      console.error('グループ取得エラー:', err);
      setError('ネットワークエラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteGroup = async (group: TournamentGroup) => {
    if (group.tournament_count > 0) {
      alert(`このグループには${group.tournament_count}個の大会が登録されています。\n先に大会のグループを解除してください。`);
      return;
    }

    if (!confirm(`グループ「${group.group_name}」を削除してもよろしいですか？`)) {
      return;
    }

    setDeleting(group.group_id);

    try {
      const response = await fetch(`/api/tournament-groups/${group.group_id}`, {
        method: 'DELETE',
      });

      const result = await response.json();

      if (result.success) {
        setGroups(groups.filter(g => g.group_id !== group.group_id));
        alert('グループを削除しました');
      } else {
        alert(`削除エラー: ${result.error}`);
      }
    } catch (err) {
      console.error('削除エラー:', err);
      alert('削除中にエラーが発生しました');
    } finally {
      setDeleting(null);
    }
  };

  const handleReorder = async (groupId: number, direction: 'up' | 'down') => {
    const currentIndex = groups.findIndex(g => g.group_id === groupId);
    if (currentIndex === -1) return;

    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= groups.length) return;

    // ローカルで並び替え
    const newGroups = [...groups];
    const [removed] = newGroups.splice(currentIndex, 1);
    newGroups.splice(newIndex, 0, removed);
    
    // display_orderを更新
    const updatedGroups = newGroups.map((group, index) => ({
      ...group,
      display_order: index
    }));
    
    setGroups(updatedGroups);

    // APIを呼び出して更新
    try {
      await fetch(`/api/tournament-groups/${groupId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...groups.find(g => g.group_id === groupId),
          display_order: newIndex
        })
      });
    } catch (err) {
      console.error('並び替えエラー:', err);
      fetchGroups(); // エラー時は再読み込み
    }
  };

  if (loading) {
    return (
      <div className="text-center py-8">
        <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-600" />
        <p className="mt-2 text-gray-600">グループを読み込み中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-600">{error}</p>
        <Button onClick={fetchGroups} className="mt-4" variant="outline">
          再読み込み
        </Button>
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="text-center py-12">
        <FolderOpen className="h-12 w-12 mx-auto text-gray-400 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          グループがまだ作成されていません
        </h3>
        <p className="text-gray-600 mb-6">
          新しいグループを作成して、関連する大会をまとめて管理しましょう
        </p>
        <Button asChild variant="outline">
          <Link href="/admin/tournament-groups/create">
            グループを作成
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((group, index) => (
        <div
          key={group.group_id}
          className="border rounded-lg p-6 hover:shadow-md transition-shadow"
          style={{ borderLeftColor: group.group_color, borderLeftWidth: '4px' }}
        >
          <div className="flex justify-between items-start mb-3">
            <div>
              <h3 className="text-xl font-bold">{group.group_name}</h3>
              {group.group_description && (
                <p className="text-gray-600 mt-1">{group.group_description}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className="flex flex-col gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleReorder(group.group_id, 'up')}
                  disabled={index === 0}
                  className="h-6 px-2"
                >
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleReorder(group.group_id, 'down')}
                  disabled={index === groups.length - 1}
                  className="h-6 px-2"
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 mb-4">
            <Badge variant="outline">
              {group.tournament_count}個の大会
            </Badge>
            {group.ongoing_count > 0 && (
              <Badge className="bg-green-100 text-green-800">
                {group.ongoing_count}個開催中
              </Badge>
            )}
            {group.completed_count > 0 && (
              <Badge className="bg-gray-100 text-gray-800">
                {group.completed_count}個完了
              </Badge>
            )}
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button asChild size="sm" variant="outline">
              <Link href={`/admin/tournament-groups/${group.group_id}/edit`}>
                <Edit className="h-4 w-4 mr-2" />
                編集
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href={`/admin/tournament-groups/${group.group_id}`}>
                <FolderOpen className="h-4 w-4 mr-2" />
                大会管理
              </Link>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleDeleteGroup(group)}
              disabled={deleting === group.group_id || group.tournament_count > 0}
              className="border-red-200 text-red-600 hover:border-red-300 hover:bg-red-50"
            >
              {deleting === group.group_id ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  削除中...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  削除
                </>
              )}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}