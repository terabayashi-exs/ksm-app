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

// 自動送信メールのtemplate_id一覧（履歴から除外する）
const AUTO_TEMPLATE_IDS = [
  'auto_application',           // 参加申請受付自動通知
  'auto_withdrawal_received',   // 辞退申請受付自動通知
  'auto_withdrawal_approved',   // 辞退承認自動通知
  'auto_withdrawal_rejected'    // 辞退却下自動通知
] as const;

interface Team {
  tournament_team_id: string; // ユニークキー（同じマスターから複数参加の場合に重複防止）
  team_id: string;
  team_name: string;
  contact_person: string;
  contact_email: string;
  participation_status: string;
  email_history?: Array<{
    template_id: string;
    subject: string;
    sent_at: string;
  }>;
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

  // フィルタリング用のステート
  const [filterStatus, setFilterStatus] = useState<string>('all'); // all, confirmed, waitlisted, cancelled
  const [filterEmailSent, setFilterEmailSent] = useState<string>('all'); // all, sent, not_sent, not_sent_{template_id}

  const MAX_SELECTION = 5;

  // テンプレートIDから名前を取得するヘルパー関数
  const getTemplateNameById = (templateId: string): string => {
    const presetNames: Record<string, string> = {
      participationConfirmed: '参加確定通知',
      participationNotSelected: '参加見送り通知',
      participationCancelled: 'キャンセル通知',
      waitlist: 'キャンセル待ち通知',
      withdrawal_approved: '辞退承認通知',
      withdrawal_rejected: '辞退却下通知',
      scheduleAnnouncement: '大会日程・組合せ決定通知',
      auto_application: '申請受付（自動）',
      custom: 'カスタム',
    };
    return presetNames[templateId] || templateId;
  };

  // テンプレートIDから色を取得するヘルパー関数
  const getTemplateColor = (templateId: string): string => {
    const colorMap: Record<string, string> = {
      participationConfirmed: 'text-green-600', // 参加確定通知 - 緑
      participationNotSelected: 'text-red-600', // 参加見送り通知 - 赤
      participationCancelled: 'text-muted-foreground', // キャンセル通知 - グレー
      waitlist: 'text-muted-foreground', // キャンセル待ち通知 - グレー
      withdrawal_approved: 'text-red-600', // 辞退承認通知 - 赤
      withdrawal_rejected: 'text-purple-600', // 辞退却下通知 - 紫
      scheduleAnnouncement: 'text-blue-600', // 大会日程・組合せ決定通知 - 青
      auto_application: 'text-muted-foreground', // 申請受付（自動） - グレー
      custom: 'text-muted-foreground', // カスタム - グレー
    };
    return colorMap[templateId] || 'text-muted-foreground';
  };

  // 日時をフォーマットするヘルパー関数
  const formatDate = (dateString: string): string => {
    try {
      const date = new Date(dateString);
      const month = date.getMonth() + 1;
      const day = date.getDate();
      const hours = date.getHours();
      const minutes = date.getMinutes().toString().padStart(2, '0');
      return `${month}/${day} ${hours}:${minutes}`;
    } catch {
      return dateString;
    }
  };

