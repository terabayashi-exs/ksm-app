'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { ShieldAlert, Plus, Trash2, RotateCcw, Settings, Loader2 } from 'lucide-react';
import {
  CARD_TYPES,
  CARD_TYPE_LABELS,
  REASON_PRESETS,
  getReasonLabel,
  type CardType,
} from '@/lib/disciplinary-constants';
import { formatDateOnly } from '@/lib/utils';

interface DisciplinaryManagementProps {
  tournamentId: number;
}

interface MatchOption {
  match_id: number;
  match_code: string;
  tournament_date: string;
  team1_name: string;
  team2_name: string;
  team1_tournament_team_id: number;
  team2_tournament_team_id: number;
}

interface PlayerOption {
  player_name: string;
  jersey_number: number | null;
  tournament_team_id: number;
}

interface DisciplinaryAction {
  action_id: number;
  match_id: number;
  tournament_team_id: number;
  player_name: string;
  card_type: CardType;
  reason_code: number;
  reason_text: string | null;
  suspension_matches: number;
  created_at: string;
  team_name?: string;
  match_code?: string;
  tournament_date?: string;
}

interface TeamData {
  tournament_team_id: number;
  team_name: string;
  penaltyPoints: number;
  actions: DisciplinaryAction[];
}

interface Settings {
  yellow_threshold: number;
  is_enabled: number;
}

