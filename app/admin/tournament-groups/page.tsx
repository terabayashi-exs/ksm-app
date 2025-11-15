'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { Plus, Calendar, Users, MapPin, Trash2 } from 'lucide-react';

interface TournamentGroup {
  group_id: number;
  group_name: string;
  organizer: string | null;
  venue_name: string | null;
  event_start_date: string | null;
  event_end_date: string | null;
  recruitment_start_date: string | null;
  recruitment_end_date: string | null;
  visibility: string;
  division_count: number;
  created_at: string;
}

export default function TournamentGroupsList() {
  const router = useRouter();
  const [tournamentGroups, setTournamentGroups] = useState<TournamentGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingGroupId, setDeletingGroupId] = useState<number | null>(null);

  useEffect(() => {
    const fetchTournamentGroups = async () => {
      try {
        const response = await fetch('/api/tournament-groups?include_inactive=true');
        const data = await response.json();

        if (data.success) {
          setTournamentGroups(data.data);
        } else {
          setError(data.error || '大会一覧の取得に失敗しました');
        }
      } catch (err) {
        console.error('大会取得エラー:', err);
        setError('大会一覧の取得中にエラーが発生しました');
      } finally {
        setLoading(false);
      }
    };

    fetchTournamentGroups();
  }, []);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('ja-JP');
  };

  const formatDateRange = (startDate: string | null, endDate: string | null) => {
    if (!startDate && !endDate) return '-';
    if (!endDate) return formatDate(startDate);
    if (startDate === endDate) return formatDate(startDate);
    const start = formatDate(startDate);
    const end = formatDate(endDate);
    return `${start} 〜 ${end}`;
  };

  const handleDeleteGroup = async (group: TournamentGroup, e: React.MouseEvent) => {
    e.stopPropagation(); // カードのクリックイベントを防止

    const confirmMessage = `大会「${group.group_name}」を削除しますか？\n\n⚠️ この操作は取り消せません。以下が削除されます：\n・所属する${group.division_count}件の部門\n・各部門の試合データ\n・チーム・選手情報\n・その他関連データ`;

    if (!window.confirm(confirmMessage)) {
      return;
    }

    setDeletingGroupId(group.group_id);
    setError(null);

    try {
      const response = await fetch(`/api/tournament-groups/${group.group_id}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (data.success) {
        // リストから削除されたグループを除去
        setTournamentGroups(prev => prev.filter(g => g.group_id !== group.group_id));

        // 成功メッセージを表示
        alert(data.message || '大会を削除しました');
      } else {
        setError(data.error || '大会の削除に失敗しました');
      }
    } catch (err) {
      console.error('削除エラー:', err);
      setError('大会の削除中にエラーが発生しました');
    } finally {
      setDeletingGroupId(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-muted-foreground">読み込み中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-card shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-foreground">大会一覧</h1>
              <p className="text-sm text-muted-foreground mt-1">
                大会の管理を行います（各大会に複数の部門を作成できます）
              </p>
            </div>
            <div className="flex space-x-3">
              <Button
                variant="outline"
                onClick={() => router.push('/admin')}
              >
                ダッシュボードに戻る
              </Button>
              <Button asChild>
                <Link href="/admin/tournament-groups/create">
                  <Plus className="w-4 h-4 mr-2" />
                  大会作成
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex justify-between items-center">
              <span>大会一覧</span>
              <span className="text-sm font-normal text-muted-foreground">
                全{tournamentGroups.length}件
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {tournamentGroups.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground mb-4">大会が登録されていません</p>
                <Button asChild>
                  <Link href="/admin/tournament-groups/create">
                    <Plus className="w-4 h-4 mr-2" />
                    最初の大会を作成
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {tournamentGroups.map((group) => (
                  <Card
                    key={group.group_id}
                    className="hover:shadow-md transition-shadow cursor-pointer"
                    onClick={() => router.push(`/admin/tournament-groups/${group.group_id}`)}
                  >
                    <CardContent className="p-6">
                      <div className="space-y-3">
                        <div className="flex items-start justify-between">
                          <h3 className="text-lg font-bold text-foreground">
                            {group.group_name}
                          </h3>
                          <div className="flex items-center space-x-2">
                            <Badge variant={group.visibility === 'open' ? 'default' : 'secondary'}>
                              {group.visibility === 'open' ? '公開' : '非公開'}
                            </Badge>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => handleDeleteGroup(group, e)}
                              disabled={deletingGroupId === group.group_id}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              {deletingGroupId === group.group_id ? (
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600"></div>
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </div>

                        {group.organizer && (
                          <p className="text-sm text-muted-foreground">
                            主催: {group.organizer}
                          </p>
                        )}

                        {group.venue_name && (
                          <div className="flex items-center text-sm text-muted-foreground">
                            <MapPin className="w-4 h-4 mr-2" />
                            {group.venue_name}
                          </div>
                        )}

                        <div className="flex items-center text-sm text-muted-foreground">
                          <Calendar className="w-4 h-4 mr-2" />
                          {formatDateRange(group.event_start_date, group.event_end_date)}
                        </div>

                        <div className="flex items-center text-sm text-muted-foreground">
                          <Users className="w-4 h-4 mr-2" />
                          {group.division_count}部門
                        </div>

                        <div className="text-xs text-muted-foreground border-t pt-2">
                          作成日: {formatDate(group.created_at)}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
