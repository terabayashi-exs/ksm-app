'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import Image from 'next/image';
import { CalendarDays, MapPin, Clock, Trophy, Eye, ChevronDown, ChevronUp } from 'lucide-react';
import { getStatusLabel, type TournamentStatus } from '@/lib/tournament-status';

interface Tournament {
  tournament_id: number;
  tournament_name: string;
  category_name: string;
  event_start_date: string | null;
  event_end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  venue_id: number;
  venue_name: string;
  format_id: number;
  format_name: string;
  team_count: number;
  status: string;
  is_archived: boolean;
  organization_name: string | null;
  logo_blob_url: string | null;
  permissions: Record<string, boolean>;
  assigned_by_login_user_id: number | null;
  assigned_by_name: string | null;
  confirmed_count: number;
  waitlisted_count: number;
  cancelled_count: number;
  withdrawal_requested_count: number;
}

interface TournamentGroup {
  group: {
    group_id: number;
    group_name: string | null;
    group_description: string | null;
    group_color: string | null;
    display_order: number;
    admin_name: string | null;
  };
  tournaments: Tournament[];
}

interface OperatorTournamentsData {
  grouped: Record<string, TournamentGroup>;
  ungrouped: Tournament[];
  total: number;
}

interface ApiResponse {
  success: boolean;
  data?: OperatorTournamentsData;
  error?: string;
}

