// components/features/my/MyDashboardTabs.tsx
"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Shield, Users, Building2, UserPlus, Database, MapPin, Trophy, CalendarDays, Clock, Plus, UserCog, Archive, Trash2, Lock, Eye, FileEdit, ClipboardList, FileText, Star, Target, Shuffle, Settings, ChevronDown, ChevronUp, Crown, Mail, Pencil, Save, X, CheckCircle, AlertCircle, LogOut, Search } from "lucide-react";
import Image from "next/image";
import PlanBadge from "@/components/features/subscription/PlanBadge";
import IncompleteTournamentGroups from "@/components/features/tournament/IncompleteTournamentGroups";
import TournamentDashboardList from "@/components/features/tournament/TournamentDashboardList";
import { TournamentDashboardData, GroupedTournamentData, TeamDashboardItem } from "@/lib/dashboard-data";
import { Tournament } from "@/lib/types";
import { getStatusLabel } from "@/lib/tournament-status";
import { checkFormatChangeEligibility, changeFormat, type FormatChangeCheckResponse } from "@/lib/format-change";
import { FormatChangeDialog } from "@/components/features/tournament/FormatChangeDialog";
import { FormatSelectionModal } from "@/components/features/tournament/FormatSelectionModal";

type Role = "admin" | "operator" | "team";

interface Tab {
  key: "admin" | "operator" | "team";
  label: string;
  icon: React.ReactNode;
}

interface MyDashboardTabsProps {
  roles: Role[];
  isSuperadmin: boolean;
  teamIds: string[];
  initialTournamentData?: TournamentDashboardData | null;
  initialTeamData?: TeamDashboardItem[] | null;
}

export default function MyDashboardTabs(props: MyDashboardTabsProps) {
  return (
    <Suspense fallback={null}>
      <MyDashboardTabsInner {...props} />
    </Suspense>
  );
}

function MyDashboardTabsInner({ roles, isSuperadmin, teamIds, initialTournamentData, initialTeamData }: MyDashboardTabsProps) {
  const searchParams = useSearchParams();

  // 表示するタブを決定
  // チームタブは全ユーザーに必ず表示
  const tabs: Tab[] = [];

  if (roles.includes("admin") || isSuperadmin) {
    tabs.push({ key: "admin", label: "管理者", icon: <Shield className="h-4 w-4" /> });
  }

  if (roles.includes("operator")) {
    tabs.push({ key: "operator", label: "運営者", icon: <Building2 className="h-4 w-4" /> });
  }

  // チームタブは常に追加
  tabs.push({ key: "team", label: "チーム代表者", icon: <Crown className="h-4 w-4" /> });

  // URLの ?tab= パラメータで初期タブを決定（なければ先頭タブ）
  const tabParam = searchParams.get("tab") as "admin" | "operator" | "team" | null;
  const initialTab = (tabParam && tabs.some(t => t.key === tabParam)) ? tabParam : tabs[0].key;

  const [activeTab, setActiveTab] = useState<"admin" | "operator" | "team">(initialTab);

  return (
    <div>
      {/* タブナビゲーション */}
      <div className="border-b border-border">
        <nav className="-mb-px flex space-x-1" aria-label="ダッシュボードタブ">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`
                flex items-center gap-2 px-4 py-3 text-base font-medium border-b-2 transition-colors whitespace-nowrap
                ${activeTab === tab.key
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                }
              `}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* タブコンテンツ */}
      <div className="py-8">
        {activeTab === "admin" && <AdminTabContent isSuperadmin={isSuperadmin} initialTournamentData={initialTournamentData} />}
        {activeTab === "operator" && <OperatorTabContent />}
        {activeTab === "team" && <TeamTabContent teamIds={teamIds} initialTeamData={initialTeamData} />}
      </div>
    </div>
  );
}

