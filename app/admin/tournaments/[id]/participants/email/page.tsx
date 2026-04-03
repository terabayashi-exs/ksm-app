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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Send, AlertCircle, Loader2, Users, ChevronRight, Home } from 'lucide-react';
import Link from 'next/link';
import Header from '@/components/layout/Header';
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
  participation_status: string;
  team_members?: Array<{
    name: string;
    email: string;
    role: string;
  }>;
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
  const [filterStatus, setFilterStatus] = useState<string>('confirmed'); // confirmed, waitlisted, cancelled
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
      participationNotSelected: 'text-destructive', // 参加見送り通知 - 赤
      participationCancelled: 'text-gray-500', // キャンセル通知 - グレー
      waitlist: 'text-gray-500', // キャンセル待ち通知 - グレー
      withdrawal_approved: 'text-destructive', // 辞退承認通知 - 赤
      withdrawal_rejected: 'text-purple-600', // 辞退却下通知 - 紫
      scheduleAnnouncement: 'text-blue-600', // 大会日程・組合せ決定通知 - 青
      auto_application: 'text-gray-500', // 申請受付（自動） - グレー
      custom: 'text-gray-500', // カスタム - グレー
    };
    return colorMap[templateId] || 'text-gray-500';
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
                participation_status: string;
                team_members?: Array<{
                  name: string;
                  email: string;
                  role: string;
                }>;
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
                participation_status: team.participation_status,
                team_members: team.team_members || [],
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
    // 担当者がいないチームは選択不可
    const team = teams.find(t => t.tournament_team_id === tournamentTeamId);
    if (!team?.team_members || team.team_members.length === 0) return;

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
              participation_status: string;
              team_members?: Array<{
                name: string;
                email: string;
                role: string;
              }>;
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
              participation_status: team.participation_status,
              team_members: team.team_members || [],
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
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header />
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <nav className="flex flex-wrap items-center gap-1.5 text-sm mb-6">
          <Link href="/" className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 transition-colors whitespace-nowrap"><Home className="h-3.5 w-3.5" /><span>Home</span></Link>
          <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <Link href="/my?tab=admin" className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 transition-colors whitespace-nowrap">マイダッシュボード</Link>
          <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <span className="inline-flex items-center px-2.5 py-1.5 rounded-md bg-primary/10 text-primary font-medium">メール送信</span>
        </nav>
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">メール一括送信</h1>
          <p className="text-sm text-gray-500 mt-1">
            参加チームの代表者にメールを一括送信します
          </p>
        </div>
        <div className="space-y-6">
          {/* 注意事項 */}
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
              <div>
                <h3 className="font-semibold text-amber-800 mb-2">送信制限について</h3>
                <ul className="text-sm text-amber-700 space-y-1 list-disc list-inside">
                  <li>一度に最大{MAX_SELECTION}チームまで送信可能です</li>
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
              <div className="mb-4 p-3 bg-gray-50/50 rounded-lg border">
                <div className="text-sm font-semibold text-gray-900 mb-2">📧 送信履歴の色分け</div>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-green-600"></span>
                    <span className="text-green-600 font-medium">参加確定通知</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-600"></span>
                    <span className="text-destructive font-medium">参加見送り・辞退承認</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-purple-600"></span>
                    <span className="text-purple-600 font-medium">辞退却下通知</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span>
                    <span className="text-blue-600 font-medium">日程・組合せ通知</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-gray-500"></span>
                    <span className="text-gray-500 font-medium">その他</span>
                  </div>
                </div>
              </div>

              {/* メール送信履歴フィルタ */}
              <div className="mb-4 p-3 bg-white rounded-lg border space-y-3">
                <div className="text-sm font-semibold text-gray-900">🔍 メール送信履歴フィルタ</div>
                <div>
                  <Select value={filterEmailSent} onValueChange={setFilterEmailSent}>
                    <SelectTrigger id="filterEmailSent" className="h-9 text-sm bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white">
                      <SelectItem value="all" className="text-sm">すべて</SelectItem>
                      <SelectItem value="not_sent_participationConfirmed" className="text-sm">参加確定通知 未送信</SelectItem>
                      <SelectItem value="not_sent_participationNotSelected" className="text-sm">参加見送り通知 未送信</SelectItem>
                      <SelectItem value="not_sent_scheduleAnnouncement" className="text-sm">大会日程・組合せ決定通知 未送信</SelectItem>
                      <SelectItem value="not_sent_tournamentClosing" className="text-sm">大会終了のお礼 未送信</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="text-xs text-gray-500">
                  表示中: {filteredTeams.length}チーム / 全{teams.length}チーム
                </div>
              </div>

              {/* 参加ステータスタブ */}
              <Tabs value={filterStatus} onValueChange={setFilterStatus} className="w-full">
                <TabsList className="grid w-full grid-cols-3 mb-4">
                  <TabsTrigger
                    value="confirmed"
                    className="text-sm data-[state=active]:bg-green-600 data-[state=active]:text-white"
                  >
                    参加確定 ({teams.filter(t => t.participation_status === 'confirmed').length})
                  </TabsTrigger>
                  <TabsTrigger
                    value="waitlisted"
                    className="text-sm data-[state=active]:bg-green-600 data-[state=active]:text-white"
                  >
                    キャンセル待ち ({teams.filter(t => t.participation_status === 'waitlisted').length})
                  </TabsTrigger>
                  <TabsTrigger
                    value="cancelled"
                    className="text-sm data-[state=active]:bg-green-600 data-[state=active]:text-white"
                  >
                    キャンセル済 ({teams.filter(t => t.participation_status === 'cancelled').length})
                  </TabsTrigger>
                </TabsList>

                {/* すべてのタブで同じチームリストを表示（フィルタリング済み） */}
                {['confirmed', 'waitlisted', 'cancelled'].map((status) => (
                  <TabsContent key={status} value={status} className="mt-0">
                    <div>
                <div className="border rounded-lg divide-y max-h-[600px] overflow-y-auto">
                  {filteredTeams.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                      {teams.length === 0 ? '大会に参加しているチームがありません' : 'フィルタ条件に一致するチームがありません'}
                    </div>
                  ) : (
                    filteredTeams.map((team) => {
                      const hasNoMembers = !team.team_members || team.team_members.length === 0;
                      const isSelected = selectedTeamIds.has(team.tournament_team_id);
                      const isDisabled = hasNoMembers || (!isSelected && selectedTeamIds.size >= MAX_SELECTION);

                      return (
                        <div
                          key={team.tournament_team_id}
                          className={`p-4 flex items-start gap-3 transition-colors ${
                            hasNoMembers ? '' : isDisabled ? 'opacity-40' : 'hover:bg-gray-50/50'
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
                            {hasNoMembers && (
                              <div className="text-sm text-destructive font-medium mb-1">
                                担当者が設定されていないため、メール送信できません
                              </div>
                            )}
                            {(() => {
                              // 自動送信メールを除外した履歴
                              const filteredHistory = team.email_history?.filter(h => !AUTO_TEMPLATE_IDS.includes(h.template_id as typeof AUTO_TEMPLATE_IDS[number])) || [];
                              if (filteredHistory.length === 0) return null;

                              return (
                                <div className="text-sm mt-1.5 flex items-start gap-1 flex-wrap">
                                  <span className="text-gray-500">📧 送信履歴:</span>
                                  {filteredHistory.slice(0, 2).map((h, index) => (
                                    <span key={index}>
                                      <span className={`font-medium ${getTemplateColor(h.template_id)}`}>
                                        {getTemplateNameById(h.template_id)}
                                      </span>
                                      <span className="text-gray-500">({formatDate(h.sent_at)})</span>
                                      {index < Math.min(filteredHistory.length, 2) - 1 && ', '}
                                    </span>
                                  ))}
                                  {filteredHistory.length > 2 && (
                                    <span className="text-gray-500"> 他{filteredHistory.length - 2}件</span>
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
                  </TabsContent>
                ))}
              </Tabs>
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
                  <Label htmlFor="title" className="text-sm font-medium">メールタイトル <span className="text-destructive">*</span></Label>
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
                  <Label htmlFor="body" className="text-sm font-medium">メール本文 <span className="text-destructive">*</span></Label>
                  <Textarea
                    id="body"
                    value={emailBody}
                    onChange={(e) => setEmailBody(e.target.value)}
                    placeholder="メール本文を入力してください"
                    rows={10}
                    className="mt-2 font-mono text-base leading-relaxed"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    チーム名を挿入したい場合は、本文中に「{'{{teamName}}'}」と記載してください
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
                  <p className="text-xs text-gray-500 mt-2">
                    入力すると、メール末尾に「ご不明な点は大会運営者までお問い合わせください」と表示されます。
                  </p>
                </div>

                {/* 送信ボタン */}
                <Button
                  onClick={handleSend}
                  disabled={isSending || selectedTeamIds.size === 0}
                  className="w-full h-12 text-base font-semibold"
                  size="lg"
                >
                  {isSending ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      送信中...
                    </>
                  ) : (
                    <>
                      <Send className="mr-2 h-5 w-5" />
                      メールを送信する ({selectedTeamIds.size}チーム)
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
        </div>
      </div>
    </div>
  );
}
