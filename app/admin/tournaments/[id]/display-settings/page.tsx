'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Link from 'next/link';
import { Eye, EyeOff, Save, Pencil, Check, X, Users, ChevronRight, Home } from 'lucide-react';
import Header from '@/components/layout/Header';

interface PhaseInfo {
  id: string;
  name: string;
  is_visible: boolean;
}

interface TeamInfo {
  tournament_team_id: number;
  team_name: string;
  team_omission: string;
  master_team_name: string;
  master_team_omission: string;
}

export default function DisplaySettingsPage() {
  const params = useParams();
  const tournamentId = params.id as string;

  const [phases, setPhases] = useState<PhaseInfo[]>([]);
  const [teams, setTeams] = useState<TeamInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingPhases, setSavingPhases] = useState(false);
  const [editingTeamId, setEditingTeamId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editOmission, setEditOmission] = useState('');
  const [savingTeam, setSavingTeam] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // 大会情報取得
        const tournamentRes = await fetch(`/api/tournaments/${tournamentId}`);
        const tournamentData = await tournamentRes.json();

        if (tournamentData.success && tournamentData.data) {
          if (tournamentData.data.phases?.phases) {
            setPhases(
              tournamentData.data.phases.phases
                .sort((a: PhaseInfo, b: PhaseInfo) => (a as unknown as { order: number }).order - (b as unknown as { order: number }).order)
                .map((p: { id: string; name: string; is_visible?: boolean }) => ({
                  id: p.id,
                  name: p.name,
                  is_visible: p.is_visible !== false
                }))
            );
          }
        }

        // チーム一覧取得
        const teamsRes = await fetch(`/api/admin/tournaments/${tournamentId}/teams`);
        const teamsData = await teamsRes.json();

        if (teamsData.success && teamsData.data?.teams) {
          setTeams(
            teamsData.data.teams.map((t: {
              tournament_team_id: number;
              team_name: string;
              team_omission: string;
              master_team_name: string;
            }) => ({
              tournament_team_id: t.tournament_team_id,
              team_name: t.team_name,
              team_omission: t.team_omission,
              master_team_name: t.master_team_name || t.team_name,
              master_team_omission: t.team_omission || t.team_name,
            }))
          );
        }
      } catch (error) {
        console.error('データ取得エラー:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [tournamentId]);

  const handleTogglePhase = (phaseId: string) => {
    setPhases(prev =>
      prev.map(p => p.id === phaseId ? { ...p, is_visible: !p.is_visible } : p)
    );
  };

  const handleSavePhases = async () => {
    setSavingPhases(true);
    try {
      const visibility: Record<string, boolean> = {};
      phases.forEach(p => { visibility[p.id] = p.is_visible; });

      const res = await fetch(`/api/tournaments/${tournamentId}/phase-visibility`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visibility })
      });
      const data = await res.json();
      if (data.success) {
        alert('フェーズ表示設定を保存しました');
      } else {
        alert(`エラー: ${data.error}`);
      }
    } catch {
      alert('保存に失敗しました');
    } finally {
      setSavingPhases(false);
    }
  };

  const handleStartEditTeam = (team: TeamInfo) => {
    setEditingTeamId(team.tournament_team_id);
    setEditName(team.team_name);
    setEditOmission(team.team_omission);
  };

  const handleCancelEditTeam = () => {
    setEditingTeamId(null);
    setEditName('');
    setEditOmission('');
  };

  const handleSaveTeamName = async (tournamentTeamId: number) => {
    if (!editName.trim()) {
      alert('チーム名は必須です');
      return;
    }
    setSavingTeam(true);
    try {
      const res = await fetch(`/api/admin/tournaments/${tournamentId}/teams/${tournamentTeamId}/name`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          team_name: editName.trim(),
          team_omission: editOmission.trim() || editName.trim()
        })
      });
      const data = await res.json();
      if (data.success) {
        setTeams(prev =>
          prev.map(t =>
            t.tournament_team_id === tournamentTeamId
              ? { ...t, team_name: data.data.new_name, team_omission: data.data.new_omission }
              : t
          )
        );
        setEditingTeamId(null);
        alert('チーム名を更新しました');
      } else {
        alert(`エラー: ${data.error}`);
      }
    } catch {
      alert('更新に失敗しました');
    } finally {
      setSavingTeam(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <nav className="flex flex-wrap items-center gap-1.5 text-sm mb-6">
          <Link href="/" className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 transition-colors whitespace-nowrap"><Home className="h-3.5 w-3.5" /><span>Home</span></Link>
          <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <Link href="/my?tab=admin" className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 transition-colors whitespace-nowrap">マイダッシュボード</Link>
          <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <span className="inline-flex items-center px-2.5 py-1.5 rounded-md bg-primary/10 text-primary font-medium">表示設定</span>
        </nav>
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">表示設定</h1>
          <p className="text-sm text-gray-500 mt-1">
            公開ページに表示するブロックやチーム名の設定を行います
          </p>
        </div>

        {/* フェーズ表示設定 */}
        {phases.length > 0 && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Eye className="h-5 w-5" />
                フェーズタブ表示設定
              </CardTitle>
              <p className="text-sm text-gray-500">
                公開ページに表示するフェーズタブを選択できます
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {phases.map(phase => (
                  <div
                    key={phase.id}
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      phase.is_visible ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-200 opacity-60'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {phase.is_visible ? (
                        <Eye className="h-4 w-4 text-green-600" />
                      ) : (
                        <EyeOff className="h-4 w-4 text-gray-400" />
                      )}
                      <span className={`font-medium ${phase.is_visible ? 'text-gray-900' : 'text-gray-400'}`}>
                        {phase.name}
                      </span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleTogglePhase(phase.id)}
                    >
                      {phase.is_visible ? '非表示にする' : '表示する'}
                    </Button>
                  </div>
                ))}
              </div>
              <div className="mt-4">
                <Button onClick={handleSavePhases} disabled={savingPhases}>
                  <Save className="h-4 w-4 mr-2" />
                  {savingPhases ? '保存中...' : 'フェーズ設定を保存'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* チーム表示名設定 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="h-5 w-5" />
              チーム表示名設定
            </CardTitle>
            <p className="text-sm text-gray-500">
              公開ページに表示するチーム名を変更できます。元のチーム名はマスターデータとして保持されます。
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {teams.map(team => (
                <div
                  key={team.tournament_team_id}
                  className="flex items-center gap-3 p-3 rounded-lg border bg-white"
                >
                  {editingTeamId === team.tournament_team_id ? (
                    <div className="flex-1 space-y-2">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs text-gray-500">チーム名</Label>
                          <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            placeholder="チーム名"
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-gray-500">略称</Label>
                          <Input
                            value={editOmission}
                            onChange={(e) => setEditOmission(e.target.value)}
                            placeholder="略称（空欄の場合チーム名を使用）"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleSaveTeamName(team.tournament_team_id)}
                          disabled={savingTeam}
                        >
                          <Check className="h-3 w-3 mr-1" />
                          {savingTeam ? '保存中...' : '保存'}
                        </Button>
                        <Button size="sm" variant="outline" onClick={handleCancelEditTeam}>
                          <X className="h-3 w-3 mr-1" />
                          キャンセル
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900 truncate">{team.team_omission || team.team_name}</div>
                        {team.team_name !== team.master_team_name && (
                          <div className="text-xs text-orange-600">
                            元のチーム名: {team.master_team_name}
                          </div>
                        )}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleStartEditTeam(team)}
                      >
                        <Pencil className="h-3 w-3 mr-1" />
                        変更
                      </Button>
                    </>
                  )}
                </div>
              ))}
              {teams.length === 0 && (
                <p className="text-sm text-gray-500 text-center py-4">参加チームがありません</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
