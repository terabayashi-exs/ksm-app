'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tournament } from '@/lib/types';
import Link from 'next/link';
import Image from 'next/image';
import { CalendarDays, MapPin, Users, Clock, Trophy, Trash2, Archive, Plus } from 'lucide-react';

interface GroupedTournamentData {
  grouped: Record<string, {
    group: {
      group_id: number;
      group_name: string | null;
      group_description: string | null;
      group_color: string | null;
      display_order: number;
    };
    tournaments: Tournament[];
  }>;
  ungrouped: Tournament[];
}

interface TournamentDashboardData {
  recruiting: Tournament[];
  ongoing: Tournament[];
  completed: Tournament[];
  total: number;
  grouped: {
    recruiting: GroupedTournamentData;
    ongoing: GroupedTournamentData;
    completed: GroupedTournamentData;
  };
}

interface ApiResponse {
  success: boolean;
  data?: TournamentDashboardData;
  error?: string;
}

export default function TournamentDashboardList() {
  const [tournaments, setTournaments] = useState<TournamentDashboardData>({
    recruiting: [],
    ongoing: [],
    completed: [],
    total: 0,
    grouped: {
      recruiting: { grouped: {}, ungrouped: [] },
      ongoing: { grouped: {}, ungrouped: [] },
      completed: { grouped: {}, ungrouped: [] }
    }
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [archiving, setArchiving] = useState<number | null>(null);
  const [notificationCounts, setNotificationCounts] = useState<Record<number, number>>({});

  useEffect(() => {
    const fetchTournaments = async () => {
      try {
        const response = await fetch('/api/tournaments/dashboard');
        const result: ApiResponse = await response.json();
        
        if (result.success && result.data) {
          setTournaments(result.data);
        } else {
          setError(result.error || '大会データの取得に失敗しました');
        }
      } catch (err) {
        setError('ネットワークエラーが発生しました');
        console.error('大会取得エラー:', err);
      } finally {
        setLoading(false);
      }
    };

    const fetchNotificationCounts = async () => {
      try {
        const response = await fetch('/api/admin/notifications/counts');
        const result = await response.json();
        
        if (result.success) {
          setNotificationCounts(result.data);
        }
      } catch (err) {
        console.error('通知件数取得エラー:', err);
      }
    };

    fetchTournaments();
    fetchNotificationCounts();
  }, []);

  const handleDeleteTournament = async (tournament: Tournament) => {
    let confirmMessage;
    let deleteUrl;
    
    if (tournament.is_archived) {
      // アーカイブ済み大会の場合
      confirmMessage = `アーカイブ済み大会「${tournament.tournament_name}」を削除してもよろしいですか？\n\n⚠️ この操作は取り消せません。以下のデータが削除されます：\n・アーカイブ済みのデータベースデータ\n・JSONアーカイブデータ\n・Blobアーカイブデータ\n・大会メインレコード`;
      deleteUrl = `/api/admin/tournaments/${tournament.tournament_id}/delete-data`;
    } else {
      // 通常の大会の場合
      confirmMessage = `大会「${tournament.tournament_name}」を削除してもよろしいですか？\n\n⚠️ この操作は取り消せません。関連する以下のデータも全て削除されます：\n・参加チーム情報\n・選手情報\n・試合データ\n・結果データ`;
      deleteUrl = `/api/tournaments/${tournament.tournament_id}`;
    }
    
    if (!confirm(confirmMessage)) {
      return;
    }

    setDeleting(tournament.tournament_id);

    try {
      const response = await fetch(deleteUrl, {
        method: 'DELETE',
      });

      const result = await response.json();

      if (result.success) {
        // 削除成功時、リストから該当大会を除去
        setTournaments(prev => {
          const updatedRecruiting = prev.recruiting.filter(t => t.tournament_id !== tournament.tournament_id);
          const updatedOngoing = prev.ongoing.filter(t => t.tournament_id !== tournament.tournament_id);
          const updatedCompleted = prev.completed.filter(t => t.tournament_id !== tournament.tournament_id);

          // グループ化されたデータも更新
          const filterGroupedData = (groupedData: GroupedTournamentData): GroupedTournamentData => {
            const newGrouped: Record<string, {
              group: {
                group_id: number;
                group_name: string | null;
                group_description: string | null;
                group_color: string | null;
                display_order: number;
              };
              tournaments: Tournament[];
            }> = {};
            Object.entries(groupedData.grouped).forEach(([key, value]) => {
              const filteredTournaments = value.tournaments.filter(t => t.tournament_id !== tournament.tournament_id);
              if (filteredTournaments.length > 0) {
                newGrouped[key] = { ...value, tournaments: filteredTournaments };
              }
            });
            return {
              grouped: newGrouped,
              ungrouped: groupedData.ungrouped.filter(t => t.tournament_id !== tournament.tournament_id)
            };
          };

          return {
            recruiting: updatedRecruiting,
            ongoing: updatedOngoing,
            completed: updatedCompleted,
            total: prev.total - 1,
            grouped: {
              recruiting: filterGroupedData(prev.grouped.recruiting),
              ongoing: filterGroupedData(prev.grouped.ongoing),
              completed: filterGroupedData(prev.grouped.completed)
            }
          };
        });
        
        if (tournament.is_archived) {
          const mainDeleted = result.deletionSummary?.tournamentMainDeleted !== false;
          if (mainDeleted) {
            alert(`✅ アーカイブ済み大会を完全削除しました。\n\n【削除情報】\n• 削除されたレコード数: ${result.deletionSummary?.totalDeletedRecords || 'N/A'}\n• 削除ステップ: ${result.deletionSummary?.successfulSteps || 'N/A'}/${result.deletionSummary?.totalSteps || 'N/A'}\n• メインレコード削除: 成功\n• 実行時間: ${result.deletionSummary?.totalExecutionTime ? (result.deletionSummary.totalExecutionTime / 1000).toFixed(1) : 'N/A'}秒`);
          } else {
            alert(`⚠️ 部分削除完了\n\n関連データは削除されましたが、大会メインレコードが残存しています。\nもう一度削除ボタンを押すか、システム管理者にお問い合わせください。\n\n【削除情報】\n• 削除されたレコード数: ${result.deletionSummary?.totalDeletedRecords || 'N/A'}\n• メインレコード削除: 失敗`);
          }
        } else {
          alert(result.message || '大会を削除しました');
        }
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

  const handleArchiveTournament = async (tournament: Tournament) => {
    const confirmMessage = `大会「${tournament.tournament_name}」をアーカイブしますか？\n\nアーカイブすると：\n1. 現在のデータが完全に保存されます\n2. 関連するデータベースのデータが削除されます\n3. アーカイブページからのみ表示可能になります\n\n⚠️ この操作は取り消せません。\n事前にバックアップを作成することを推奨します。`;
    
    if (!confirm(confirmMessage)) {
      return;
    }

    setArchiving(tournament.tournament_id);

    try {
      // Step 1: アーカイブ作成
      console.log('Step 1: アーカイブ作成開始...');
      const archiveResponse = await fetch(`/api/tournaments/${tournament.tournament_id}/archive`, {
        method: 'POST',
      });

      const archiveResult = await archiveResponse.json();

      if (!archiveResult.success) {
        alert(`アーカイブエラー: ${archiveResult.error}`);
        return;
      }

      console.log('Step 1: アーカイブ作成完了');

      // Step 2: アーカイブ後クリーンアップ実行（大会メインレコードは保持）
      console.log('Step 2: アーカイブ後クリーンアップ開始...');
      const deleteResponse = await fetch(`/api/admin/tournaments/${tournament.tournament_id}/archive-cleanup`, {
        method: 'DELETE',
      });

      const deleteResult = await deleteResponse.json();

      if (deleteResult.success) {
        alert(`✅ アーカイブとクリーンアップが完了しました。\n\n【アーカイブ情報】\n• 大会名: ${tournament.tournament_name}\n• データサイズ: ${(archiveResult.data.file_size / 1024).toFixed(2)} KB\n• アーカイブ日時: ${archiveResult.data.archived_at}\n\n【クリーンアップ情報】\n• 削除されたレコード数: ${deleteResult.deletionSummary.totalDeletedRecords}\n• 削除ステップ: ${deleteResult.deletionSummary.successfulSteps}/${deleteResult.deletionSummary.totalSteps}\n• 実行時間: ${(deleteResult.deletionSummary.totalExecutionTime / 1000).toFixed(1)}秒\n• 大会メインレコード: 保持\n\n📄 アーカイブページ: /public/tournaments/${tournament.tournament_id}/archived`);
      } else {
        // アーカイブは成功したが削除に失敗
        alert(`⚠️ アーカイブは完了しましたが、クリーンアップでエラーが発生しました。\n\n【アーカイブ完了】\n• データサイズ: ${(archiveResult.data.file_size / 1024).toFixed(2)} KB\n• アーカイブ日時: ${archiveResult.data.archived_at}\n\n【クリーンアップエラー】\n${deleteResult.error}\n\n大会はアーカイブ状態になっていますが、関連データが残存している可能性があります。\n管理者ダッシュボードで「削除」ボタンから後で関連データを削除してください。`);
      }
      
      // いずれの場合もリストを更新
      const fetchTournaments = async () => {
        try {
          const response = await fetch('/api/tournaments/dashboard');
          const result: ApiResponse = await response.json();
          
          if (result.success && result.data) {
            setTournaments(result.data);
          }
        } catch (err) {
          console.error('大会リスト更新エラー:', err);
        }
      };

      const fetchNotificationCounts = async () => {
        try {
          const response = await fetch('/api/admin/notifications/counts');
          const result = await response.json();
          
          if (result.success) {
            setNotificationCounts(result.data);
          }
        } catch (err) {
          console.error('通知件数取得エラー:', err);
        }
      };
      
      fetchTournaments();
      fetchNotificationCounts();
    } catch (err) {
      console.error('アーカイブ・削除エラー:', err);
      alert('アーカイブ・削除処理中にエラーが発生しました');
    } finally {
      setArchiving(null);
    }
  };


  if (loading) {
    return (
      <div className="space-y-6">
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-gray-600">大会データを読み込み中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-6">
            <p className="text-red-600 text-center">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  // 通知件数を取得する関数
  const getNotificationCount = (tournamentId: number): number => {
    return notificationCounts[tournamentId] || 0;
  };

  // 通知があるかどうかをチェックする関数
  const hasNotifications = (tournamentId: number): boolean => {
    return getNotificationCount(tournamentId) > 0;
  };

  const TournamentCard = ({ tournament }: { tournament: Tournament }) => (
    <div className="border rounded-lg overflow-hidden hover:shadow-md transition-shadow relative">
      {/* 管理者ロゴ背景 */}
      {tournament.logo_blob_url && (
        <div className="absolute top-0 right-0 w-20 h-20 opacity-10 overflow-hidden">
          <Image
            src={tournament.logo_blob_url}
            alt={tournament.organization_name || '管理者ロゴ'}
            fill
            className="object-contain"
            sizes="80px"
          />
        </div>
      )}
      
      <div className="p-4 relative">
        <div className="flex justify-between items-start mb-3">
          <div>
            <h4 className="font-semibold text-lg text-gray-900">{tournament.tournament_name}</h4>
            <div className="flex items-center text-sm text-gray-600 mt-1">
              <Trophy className="w-4 h-4 mr-1" />
              <span>{tournament.format_name || `フォーマットID: ${tournament.format_id}`}</span>
            </div>
            {tournament.organization_name && (
              <div className="flex items-center text-xs text-gray-500 mt-1">
                <span>主催: {tournament.organization_name}</span>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <div className={`px-3 py-1 rounded-full text-xs font-medium ${
              tournament.status === 'ongoing'
                ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300'
                : tournament.status === 'planning'
                ? tournament.visibility === 1
                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300'
                  : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300'
                : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
            }`}>
              {tournament.status === 'ongoing' ? '開催中' : tournament.status === 'planning' ? (tournament.visibility === 1 ? '募集中' : '準備中') : '完了'}
            </div>
            {tournament.is_archived && (
              <div className="px-3 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300">
                アーカイブ済み
              </div>
            )}
          </div>
        </div>

        <div className="space-y-2 mb-4">
          <div className="flex items-center text-sm text-gray-600">
            <CalendarDays className="w-4 h-4 mr-2" />
            <span>
              {tournament.event_start_date ? formatDate(tournament.event_start_date) : '日程未定'}
              {tournament.event_end_date && tournament.event_end_date !== tournament.event_start_date && 
                ` - ${formatDate(tournament.event_end_date)}`
              }
            </span>
          </div>
          {tournament.start_time && tournament.end_time && (
            <div className="flex items-center text-sm text-gray-600">
              <Clock className="w-4 h-4 mr-2" />
              <span>{tournament.start_time} - {tournament.end_time}</span>
            </div>
          )}
          {(!tournament.start_time || !tournament.end_time) && tournament.status === 'planning' && (
            <div className="flex items-center text-sm text-gray-500">
              <Clock className="w-4 h-4 mr-2" />
              <span>試合時刻未設定</span>
            </div>
          )}
          <div className="flex items-center text-sm text-gray-600">
            <MapPin className="w-4 h-4 mr-2" />
            <span>{tournament.venue_name || `会場ID: ${tournament.venue_id}`}</span>
          </div>
          <div className="flex items-center text-sm text-gray-600">
            <Users className="w-4 h-4 mr-2" />
            <span>{tournament.team_count}チーム参加</span>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          <Button asChild size="sm" variant="outline" className="flex-1 hover:border-blue-300 hover:bg-blue-50">
            <Link href={`/admin/tournaments/${tournament.tournament_id}`}>
              詳細
            </Link>
          </Button>
          {!tournament.is_archived ? (
            <>
              <Button asChild size="sm" variant="outline" className="hover:border-blue-300 hover:bg-blue-50">
                <Link href={`/admin/tournaments/${tournament.tournament_id}/edit`}>
                  部門編集
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline" className="hover:border-green-300 hover:bg-green-50">
                <Link href={`/admin/tournaments/${tournament.tournament_id}/rules`}>
                  ルール設定
                </Link>
              </Button>
            </>
          ) : (
            // アーカイブ済み大会の場合は削除ボタンのみ表示
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => handleDeleteTournament(tournament)}
              disabled={deleting === tournament.tournament_id}
              className="border-red-200 text-red-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
            >
              {deleting === tournament.tournament_id ? (
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-red-600 mr-1"></div>
                  削除中...
                </div>
              ) : (
                <div className="flex items-center">
                  <Trash2 className="w-3 h-3 mr-1" />
                  削除
                </div>
              )}
            </Button>
          )}
          {tournament.status === 'planning' && !tournament.is_archived && (
            <>
              <Button asChild size="sm" variant="outline" className="hover:border-blue-300 hover:bg-blue-50">
                <Link href={`/admin/tournaments/${tournament.tournament_id}/teams`}>
                  チーム登録
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline" className="hover:border-blue-300 hover:bg-blue-50">
                <Link href={`/admin/tournaments/${tournament.tournament_id}/draw`}>
                  組合せ作成・編集
                </Link>
              </Button>
              <Button 
                asChild 
                size="sm" 
                variant={hasNotifications(tournament.tournament_id) ? "default" : "outline"}
                className={hasNotifications(tournament.tournament_id)
                  ? "bg-red-600 hover:bg-red-700"
                  : "hover:border-blue-300 hover:bg-blue-50"
                }
              >
                <Link href={`/admin/tournaments/${tournament.tournament_id}/matches`}>
                  試合管理
                  {hasNotifications(tournament.tournament_id) && (
                    <span className="ml-2 px-2 py-1 text-xs bg-red-200 text-red-800 rounded-full">
                      {getNotificationCount(tournament.tournament_id)}
                    </span>
                  )}
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline" className="hover:border-blue-300 hover:bg-blue-50">
                <Link href={`/admin/tournaments/${tournament.tournament_id}/manual-rankings`}>
                  順位設定
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline" className="hover:border-purple-300 hover:bg-purple-50">
                <Link href={`/admin/tournaments/${tournament.tournament_id}/files`}>
                  ファイル管理
                </Link>
              </Button>
              <Button 
                size="sm" 
                variant="outline" 
                onClick={() => handleDeleteTournament(tournament)}
                disabled={deleting === tournament.tournament_id}
                className="border-red-200 text-red-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
              >
                {deleting === tournament.tournament_id ? (
                  <div className="flex items-center">
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-red-600 mr-1"></div>
                    削除中...
                  </div>
                ) : (
                  <div className="flex items-center">
                    <Trash2 className="w-3 h-3 mr-1" />
                    削除
                  </div>
                )}
              </Button>
            </>
          )}
          {tournament.status === 'ongoing' && !tournament.is_archived && (
            <>
              <Button
                asChild
                size="sm"
                variant={hasNotifications(tournament.tournament_id) ? "default" : "outline"}
                className={hasNotifications(tournament.tournament_id)
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'hover:border-blue-300 hover:bg-blue-50'
                }
              >
                <Link href={`/admin/tournaments/${tournament.tournament_id}/matches`}>
                  試合管理
                  {hasNotifications(tournament.tournament_id) && (
                    <span className="ml-2 px-2 py-1 text-xs bg-red-200 text-red-800 rounded-full">
                      {getNotificationCount(tournament.tournament_id)}
                    </span>
                  )}
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline" className="hover:border-blue-300 hover:bg-blue-50">
                <Link href={`/admin/tournaments/${tournament.tournament_id}/manual-rankings`}>
                  順位設定
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline" className="hover:border-purple-300 hover:bg-purple-50">
                <Link href={`/admin/tournaments/${tournament.tournament_id}/files`}>
                  ファイル管理
                </Link>
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleDeleteTournament(tournament)}
                disabled={deleting === tournament.tournament_id}
                className="border-red-200 text-red-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
              >
                {deleting === tournament.tournament_id ? (
                  <div className="flex items-center">
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-red-600 mr-1"></div>
                    削除中...
                  </div>
                ) : (
                  <div className="flex items-center">
                    <Trash2 className="w-3 h-3 mr-1" />
                    削除
                  </div>
                )}
              </Button>
            </>
          )}
          {tournament.status === 'completed' && !tournament.is_archived && (
            <>
              <Button
                asChild
                size="sm"
                variant={hasNotifications(tournament.tournament_id) ? "default" : "outline"}
                className={hasNotifications(tournament.tournament_id)
                  ? "bg-red-600 hover:bg-red-700"
                  : "hover:border-blue-300 hover:bg-blue-50"
                }
              >
                <Link href={`/admin/tournaments/${tournament.tournament_id}/matches`}>
                  試合管理
                  {hasNotifications(tournament.tournament_id) && (
                    <span className="ml-2 px-2 py-1 text-xs bg-red-200 text-red-800 rounded-full">
                      {getNotificationCount(tournament.tournament_id)}
                    </span>
                  )}
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline" className="hover:border-blue-300 hover:bg-blue-50">
                <Link href={`/admin/tournaments/${tournament.tournament_id}/manual-rankings`}>
                  順位設定
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline" className="hover:border-purple-300 hover:bg-purple-50">
                <Link href={`/admin/tournaments/${tournament.tournament_id}/files`}>
                  ファイル管理
                </Link>
              </Button>
              {!tournament.is_archived && (
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={() => handleArchiveTournament(tournament)}
                  disabled={archiving === tournament.tournament_id}
                  className="border-orange-200 text-orange-600 hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700"
                >
                  {archiving === tournament.tournament_id ? (
                    <div className="flex items-center">
                      <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-orange-600 mr-1"></div>
                      アーカイブ中...
                    </div>
                  ) : (
                    <div className="flex items-center">
                      <Archive className="w-3 h-3 mr-1" />
                      アーカイブ
                    </div>
                  )}
                </Button>
              )}
              <Button 
                size="sm" 
                variant="outline" 
                onClick={() => handleDeleteTournament(tournament)}
                disabled={deleting === tournament.tournament_id}
                className="border-red-200 text-red-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
              >
                {deleting === tournament.tournament_id ? (
                  <div className="flex items-center">
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-red-600 mr-1"></div>
                    削除中...
                  </div>
                ) : (
                  <div className="flex items-center">
                    <Trash2 className="w-3 h-3 mr-1" />
                    削除
                  </div>
                )}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );

  const renderGroupedSection = (
    groupedData: GroupedTournamentData
  ) => {
    const groups = Object.values(groupedData.grouped);
    const ungroupedDivisions = groupedData.ungrouped;

    return (
      <>
        {/* グループ化された大会 */}
        {groups.map(({ group, tournaments: divisions }) => (
          <Card key={group.group_id} className="overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <CardTitle className="text-2xl mb-2">{group.group_name}</CardTitle>
                  {group.group_description && (
                    <p className="text-sm text-muted-foreground mb-3">
                      {group.group_description}
                    </p>
                  )}
                  <div className="flex items-center text-sm text-muted-foreground">
                    <Users className="h-4 w-4 mr-1" />
                    {divisions.length}部門
                  </div>
                </div>
                <div className="flex-shrink-0">
                  <Button
                    asChild
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white dark:bg-green-700 dark:hover:bg-green-600"
                  >
                    <Link href={`/admin/tournaments/create-new?group_id=${group.group_id}`}>
                      <Plus className="w-4 h-4 mr-1" />
                      部門作成
                    </Link>
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-foreground">所属部門</h4>
                <div className="grid gap-4">
                  {divisions.map((division) => (
                    <TournamentCard
                      key={division.tournament_id}
                      tournament={division}
                    />
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {/* グループに所属していない部門 */}
        {ungroupedDivisions.map((division) => (
          <TournamentCard
            key={division.tournament_id}
            tournament={division}
          />
        ))}
      </>
    );
  };

  return (
    <div className="space-y-6">
      {/* 開催中の大会 */}
      {tournaments.ongoing.length > 0 && (
        <>
          <div className="flex items-center text-green-700 mb-4">
            <Trophy className="w-5 h-5 mr-2" />
            <h3 className="text-xl font-bold">
              開催中の大会 ({Object.keys(tournaments.grouped.ongoing.grouped).length + tournaments.grouped.ongoing.ungrouped.length}件)
            </h3>
          </div>
          {renderGroupedSection(tournaments.grouped.ongoing)}
        </>
      )}

      {/* 募集中の大会 */}
      {tournaments.recruiting.length > 0 && (
        <>
          <div className="flex items-center text-blue-700 mb-4 mt-8">
            <CalendarDays className="w-5 h-5 mr-2" />
            <h3 className="text-xl font-bold">
              募集中の大会 ({Object.keys(tournaments.grouped.recruiting.grouped).length + tournaments.grouped.recruiting.ungrouped.length}件)
            </h3>
          </div>
          {renderGroupedSection(tournaments.grouped.recruiting)}
        </>
      )}

      {/* 完了した大会 */}
      {tournaments.completed.length > 0 && (
        <>
          <div className="flex items-center text-gray-700 mb-4 mt-8">
            <Trophy className="w-5 h-5 mr-2" />
            <h3 className="text-xl font-bold">
              完了した大会（過去1年以内） ({Object.keys(tournaments.grouped.completed.grouped).length + tournaments.grouped.completed.ungrouped.length}件)
            </h3>
          </div>
          {renderGroupedSection(tournaments.grouped.completed)}
        </>
      )}

      {/* 大会がない場合 */}
      {tournaments.total === 0 && (
        <Card>
          <CardContent className="text-center py-12">
            <Trophy className="w-12 h-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              現在、表示可能な大会はありません
            </h3>
            <p className="text-gray-600 mb-6">
              新しい大会を作成して参加チームの募集を開始しましょう
            </p>
            <Button asChild className="hover:bg-blue-600">
              <Link href="/admin/tournaments/create-new">
                大会作成
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}