  // フィルタリングされたチームリスト
  const filteredTeams = teams.filter(team => {
    // 参加ステータスフィルタ
    if (filterStatus !== 'all' && team.participation_status !== filterStatus) {
      return false;
    }

    // メール送信履歴フィルタ（自動送信メールを除外してカウント）
    const manualEmailHistory = team.email_history?.filter(h => !AUTO_TEMPLATE_IDS.includes(h.template_id as typeof AUTO_TEMPLATE_IDS[number])) || [];

    if (filterEmailSent === 'sent' && manualEmailHistory.length === 0) {
      return false;
    }
    if (filterEmailSent === 'not_sent' && manualEmailHistory.length > 0) {
      return false;
    }

    // 特定のテンプレート未送信フィルタ
    if (filterEmailSent.startsWith('not_sent_')) {
      const templateId = filterEmailSent.replace('not_sent_', '');
      const hasSent = team.email_history?.some(h => h.template_id === templateId) || false;
      if (hasSent) {
        return false;
      }
    }

    return true;
  });

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
                email_history?: Array<{
                  template_id: string;
                  subject: string;
                  sent_at: string;
                }>;
              }>;
              // 全チームを表示（フィルタなし）
              const allTeams = participants.map((team) => ({
                tournament_team_id: String(team.tournament_team_id),
                team_id: team.team_id,
                team_name: team.tournament_team_name || team.master_team_name || '',
                contact_person: team.contact_person,
                contact_email: team.contact_email,
                participation_status: team.participation_status,
                email_history: team.email_history || [],
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
          preset_id: selectedPreset, // 使用したテンプレートID
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

      // チーム一覧を再取得して履歴を更新
      try {
        const teamsRes = await fetch(`/api/admin/tournaments/${tournamentId}/participants`);
        if (teamsRes.ok) {
          const response = await teamsRes.json();
          if (response.success && response.data && Array.isArray(response.data.participants)) {
            const participants = response.data.participants as Array<{
              tournament_team_id: number;
              team_id: string;
              tournament_team_name?: string;
              master_team_name?: string;
              contact_person: string;
              contact_email: string;
              participation_status: string;
              email_history?: Array<{
                template_id: string;
                subject: string;
                sent_at: string;
              }>;
            }>;
            const allTeams = participants.map((team) => ({
              tournament_team_id: String(team.tournament_team_id),
              team_id: team.team_id,
              team_name: team.tournament_team_name || team.master_team_name || '',
              contact_person: team.contact_person,
              contact_email: team.contact_email,
              participation_status: team.participation_status,
              email_history: team.email_history || [],
            }));
            setTeams(allTeams);
          }
        }
      } catch (refreshError) {
        console.error('チーム一覧再取得エラー:', refreshError);
        // エラーが発生してもメイン処理は継続
      }
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
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                送信先チーム選択
              </CardTitle>
              <CardDescription>
                選択中: {selectedTeamIds.size} / {MAX_SELECTION}チーム
              </CardDescription>
            </CardHeader>
            <CardContent className="pb-4">
              {/* 送信履歴の色分け説明 */}
              <div className="mb-4 p-3 bg-muted/50 rounded-lg border">
                <div className="text-sm font-semibold text-foreground mb-2">📧 送信履歴の色分け</div>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-green-600"></span>
                    <span className="text-green-600 font-medium">参加確定通知</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-600"></span>
                    <span className="text-red-600 font-medium">参加見送り・辞退承認</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-purple-600"></span>
                    <span className="text-purple-600 font-medium">辞退却下通知</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-gray-500"></span>
                    <span className="text-muted-foreground font-medium">その他</span>
                  </div>
                </div>
              </div>

              {/* フィルタリング */}
              <div className="mb-4 p-3 bg-white rounded-lg border space-y-3">
                <div className="text-sm font-semibold text-foreground">🔍 フィルタリング</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="filterStatus" className="text-xs font-medium mb-1.5 block">参加ステータス</Label>
                    <Select value={filterStatus} onValueChange={setFilterStatus}>
                      <SelectTrigger id="filterStatus" className="h-9 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all" className="text-sm">すべて</SelectItem>
                        <SelectItem value="confirmed" className="text-sm">参加確定</SelectItem>
                        <SelectItem value="waitlisted" className="text-sm">キャンセル待ち</SelectItem>
                        <SelectItem value="cancelled" className="text-sm">キャンセル済み</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="filterEmailSent" className="text-xs font-medium mb-1.5 block">メール送信履歴</Label>
                    <Select value={filterEmailSent} onValueChange={setFilterEmailSent}>
                      <SelectTrigger id="filterEmailSent" className="h-9 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all" className="text-sm">すべて</SelectItem>
                        <SelectItem value="not_sent_participationConfirmed" className="text-sm">参加確定通知 未送信</SelectItem>
                        <SelectItem value="not_sent_participationNotSelected" className="text-sm">参加見送り通知 未送信</SelectItem>
                        <SelectItem value="not_sent_tournamentClosing" className="text-sm">大会終了のお礼 未送信</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  表示中: {filteredTeams.length}チーム / 全{teams.length}チーム
                </div>
              </div>

              <div>
                <div className="border rounded-lg divide-y max-h-[600px] overflow-y-auto">
                  {filteredTeams.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">
                      {teams.length === 0 ? '大会に参加しているチームがありません' : 'フィルタ条件に一致するチームがありません'}
                    </div>
                  ) : (
                    filteredTeams.map((team) => {
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
                            className="mt-1 w-5 h-5"
                          />
                          <Label
                            htmlFor={`team-${team.tournament_team_id}`}
                            className={`flex-1 ${isDisabled ? '' : 'cursor-pointer'}`}
                          >
                            <div className="font-medium text-base mb-1">{team.team_name}</div>
                            <div className="text-sm text-muted-foreground mb-0.5">
                              {team.contact_person} ({team.contact_email})
                            </div>
                            <div className="text-sm text-muted-foreground mb-1">
                              {statusLabel}
                            </div>
                            {(() => {
                              // 自動送信メールを除外した履歴
                              const filteredHistory = team.email_history?.filter(h => !AUTO_TEMPLATE_IDS.includes(h.template_id as typeof AUTO_TEMPLATE_IDS[number])) || [];
                              if (filteredHistory.length === 0) return null;

                              return (
                                <div className="text-sm mt-1.5 flex items-start gap-1 flex-wrap">
                                  <span className="text-muted-foreground">📧 送信履歴:</span>
                                  {filteredHistory.slice(0, 2).map((h, index) => (
                                    <span key={index}>
                                      <span className={`font-medium ${getTemplateColor(h.template_id)}`}>
                                        {getTemplateNameById(h.template_id)}
                                      </span>
                                      <span className="text-muted-foreground">({formatDate(h.sent_at)})</span>
                                      {index < Math.min(filteredHistory.length, 2) - 1 && ', '}
                                    </span>
                                  ))}
                                  {filteredHistory.length > 2 && (
                                    <span className="text-muted-foreground"> 他{filteredHistory.length - 2}件</span>
                                  )}
                                </div>
                              );
                            })()}
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
              <div className="space-y-5">
                {/* プリセット選択 */}
                <div>
                  <Label htmlFor="preset" className="text-sm font-medium">テンプレート選択</Label>
                  <Select value={selectedPreset} onValueChange={handlePresetChange}>
                    <SelectTrigger id="preset" className="mt-2 h-11 text-base">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(EMAIL_PRESETS).map(([key, preset]) => (
                        <SelectItem key={key} value={key} className="text-base">
                          {preset.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* タイトル */}
                <div>
                  <Label htmlFor="title" className="text-sm font-medium">メールタイトル *</Label>
                  <Input
                    id="title"
                    value={emailTitle}
                    onChange={(e) => setEmailTitle(e.target.value)}
                    placeholder="例: 【重要】試合日程変更のお知らせ"
                    className="mt-2 h-11 text-base"
                  />
                </div>

                {/* 本文 */}
                <div>
                  <Label htmlFor="body" className="text-sm font-medium">メール本文 *</Label>
                  <Textarea
                    id="body"
                    value={emailBody}
                    onChange={(e) => setEmailBody(e.target.value)}
                    placeholder="メール本文を入力してください"
                    rows={10}
                    className="mt-2 font-mono text-base leading-relaxed"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    改行も反映されます。大会名は自動的に追加されます。
                  </p>
                </div>

                {/* 大会運営者メールアドレス */}
                <div>
                  <Label htmlFor="organizerEmail" className="text-sm font-medium">大会運営者メールアドレス（問い合わせ先）</Label>
                  <Input
                    id="organizerEmail"
                    type="email"
                    value={organizerEmail}
                    onChange={(e) => setOrganizerEmail(e.target.value)}
                    placeholder="例: organizer@example.com"
                    className="mt-2 h-11 text-base"
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    入力すると、メール末尾に「ご不明な点は大会運営者までお問い合わせください」と表示されます。
                  </p>
                </div>

                {/* 送信ボタン */}
                <Button
                  onClick={handleSend}
                  disabled={isSending || selectedTeamIds.size === 0 || !emailTitle || !emailBody}
                  className="w-full h-12 text-base font-semibold"
                >
                  {isSending ? (
                    <>
                      <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                      送信中...
                    </>
                  ) : (
                    <>
                      <Send className="h-5 w-5 mr-2" />
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
              <CardTitle className="text-xl flex items-center gap-2">
                <CheckCircle2 className="h-6 w-6 text-blue-600" />
                プレビュー
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-white p-6 rounded-lg border">
                <div className="font-bold text-xl mb-4 border-b pb-3">{emailTitle}</div>
                <div className="whitespace-pre-wrap text-base leading-relaxed">
                  {emailBody.replace(
                    /\[URLをここに記載\]/g,
                    `${typeof window !== 'undefined' ? window.location.origin : ''}/public/tournaments/${tournamentId}`
                  )}
                </div>
                {tournamentName && (
                  <div className="mt-6 pt-4 border-t text-base text-muted-foreground">
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
