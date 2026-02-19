'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Users, UserPlus, Trash2, Mail, ArrowLeft,
  AlertCircle, Clock, CheckCircle, Trophy, Plus, Pencil, X, Save,
} from 'lucide-react';

// ── 型定義 ────────────────────────────────────────────
interface TeamInfo {
  team_id: string;
  team_name: string;
  team_omission: string | null;
  contact_person: string | null;
  contact_email: string | null;
  is_active: boolean;
  member_role: string;
  player_count: number;
  manager_count: number;
}

interface Manager {
  login_user_id: number;
  display_name: string;
  email: string;
  member_role: string;
  joined_at: string;
}

interface Invitation {
  id: number;
  invited_email: string;
  status: string;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
  invited_by_name: string | null;
}

interface Player {
  player_id: number;
  player_name: string;
  jersey_number: number | null;
  is_active: boolean;
}

interface PlayerForm {
  player_id?: number;
  player_name: string;
  jersey_number: string; // フォーム上は文字列として扱う
}

interface JoinedTournament {
  tournament_id: number;
  tournament_name: string;
  event_start_date: string | null;
  venue_name: string | null;
  tournament_team_id: number;
  tournament_team_name: string;
  participation_status: string;
  assigned_block: string | null;
}

interface AvailableTournament {
  tournament_id: number;
  tournament_name: string;
  event_start_date: string | null;
  venue_name: string | null;
  recruitment_end_date: string | null;
  confirmed_count: number;
}

type TabKey = 'managers' | 'players' | 'tournaments';

