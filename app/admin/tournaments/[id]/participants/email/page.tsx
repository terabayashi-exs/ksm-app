// app/admin/tournaments/[id]/participants/email/page.tsx
// チーム代表者へのメール一括送信画面

'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Mail, Send, AlertCircle, Loader2, Users, CheckCircle2 } from 'lucide-react';
import { EMAIL_PRESETS, EmailPresetId } from '@/lib/email/templates-broadcast';

interface Team {
  tournament_team_id: string; // ユニークキー（同じマスターから複数参加の場合に重複防止）
  team_id: string;
  team_name: string;
  contact_person: string;
  contact_email: string;
  participation_status: string;
}

export default function EmailSendPage() {
  const params = useParams();
  const tournamentId = params.id as string;

  const [teams, setTeams] = useState<Team[]>([]);
  const [tournamentName, setTournamentName] = useState<string>('');
  const [organizerEmail, setOrganizerEmail] = useState<string>(''); // 大会運営者メールアドレス
  const [selectedTeamIds, setSelectedTeamIds] = useState<Set<string>>(new Set());
  const [selectedPreset, setSelectedPreset] = useState<EmailPresetId>('custom');
  const [emailTitle, setEmailTitle] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);

  const MAX_SELECTION = 5;

  // データ取得
  useEffect(() => {
    async function fetchData() {
      try {
        setIsLoading(true);

        // 参加チーム一覧取得（大会情報も含む）
        const teamsRes = await fetch(`/api/admin/tournaments/${tournamentId}/participants`);
        if (teamsRes.ok) {
          const response = await teamsRes.json();

          // レスポンス構造に対応: { success: true, data: { participants: [...], tournament: {...}, adminEmail: "..." } }
          if (response.success && response.data) {
            // 大会情報設定
            if (response.data.tournament) {
              setTournamentName(response.data.tournament.tournament_name || '');
            }

            // 管理者メールアドレス設定（大会運営者）
            if (response.data.adminEmail) {
              setOrganizerEmail(response.data.adminEmail);
            }

            // 参加チーム一覧設定
            if (Array.isArray(response.data.participants)) {
              const participants = response.data.participants as Array<{
                tournament_team_id: number;
                team_id: string;
                tournament_team_name?: string;
                master_team_name?: string;
                contact_person: string;
                contact_email: string;
                participation_status: string;
              }>;
              // 全チームを表示（フィルタなし）
              const allTeams = participants.map((team) => ({
                tournament_team_id: String(team.tournament_team_id),
                team_id: team.team_id,
                team_name: team.tournament_team_name || team.master_team_name || '',
                contact_person: team.contact_person,
                contact_email: team.contact_email,
                participation_status: team.participation_status,
              }));
              setTeams(allTeams);
            }
          } else {
            console.error('予期しないレスポンス形式:', response);
            alert('参加チーム情報の取得に失敗しました');
          }
        }
      } catch (error) {
        console.error('データ取得エラー:', error);
        alert('データの取得に失敗しました');
      } finally {
        setIsLoading(false);
      }
    }

    fetchData();
  }, [tournamentId]);

  // プリセット変更時の処理
  const handlePresetChange = (presetId: EmailPresetId) => {
    setSelectedPreset(presetId);
    const preset = EMAIL_PRESETS[presetId];
    setEmailTitle(preset.title);
    setEmailBody(preset.body);
  };

  // チーム選択/解除
  const handleTeamToggle = (tournamentTeamId: string) => {
    setSelectedTeamIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(tournamentTeamId)) {
        newSet.delete(tournamentTeamId);
      } else {
        if (newSet.size >= MAX_SELECTION) {
          alert(`一度に送信できるチーム数は${MAX_SELECTION}件までです`);
          return prev;
        }
        newSet.add(tournamentTeamId);
      }
      return newSet;
    });
  };

  // 全選択/全解除
  const handleSelectAll = () => {
    if (selectedTeamIds.size === teams.length) {
      setSelectedTeamIds(new Set());
    } else {
      const teamIds = teams.slice(0, MAX_SELECTION).map((t) => t.tournament_team_id);
      setSelectedTeamIds(new Set(teamIds));
      if (teams.length > MAX_SELECTION) {
        alert(`最初の${MAX_SELECTION}チームのみ選択しました`);
      }
    }
  };

  // メール送信
  const handleSend = async () => {
    if (selectedTeamIds.size === 0) {
      alert('送信先が未選択です。少なくとも1チームを選択してください');
      return;
    }

    if (!emailTitle.trim() || !emailBody.trim()) {
      alert('入力内容が不足しています。タイトルと本文を入力してください');
      return;
    }

    // 確認ダイアログ
    const confirmed = window.confirm(
      `${selectedTeamIds.size}チームにメールを送信します。\n\nタイトル: ${emailTitle}\n\nよろしいですか？`
    );

    if (!confirmed) return;

    try {
      setIsSending(true);

      const response = await fetch(`/api/admin/tournaments/${tournamentId}/participants/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tournamentTeamIds: Array.from(selectedTeamIds), // tournament_team_id の配列
          title: emailTitle,
          body: emailBody,
          tournamentName,
          organizerEmail: organizerEmail || undefined, // 大会運営者メールアドレス
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'メール送信に失敗しました');
      }

      const result = await response.json();

      // エラーがある場合は警告を含めて表示
      if (result.errors && result.errors.length > 0) {
        alert(`メール送信完了: ${result.message}\n\nエラー詳細:\n${result.errors.join('\n')}`);
      } else {
        alert(`メール送信成功: ${result.message}`);
      }

      // フォームリセット
      setSelectedTeamIds(new Set());
      setSelectedPreset('custom');
      setEmailTitle('');
      setEmailBody('');
    } catch (error) {
      console.error('メール送信エラー:', error);
      alert(`エラー: ${error instanceof Error ? error.message : 'メール送信に失敗しました'}`);
    } finally {
      setIsSending(false);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <div className="space-y-6">
        {/* ヘッダー */}
        <div className="flex items-center gap-3">
          <Mail className="h-8 w-8 text-blue-500" />
          <div>
            <h1 className="text-3xl font-bold text-foreground">メール一括送信</h1>
            <p className="text-muted-foreground mt-1">{tournamentName}</p>
          </div>
        </div>

        {/* 注意事項 */}
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
              <div>
                <h3 className="font-semibold text-amber-800 mb-2">送信制限について</h3>
                <ul className="text-sm text-amber-700 space-y-1 list-disc list-inside">
                  <li>一度に最大{MAX_SELECTION}チームまで送信可能です</li>
                  <li>送信元: rakusyogo-official@rakusyo-go.com</li>
                  <li>宛先: rakusyogo-official@rakusyo-go.com（送信記録用）</li>
                  <li>BCC: 選択したチーム代表者のメールアドレス</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 左側: チーム選択 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                送信先チーム選択
              </CardTitle>
              <CardDescription>
                選択中: {selectedTeamIds.size} / {MAX_SELECTION}チーム
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSelectAll}
                  className="w-full"
                >
                  {selectedTeamIds.size === teams.length ? '全て解除' : `最初の${MAX_SELECTION}件を選択`}
                </Button>

                <div className="border rounded-lg divide-y max-h-96 overflow-y-auto">
                  {teams.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">
                      大会に参加しているチームがありません
                    </div>
                  ) : (
                    teams.map((team) => {
                      const isSelected = selectedTeamIds.has(team.tournament_team_id);
                      const isDisabled = !isSelected && selectedTeamIds.size >= MAX_SELECTION;

                      // 参加状態の表示ラベル
                      let statusLabel = '';
                      switch (team.participation_status) {
                        case 'confirmed':
                          statusLabel = '参加確定';
                          break;
                        case 'waitlisted':
                          statusLabel = 'キャンセル待ち';
                          break;
                        case 'cancelled':
                          statusLabel = 'キャンセル済み';
                          break;
                        default:
                          statusLabel = team.participation_status;
                      }

                      return (
                        <div
                          key={team.tournament_team_id}
                          className={`p-4 flex items-start gap-3 transition-colors ${
                            isDisabled ? 'opacity-40' : 'hover:bg-muted/50'
                          }`}
                        >
                          <Checkbox
                            id={`team-${team.tournament_team_id}`}
                            checked={isSelected}
                            onCheckedChange={() => handleTeamToggle(team.tournament_team_id)}
                            disabled={isDisabled}
                            className="mt-1"
                          />
                          <Label
                            htmlFor={`team-${team.tournament_team_id}`}
                            className={`flex-1 ${isDisabled ? '' : 'cursor-pointer'}`}
                          >
                            <div className="font-medium">{team.team_name}</div>
                            <div className="text-sm text-muted-foreground">
                              {team.contact_person} ({team.contact_email})
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {statusLabel}
                            </div>
                          </Label>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 右側: メール内容 */}
          <Card>
            <CardHeader>
              <CardTitle>メール内容</CardTitle>
              <CardDescription>送信するメールの内容を入力してください</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* プリセット選択 */}
                <div>
                  <Label htmlFor="preset">テンプレート選択</Label>
                  <Select value={selectedPreset} onValueChange={handlePresetChange}>
                    <SelectTrigger id="preset" className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(EMAIL_PRESETS).map(([key, preset]) => (
                        <SelectItem key={key} value={key}>
                          {preset.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* タイトル */}
                <div>
                  <Label htmlFor="title">メールタイトル *</Label>
                  <Input
                    id="title"
                    value={emailTitle}
                    onChange={(e) => setEmailTitle(e.target.value)}
                    placeholder="例: 【重要】試合日程変更のお知らせ"
                    className="mt-1"
                  />
                </div>

                {/* 本文 */}
                <div>
                  <Label htmlFor="body">メール本文 *</Label>
                  <Textarea
                    id="body"
                    value={emailBody}
                    onChange={(e) => setEmailBody(e.target.value)}
                    placeholder="メール本文を入力してください"
                    rows={10}
                    className="mt-1 font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    改行も反映されます。大会名は自動的に追加されます。
                  </p>
                </div>

                {/* 大会運営者メールアドレス */}
                <div>
                  <Label htmlFor="organizerEmail">大会運営者メールアドレス（問い合わせ先）</Label>
                  <Input
                    id="organizerEmail"
                    type="email"
                    value={organizerEmail}
                    onChange={(e) => setOrganizerEmail(e.target.value)}
                    placeholder="例: organizer@example.com"
                    className="mt-1"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    入力すると、メール末尾に「ご不明な点は大会運営者までお問い合わせください」と表示されます。
                  </p>
                </div>

                {/* 送信ボタン */}
                <Button
                  onClick={handleSend}
                  disabled={isSending || selectedTeamIds.size === 0 || !emailTitle || !emailBody}
                  className="w-full"
                  size="lg"
                >
                  {isSending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      送信中...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      {selectedTeamIds.size}チームに送信
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* プレビュー（オプション） */}
        {emailTitle && emailBody && (
          <Card className="border-blue-200 bg-blue-50/50">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-blue-600" />
                プレビュー
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-white p-4 rounded-lg border">
                <div className="font-bold text-lg mb-3 border-b pb-2">{emailTitle}</div>
                <div className="whitespace-pre-wrap text-sm">
                  {emailBody.replace(
                    /\[URLをここに記載\]/g,
                    `${typeof window !== 'undefined' ? window.location.origin : ''}/public/tournaments/${tournamentId}`
                  )}
                </div>
                {tournamentName && (
                  <div className="mt-4 pt-4 border-t text-sm text-muted-foreground">
                    大会名: {tournamentName}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