export default function DisciplinaryManagement({ tournamentId }: DisciplinaryManagementProps) {
  const [teams, setTeams] = useState<TeamData[]>([]);
  const [settings, setSettings] = useState<Settings>({ yellow_threshold: 2, is_enabled: 1 });
  const [matches, setMatches] = useState<MatchOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // フォーム状態
  const [selectedMatchId, setSelectedMatchId] = useState<string>('');
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [selectedPlayerName, setSelectedPlayerName] = useState<string>('');
  const [selectedCardType, setSelectedCardType] = useState<string>('');
  const [selectedReasonCode, setSelectedReasonCode] = useState<string>('');
  const [suspensionMatches, setSuspensionMatches] = useState<string>('1');
  const [players, setPlayers] = useState<PlayerOption[]>([]);

  // 設定フォーム
  const [showSettings, setShowSettings] = useState(false);
  const [settingsThreshold, setSettingsThreshold] = useState('2');
  const [groupId, setGroupId] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/disciplinary`);
      const data = await res.json();
      if (data.success) {
        setTeams(data.data.teams || []);
        setSettings(data.data.settings || { yellow_threshold: 2, is_enabled: 1 });
        setSettingsThreshold(String(data.data.settings?.yellow_threshold ?? 2));
      }
    } catch (error) {
      console.error('データ読み込みエラー:', error);
    }
  }, [tournamentId]);

  const loadMatches = useCallback(async () => {
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/matches`);
      const data = await res.json();
      if (data.success && data.data) {
        const matchList: MatchOption[] = data.data.map((m: Record<string, unknown>) => ({
          match_id: Number(m.match_id),
          match_code: String(m.match_code || ''),
          tournament_date: String(m.tournament_date || ''),
          team1_name: String(m.team1_display_name || m.team1_name || ''),
          team2_name: String(m.team2_display_name || m.team2_name || ''),
          team1_tournament_team_id: Number(m.team1_tournament_team_id || 0),
          team2_tournament_team_id: Number(m.team2_tournament_team_id || 0),
        }));
        setMatches(matchList);
      }
    } catch (error) {
      console.error('試合データ読み込みエラー:', error);
    }
  }, [tournamentId]);

  const loadGroupId = useCallback(async () => {
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}`);
      const data = await res.json();
      if (data.success && data.data?.group_id) {
        setGroupId(Number(data.data.group_id));
      }
    } catch {
      // ignore
    }
  }, [tournamentId]);

  useEffect(() => {
    Promise.all([loadData(), loadMatches(), loadGroupId()]).finally(() => setLoading(false));
  }, [loadData, loadMatches, loadGroupId]);

  // 試合選択時に両チームの選手を取得
  useEffect(() => {
    if (!selectedMatchId) {
      setPlayers([]);
      setSelectedTeamId('');
      return;
    }

    const match = matches.find((m) => m.match_id === Number(selectedMatchId));
    if (!match) return;

    const fetchPlayers = async () => {
      try {
        const teamIds = [match.team1_tournament_team_id, match.team2_tournament_team_id].filter(Boolean);
        if (teamIds.length === 0) return;

        // 各チームの選手を直接取得
        const allPlayers: PlayerOption[] = [];
        for (const teamId of teamIds) {
          const res = await fetch(`/api/tournaments/${tournamentId}/disciplinary/players?tournament_team_id=${teamId}`);
          const data = await res.json();
          if (data.success && data.data) {
            for (const player of data.data) {
              allPlayers.push({
                player_name: String(player.player_name),
                jersey_number: player.jersey_number ?? null,
                tournament_team_id: teamId,
              });
            }
          }
        }
        setPlayers(allPlayers);
      } catch (error) {
        console.error('選手データ読み込みエラー:', error);
      }
    };
    fetchPlayers();
  }, [selectedMatchId, matches, tournamentId]);

  const selectedMatch = matches.find((m) => m.match_id === Number(selectedMatchId));

  const teamsInMatch = selectedMatch
    ? [
        { id: selectedMatch.team1_tournament_team_id, name: selectedMatch.team1_name },
        { id: selectedMatch.team2_tournament_team_id, name: selectedMatch.team2_name },
      ].filter((t) => t.id > 0)
    : [];

  const filteredPlayers = selectedTeamId
    ? players.filter((p) => p.tournament_team_id === Number(selectedTeamId))
    : [];

  const needsSuspensionInput =
    selectedCardType === CARD_TYPES.RED || selectedCardType === CARD_TYPES.SECOND_YELLOW;

  const handleSubmit = async () => {
    if (!selectedMatchId || !selectedTeamId || !selectedPlayerName || !selectedCardType || !selectedReasonCode) {
      alert('全ての項目を選択してください');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/disciplinary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchId: Number(selectedMatchId),
          tournamentTeamId: Number(selectedTeamId),
          playerName: selectedPlayerName,
          cardType: selectedCardType,
          reasonCode: Number(selectedReasonCode),
          suspensionMatches: needsSuspensionInput ? Number(suspensionMatches) : 0,
        }),
      });
      const data = await res.json();
      if (data.success) {
        // フォームリセット
        setSelectedPlayerName('');
        setSelectedCardType('');
        setSelectedReasonCode('');
        setSuspensionMatches('1');
        await loadData();
      } else {
        alert(data.error || '登録に失敗しました');
      }
    } catch {
      alert('登録に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVoid = async (actionId: number) => {
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/disciplinary/${actionId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        await loadData();
      } else {
        alert(data.error || '取消に失敗しました');
      }
    } catch {
      alert('取消に失敗しました');
    }
  };

  const handleReset = async (playerName: string) => {
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/disciplinary/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerName }),
      });
      const data = await res.json();
      if (data.success) {
        await loadData();
      } else {
        alert(data.error || 'リセットに失敗しました');
      }
    } catch {
      alert('リセットに失敗しました');
    }
  };

  const handleSaveSettings = async () => {
    if (!groupId) return;
    try {
      const res = await fetch(`/api/tournament-groups/${groupId}/disciplinary-settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          yellowThreshold: Number(settingsThreshold),
          isEnabled: settings.is_enabled,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSettings(data.data);
        setShowSettings(false);
      } else {
        alert(data.error || '設定の保存に失敗しました');
      }
    } catch {
      alert('設定の保存に失敗しました');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const allActions = teams.flatMap((t) =>
    t.actions.map((a) => ({ ...a, team_name: t.team_name }))
  );

  return (
    <div className="space-y-6">
      {/* 設定 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <ShieldAlert className="h-4 w-4" />
          <span>イエロー累積閾値: {settings.yellow_threshold}枚で出場停止</span>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowSettings(!showSettings)}>
          <Settings className="h-4 w-4 mr-1" />
          設定
        </Button>
      </div>

      {showSettings && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">懲罰設定</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>イエローカード累積閾値（何枚で出場停止）</Label>
              <Input
                type="number"
                min={1}
                max={10}
                value={settingsThreshold}
                onChange={(e) => setSettingsThreshold(e.target.value)}
                className="w-32 mt-1"
              />
            </div>
            <Button onClick={handleSaveSettings} size="sm">保存</Button>
          </CardContent>
        </Card>
      )}

      {/* カード登録フォーム */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Plus className="h-5 w-5" />
            カード登録
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 試合選択 */}
            <div>
              <Label>試合</Label>
              <Select value={selectedMatchId} onValueChange={setSelectedMatchId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="試合を選択" />
                </SelectTrigger>
                <SelectContent>
                  {matches.map((m) => (
                    <SelectItem key={m.match_id} value={String(m.match_id)}>
                      {m.match_code} {m.team1_name} vs {m.team2_name}
                      {m.tournament_date && ` (${formatDateOnly(m.tournament_date)})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* チーム選択 */}
            <div>
              <Label>チーム</Label>
              <Select
                value={selectedTeamId}
                onValueChange={(v) => {
                  setSelectedTeamId(v);
                  setSelectedPlayerName('');
                }}
                disabled={teamsInMatch.length === 0}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="チームを選択" />
                </SelectTrigger>
                <SelectContent>
                  {teamsInMatch.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 選手選択 */}
            <div>
              <Label>選手</Label>
              <Select
                value={selectedPlayerName}
                onValueChange={setSelectedPlayerName}
                disabled={filteredPlayers.length === 0}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="選手を選択" />
                </SelectTrigger>
                <SelectContent>
                  {filteredPlayers.map((p) => (
                    <SelectItem key={`${p.tournament_team_id}-${p.player_name}`} value={p.player_name}>
                      {p.jersey_number ? `#${p.jersey_number} ` : ''}{p.player_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* カードタイプ */}
            <div>
              <Label>カード種別</Label>
              <Select value={selectedCardType} onValueChange={setSelectedCardType}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="カード種別を選択" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CARD_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 理由 */}
            <div className="md:col-span-2">
              <Label>理由</Label>
              <Select value={selectedReasonCode} onValueChange={setSelectedReasonCode}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="理由を選択" />
                </SelectTrigger>
                <SelectContent>
                  {REASON_PRESETS.map((r) => (
                    <SelectItem key={r.code} value={String(r.code)}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 出場停止試合数（レッド/2枚目イエロー時） */}
            {needsSuspensionInput && (
              <div>
                <Label>出場停止試合数</Label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={suspensionMatches}
                  onChange={(e) => setSuspensionMatches(e.target.value)}
                  className="w-32 mt-1"
                />
              </div>
            )}
          </div>

          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            登録
          </Button>
        </CardContent>
      </Card>

      {/* カード履歴 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">カード履歴</CardTitle>
        </CardHeader>
        <CardContent>
          {allActions.length === 0 ? (
            <p className="text-sm text-gray-500 py-4 text-center">登録されたカードはありません</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>試合</TableHead>
                    <TableHead>チーム</TableHead>
                    <TableHead>選手</TableHead>
                    <TableHead>カード</TableHead>
                    <TableHead>理由</TableHead>
                    <TableHead>停止</TableHead>
                    <TableHead>日時</TableHead>
                    <TableHead className="w-24">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allActions.map((action) => (
                    <TableRow key={action.action_id}>
                      <TableCell className="text-sm">{action.match_code || `#${action.match_id}`}</TableCell>
                      <TableCell className="text-sm">{action.team_name}</TableCell>
                      <TableCell className="text-sm font-medium">{action.player_name}</TableCell>
                      <TableCell>
                        <CardTypeBadge cardType={action.card_type} />
                      </TableCell>
                      <TableCell className="text-sm max-w-48 truncate">{getReasonLabel(action.reason_code)}</TableCell>
                      <TableCell className="text-sm">
                        {action.suspension_matches > 0 ? `${action.suspension_matches}試合` : '-'}
                      </TableCell>
                      <TableCell className="text-sm text-gray-500">
                        {action.tournament_date ? formatDateOnly(action.tournament_date) : ''}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>カードを取消しますか？</AlertDialogTitle>
                                <AlertDialogDescription>
                                  {action.player_name} の {CARD_TYPE_LABELS[action.card_type]} を取消します。
                                  チームの累積懲罰ポイントからも除外されます。
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>キャンセル</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleVoid(action.action_id)}>
                                  取消する
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>

                          {action.card_type === 'yellow' && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-500" title="累積リセット">
                                  <RotateCcw className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>累積リセットしますか？</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    {action.player_name} のイエロー累積カウンターを0にリセットします。
                                    チームの累積懲罰ポイントには影響しません。
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>キャンセル</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleReset(action.player_name)}>
                                    リセットする
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CardTypeBadge({ cardType }: { cardType: CardType }) {
  const config: Record<CardType, { bg: string; text: string; label: string }> = {
    yellow: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'イエロー' },
    red: { bg: 'bg-red-100', text: 'text-red-800', label: 'レッド' },
    second_yellow: { bg: 'bg-red-100', text: 'text-red-800', label: '2枚目Y' },
  };
  const c = config[cardType] || config.yellow;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
}