export default function OperatorTournamentList() {
  const [data, setData] = useState<OperatorTournamentsData>({
    grouped: {},
    ungrouped: [],
    total: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<number>>(new Set());

  useEffect(() => {
    const fetchTournaments = async () => {
      try {
        const response = await fetch('/api/operators/tournaments');
        const result: ApiResponse = await response.json();

        if (result.success && result.data) {
          setData(result.data);
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

    fetchTournaments();
  }, []);

  const toggleGroupCollapse = (groupId: number) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
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
              <span>{tournament.format_name}</span>
            </div>
            {tournament.organization_name && (
              <div className="flex items-center text-xs text-gray-500 mt-1">
                <span>主催: {tournament.organization_name}</span>
              </div>
            )}
            {tournament.assigned_by_name && (
              <div className="flex items-center text-xs text-blue-600 mt-1">
                <span>招待元: {tournament.assigned_by_name}</span>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <div className={`px-3 py-1 rounded-full text-xs font-medium ${
              tournament.status === 'planning'
                ? 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-300'
                : tournament.status === 'recruiting'
                ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300'
                : tournament.status === 'before_event'
                ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300'
                : tournament.status === 'ongoing'
                ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300'
                : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
            }`}>
              {getStatusLabel(tournament.status as TournamentStatus)}
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
          {(!tournament.start_time || !tournament.end_time) && (tournament.status === 'planning' || tournament.status === 'recruiting' || tournament.status === 'before_event') && (
            <div className="flex items-center text-sm text-gray-500">
              <Clock className="w-4 h-4 mr-2" />
              <span>試合時刻未設定</span>
            </div>
          )}
          <div className="flex items-center text-sm text-gray-600">
            <MapPin className="w-4 h-4 mr-2" />
            <span>{tournament.venue_name}</span>
          </div>

          {/* 参加状況詳細 */}
          {((tournament.confirmed_count ?? 0) > 0 || (tournament.waitlisted_count ?? 0) > 0 || (tournament.withdrawal_requested_count ?? 0) > 0 || (tournament.cancelled_count ?? 0) > 0) && (
            <div className="mt-3">
              <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">参加状況</div>
              <div className="grid grid-cols-5 gap-2">
                {/* 想定チーム数 */}
                <div className="p-2 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800 text-center">
                  <div className="text-xs text-blue-700 dark:text-blue-400 font-medium mb-1">想定チーム数</div>
                  <div className="text-lg font-bold text-blue-700 dark:text-blue-400">{tournament.team_count}</div>
                </div>
                {/* 参加確定 */}
                <div className="p-2 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-800 text-center">
                  <div className="text-xs text-green-700 dark:text-green-400 font-medium mb-1">参加確定</div>
                  <div className="text-lg font-bold text-green-700 dark:text-green-400">{tournament.confirmed_count || 0}</div>
                </div>
                {/* キャンセル待ち */}
                <div className="p-2 bg-orange-50 dark:bg-orange-950/20 rounded-lg border border-orange-200 dark:border-orange-800 text-center">
                  <div className="text-xs text-orange-700 dark:text-orange-400 font-medium mb-1">キャンセル待ち</div>
                  <div className="text-lg font-bold text-orange-700 dark:text-orange-400">{tournament.waitlisted_count || 0}</div>
                </div>
                {/* 辞退申請中 */}
                <div className="p-2 bg-yellow-50 dark:bg-yellow-950/20 rounded-lg border border-yellow-200 dark:border-yellow-800 text-center">
                  <div className="text-xs text-yellow-700 dark:text-yellow-400 font-medium mb-1">辞退申請中</div>
                  <div className="text-lg font-bold text-yellow-700 dark:text-yellow-400">{tournament.withdrawal_requested_count || 0}</div>
                </div>
                {/* キャンセル済 */}
                <div className="p-2 bg-gray-50 dark:bg-gray-950/20 rounded-lg border border-gray-200 dark:border-gray-800 text-center">
                  <div className="text-xs text-gray-700 dark:text-gray-400 font-medium mb-1">キャンセル済</div>
                  <div className="text-lg font-bold text-gray-700 dark:text-gray-400">{tournament.cancelled_count || 0}</div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2 flex-wrap">
          <Button asChild size="sm" variant="outline" className="text-sm hover:border-blue-300 hover:bg-blue-50">
            <Link href={`/admin/tournaments/${tournament.tournament_id}`}>
              <Eye className="w-4 h-4 mr-1" />
              詳細
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );

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

  if (data.total === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Trophy className="h-12 w-12 mx-auto mb-4 opacity-30" />
        <p className="text-lg font-medium text-foreground">アクセス可能な大会がありません</p>
        <p className="text-sm mt-2">管理者から大会へのアクセス権を付与されるとここに表示されます</p>
      </div>
    );
  }

  // グループをdisplay_order順にソート
  const sortedGroups = Object.values(data.grouped).sort((a, b) =>
    a.group.display_order - b.group.display_order
  );

  return (
    <div className="space-y-6">
      {/* グループ化された大会 */}
      {sortedGroups.map(({ group, tournaments }) => {
        const isCollapsed = collapsedGroups.has(group.group_id);
        const groupColor = group.group_color || '#3b82f6';

        return (
          <div key={group.group_id} className="space-y-4">
            <div
              className="flex items-center justify-between p-4 rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
              style={{ backgroundColor: `${groupColor}15`, borderLeft: `4px solid ${groupColor}` }}
              onClick={() => toggleGroupCollapse(group.group_id)}
            >
              <div>
                <h3 className="text-xl font-bold text-foreground">
                  {group.group_name || `グループ ${group.group_id}`}
                </h3>
                {group.group_description && (
                  <p className="text-sm text-muted-foreground mt-1">{group.group_description}</p>
                )}
                {group.admin_name && (
                  <p className="text-xs text-muted-foreground mt-1">主催者: {group.admin_name}</p>
                )}
                <p className="text-sm text-muted-foreground mt-1">{tournaments.length}部門</p>
              </div>
              <div className="flex items-center gap-2">
                {isCollapsed ? <ChevronDown className="h-5 w-5" /> : <ChevronUp className="h-5 w-5" />}
              </div>
            </div>

            {!isCollapsed && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pl-4">
                {tournaments.map((tournament) => (
                  <TournamentCard key={tournament.tournament_id} tournament={tournament} />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* グループ化されていない大会 */}
      {data.ungrouped.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-xl font-bold text-foreground">その他の大会</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {data.ungrouped.map((tournament) => (
              <TournamentCard key={tournament.tournament_id} tournament={tournament} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
