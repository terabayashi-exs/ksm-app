// components/features/admin/ParticipantManagement.tsx
// 参加チーム統合管理コンポーネント

'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, Users, Clock, XCircle, CheckCircle } from 'lucide-react';
import ParticipantCard from './ParticipantCard';
import ParticipantActionsModal, { type ParticipantTeam, type ActionType } from './ParticipantActionsModal';

interface ParticipantStatistics {
  confirmed: number;
  waitlisted: number;
  withdrawal_requested: number;
  cancelled: number;
  total: number;
  max_teams: number;
}

interface TournamentInfo {
  tournament_id: number;
  tournament_name: string;
  team_count: number;
  status: string;
  format_name: string | null;
}

interface ParticipantData {
  participants: ParticipantTeam[];
  statistics: ParticipantStatistics;
  tournament: TournamentInfo;
}

interface ParticipantManagementProps {
  tournamentId: number;
}

export default function ParticipantManagement({ tournamentId }: ParticipantManagementProps) {
  const [data, setData] = useState<ParticipantData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('all');

  // モーダル関連
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<ParticipantTeam | null>(null);
  const [selectedAction, setSelectedAction] = useState<ActionType | null>(null);

  // データ取得
  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/admin/tournaments/${tournamentId}/participants`);
      const result = await response.json();

      if (result.success) {
        setData(result.data);
        setError(null);
      } else {
        setError(result.error || '参加チーム情報の取得に失敗しました');
      }
    } catch (err) {
      setError('参加チーム情報の取得中にエラーが発生しました');
      console.error('参加チーム取得エラー:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId]);

  // アクション実行
  const handleAction = (team: ParticipantTeam, action: ActionType) => {
    setSelectedTeam(team);
    setSelectedAction(action);
    setModalOpen(true);
  };

  // アクション送信
  const handleSubmitAction = async (
    tournamentTeamId: number,
    action: ActionType,
    adminComment: string
  ) => {
    try {
      const response = await fetch(`/api/admin/tournaments/${tournamentId}/participants`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tournament_team_id: tournamentTeamId,
          action,
          admin_comment: adminComment
        })
      });

      const result = await response.json();

      if (result.success) {
        // データ再取得
        await fetchData();
      } else {
        throw new Error(result.error || '操作に失敗しました');
      }
    } catch (error) {
      console.error('アクション実行エラー:', error);
      throw error;
    }
  };

  // フィルタリング
  const getFilteredParticipants = () => {
    if (!data) return [];

    switch (activeTab) {
      case 'all':
        return data.participants;
      case 'confirmed':
        return data.participants.filter(p => p.participation_status === 'confirmed');
      case 'waitlisted':
        return data.participants.filter(p => p.participation_status === 'waitlisted');
      case 'withdrawal_requested':
        return data.participants.filter(p => p.withdrawal_status === 'withdrawal_requested');
      case 'cancelled':
        return data.participants.filter(p => p.participation_status === 'cancelled');
      default:
        return data.participants;
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>{error || 'データの読み込みに失敗しました'}</AlertDescription>
      </Alert>
    );
  }

  const filteredParticipants = getFilteredParticipants();
  const stats = data.statistics;

  return (
    <div className="space-y-6">
      {/* 統計サマリー */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-6 w-6" />
            参加チーム統計
          </CardTitle>
          <CardDescription>
            {data.tournament.tournament_name} の参加チーム状況
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-green-50 p-4 rounded-lg border border-green-200">
              <div className="text-sm text-green-700 mb-1">参加確定</div>
              <div className="text-3xl font-bold text-green-600">
                {stats.confirmed}
                <span className="text-sm font-normal text-muted-foreground ml-1">
                  / {stats.max_teams}
                </span>
              </div>
            </div>

            <div className="bg-amber-50 p-4 rounded-lg border border-amber-200">
              <div className="text-sm text-amber-700 mb-1">キャンセル待ち</div>
              <div className="text-3xl font-bold text-amber-600">{stats.waitlisted}</div>
            </div>

            <div className="bg-red-50 p-4 rounded-lg border border-red-200">
              <div className="text-sm text-red-700 mb-1 flex items-center gap-1">
                辞退申請中
                {stats.withdrawal_requested > 0 && (
                  <span className="h-2 w-2 bg-red-500 rounded-full animate-pulse"></span>
                )}
              </div>
              <div className="text-3xl font-bold text-red-600">{stats.withdrawal_requested}</div>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
              <div className="text-sm text-gray-700 mb-1">キャンセル済み</div>
              <div className="text-3xl font-bold text-gray-600">{stats.cancelled}</div>
            </div>

            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <div className="text-sm text-blue-700 mb-1">総エントリー</div>
              <div className="text-3xl font-bold text-blue-600">{stats.total}</div>
            </div>
          </div>

          {/* 空き状況 */}
          {stats.confirmed < stats.max_teams ? (
            <Alert className="mt-4 bg-blue-50 border-blue-200">
              <AlertDescription className="text-blue-800">
                現在の空き枠: <span className="font-bold">{stats.max_teams - stats.confirmed}</span> チーム
                {stats.waitlisted > 0 && (
                  <span className="ml-2">
                    （キャンセル待ち {stats.waitlisted} チームを繰り上げ可能）
                  </span>
                )}
              </AlertDescription>
            </Alert>
          ) : (
            <Alert className="mt-4 bg-amber-50 border-amber-200">
              <AlertDescription className="text-amber-800">
                ✓ 参加枠が満員です
                {stats.waitlisted > 0 && (
                  <span className="ml-2">
                    （キャンセル待ち {stats.waitlisted} チーム）
                  </span>
                )}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* タブフィルター */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="all" className="relative">
            全て ({stats.total})
          </TabsTrigger>
          <TabsTrigger value="confirmed" className="relative">
            <CheckCircle className="h-4 w-4 mr-1" />
            確定 ({stats.confirmed})
          </TabsTrigger>
          <TabsTrigger value="waitlisted" className="relative">
            <Clock className="h-4 w-4 mr-1" />
            待機 ({stats.waitlisted})
          </TabsTrigger>
          <TabsTrigger value="withdrawal_requested" className="relative">
            <AlertTriangle className="h-4 w-4 mr-1" />
            辞退申請 ({stats.withdrawal_requested})
            {stats.withdrawal_requested > 0 && (
              <span className="absolute -top-1 -right-1 h-3 w-3 bg-red-500 rounded-full animate-pulse" />
            )}
          </TabsTrigger>
          <TabsTrigger value="cancelled" className="relative">
            <XCircle className="h-4 w-4 mr-1" />
            キャンセル ({stats.cancelled})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-6">
          {filteredParticipants.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center text-muted-foreground py-8">
                  該当するチームがありません
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {filteredParticipants.map((team) => (
                <ParticipantCard
                  key={team.tournament_team_id}
                  team={team}
                  onAction={handleAction}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* アクションモーダル */}
      <ParticipantActionsModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setSelectedTeam(null);
          setSelectedAction(null);
        }}
        team={selectedTeam}
        action={selectedAction}
        onSubmit={handleSubmitAction}
      />
    </div>
  );
}