// ── メッセージバナー ──────────────────────────────────
function MessageBanner({ message, onClose }: {
  message: { type: 'success' | 'error'; text: string };
  onClose: () => void;
}) {
  return (
    <div className={`flex items-start justify-between gap-2 p-4 rounded-lg text-sm ${
      message.type === 'success'
        ? 'bg-green-50 border border-green-200 text-green-800 dark:bg-green-950/20 dark:border-green-800 dark:text-green-300'
        : 'bg-red-50 border border-red-200 text-red-800 dark:bg-red-950/20 dark:border-red-800 dark:text-red-300'
    }`}>
      <div className="flex items-start gap-2">
        {message.type === 'success'
          ? <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          : <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
        <span>{message.text}</span>
      </div>
      <button onClick={onClose} className="flex-shrink-0 opacity-60 hover:opacity-100">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

// ── 担当者タブ ────────────────────────────────────────
function ManagersTab({ teamId, managers, invitations, managerCount, onRefresh, setMessage }: {
  teamId: string;
  managers: Manager[];
  invitations: Invitation[];
  managerCount: number;
  onRefresh: () => void;
  setMessage: (msg: { type: 'success' | 'error'; text: string } | null) => void;
}) {
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [cancelling, setCancelling] = useState<number | null>(null);

  const pendingInvites = invitations.filter(i => i.status === 'pending');
  const canInvite = managerCount < 2 && pendingInvites.length === 0;

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setMessage(null);
    try {
      const res = await fetch('/api/my/teams/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team_id: teamId, invited_email: inviteEmail.trim() }),
      });
      const result = await res.json();
      if (result.success) {
        setMessage({ type: 'success', text: `${inviteEmail} に招待メールを送信しました` });
        setInviteEmail('');
        onRefresh();
      } else {
        setMessage({ type: 'error', text: result.error });
      }
    } catch {
      setMessage({ type: 'error', text: '招待の送信に失敗しました' });
    } finally {
      setInviting(false);
    }
  };

  const handleCancelInvite = async (invitationId: number) => {
    if (!confirm('この招待をキャンセルしますか？')) return;
    setCancelling(invitationId);
    try {
      const res = await fetch('/api/my/teams/invite', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invitation_id: invitationId }),
      });
      const result = await res.json();
      if (result.success) {
        setMessage({ type: 'success', text: '招待をキャンセルしました' });
        onRefresh();
      } else {
        setMessage({ type: 'error', text: result.error });
      }
    } catch {
      setMessage({ type: 'error', text: 'キャンセルに失敗しました' });
    } finally {
      setCancelling(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* 担当者一覧 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="w-5 h-5" />
            担当者一覧（{managers.length} / 2名）
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {managers.map((manager) => (
            <div key={manager.login_user_id}
              className="flex items-center gap-3 p-3 bg-muted/40 rounded-lg">
              <div className="w-9 h-9 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
                <Users className="w-4 h-4 text-green-700 dark:text-green-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">{manager.display_name}</span>
                </div>
                <div className="text-sm text-muted-foreground">{manager.email}</div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* 招待中 */}
      {pendingInvites.length > 0 && (
        <Card className="border-amber-200 dark:border-amber-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg text-amber-800 dark:text-amber-200">
              <Clock className="w-5 h-5" />招待中（承認待ち）
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingInvites.map((inv) => (
              <div key={inv.id}
                className="flex items-center justify-between p-3 bg-amber-50/60 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800">
                <div className="flex items-center gap-3">
                  <Mail className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  <div>
                    <div className="font-medium text-foreground">{inv.invited_email}</div>
                    <div className="text-xs text-muted-foreground">
                      有効期限: {new Date(inv.expires_at).toLocaleString('ja-JP')}
                    </div>
                  </div>
                </div>
                <Button
                  size="sm" variant="outline"
                  className="border-red-300 text-red-600 hover:border-red-400 hover:bg-red-50 dark:border-red-800 dark:text-red-400"
                  onClick={() => handleCancelInvite(inv.id)}
                  disabled={cancelling === inv.id}
                >
                  <Trash2 className="w-3 h-3 mr-1" />
                  {cancelling === inv.id ? 'キャンセル中...' : '取消'}
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* 招待フォーム */}
      <Card className={!canInvite ? 'opacity-60' : ''}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <UserPlus className="w-5 h-5" />2人目の担当者を招待
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!canInvite ? (
            <p className="text-sm text-muted-foreground">
              {managerCount >= 2
                ? 'すでに2名の担当者が登録されています。'
                : '承認待ちの招待があります。先に現在の招待をキャンセルしてください。'}
            </p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                招待したい方のメールアドレスを入力してください。72時間有効な招待メールが送信されます。
              </p>
              <div className="flex gap-2">
                <Input
                  type="email"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  placeholder="メールアドレス"
                  onKeyDown={e => e.key === 'Enter' && handleInvite()}
                  disabled={inviting}
                />
                <Button
                  onClick={handleInvite}
                  disabled={inviting || !inviteEmail.trim()}
                  className="bg-blue-600 hover:bg-blue-700 text-white flex-shrink-0"
                >
                  <Mail className="w-4 h-4 mr-1" />
                  {inviting ? '送信中...' : '招待を送る'}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── 選手管理タブ ─────────────────────────────────────
function PlayersTab({ teamId, setMessage }: {
  teamId: string;
  setMessage: (msg: { type: 'success' | 'error'; text: string } | null) => void;
}) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [formPlayers, setFormPlayers] = useState<PlayerForm[]>([]);
  const [saving, setSaving] = useState(false);

  const fetchPlayers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/my/teams/${teamId}/players`);
      const result = await res.json();
      if (result.success) setPlayers(result.data);
    } catch {
      setMessage({ type: 'error', text: '選手情報の取得に失敗しました' });
    } finally {
      setLoading(false);
    }
  }, [teamId, setMessage]);

  useEffect(() => { fetchPlayers(); }, [fetchPlayers]);

  const startEdit = () => {
    setFormPlayers(players.map(p => ({
      player_id: p.player_id,
      player_name: p.player_name,
      jersey_number: p.jersey_number != null ? String(p.jersey_number) : '',
    })));
    setEditMode(true);
    setMessage(null);
  };

  const cancelEdit = () => { setEditMode(false); };

  const addPlayer = () => {
    if (formPlayers.length >= 20) return;
    setFormPlayers(prev => [...prev, { player_name: '', jersey_number: '' }]);
  };

  const removePlayer = (idx: number) => {
    if (formPlayers.length <= 1) return;
    setFormPlayers(prev => prev.filter((_, i) => i !== idx));
  };

  const updatePlayer = (idx: number, field: 'player_name' | 'jersey_number', value: string) => {
    setFormPlayers(prev => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p));
  };

  const handleSave = async () => {
    // クライアントバリデーション
    const names = formPlayers.map(p => p.player_name.trim()).filter(Boolean);
    if (names.length !== formPlayers.length) {
      setMessage({ type: 'error', text: '選手名を入力してください' });
      return;
    }
    if (new Set(names).size !== names.length) {
      setMessage({ type: 'error', text: '選手名が重複しています' });
      return;
    }
    const jerseys = formPlayers.map(p => p.jersey_number).filter(n => n !== '');
    if (new Set(jerseys).size !== jerseys.length) {
      setMessage({ type: 'error', text: '背番号が重複しています' });
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const payload = formPlayers.map(p => ({
        ...(p.player_id ? { player_id: p.player_id } : {}),
        player_name: p.player_name.trim(),
        jersey_number: p.jersey_number !== '' ? Number(p.jersey_number) : null,
      }));
      const res = await fetch(`/api/my/teams/${teamId}/players`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ players: payload }),
      });
      const result = await res.json();
      if (result.success) {
        setMessage({ type: 'success', text: '選手情報を保存しました' });
        setEditMode(false);
        await fetchPlayers();
      } else {
        setMessage({ type: 'error', text: result.error });
      }
    } catch {
      setMessage({ type: 'error', text: '保存に失敗しました' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="w-5 h-5" />選手一覧（{players.length}名）
          </CardTitle>
          {!editMode && (
            <Button size="sm" variant="outline" onClick={startEdit}>
              <Pencil className="w-3 h-3 mr-1" />編集
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {!editMode ? (
          // 表示モード
          players.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">選手が登録されていません</p>
              <Button size="sm" variant="outline" className="mt-3" onClick={startEdit}>
                <Plus className="w-3 h-3 mr-1" />選手を追加
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {players.map(player => (
                <div key={player.player_id}
                  className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/30">
                  <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0 text-xs font-bold text-blue-700 dark:text-blue-300">
                    {player.jersey_number != null ? player.jersey_number : '—'}
                  </div>
                  <span className="text-sm font-medium">{player.player_name}</span>
                </div>
              ))}
            </div>
          )
        ) : (
          // 編集モード
          <div className="space-y-4">
            <div className="space-y-2">
              {/* ヘッダー */}
              <div className="grid grid-cols-[1fr_80px_32px] gap-2 text-xs text-muted-foreground px-1">
                <span>選手名 <span className="text-red-500">*</span></span>
                <span>背番号</span>
                <span />
              </div>
              {formPlayers.map((player, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_80px_32px] gap-2 items-center">
                  <Input
                    value={player.player_name}
                    onChange={e => updatePlayer(idx, 'player_name', e.target.value)}
                    placeholder="例: 山田太郎"
                    maxLength={50}
                    className="text-sm"
                  />
                  <Input
                    type="number"
                    value={player.jersey_number}
                    onChange={e => updatePlayer(idx, 'jersey_number', e.target.value)}
                    placeholder="—"
                    min={1}
                    max={99}
                    className="text-sm text-center"
                  />
                  <button
                    onClick={() => removePlayer(idx)}
                    disabled={formPlayers.length <= 1}
                    className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed rounded"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            {formPlayers.length < 20 && (
              <Button size="sm" variant="outline" onClick={addPlayer} className="w-full">
                <Plus className="w-3 h-3 mr-1" />選手を追加
              </Button>
            )}

            <div className="flex gap-2 pt-2">
              <Button
                onClick={handleSave}
                disabled={saving}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                <Save className="w-4 h-4 mr-1" />
                {saving ? '保存中...' : '保存する'}
              </Button>
              <Button variant="outline" onClick={cancelEdit} disabled={saving}>
                キャンセル
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── 大会参加タブ ─────────────────────────────────────
function TournamentsTab({ teamId }: { teamId: string }) {
  const [joined, setJoined] = useState<JoinedTournament[]>([]);
  const [available, setAvailable] = useState<AvailableTournament[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch_ = async () => {
      try {
        const res = await fetch(`/api/my/teams/${teamId}/tournaments`);
        const result = await res.json();
        if (result.success) {
          setJoined(result.data.joined);
          setAvailable(result.data.available);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };
    fetch_();
  }, [teamId]);

  const statusLabel = (status: string) => {
    switch (status) {
      case 'confirmed': return { label: '参加確定', cls: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' };
      case 'waitlisted': return { label: 'キャンセル待ち', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' };
      case 'cancelled': return { label: 'キャンセル', cls: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' };
      default: return { label: status, cls: 'bg-gray-100 text-gray-600' };
    }
  };

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 参加申込可能な大会 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Trophy className="w-5 h-5" />参加申込できる大会
          </CardTitle>
        </CardHeader>
        <CardContent>
          {available.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              現在、参加申込できる大会はありません
            </p>
          ) : (
            <div className="space-y-3">
              {available.map(t => (
                <div key={t.tournament_id}
                  className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                  <div>
                    <div className="font-medium text-foreground">{t.tournament_name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 space-x-2">
                      {t.event_start_date && <span>開催: {t.event_start_date}</span>}
                      {t.venue_name && <span>会場: {t.venue_name}</span>}
                      {t.recruitment_end_date && <span>締切: {t.recruitment_end_date}</span>}
                    </div>
                  </div>
                  <Button asChild size="sm" className="bg-green-600 hover:bg-green-700 text-white flex-shrink-0 ml-3">
                    <Link href={`/tournaments/${t.tournament_id}/join`}>
                      参加申込
                    </Link>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 参加済み大会 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <CheckCircle className="w-5 h-5" />参加済み・申込済み大会
          </CardTitle>
        </CardHeader>
        <CardContent>
          {joined.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              参加申込した大会はありません
            </p>
          ) : (
            <div className="space-y-3">
              {joined.map(t => {
                const { label, cls } = statusLabel(t.participation_status);
                return (
                  <div key={t.tournament_team_id}
                    className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                    <div>
                      <div className="font-medium text-foreground">{t.tournament_name}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
                          {label}
                        </span>
                        {t.assigned_block && (
                          <span className="text-xs text-muted-foreground">ブロック: {t.assigned_block}</span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        エントリー名: {t.tournament_team_name}
                        {t.event_start_date && ` ／ 開催: ${t.event_start_date}`}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── メインページ ─────────────────────────────────────
export default function TeamManagePage() {
  const params = useParams();
  const router = useRouter();
  const teamId = params.id as string;

  const [team, setTeam] = useState<TeamInfo | null>(null);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>('managers');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [teamsRes, managersRes, invitesRes] = await Promise.all([
        fetch('/api/my/teams'),
        fetch(`/api/my/teams/${teamId}/managers`),
        fetch(`/api/my/teams/invite?team_id=${teamId}`),
      ]);
      const [teamsData, managersData, invitesData] = await Promise.all([
        teamsRes.json(), managersRes.json(), invitesRes.json(),
      ]);

      if (teamsData.success) {
        const found = teamsData.data.find((t: TeamInfo) => t.team_id === teamId);
        if (!found) { router.push('/my'); return; }
        setTeam(found);
      }
      if (managersData.success) setManagers(managersData.data);
      if (invitesData.success) setInvitations(invitesData.data);
    } catch (err) {
      console.error('データ取得エラー:', err);
    } finally {
      setLoading(false);
    }
  }, [teamId, router]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!team) return null;

  const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: 'managers', label: '担当者管理', icon: <Users className="w-4 h-4" /> },
    { key: 'players',  label: '選手管理',   icon: <UserPlus className="w-4 h-4" /> },
    { key: 'tournaments', label: '大会参加', icon: <Trophy className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* ヘッダー */}
      <div className="bg-card shadow-sm border-b border-border">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4">
          <Button asChild variant="ghost" size="sm">
            <Link href="/my"><ArrowLeft className="w-4 h-4 mr-1" />マイダッシュボード</Link>
          </Button>
          <h1 className="text-2xl font-bold text-foreground mt-2">
            {team.team_name}
            {team.team_omission && (
              <span className="text-base font-normal text-muted-foreground ml-2">（{team.team_omission}）</span>
            )}
          </h1>
        </div>

        {/* タブ */}
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <div className="flex gap-1 border-b border-transparent -mb-px">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => { setActiveTab(tab.key); setMessage(null); }}
                className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted'
                }`}
              >
                {tab.icon}
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.label.split('管理')[0].split('参加')[0]}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* コンテンツ */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        {message && (
          <MessageBanner message={message} onClose={() => setMessage(null)} />
        )}

        {activeTab === 'managers' && (
          <ManagersTab
            teamId={teamId}
            managers={managers}
            invitations={invitations}
            managerCount={team.manager_count}
            onRefresh={fetchData}
            setMessage={setMessage}
          />
        )}
        {activeTab === 'players' && (
          <PlayersTab teamId={teamId} setMessage={setMessage} />
        )}
        {activeTab === 'tournaments' && (
          <TournamentsTab teamId={teamId} />
        )}
      </div>
    </div>
  );
}
