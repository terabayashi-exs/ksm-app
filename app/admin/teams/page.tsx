'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { 
  ArrowLeft, 
  Users, 
  Calendar, 
  Trophy, 
  MapPin, 
  Search,
  UserCheck,
  Mail,
  Phone,
  Crown
} from 'lucide-react';

interface Tournament {
  tournament_id: number;
  tournament_name: string;
  status: string;
  calculated_status: string;
  team_count: number;
  created_at: string;
  event_start_date?: string;
  venue_name?: string;
  format_name?: string;
  visibility?: number;
}

interface TeamData {
  tournament_team_id: number;
  team_id: string;
  team_name: string;
  team_omission?: string;
  contact_person: string;
  contact_email: string;
  contact_phone?: string;
  registration_type: 'self_registered' | 'admin_proxy';
  withdrawal_status: string;
  joined_at: string;
  player_count: number;
  players: PlayerData[];
}

interface PlayerData {
  tournament_player_id: number;
  player_id: string;
  player_name: string;
  jersey_number?: number;
  position?: string;
}

export default function AdminTeamsPage() {
  const router = useRouter();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedTournamentId, setSelectedTournamentId] = useState<number | null>(null);
  const [teams, setTeams] = useState<TeamData[]>([]);
  const [loading, setLoading] = useState(true);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [tournamentSearchTerm, setTournamentSearchTerm] = useState('');

  useEffect(() => {
    fetchTournaments();
  }, []);

  const fetchTournaments = async () => {
    try {
      console.log('[ADMIN_TEAMS] Fetching tournaments...');
      const response = await fetch('/api/admin/tournaments/active', {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      console.log('[ADMIN_TEAMS] Response status:', response.status);
      const data = await response.json();
      console.log('[ADMIN_TEAMS] Response data:', data);
      
      if (data.success) {
        setTournaments(data.data || []);
        console.log('[ADMIN_TEAMS] Tournaments loaded successfully:', data.data?.length || 0);
      } else {
        console.error('[ADMIN_TEAMS] API error:', data.error);
        if (data.details) {
          console.error('[ADMIN_TEAMS] Error details:', data.details);
        }
        // ユーザーにエラーを表示
        alert(`大会データの取得に失敗しました: ${data.error}\n${data.details || ''}`);
      }
    } catch (error) {
      console.error('[ADMIN_TEAMS] Network or parsing error:', error);
      alert(`ネットワークエラーが発生しました: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const fetchTeamsForTournament = async (tournamentId: number) => {
    setTeamsLoading(true);
    try {
      const response = await fetch(`/api/admin/tournaments/${tournamentId}/teams`);
      const data = await response.json();
      
      if (data.success) {
        setTeams(data.data || []);
      } else {
        console.error('チーム一覧取得エラー:', data.error);
        if (data.details) {
          console.error('エラー詳細:', data.details);
        }
        alert(`チーム一覧の取得に失敗しました: ${data.error}\n${data.details || ''}`);
        setTeams([]);
      }
    } catch (error) {
      console.error('チーム一覧取得エラー:', error);
      setTeams([]);
    } finally {
      setTeamsLoading(false);
    }
  };

  const handleTournamentSelect = (tournamentId: number) => {
    setSelectedTournamentId(tournamentId);
    fetchTeamsForTournament(tournamentId);
  };

  const getStatusBadge = (tournament: Tournament) => {
    const status = tournament.calculated_status || tournament.status;
    const visibility = tournament.visibility;
    
    // 管理者ダッシュボードのTournamentDashboardListと完全に同じロジック
    let type: 'ongoing' | 'recruiting' | 'completed' | 'other' = 'other';
    
    if (status === 'ongoing') {
      type = 'ongoing';
    } else if (status === 'recruiting') {
      type = 'recruiting';
    } else if (status === 'completed') {
      type = 'completed';
    }

    // 管理者ダッシュボードと完全に同じ色分けとテキスト
    return (
      <div className={`px-3 py-1 rounded-full text-xs font-medium ${
        type === 'ongoing' 
          ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300' 
          : type === 'recruiting'
          ? visibility === 1
            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300'
            : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300'
          : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
      }`}>
        {type === 'ongoing' ? '開催中' : type === 'recruiting' ? (visibility === 1 ? '募集中' : '準備中') : type === 'completed' ? '完了' : status}
      </div>
    );
  };

  const getRegistrationTypeDisplay = (type: string) => {
    switch (type) {
      case 'self_registered':
        return <Badge variant="outline" className="bg-green-100 text-green-700">代表者登録</Badge>;
      case 'admin_proxy':
        return <Badge variant="outline" className="bg-yellow-100 text-yellow-700">管理者代行</Badge>;
      default:
        return <Badge variant="outline">{type}</Badge>;
    }
  };

  const getWithdrawalStatusDisplay = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge variant="outline" className="bg-green-100 text-green-700">参加中</Badge>;
      case 'withdrawal_requested':
        return <Badge variant="outline" className="bg-orange-100 text-orange-700">辞退申請中</Badge>;
      case 'withdrawal_approved':
        return <Badge variant="outline" className="bg-red-100 text-red-700">辞退承認済み</Badge>;
      case 'withdrawal_rejected':
        return <Badge variant="outline" className="bg-blue-100 text-blue-700">辞退却下</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // チーム検索フィルタリング
  const filteredTeams = teams.filter(team => 
    team.team_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    team.contact_person.toLowerCase().includes(searchTerm.toLowerCase()) ||
    team.contact_email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // 大会検索フィルタリング
  const filteredTournaments = tournaments.filter(tournament =>
    tournament.tournament_name.toLowerCase().includes(tournamentSearchTerm.toLowerCase()) ||
    (tournament.venue_name && tournament.venue_name.toLowerCase().includes(tournamentSearchTerm.toLowerCase())) ||
    (tournament.format_name && tournament.format_name.toLowerCase().includes(tournamentSearchTerm.toLowerCase()))
  );

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
      {/* ヘッダー */}
      <div className="bg-card shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-foreground">チーム一覧</h1>
              <p className="text-sm text-muted-foreground mt-1">
                大会別の参加チーム一覧を確認できます
              </p>
            </div>
            <div className="flex space-x-3">
              <Button
                variant="outline"
                onClick={() => router.push('/admin')}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                管理者ダッシュボードに戻る
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 min-h-[calc(100vh-200px)]">
          {/* 左側: 大会一覧 */}
          <div className="flex flex-col">
            <Card className="flex-1 flex flex-col">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Trophy className="w-5 h-5 mr-2" />
                  大会選択
                  {filteredTournaments.length !== tournaments.length && (
                    <Badge variant="outline" className="ml-2">
                      {filteredTournaments.length}/{tournaments.length}
                    </Badge>
                  )}
                </CardTitle>
                <p className="text-sm text-muted-foreground">チームを確認したい大会を選択してください</p>
                <div className="relative mt-3">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input
                    placeholder="大会名・会場・フォーマットで検索..."
                    value={tournamentSearchTerm}
                    onChange={(e) => setTournamentSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-3 flex-1 overflow-y-auto">
                {tournaments.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Trophy className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>大会がありません</p>
                  </div>
                ) : filteredTournaments.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Search className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p className="text-lg font-medium mb-2">検索条件に一致する大会がありません</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setTournamentSearchTerm('')}
                      className="mt-2"
                    >
                      検索をクリア
                    </Button>
                  </div>
                ) : (
                  filteredTournaments.map((tournament) => (
                    <div
                      key={`tournament-${tournament.tournament_id}`}
                      className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                        selectedTournamentId === tournament.tournament_id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      onClick={() => handleTournamentSelect(tournament.tournament_id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-2">
                            <p className="font-medium text-foreground">
                              {tournament.tournament_name}
                            </p>
                            {getStatusBadge(tournament)}
                          </div>
                          <div className="space-y-1">
                            {tournament.format_name && (
                              <div className="flex items-center text-sm text-gray-600">
                                <Trophy className="w-4 h-4 mr-1" />
                                <span>{tournament.format_name}</span>
                              </div>
                            )}
                            <div className="flex space-x-4 text-xs text-muted-foreground">
                              <div className="flex items-center">
                                <Users className="w-3 h-3 mr-1" />
                                {tournament.team_count}チーム
                              </div>
                              {tournament.event_start_date && (
                                <div className="flex items-center">
                                  <Calendar className="w-3 h-3 mr-1" />
                                  {new Date(tournament.event_start_date).toLocaleDateString('ja-JP')}
                                </div>
                              )}
                              {tournament.venue_name && (
                                <div className="flex items-center">
                                  <MapPin className="w-3 h-3 mr-1" />
                                  {tournament.venue_name}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          {/* 右側: 参加チーム一覧 */}
          <div className="flex flex-col">
            <Card className="flex-1 flex flex-col">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center">
                    <Users className="w-5 h-5 mr-2" />
                    参加チーム一覧
                    {selectedTournamentId && (
                      <Badge variant="outline" className="ml-2">
                        {filteredTeams.length}チーム
                      </Badge>
                    )}
                  </div>
                </CardTitle>
                {selectedTournamentId && (
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                    <Input
                      placeholder="チーム名・代表者・メールアドレスで検索..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                )}
              </CardHeader>
              <CardContent className="flex-1 flex flex-col">
                {!selectedTournamentId ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Users className="w-16 h-16 mx-auto mb-4 opacity-30" />
                    <p className="text-lg font-medium mb-2">大会を選択してください</p>
                    <p className="text-sm">左側から大会を選択すると、参加チーム一覧が表示されます</p>
                  </div>
                ) : teamsLoading ? (
                  <div className="text-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-muted-foreground">チーム一覧を読み込み中...</p>
                  </div>
                ) : filteredTeams.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Users className="w-16 h-16 mx-auto mb-4 opacity-30" />
                    <p className="text-lg font-medium mb-2">
                      {searchTerm ? '検索条件に一致するチームがありません' : 'この大会に参加チームはありません'}
                    </p>
                    {searchTerm && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSearchTerm('')}
                        className="mt-2"
                      >
                        検索をクリア
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4 flex-1 overflow-y-auto">
                    {filteredTeams.map((team, index) => (
                      <div key={`team-${team.tournament_team_id}`} className="border rounded-lg p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <div className="flex items-center space-x-2 mb-2">
                              <h4 className="font-medium text-foreground flex items-center">
                                {team.team_name}
                                {team.team_omission && (
                                  <span className="text-sm text-muted-foreground ml-2">
                                    ({team.team_omission})
                                  </span>
                                )}
                              </h4>
                              {getRegistrationTypeDisplay(team.registration_type)}
                            </div>
                            <div className="flex items-center space-x-1 mb-2">
                              {getWithdrawalStatusDisplay(team.withdrawal_status)}
                            </div>
                          </div>
                          <div className="text-right">
                            <Badge variant="outline" className="bg-blue-100 text-blue-700">
                              #{index + 1}
                            </Badge>
                          </div>
                        </div>

                        {/* 代表者情報 */}
                        <div className="space-y-2 mb-3">
                          <div className="flex items-center text-sm text-muted-foreground">
                            <Crown className="w-4 h-4 mr-2 text-amber-500" />
                            代表者: {team.contact_person}
                          </div>
                          <div className="flex items-center text-sm text-muted-foreground">
                            <Mail className="w-4 h-4 mr-2" />
                            {team.contact_email}
                          </div>
                          {team.contact_phone && (
                            <div className="flex items-center text-sm text-muted-foreground">
                              <Phone className="w-4 h-4 mr-2" />
                              {team.contact_phone}
                            </div>
                          )}
                        </div>

                        {/* 選手情報 */}
                        <div className="pt-3 border-t">
                          <div className="flex items-center justify-between mb-2">
                            <h5 className="font-medium text-sm text-foreground flex items-center">
                              <UserCheck className="w-4 h-4 mr-1" />
                              登録選手 ({team.player_count}名)
                            </h5>
                            <span className="text-xs text-muted-foreground">
                              {new Date(team.joined_at).toLocaleDateString('ja-JP')}参加
                            </span>
                          </div>
                          
                          {team.players.length > 0 ? (
                            <div className="grid grid-cols-1 gap-2">
                              {team.players.slice(0, 5).map((player) => (
                                <div key={player.tournament_player_id} className="flex items-center text-sm text-muted-foreground">
                                  <span className="min-w-[2rem]">
                                    {player.jersey_number ? `#${player.jersey_number}` : ''}
                                  </span>
                                  <span className="flex-1">{player.player_name}</span>
                                </div>
                              ))}
                              {team.players.length > 5 && (
                                <div className="text-xs text-muted-foreground text-center pt-1">
                                  ...他{team.players.length - 5}名
                                </div>
                              )}
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground text-center py-2">
                              選手が登録されていません
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}