// ─── 管理者タブ ────────────────────────────────────────────────────────────────
function AdminTabContent({ isSuperadmin, initialTournamentData }: { isSuperadmin: boolean; initialTournamentData?: TournamentDashboardData | null }) {
  const [hasIncompleteGroups, setHasIncompleteGroups] = useState<boolean | null>(null);

  return (
    <div className="space-y-8">
      {/* プラン情報 */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">現在のプラン：</span>
        <PlanBadge apiUrl="/api/my/subscription/current" />
      </div>

      {/* システム管理者メニュー（スーパーユーザーのみ） */}
      {isSuperadmin && (
        <div>
          <h2 className="text-xl font-bold text-foreground mb-4">システム管理者メニュー</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card className="border-purple-200 bg-purple-50 dark:border-purple-800 dark:bg-purple-950/20">
              <CardHeader>
                <CardTitle className="text-purple-800 dark:text-purple-200 flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  マスタ管理
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-purple-700 dark:text-purple-300 mb-4">
                  システムの基本データを管理します
                </p>
                <div className="space-y-2">
                  <Button asChild variant="outline" className="w-full border-2 border-purple-300 hover:border-purple-400 hover:bg-purple-100 dark:border-purple-700 dark:hover:border-purple-600 dark:hover:bg-purple-950/30">
                    <Link href="/admin/administrators">利用者マスタ</Link>
                  </Button>
                  <Button asChild variant="outline" className="w-full border-2 border-purple-300 hover:border-purple-400 hover:bg-purple-100 dark:border-purple-700 dark:hover:border-purple-600 dark:hover:bg-purple-950/30">
                    <Link href="/admin/sport-types">競技種別マスタ</Link>
                  </Button>
                  <Button asChild variant="outline" className="w-full border-2 border-purple-300 hover:border-purple-400 hover:bg-purple-100 dark:border-purple-700 dark:hover:border-purple-600 dark:hover:bg-purple-950/30">
                    <Link href="/admin/tournament-formats">大会フォーマット</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/20">
              <CardHeader>
                <CardTitle className="text-blue-800 dark:text-blue-200 flex items-center">
                  📢 お知らせ管理
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-blue-700 dark:text-blue-300 mb-4">
                  TOPページに表示するお知らせの作成・編集・削除を行います
                </p>
                <div className="space-y-2">
                  <Button asChild variant="outline" className="w-full border-2 border-blue-300 hover:border-blue-400 hover:bg-blue-100 dark:border-blue-700 dark:hover:border-blue-600 dark:hover:bg-blue-950/30">
                    <Link href="/admin/announcements">お知らせ管理</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* 大会管理者メニュー（全管理者） */}
      <div>
        <h2 className="text-xl font-bold text-foreground mb-4">大会管理者メニュー</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/20">
            <CardHeader>
              <CardTitle className="text-green-800 dark:text-green-200 flex items-center gap-2">
                <Trophy className="h-5 w-5" />
                大会の登録
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-green-700 dark:text-green-300 mb-4">
                新しい大会を作成します
              </p>
              <div className="space-y-2">
                <Button asChild variant="outline" className="w-full border-2 border-green-300 hover:border-green-400 hover:bg-green-100 dark:border-green-700 dark:hover:border-green-600 dark:hover:bg-green-950/30">
                  <Link href="/admin/tournament-groups/create">大会を作成する</Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/20">
            <CardHeader>
              <CardTitle className="text-blue-800 dark:text-blue-200 flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                会場の管理
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-blue-700 dark:text-blue-300 mb-4">
                大会運営に必要な基本データを管理します
              </p>
              <div className="space-y-2">
                <Button asChild variant="outline" className="w-full border-2 border-blue-300 hover:border-blue-400 hover:bg-blue-100 dark:border-blue-700 dark:hover:border-blue-600 dark:hover:bg-blue-950/30">
                  <Link href="/admin/venues">会場を登録する</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 作成中の大会（1件以上ある場合のみ表示） */}
      {hasIncompleteGroups && (
        <div>
          <Card className="border-2 border-amber-300 bg-amber-50/50 dark:border-amber-700 dark:bg-amber-950/10">
            <CardHeader>
              <CardTitle className="text-amber-800 dark:text-amber-200 flex items-center gap-2">
                ⚠️ 作成中の大会
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-amber-700 dark:text-amber-300 mb-4 text-sm">
                大会は作成されましたが、まだ部門が設定されていません。
                部門を作成して大会を完成させましょう。
              </p>
              <IncompleteTournamentGroups onCountChange={(count) => setHasIncompleteGroups(count > 0)} />
            </CardContent>
          </Card>
        </div>
      )}

      {/* 大会状況 */}
      <div>
        <div className="mb-4">
          <h2 className="text-xl font-bold text-foreground">大会状況</h2>
        </div>
        {initialTournamentData ? (
          <TournamentStatusList data={initialTournamentData} />
        ) : (
          <TournamentDashboardList />
        )}
      </div>
    </div>
  );
}

// ─── 大会状況リスト（サーバーデータを使った表示専用コンポーネント） ────────────
function TournamentStatusList({ data }: { data: TournamentDashboardData }) {
  const router = useRouter();
  const { data: session } = useSession();
  const isAdminUser = session?.user?.id === 'admin';

  // 削除・アーカイブ中フラグ
  const [deleting, setDeleting] = useState<number | null>(null);
  const [archiving, setArchiving] = useState<number | null>(null);

  // フォーマット変更関連のstate
  const [showFormatSelectionModal, setShowFormatSelectionModal] = useState(false);
  const [showFormatChangeDialog, setShowFormatChangeDialog] = useState(false);
  const [formatChangeCheckResult, setFormatChangeCheckResult] = useState<FormatChangeCheckResponse['data'] | null>(null);
  const [selectedTournamentId, setSelectedTournamentId] = useState<number | null>(null);
  const [isFormatChanging, setIsFormatChanging] = useState(false);
  const [availableFormats, setAvailableFormats] = useState<Array<{ format_id: number; format_name: string; target_team_count: number; format_description?: string; template_count?: number }>>([]);
  const [selectedNewFormatId, setSelectedNewFormatId] = useState<number | null>(null);
  const [selectedNewFormatName, setSelectedNewFormatName] = useState<string>('');

  // フォーマット一覧は初回レンダー時に取得
  const [formatsLoaded, setFormatsLoaded] = useState(false);
  const loadFormats = async () => {
    if (formatsLoaded) return;
    try {
      const res = await fetch('/api/admin/tournament-formats');
      const result = await res.json();
      if (result.success && result.formats) setAvailableFormats(result.formats);
    } catch (err) {
      console.error('フォーマット取得エラー:', err);
    }
    setFormatsLoaded(true);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  // 削除ハンドラ
  const handleDeleteTournament = async (tournament: Tournament) => {
    let confirmMessage: string;
    let deleteUrl: string;
    if (tournament.is_archived) {
      confirmMessage = `アーカイブ済み大会「${tournament.tournament_name}」を削除してもよろしいですか？\n\n⚠️ この操作は取り消せません。以下のデータが削除されます：\n・アーカイブ済みのデータベースデータ\n・JSONアーカイブデータ\n・Blobアーカイブデータ\n・大会メインレコード`;
      deleteUrl = `/api/admin/tournaments/${tournament.tournament_id}/delete-data`;
    } else {
      confirmMessage = `大会「${tournament.tournament_name}」を削除してもよろしいですか？\n\n⚠️ この操作は取り消せません。関連する以下のデータも全て削除されます：\n・参加チーム情報\n・選手情報\n・試合データ\n・結果データ`;
      deleteUrl = `/api/tournaments/${tournament.tournament_id}`;
    }
    if (!confirm(confirmMessage)) return;
    setDeleting(tournament.tournament_id);
    try {
      const response = await fetch(deleteUrl, { method: 'DELETE' });
      const result = await response.json();
      if (result.success) {
        alert(tournament.is_archived ? `✅ アーカイブ済み大会を完全削除しました。` : result.message || '部門を削除しました');
        router.refresh();
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

  // アーカイブハンドラ
  const handleArchiveTournament = async (tournament: Tournament) => {
    if (!confirm(`大会「${tournament.tournament_name}」をアーカイブしますか？\n\n⚠️ この操作は取り消せません。`)) return;
    setArchiving(tournament.tournament_id);
    try {
      const archiveRes = await fetch(`/api/tournaments/${tournament.tournament_id}/archive`, { method: 'POST' });
      const archiveResult = await archiveRes.json();
      if (!archiveResult.success) { alert(`アーカイブエラー: ${archiveResult.error}`); return; }
      const cleanupRes = await fetch(`/api/admin/tournaments/${tournament.tournament_id}/archive-cleanup`, { method: 'DELETE' });
      const cleanupResult = await cleanupRes.json();
      alert(cleanupResult.success
        ? `✅ アーカイブとクリーンアップが完了しました。`
        : `⚠️ アーカイブは完了しましたが、クリーンアップでエラーが発生しました。\n${cleanupResult.error}`);
      router.refresh();
    } catch (err) {
      console.error('アーカイブエラー:', err);
      alert('アーカイブ処理中にエラーが発生しました');
    } finally {
      setArchiving(null);
    }
  };

  // 組合せ作成クリック
  const handleDrawClick = (tournament: Tournament) => {
    const confirmedCount = tournament.confirmed_count || 0;
    const expectedCount = tournament.team_count;
    const waitlistedCount = tournament.waitlisted_count || 0;
    if (confirmedCount !== expectedCount) {
      const message = `⚠️ チーム数の確認\n\n参加確定: ${confirmedCount}チーム\n想定チーム数: ${expectedCount}チーム\nキャンセル待ち: ${waitlistedCount}チーム\n\n想定チーム数と異なりますが、このまま組合せ作成画面に進みますか？`;
      if (!confirm(message)) return;
    }
    router.push(`/admin/tournaments/${tournament.tournament_id}/draw`);
  };

  // フォーマット変更クリック
  const handleFormatChangeClick = async (tournament: Tournament) => {
    await loadFormats();
    setSelectedTournamentId(tournament.tournament_id);
    setIsFormatChanging(true);
    try {
      const checkResult = await checkFormatChangeEligibility(tournament.tournament_id);
      if (checkResult.success && checkResult.data) {
        setFormatChangeCheckResult(checkResult.data);
        const otherFormats = availableFormats.filter(f => f.format_id !== checkResult.data!.current_format_id);
        if (otherFormats.length === 0) {
          alert(`変更可能な他のフォーマットが見つかりません。`);
          setIsFormatChanging(false);
          return;
        }
        setShowFormatSelectionModal(true);
      } else {
        alert(`変更可否チェックエラー: ${checkResult.error}`);
      }
    } catch (err) {
      console.error('フォーマット変更チェックエラー:', err);
      alert('フォーマット変更チェック中にエラーが発生しました');
    } finally {
      setIsFormatChanging(false);
    }
  };

  const handleFormatSelection = (formatId: number, formatName: string) => {
    setSelectedNewFormatId(formatId);
    setSelectedNewFormatName(formatName);
    setShowFormatSelectionModal(false);
    setShowFormatChangeDialog(true);
  };

  const handleConfirmFormatChange = async () => {
    if (!selectedTournamentId || !selectedNewFormatId) return;
    setIsFormatChanging(true);
    try {
      const result = await changeFormat(selectedTournamentId, selectedNewFormatId, true);
      if (result.success) {
        alert(`✅ ${result.message}\n\n次は「組合せ作成・編集」から新しいフォーマットでチームを配置してください。`);
        router.refresh();
        setShowFormatChangeDialog(false);
        setSelectedTournamentId(null);
        setSelectedNewFormatId(null);
        setFormatChangeCheckResult(null);
      } else {
        alert(`フォーマット変更エラー: ${result.error}`);
        setShowFormatChangeDialog(false);
      }
    } catch (err) {
      console.error('フォーマット変更エラー:', err);
      alert('フォーマット変更中にエラーが発生しました');
    } finally {
      setIsFormatChanging(false);
    }
  };

  const TournamentCard = ({ tournament }: { tournament: Tournament }) => (
    <div className="border rounded-lg overflow-hidden hover:shadow-md transition-shadow relative">
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
            <h4 className="font-semibold text-lg text-gray-900 dark:text-gray-100">{tournament.tournament_name}</h4>
            <div className="flex items-center text-sm text-gray-600 dark:text-gray-400 mt-1">
              <Trophy className="w-4 h-4 mr-1" />
              <span>{tournament.format_name || `フォーマットID: ${tournament.format_id}`}</span>
            </div>
            {tournament.organization_name && (
              <div className="flex items-center text-xs text-gray-500 dark:text-gray-500 mt-1">
                <span>主催: {tournament.organization_name}</span>
              </div>
            )}
          </div>
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
            {getStatusLabel(tournament.status)}
          </div>
        </div>

        <div className="space-y-2 mb-4">
          <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
            <CalendarDays className="w-4 h-4 mr-2" />
            <span>
              {tournament.event_start_date ? formatDate(tournament.event_start_date) : '日程未定'}
              {tournament.event_end_date && tournament.event_end_date !== tournament.event_start_date &&
                ` - ${formatDate(tournament.event_end_date)}`}
            </span>
          </div>
          {/* 参加状況 */}
          {((tournament.confirmed_count ?? 0) > 0 || (tournament.waitlisted_count ?? 0) > 0 || (tournament.withdrawal_requested_count ?? 0) > 0 || (tournament.cancelled_count ?? 0) > 0) && (
            <div className="mt-3">
              <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">参加状況</div>
              <div className="grid grid-cols-5 gap-2">
                <div className="p-2 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800 text-center">
                  <div className="text-xs text-blue-700 dark:text-blue-400 font-medium mb-1">想定チーム数</div>
                  <div className="text-lg font-bold text-blue-700 dark:text-blue-400">{tournament.team_count}</div>
                </div>
                <div className="p-2 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-800 text-center">
                  <div className="text-xs text-green-700 dark:text-green-400 font-medium mb-1">参加確定</div>
                  <div className="text-lg font-bold text-green-700 dark:text-green-400">{tournament.confirmed_count || 0}</div>
                </div>
                <div className="p-2 bg-orange-50 dark:bg-orange-950/20 rounded-lg border border-orange-200 dark:border-orange-800 text-center">
                  <div className="text-xs text-orange-700 dark:text-orange-400 font-medium mb-1">キャンセル待ち</div>
                  <div className="text-lg font-bold text-orange-700 dark:text-orange-400">{tournament.waitlisted_count || 0}</div>
                </div>
                <div className="p-2 bg-yellow-50 dark:bg-yellow-950/20 rounded-lg border border-yellow-200 dark:border-yellow-800 text-center">
                  <div className="text-xs text-yellow-700 dark:text-yellow-400 font-medium mb-1">辞退申請中</div>
                  <div className="text-lg font-bold text-yellow-700 dark:text-yellow-400">{tournament.withdrawal_requested_count || 0}</div>
                </div>
                <div className="p-2 bg-gray-50 dark:bg-gray-950/20 rounded-lg border border-gray-200 dark:border-gray-800 text-center">
                  <div className="text-xs text-gray-700 dark:text-gray-400 font-medium mb-1">キャンセル済</div>
                  <div className="text-lg font-bold text-gray-700 dark:text-gray-400">{tournament.cancelled_count || 0}</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 操作ボタン（カテゴリ別） */}
        {!tournament.is_archived ? (
          <div className="space-y-3 pt-1">

            {/* ── 基本情報 ── */}
            <div>
              <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">基本情報</p>
              <div className="flex gap-2 flex-wrap">
                <Button asChild size="sm" variant="outline" className="text-sm hover:border-blue-300 hover:bg-blue-50">
                  <Link href={`/admin/tournaments/${tournament.tournament_id}`} target="_blank" rel="noopener noreferrer">
                    <Eye className="w-4 h-4 mr-1" />
                    公開画面を見る
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline" className="text-sm hover:border-blue-300 hover:bg-blue-50">
                  <Link href={`/admin/tournaments/${tournament.tournament_id}/edit`}>
                    <FileEdit className="w-4 h-4 mr-1" />
                    部門編集
                  </Link>
                </Button>
              </div>
            </div>

            {/* ── 事前準備 ── */}
            <div>
              <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">事前準備</p>
              <div className="flex gap-2 flex-wrap">
                {/* チーム登録・組合せ・フォーマット変更は planning/recruiting/before_event のみ有効 */}
                {(tournament.status === 'planning' || tournament.status === 'recruiting' || tournament.status === 'before_event') ? (
                  <>
                    <Button asChild size="sm" variant="outline" className="text-sm hover:border-blue-300 hover:bg-blue-50">
                      <Link href={`/admin/tournaments/${tournament.tournament_id}/teams`}>
                        <Users className="w-4 h-4 mr-1" />
                        チーム手動登録
                      </Link>
                    </Button>
                    <Button asChild size="sm" variant="outline" className="text-sm border-blue-200 text-blue-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700">
                      <Link href={`/admin/tournaments/${tournament.tournament_id}/participants`}>
                        <Users className="w-4 h-4 mr-1" />
                        参加チーム管理
                      </Link>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDrawClick(tournament)}
                      className="text-sm hover:border-blue-300 hover:bg-blue-50"
                    >
                      <Shuffle className="w-4 h-4 mr-1" />
                      組合せ作成・編集
                    </Button>
                    <Button asChild size="sm" variant="outline" className="text-sm hover:border-blue-300 hover:bg-blue-50">
                      <Link href={`/admin/tournaments/${tournament.tournament_id}/courts`}>
                        <MapPin className="w-4 h-4 mr-1" />
                        コート名設定
                      </Link>
                    </Button>
                    <Button asChild size="sm" variant="outline" className="text-sm hover:border-green-300 hover:bg-green-50">
                      <Link href={`/admin/tournaments/${tournament.tournament_id}/rules`}>
                        <FileText className="w-4 h-4 mr-1" />
                        ルール設定
                      </Link>
                    </Button>
                    <Button asChild size="sm" variant="outline" className="text-sm hover:border-blue-300 hover:bg-blue-50">
                      <Link href={`/admin/tournaments/${tournament.tournament_id}/match-overrides`}>
                        <Target className="w-4 h-4 mr-1" />
                        選出条件変更
                      </Link>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleFormatChangeClick(tournament)}
                      disabled={isFormatChanging && selectedTournamentId === tournament.tournament_id}
                      className="text-sm border-orange-200 text-orange-600 hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
                      title="部門のフォーマットを変更（試合データは削除されます）"
                    >
                      {isFormatChanging && selectedTournamentId === tournament.tournament_id ? (
                        <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-orange-600 mr-1" />確認中...</>
                      ) : (
                        <><Settings className="w-4 h-4 mr-1" />フォーマット変更</>
                      )}
                    </Button>
                  </>
                ) : (
                  /* 開催中・完了: 変更系は無効表示、参加チーム管理のみ有効 */
                  <>
                    <Button size="sm" variant="outline" disabled className="text-sm cursor-not-allowed opacity-50" title="開催中のため変更できません">
                      <Lock className="w-4 h-4 mr-1" />
                      チーム手動登録
                    </Button>
                    <Button asChild size="sm" variant="outline" className="text-sm border-blue-200 text-blue-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700">
                      <Link href={`/admin/tournaments/${tournament.tournament_id}/participants`}>
                        <Users className="w-4 h-4 mr-1" />
                        参加チーム管理
                      </Link>
                    </Button>
                    <Button size="sm" variant="outline" disabled className="text-sm cursor-not-allowed opacity-50" title="開催中のため変更できません">
                      <Lock className="w-4 h-4 mr-1" />
                      組合せ作成・編集
                    </Button>
                    <Button asChild size="sm" variant="outline" className="text-sm hover:border-blue-300 hover:bg-blue-50">
                      <Link href={`/admin/tournaments/${tournament.tournament_id}/courts`}>
                        <MapPin className="w-4 h-4 mr-1" />
                        コート名設定
                      </Link>
                    </Button>
                    <Button asChild size="sm" variant="outline" className="text-sm hover:border-green-300 hover:bg-green-50">
                      <Link href={`/admin/tournaments/${tournament.tournament_id}/rules`}>
                        <FileText className="w-4 h-4 mr-1" />
                        ルール設定
                      </Link>
                    </Button>
                    <Button asChild size="sm" variant="outline" className="text-sm hover:border-blue-300 hover:bg-blue-50">
                      <Link href={`/admin/tournaments/${tournament.tournament_id}/match-overrides`}>
                        <Target className="w-4 h-4 mr-1" />
                        選出条件変更
                      </Link>
                    </Button>
                    <Button size="sm" variant="outline" disabled className="text-sm cursor-not-allowed opacity-50" title="開催中のため変更できません">
                      <Lock className="w-4 h-4 mr-1" />
                      フォーマット変更
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* ── 当日運営 ── */}
            <div>
              <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">当日運営</p>
              <div className="flex gap-2 flex-wrap">
                <Button asChild size="sm" variant="outline" className="text-sm hover:border-blue-300 hover:bg-blue-50">
                  <Link href={`/admin/tournaments/${tournament.tournament_id}/matches`}>
                    <ClipboardList className="w-4 h-4 mr-1" />
                    試合結果入力
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline" className="text-sm hover:border-blue-300 hover:bg-blue-50">
                  <Link href={`/admin/tournaments/${tournament.tournament_id}/manual-rankings`}>
                    <Trophy className="w-4 h-4 mr-1" />
                    順位設定
                  </Link>
                </Button>
              </div>
            </div>

            {/* ── 管理・その他 ── */}
            <div>
              <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">管理・その他</p>
              <div className="flex gap-2 flex-wrap">
                <Button asChild size="sm" variant="outline" className="text-sm hover:border-blue-300 hover:bg-blue-50">
                  <Link href={`/admin/tournaments/${tournament.tournament_id}/files`}>
                    <FileText className="w-4 h-4 mr-1" />
                    ファイル管理
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline" className="text-sm hover:border-yellow-300 hover:bg-yellow-50">
                  <Link href={`/admin/tournaments/${tournament.tournament_id}/sponsor-banners`}>
                    <Star className="w-4 h-4 mr-1" />
                    スポンサー管理
                  </Link>
                </Button>
                {isAdminUser && (
                  tournament.status === 'completed' ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleArchiveTournament(tournament)}
                      disabled={archiving === tournament.tournament_id}
                      className="text-sm hover:border-purple-300 hover:bg-purple-50"
                    >
                      {archiving === tournament.tournament_id ? (
                        <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-600 mr-1" />アーカイブ中...</>
                      ) : (
                        <><Archive className="w-4 h-4 mr-1" />アーカイブ</>
                      )}
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" disabled className="text-sm cursor-not-allowed opacity-50" title="大会終了後にアーカイブできます">
                      <Lock className="w-4 h-4 mr-1" />
                      アーカイブ
                    </Button>
                  )
                )}
                {isAdminUser && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDeleteTournament(tournament)}
                    disabled={deleting === tournament.tournament_id}
                    className="text-sm border-red-200 text-red-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                  >
                    {deleting === tournament.tournament_id ? (
                      <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600 mr-1" />削除中...</>
                    ) : (
                      <><Trash2 className="w-4 h-4 mr-1" />削除</>
                    )}
                  </Button>
                )}
              </div>
            </div>

          </div>
        ) : (
          /* アーカイブ済み */
          <div className="pt-1">
            <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">管理・その他</p>
            <div className="flex gap-2 flex-wrap">
              <Button asChild size="sm" variant="outline" className="text-sm hover:border-blue-300 hover:bg-blue-50">
                <Link href={`/admin/tournaments/${tournament.tournament_id}`} target="_blank" rel="noopener noreferrer">
                  <Eye className="w-4 h-4 mr-1" />
                  公開画面を見る
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline" className="text-sm hover:border-purple-300 hover:bg-purple-50">
                <Link href={`/public/tournaments/${tournament.tournament_id}/archived`}>
                  <Archive className="w-4 h-4 mr-1" />
                  アーカイブ表示
                </Link>
              </Button>
              {isAdminUser && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDeleteTournament(tournament)}
                  disabled={deleting === tournament.tournament_id}
                  className="text-sm border-red-200 text-red-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                >
                  {deleting === tournament.tournament_id ? (
                    <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600 mr-1" />削除中...</>
                  ) : (
                    <><Trash2 className="w-4 h-4 mr-1" />削除</>
                  )}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderGroupedSection = (groupedData: GroupedTournamentData) => {
    const groups = Object.values(groupedData.grouped);
    const ungrouped = groupedData.ungrouped;

    return (
      <>
        {groups.map(({ group, tournaments: divisions }) => (
          <Card key={group.group_id} className="overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <CardTitle className="text-2xl mb-2">{group.group_name}</CardTitle>
                  {group.group_description && (
                    <p className="text-sm text-muted-foreground mb-3">{group.group_description}</p>
                  )}
                </div>
                <div className="flex-shrink-0 flex gap-2 flex-wrap justify-end">
                  <Button asChild size="sm" variant="outline" className="text-sm border-blue-400 bg-white/70 hover:bg-white dark:border-blue-500 dark:bg-blue-950/50 dark:hover:bg-blue-950">
                    <Link href={`/admin/tournament-groups/${group.group_id}/edit`}>
                      <FileEdit className="w-4 h-4 mr-1" />
                      大会編集
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="outline" className="text-sm border-blue-400 bg-white/70 hover:bg-white dark:border-blue-500 dark:bg-blue-950/50 dark:hover:bg-blue-950">
                    <Link href={`/admin/operators?group_id=${group.group_id}`}>
                      <UserCog className="w-4 h-4 mr-1" />
                      運営者管理
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="outline" className="text-sm border-blue-400 bg-white/70 hover:bg-white dark:border-blue-500 dark:bg-blue-950/50 dark:hover:bg-blue-950">
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
                    <TournamentCard key={division.tournament_id} tournament={division} />
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {ungrouped.map((division) => (
          <TournamentCard key={division.tournament_id} tournament={division} />
        ))}
      </>
    );
  };

  const totalGroups = (groupedData: GroupedTournamentData) =>
    Object.keys(groupedData.grouped).length + groupedData.ungrouped.length;

  return (
    <>
    {/* フォーマット変更ダイアログ */}
    {showFormatSelectionModal && formatChangeCheckResult && (
      <FormatSelectionModal
        currentFormatId={formatChangeCheckResult.current_format_id}
        currentFormatName={formatChangeCheckResult.current_format_name}
        availableFormats={availableFormats}
        onSelect={handleFormatSelection}
        onCancel={() => { setShowFormatSelectionModal(false); setSelectedTournamentId(null); }}
      />
    )}
    {showFormatChangeDialog && formatChangeCheckResult && (
      <FormatChangeDialog
        checkResult={formatChangeCheckResult}
        newFormatName={selectedNewFormatName}
        onConfirm={handleConfirmFormatChange}
        onCancel={() => { setShowFormatChangeDialog(false); setSelectedTournamentId(null); }}
        isProcessing={isFormatChanging}
      />
    )}
    <div className="space-y-6">
      {/* 募集前の大会 */}
      {data.planning.length > 0 && (
        <>
          <div className="flex items-center text-gray-500 mb-4">
            <Clock className="w-5 h-5 mr-2" />
            <h3 className="text-xl font-bold">募集前の大会 ({totalGroups(data.grouped.planning)}件)</h3>
          </div>
          {renderGroupedSection(data.grouped.planning)}
        </>
      )}

      {/* 開催中の大会 */}
      {data.ongoing.length > 0 && (
        <>
          <div className="flex items-center text-green-700 mb-4">
            <Trophy className="w-5 h-5 mr-2" />
            <h3 className="text-xl font-bold">開催中の大会 ({totalGroups(data.grouped.ongoing)}件)</h3>
          </div>
          {renderGroupedSection(data.grouped.ongoing)}
        </>
      )}

      {/* 募集中の大会 */}
      {data.recruiting.length > 0 && (
        <>
          <div className="flex items-center text-blue-700 mb-4 mt-8">
            <CalendarDays className="w-5 h-5 mr-2" />
            <h3 className="text-xl font-bold">募集中の大会 ({totalGroups(data.grouped.recruiting)}件)</h3>
          </div>
          {renderGroupedSection(data.grouped.recruiting)}
        </>
      )}

      {/* 開催前の大会 */}
      {data.before_event.length > 0 && (
        <>
          <div className="flex items-center text-orange-700 mb-4 mt-8">
            <CalendarDays className="w-5 h-5 mr-2" />
            <h3 className="text-xl font-bold">開催前の大会 ({totalGroups(data.grouped.before_event)}件)</h3>
          </div>
          {renderGroupedSection(data.grouped.before_event)}
        </>
      )}

      {/* 完了した大会 */}
      {data.completed.length > 0 && (
        <>
          <div className="flex items-center text-gray-700 mb-4 mt-8">
            <Trophy className="w-5 h-5 mr-2" />
            <h3 className="text-xl font-bold">完了した大会（過去1年以内） ({totalGroups(data.grouped.completed)}件)</h3>
          </div>
          {renderGroupedSection(data.grouped.completed)}
        </>
      )}

      {/* 大会がない場合 */}
      {data.total === 0 && (
        <Card>
          <CardContent className="text-center py-12">
            <Trophy className="w-12 h-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
              現在、表示可能な大会はありません
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              新しい大会を作成して参加チームの募集を開始しましょう
            </p>
            <Button asChild>
              <Link href="/admin/tournament-groups/create">大会を作成する</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
    </>
  );
}

// ─── 運営者タブ（準備中） ──────────────────────────────────────────────────────
function OperatorTabContent() {
  return (
    <div className="text-center py-12 text-muted-foreground">
      <Building2 className="h-12 w-12 mx-auto mb-4 opacity-30" />
      <p className="text-lg font-medium text-foreground">運営者機能</p>
      <p className="text-sm mt-2">準備中です</p>
    </div>
  );
}

// ─── チームタブ ────────────────────────────────────────────────────────────────
// ── チーム管理タブ用 型定義 ──────────────────────────────
interface TeamInfo {
  team_id: string;
  team_name: string;
  team_omission: string | null;
  contact_person: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  is_active: boolean;
  member_role: string;
  joined_at: string;
  player_count: number;
  manager_count: number;
}
interface TeamManager {
  login_user_id: number;
  display_name: string;
  email: string;
  member_role: string;
}
interface TeamInvitation {
  id: number;
  invited_email: string;
  status: string;
  expires_at: string;
}
interface TeamPlayer {
  player_id: number;
  player_name: string;
  jersey_number: number | null;
  is_active: boolean;
}
interface PlayerForm {
  player_id?: number;
  player_name: string;
  jersey_number: string;
}
interface JoinedTournament {
  tournament_id: number;
  tournament_name: string;
  event_start_date: string | null;
  tournament_team_id: number;
  tournament_team_name: string;
  participation_status: string;
  assigned_block: string | null;
}
interface AvailableTournament {
  tournament_id: number;
  tournament_name: string;
  event_start_date: string | null;
  event_end_date: string | null;
  venue_name: string | null;
  recruitment_end_date: string | null;
  tournament_group_id: number | null;
  group_name: string | null;
  group_order: number | null;
}
type TeamPanelTab = 'managers' | 'players' | 'tournaments';

// ── チームカード展開パネル ──────────────────────────────
function TeamExpandedPanel({ team, onDataChange }: {
  team: TeamInfo;
  onDataChange: () => void;
}) {
  const teamId = team.team_id;
  const [activeTab, setActiveTab] = useState<TeamPanelTab>('managers');
  const [panelMsg, setPanelMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 担当者・招待
  const [managers, setManagers] = useState<TeamManager[]>([]);
  const [invitations, setInvitations] = useState<TeamInvitation[]>([]);
  const [managersLoading, setManagersLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [cancelling, setCancelling] = useState<number | null>(null);
  const [leaving, setLeaving] = useState<number | null>(null);

  // 選手
  const [players, setPlayers] = useState<TeamPlayer[]>([]);
  const [playersLoading, setPlayersLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [formPlayers, setFormPlayers] = useState<PlayerForm[]>([]);
  const [saving, setSaving] = useState(false);

  // 大会
  const [joined, setJoined] = useState<JoinedTournament[]>([]);
  const [available, setAvailable] = useState<AvailableTournament[]>([]);
  const [tournamentsLoading, setTournamentsLoading] = useState(true);

  // 検索関連
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [selectedPrefecture, setSelectedPrefecture] = useState<string>('');
  const [selectedSportType, setSelectedSportType] = useState<string>('');
  const [prefectures, setPrefectures] = useState<Array<{prefecture_id: number; prefecture_name: string}>>([]);
  const [sportTypes, setSportTypes] = useState<Array<{sport_type_id: number; sport_name: string; sport_code: string}>>([]);

  const fetchManagers = useCallback(async () => {
    setManagersLoading(true);
    try {
      const [mRes, iRes] = await Promise.all([
        fetch(`/api/my/teams/${teamId}/managers`),
        fetch(`/api/my/teams/invite?team_id=${teamId}`),
      ]);
      if (mRes.ok && iRes.ok) {
        const [mData, iData] = await Promise.all([mRes.json(), iRes.json()]);
        if (mData.success) setManagers(mData.data);
        if (iData.success) setInvitations(iData.data.filter((i: TeamInvitation) => i.status === 'pending'));
      }
    } finally {
      setManagersLoading(false);
    }
  }, [teamId]);

  const fetchPlayers = useCallback(async () => {
    setPlayersLoading(true);
    try {
      const res = await fetch(`/api/my/teams/${teamId}/players`);
      if (!res.ok) return;
      const result = await res.json();
      if (result.success) setPlayers(result.data);
    } finally {
      setPlayersLoading(false);
    }
  }, [teamId]);

  const fetchTournaments = useCallback(async (keyword = '', prefectureId = '', sportTypeId = '') => {
    setTournamentsLoading(true);
    try {
      const params = new URLSearchParams();
      if (keyword) params.set('keyword', keyword);
      if (prefectureId) params.set('prefectureId', prefectureId);
      if (sportTypeId) params.set('sportTypeId', sportTypeId);

      const res = await fetch(`/api/my/teams/${teamId}/tournaments?${params}`);
      if (!res.ok) return;
      const result = await res.json();
      if (result.success) {
        setJoined(result.data.joined);
        setAvailable(result.data.available);
      }
    } finally {
      setTournamentsLoading(false);
    }
  }, [teamId]);

  // 検索実行
  const handleSearch = useCallback(() => {
    fetchTournaments(searchKeyword, selectedPrefecture, selectedSportType);
  }, [fetchTournaments, searchKeyword, selectedPrefecture, selectedSportType]);

  // 検索クリア
  const handleClearSearch = useCallback(() => {
    setSearchKeyword('');
    setSelectedPrefecture('');
    setSelectedSportType('');
    fetchTournaments('', '', '');
  }, [fetchTournaments]);

  useEffect(() => { fetchManagers(); }, [fetchManagers]);
  useEffect(() => { if (activeTab === 'players') fetchPlayers(); }, [activeTab, fetchPlayers]);
  useEffect(() => { if (activeTab === 'tournaments') fetchTournaments(); }, [activeTab, fetchTournaments]);

  // 都道府県マスタ取得
  useEffect(() => {
    fetch('/api/prefectures')
      .then(res => res.json())
      .then(data => {
        if (data.success) setPrefectures(data.prefectures);
      })
      .catch(err => console.error('Failed to fetch prefectures:', err));
  }, []);

  // 競技種別マスタ取得
  useEffect(() => {
    fetch('/api/sport-types')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.data) setSportTypes(data.data);
      })
      .catch(err => console.error('Failed to fetch sport types:', err));
  }, []);

  // 競技種別アイコン取得
  const getSportIcon = (sportCode: string) => {
    switch (sportCode) {
      case 'soccer': return '⚽';
      case 'baseball': return '⚾';
      case 'basketball': return '🏀';
      case 'pk': return '🥅'; // PKはゴールネットアイコンで区別
      default: return '⚽';
    }
  };

  // 招待送信
  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true); setPanelMsg(null);
    try {
      const res = await fetch('/api/my/teams/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team_id: teamId, invited_email: inviteEmail.trim() }),
      });
      const result = await res.json();
      if (result.success) {
        setPanelMsg({ type: 'success', text: `${inviteEmail} に招待メールを送信しました` });
        setInviteEmail(''); fetchManagers(); onDataChange();
      } else { setPanelMsg({ type: 'error', text: result.error }); }
    } catch { setPanelMsg({ type: 'error', text: '招待の送信に失敗しました' }); }
    finally { setInviting(false); }
  };

  // 招待取消
  const handleCancelInvite = async (id: number) => {
    if (!confirm('この招待をキャンセルしますか？')) return;
    setCancelling(id);
    try {
      const res = await fetch('/api/my/teams/invite', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invitation_id: id }),
      });
      const result = await res.json();
      if (result.success) { setPanelMsg({ type: 'success', text: '招待をキャンセルしました' }); fetchManagers(); }
      else { setPanelMsg({ type: 'error', text: result.error }); }
    } catch { setPanelMsg({ type: 'error', text: 'キャンセルに失敗しました' }); }
    finally { setCancelling(null); }
  };

  // チーム脱退
  const handleLeaveTeam = async (loginUserId: number) => {
    const managerCount = managers.length;
    let confirmMessage: string;

    if (managerCount === 1) {
      confirmMessage = `あなたは唯一の担当者です。脱退するとチームごと削除されます。\n\nチーム「${team.team_name}」を削除してもよろしいですか？\n\n※大会参加履歴がある場合は削除できません。`;
    } else {
      confirmMessage = `チーム「${team.team_name}」から脱退しますか？`;
    }

    if (!confirm(confirmMessage)) return;
    setLeaving(loginUserId);
    setPanelMsg(null);
    try {
      const res = await fetch(`/api/my/teams/${teamId}/leave`, {
        method: 'DELETE',
      });
      const result = await res.json();
      if (result.success) {
        if (result.teamDeleted) {
          setPanelMsg({ type: 'success', text: 'チームを削除しました' });
          setTimeout(() => onDataChange(), 1500);
        } else {
          setPanelMsg({ type: 'success', text: 'チームから脱退しました' });
          fetchManagers();
          onDataChange();
        }
      } else {
        setPanelMsg({ type: 'error', text: result.error });
      }
    } catch {
      setPanelMsg({ type: 'error', text: '処理に失敗しました' });
    } finally {
      setLeaving(null);
    }
  };

  // 選手編集開始
  const startEdit = () => {
    setFormPlayers(players.map(p => ({
      player_id: p.player_id,
      player_name: p.player_name,
      jersey_number: p.jersey_number != null ? String(p.jersey_number) : '',
    })));
    setEditMode(true); setPanelMsg(null);
  };

  // 選手保存
  const handleSavePlayers = async () => {
    const names = formPlayers.map(p => p.player_name.trim()).filter(Boolean);
    if (names.length !== formPlayers.length) { setPanelMsg({ type: 'error', text: '選手名を入力してください' }); return; }
    if (new Set(names).size !== names.length) { setPanelMsg({ type: 'error', text: '選手名が重複しています' }); return; }
    const jerseys = formPlayers.map(p => p.jersey_number).filter(n => n !== '');
    if (new Set(jerseys).size !== jerseys.length) { setPanelMsg({ type: 'error', text: '背番号が重複しています' }); return; }
    setSaving(true); setPanelMsg(null);
    try {
      const payload = formPlayers.map(p => ({
        ...(p.player_id ? { player_id: p.player_id } : {}),
        player_name: p.player_name.trim(),
        jersey_number: p.jersey_number !== '' ? Number(p.jersey_number) : null,
      }));
      const res = await fetch(`/api/my/teams/${teamId}/players`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ players: payload }),
      });
      const result = await res.json();
      if (result.success) {
        setPanelMsg({ type: 'success', text: '選手情報を保存しました' });
        setEditMode(false); fetchPlayers(); onDataChange();
      } else { setPanelMsg({ type: 'error', text: result.error }); }
    } catch { setPanelMsg({ type: 'error', text: '保存に失敗しました' }); }
    finally { setSaving(false); }
  };

  const panelTabs: { key: TeamPanelTab; label: string; icon: React.ReactNode }[] = [
    { key: 'managers', label: '担当者', icon: <UserCog className="w-4 h-4" /> },
    { key: 'players', label: '選手', icon: <Users className="w-4 h-4" /> },
    { key: 'tournaments', label: '大会参加', icon: <Trophy className="w-4 h-4" /> },
  ];

  const canInvite = team.manager_count < 2 && invitations.length === 0;

  const statusLabel = (status: string) => {
    switch (status) {
      case 'confirmed': return { label: '参加確定', cls: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' };
      case 'waitlisted': return { label: 'キャンセル待ち', cls: 'bg-amber-100 text-amber-800' };
      case 'cancelled': return { label: 'キャンセル', cls: 'bg-gray-100 text-gray-600' };
      default: return { label: status, cls: 'bg-gray-100 text-gray-600' };
    }
  };

  return (
    <div className="border-t border-border">
      {/* パネルタブ */}
      <div className="flex border-b border-border bg-muted/20">
        {panelTabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setPanelMsg(null); }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-base font-medium transition-colors ${
              activeTab === tab.key
                ? 'border-b-2 border-blue-600 text-blue-600 dark:text-blue-400 bg-background'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      <div className="p-4 space-y-3">
        {/* メッセージ */}
        {panelMsg && (
          <div className={`flex items-start justify-between gap-2 p-3 rounded-lg text-xs ${
            panelMsg.type === 'success'
              ? 'bg-green-50 border border-green-200 text-green-800 dark:bg-green-950/20 dark:border-green-800 dark:text-green-300'
              : 'bg-red-50 border border-red-200 text-red-800 dark:bg-red-950/20 dark:border-red-800 dark:text-red-300'
          }`}>
            <div className="flex items-start gap-1.5">
              {panelMsg.type === 'success'
                ? <CheckCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                : <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />}
              <span>{panelMsg.text}</span>
            </div>
            <button onClick={() => setPanelMsg(null)} className="opacity-60 hover:opacity-100 flex-shrink-0">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* 担当者タブ */}
        {activeTab === 'managers' && (
          managersLoading ? <div className="text-center py-4"><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 mx-auto" /></div> : (
            <div className="space-y-3">
              {/* 担当者一覧 */}
              <div className="space-y-2">
                {managers.map(m => (
                  <div key={m.login_user_id} className="flex items-center justify-between gap-3 p-3 bg-muted/40 rounded-lg">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
                        <UserCog className="w-5 h-5 text-green-700 dark:text-green-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-base font-medium truncate">{m.display_name}</span>
                        </div>
                        <div className="text-sm text-muted-foreground truncate">{m.email}</div>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleLeaveTeam(m.login_user_id)}
                      disabled={leaving === m.login_user_id}
                      className="border-red-300 text-red-600 hover:border-red-400 hover:bg-red-50 dark:border-red-800 dark:text-red-400 flex-shrink-0"
                    >
                      <LogOut className="w-4 h-4 mr-1" />
                      {leaving === m.login_user_id ? '処理中...' : '脱退'}
                    </Button>
                  </div>
                ))}
              </div>
              {/* 招待中 */}
              {invitations.map(inv => (
                <div key={inv.id} className="flex items-center justify-between p-3 bg-amber-50/60 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800">
                  <div className="flex items-center gap-2 min-w-0">
                    <Clock className="w-4 h-4 text-amber-600 flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{inv.invited_email}</div>
                      <div className="text-sm text-muted-foreground">承認待ち</div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleCancelInvite(inv.id)}
                    disabled={cancelling === inv.id}
                    className="text-sm text-red-500 hover:text-red-700 flex-shrink-0 ml-2 disabled:opacity-50"
                  >
                    取消
                  </button>
                </div>
              ))}
              {/* 招待フォーム */}
              {canInvite && (
                <div className="pt-2">
                  <div className="text-sm text-muted-foreground mb-2">2人目の担当者を招待</div>
                  <div className="flex gap-2">
                    <Input
                      type="email"
                      value={inviteEmail}
                      onChange={e => setInviteEmail(e.target.value)}
                      placeholder="メールアドレス"
                      className="text-sm"
                      onKeyDown={e => e.key === 'Enter' && handleInvite()}
                      disabled={inviting}
                    />
                    <Button size="sm" onClick={handleInvite} disabled={inviting || !inviteEmail.trim()}
                      className="bg-blue-600 hover:bg-blue-700 text-white text-sm flex-shrink-0">
                      <Mail className="w-4 h-4 mr-1" />{inviting ? '送信中' : '招待'}
                    </Button>
                  </div>
                </div>
              )}
              {!canInvite && team.manager_count < 2 && invitations.length > 0 && (
                <p className="text-sm text-muted-foreground">承認待ちの招待があります。</p>
              )}
            </div>
          )
        )}

        {/* 選手タブ */}
        {activeTab === 'players' && (
          playersLoading ? <div className="text-center py-4"><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 mx-auto" /></div> : (
            <div className="space-y-3">
              {!editMode ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">{players.length}名登録</span>
                    <Button size="sm" variant="outline" onClick={startEdit}>
                      <Pencil className="w-4 h-4 mr-1" />編集
                    </Button>
                  </div>
                  {players.length === 0 ? (
                    <div className="text-center py-4 text-muted-foreground">
                      <p className="text-sm">選手が登録されていません</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {players.map(p => (
                        <div key={p.player_id} className="flex items-center gap-3 p-3 bg-muted/40 rounded-lg">
                          <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0 text-sm font-bold text-blue-700 dark:text-blue-300">
                            {p.jersey_number != null ? p.jersey_number : '—'}
                          </div>
                          <span className="text-base font-medium">{p.player_name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-[1fr_80px_36px] gap-2 text-sm text-muted-foreground px-0.5">
                    <span>選手名 <span className="text-red-500">*</span></span>
                    <span>背番号</span>
                    <span />
                  </div>
                  {formPlayers.map((p, idx) => (
                    <div key={idx} className="grid grid-cols-[1fr_80px_36px] gap-2 items-center">
                      <Input value={p.player_name} onChange={e => setFormPlayers(prev => prev.map((fp, i) => i === idx ? { ...fp, player_name: e.target.value } : fp))}
                        placeholder="例: 山田太郎" maxLength={50} className="text-sm" lang="ja" />
                      <Input type="number" value={p.jersey_number} onChange={e => setFormPlayers(prev => prev.map((fp, i) => i === idx ? { ...fp, jersey_number: e.target.value } : fp))}
                        placeholder="—" min={1} max={99} className="text-sm text-center" />
                      <button onClick={() => setFormPlayers(prev => prev.filter((_, i) => i !== idx))}
                        className="w-9 h-9 flex items-center justify-center text-muted-foreground hover:text-red-500 rounded">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  {formPlayers.length < 20 && (
                    <Button size="sm" variant="outline" className="w-full"
                      onClick={() => setFormPlayers(prev => [...prev, { player_name: '', jersey_number: '' }])}>
                      <Plus className="w-4 h-4 mr-1" />追加
                    </Button>
                  )}
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" onClick={handleSavePlayers} disabled={saving}
                      className="bg-green-600 hover:bg-green-700 text-white">
                      <Save className="w-4 h-4 mr-1" />{saving ? '保存中...' : '保存'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditMode(false)} disabled={saving}>
                      キャンセル
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )
        )}

        {/* 大会参加タブ */}
        {activeTab === 'tournaments' && (
          tournamentsLoading ? <div className="text-center py-4"><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 mx-auto" /></div> : (
            <div className="space-y-4">
              {/* 検索UI */}
              <div className="border border-border rounded-lg mb-6 bg-muted/20">
                {/* 検索ヘッダー（常に表示） */}
                <button
                  onClick={() => setSearchExpanded(!searchExpanded)}
                  className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Search className="w-5 h-5 text-blue-600" />
                    <span className="font-medium">大会を検索</span>
                  </div>
                  {searchExpanded ? (
                    <ChevronUp className="w-5 h-5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-muted-foreground" />
                  )}
                </button>

                {/* 検索条件エリア（折り畳み） */}
                {searchExpanded && (
                  <div className="p-4 pt-0 space-y-4 border-t border-border">
                    {/* フリーワード検索 */}
                    <div>
                      <label className="text-sm font-medium mb-2 block">フリーワード検索</label>
                      <Input
                        type="text"
                        placeholder="大会名・グループ名で検索"
                        value={searchKeyword}
                        onChange={(e) => setSearchKeyword(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                      />
                    </div>

                    {/* 地域で探す */}
                    <div>
                      <label className="text-sm font-medium mb-2 block">地域で探す</label>
                      <Select value={selectedPrefecture || 'all'} onValueChange={(value) => setSelectedPrefecture(value === 'all' ? '' : value)}>
                        <SelectTrigger className="bg-background">
                          <SelectValue placeholder="都道府県を選択" />
                        </SelectTrigger>
                        <SelectContent className="bg-background">
                          <SelectItem value="all">指定しない</SelectItem>
                          {prefectures.map((pref) => (
                            <SelectItem key={pref.prefecture_id} value={String(pref.prefecture_id)}>
                              {pref.prefecture_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* 競技から探す */}
                    <div>
                      <label className="text-sm font-medium mb-2 block">競技から探す</label>
                      <div className="flex flex-wrap gap-2">
                        {/* 全ての競技ボタン */}
                        <button
                          onClick={() => setSelectedSportType('')}
                          className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg border-2 transition-all ${
                            selectedSportType === ''
                              ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                              : 'border-border hover:border-blue-300 hover:bg-blue-50/50 dark:hover:bg-blue-900/10'
                          }`}
                        >
                          <span className="text-xl">🏆</span>
                          <span className="text-sm font-medium">全ての競技</span>
                        </button>

                        {/* 各競技ボタン */}
                        {sportTypes && sportTypes.length > 0 && sportTypes.map((sport) => (
                          <button
                            key={sport.sport_type_id}
                            onClick={() => setSelectedSportType(String(sport.sport_type_id))}
                            className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg border-2 transition-all ${
                              selectedSportType === String(sport.sport_type_id)
                                ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                                : 'border-border hover:border-blue-300 hover:bg-blue-50/50 dark:hover:bg-blue-900/10'
                            }`}
                          >
                            <span className="text-xl">{getSportIcon(sport.sport_code)}</span>
                            <span className="text-sm font-medium">{sport.sport_name}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 検索ボタン */}
                    <div className="flex gap-2 pt-2">
                      <Button onClick={handleSearch} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white">
                        <Search className="w-4 h-4 mr-1" />
                        検索
                      </Button>
                      <Button
                        variant="outline"
                        onClick={handleClearSearch}
                        className="flex-1"
                      >
                        <X className="w-4 h-4 mr-1" />
                        クリア
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* 参加申込可能 */}
              <div>
                <div className="text-sm font-medium text-muted-foreground mb-3">参加申込できる大会</div>
                {available.length === 0 ? (
                  <p className="text-sm text-muted-foreground">現在募集中の大会はありません</p>
                ) : (
                  <div className="space-y-4">
                    {(() => {
                      // 大会グループごとにグループ化
                      const grouped = new Map<number | null, { group_name: string | null; tournaments: typeof available }>();
                      available.forEach(t => {
                        const key = t.tournament_group_id;
                        if (!grouped.has(key)) {
                          grouped.set(key, { group_name: t.group_name, tournaments: [] });
                        }
                        grouped.get(key)!.tournaments.push(t);
                      });

                      return Array.from(grouped.entries()).map(([groupId, { group_name, tournaments }]) => (
                        <div key={groupId ?? 'no-group'} className="border border-border rounded-lg p-5">
                          <div className="text-lg font-semibold mb-3 flex items-center gap-2">
                            <Trophy className="w-6 h-6 text-blue-600" />
                            {group_name || '大会'}
                          </div>
                          <div className="space-y-3">
                            {tournaments.map(t => (
                              <div key={t.tournament_id} className="flex items-center justify-between p-4 bg-muted/40 rounded-lg">
                                <div className="min-w-0 flex-1">
                                  <div className="text-base font-semibold truncate">{t.tournament_name}</div>
                                  <div className="text-sm text-muted-foreground mt-1">
                                    {t.event_start_date && t.event_end_date && (
                                      <>
                                        {t.event_start_date === t.event_end_date
                                          ? `開催期間: ${t.event_start_date}`
                                          : `開催期間: ${t.event_start_date} 〜 ${t.event_end_date}`
                                        }
                                      </>
                                    )}
                                    {t.recruitment_end_date && (
                                      <>
                                        <br />
                                        {`締め切り: ${t.recruitment_end_date.replace('T', ' ')}`}
                                      </>
                                    )}
                                  </div>
                                </div>
                                <Button asChild size="default" className="bg-green-600 hover:bg-green-700 text-white flex-shrink-0 ml-3">
                                  <Link href={`/tournaments/${t.tournament_id}/join`}>申込</Link>
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                )}
              </div>
              {/* 参加済み */}
              {joined.length > 0 && (
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-3">参加済み・申込済み</div>
                  <div className="space-y-2">
                    {joined.map(t => {
                      const { label, cls } = statusLabel(t.participation_status);
                      return (
                        <div key={t.tournament_team_id} className="p-3 bg-muted/40 rounded-lg">
                          <div className="text-sm font-medium">{t.tournament_name}</div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{label}</span>
                            {t.assigned_block && <span className="text-xs text-muted-foreground">ブロック: {t.assigned_block}</span>}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">{t.tournament_team_name}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )
        )}
      </div>
    </div>
  );
}

// ── チームタブコンテンツ ──────────────────────────────
function TeamTabContent({ teamIds: _teamIds, initialTeamData }: { teamIds: string[]; initialTeamData?: TeamDashboardItem[] | null }) {
  const [teams, setTeams] = useState<TeamInfo[]>((initialTeamData ?? []) as TeamInfo[]);
  const [loading, setLoading] = useState(!initialTeamData);
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(
    // initialTeamData が1件のみなら自動展開
    initialTeamData?.length === 1 ? initialTeamData[0].team_id : null
  );

  const fetchTeams = useCallback(async () => {
    try {
      const res = await fetch('/api/my/teams');
      if (!res.ok) return;
      const result = await res.json();
      if (result.success) {
        setTeams(result.data);
        // チームが1つだけなら自動展開（まだ展開していない場合）
        if (result.data.length === 1 && expandedTeamId === null) {
          setExpandedTeamId(result.data[0].team_id);
        }
      }
    } catch (err) {
      console.error('チーム取得エラー:', err);
    } finally {
      setLoading(false);
    }
  // expandedTeamId を依存に入れると展開するたびに再フェッチになるため除外
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // initialTeamData がない場合のみクライアント側フェッチ
  useEffect(() => {
    if (!initialTeamData) {
      fetchTeams();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4" />
        <p className="text-sm">読み込み中...</p>
      </div>
    );
  }

  if (teams.length === 0) {
    return (
      <div className="max-w-md mx-auto text-center py-12">
        <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-40" />
        <p className="text-lg font-medium text-foreground mb-2">チーム情報が未登録です</p>
        <p className="text-sm text-muted-foreground mb-6">
          大会に参加するには、チームを登録する必要があります。
        </p>
        <Button asChild variant="outline" className="border-2 border-blue-400 hover:border-blue-500 hover:bg-blue-50 dark:border-blue-500 dark:hover:border-blue-400 dark:hover:bg-blue-950/30">
          <Link href="/my/teams/new">
            <UserPlus className="mr-2 h-4 w-4" />
            チームを登録する
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {teams.map((team) => {
        const isExpanded = expandedTeamId === team.team_id;
        return (
          <Card key={team.team_id} className="overflow-hidden">
            {/* カードヘッダー：クリックで展開／折りたたみ */}
            <button
              className="w-full text-left"
              onClick={() => setExpandedTeamId(isExpanded ? null : team.team_id)}
            >
              <CardHeader className="bg-gradient-to-r from-green-50 to-green-100 dark:from-green-950 dark:to-green-900 pb-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-lg mb-1 flex items-center gap-2">
                      <span className="truncate">{team.team_name}</span>
                      {team.team_omission && (
                        <span className="text-sm font-normal text-muted-foreground flex-shrink-0">（{team.team_omission}）</span>
                      )}
                    </CardTitle>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-200 text-blue-800 dark:bg-blue-800 dark:text-blue-200">
                        担当者
                      </span>
                      <span className="text-xs">選手 {team.player_count}名</span>
                      <span className="text-xs">担当者 {team.manager_count}/2名</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 flex-shrink-0 pt-1">
                    <Button asChild size="sm" variant="outline" className="text-sm border-blue-400 bg-white/70 hover:bg-white dark:border-blue-500 dark:bg-blue-950/50 dark:hover:bg-blue-950">
                      <Link href={`/my/teams/${team.team_id}/edit`} onClick={e => e.stopPropagation()}>
                        <Pencil className="w-4 h-4 mr-1" />
                        編集
                      </Link>
                    </Button>
                    <span className="text-muted-foreground">
                      {isExpanded
                        ? <ChevronUp className="w-5 h-5" />
                        : <ChevronDown className="w-5 h-5" />}
                    </span>
                  </div>
                </div>
              </CardHeader>
            </button>

            {/* 展開パネル */}
            {isExpanded && (
              <TeamExpandedPanel team={team} onDataChange={fetchTeams} />
            )}
          </Card>
        );
      })}
    </div>
  );
}
