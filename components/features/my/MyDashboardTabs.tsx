// components/features/my/MyDashboardTabs.tsx
"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Shield, Users, Building2, UserPlus, Database, MapPin, Trophy, CalendarDays, Clock, Plus, UserCog, Archive, Trash2, Lock, Eye, FileEdit, ClipboardList, FileText, Star, Target, Shuffle, Settings, ChevronDown, ChevronUp, Crown, Mail, Pencil, X, CheckCircle, AlertCircle, Search, QrCode, Image as ImageIcon, Calendar } from "lucide-react";
import Image from "next/image";
import IncompleteTournamentGroups from "@/components/features/tournament/IncompleteTournamentGroups";
import TournamentDashboardList from "@/components/features/tournament/TournamentDashboardList";
import { TournamentDashboardData, GroupedTournamentData, TeamDashboardItem } from "@/lib/dashboard-data";
import { Tournament } from "@/lib/types";
import { getStatusLabel } from "@/lib/tournament-status";
import { checkFormatChangeEligibility, changeFormat, type FormatChangeCheckResponse } from "@/lib/format-change";
import { FormatChangeDialog } from "@/components/features/tournament/FormatChangeDialog";
import { FormatSelectionModal } from "@/components/features/tournament/FormatSelectionModal";
import WithdrawalModal from "@/components/features/my/WithdrawalModal";

type Role = "admin" | "operator" | "team";

interface Tab {
  key: "admin" | "operator" | "team";
  label: string;
  icon: React.ReactNode;
}

interface SportType {
  sport_type_id: number;
  sport_name: string;
  sport_code: string;
}

interface MyDashboardTabsProps {
  roles: Role[];
  isSuperadmin: boolean;
  teamIds: string[];
  currentUserId: string;
  initialTournamentData?: TournamentDashboardData | null;
  initialOperatorTournamentData?: TournamentDashboardData | null;
  initialTeamData?: TeamDashboardItem[] | null;
  initialSportTypes?: SportType[];
}

export default function MyDashboardTabs(props: MyDashboardTabsProps) {
  return (
    <Suspense fallback={null}>
      <MyDashboardTabsInner {...props} />
    </Suspense>
  );
}

function MyDashboardTabsInner({ roles, isSuperadmin, teamIds, currentUserId, initialTournamentData, initialOperatorTournamentData, initialTeamData, initialSportTypes }: MyDashboardTabsProps) {
  const searchParams = useSearchParams();

  // 表示するタブを決定
  // チームタブは全ユーザーに必ず表示
  const tabs: Tab[] = [];

  if (roles.includes("admin") || isSuperadmin) {
    tabs.push({
      key: "admin",
      label: isSuperadmin ? "S大会管理" : "大会管理",
      icon: <Shield className="h-4 w-4" />
    });
  }

  if (roles.includes("operator")) {
    tabs.push({ key: "operator", label: "運営管理", icon: <Building2 className="h-4 w-4" /> });
  }

  // チームタブは常に追加
  tabs.push({ key: "team", label: "チーム管理", icon: <Crown className="h-4 w-4" /> });

  // URLの ?tab= パラメータで初期タブを決定（なければ先頭タブ）
  const tabParam = searchParams.get("tab") as "admin" | "operator" | "team" | null;
  const initialTab = (tabParam && tabs.some(t => t.key === tabParam)) ? tabParam : tabs[0].key;

  const [activeTab, setActiveTab] = useState<"admin" | "operator" | "team">(initialTab);

  return (
    <div>
      {/* タブナビゲーション */}
      <div>
        <nav className={`grid gap-1 ${tabs.length === 1 ? 'grid-cols-1' : tabs.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`} aria-label="ダッシュボードタブ">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`
                flex items-center justify-center gap-2 py-3 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap
                ${activeTab === tab.key
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-gray-50 text-gray-500 hover:bg-gray-50/80 hover:text-gray-900"
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
        {activeTab === "admin" && <AdminTabContent isSuperadmin={isSuperadmin} currentUserId={currentUserId} initialTournamentData={initialTournamentData} initialSportTypes={initialSportTypes} />}
        {activeTab === "operator" && <OperatorTabContent initialTournamentData={initialOperatorTournamentData} initialSportTypes={initialSportTypes} />}
        {activeTab === "team" && <TeamTabContent teamIds={teamIds} initialTeamData={initialTeamData} />}
      </div>
    </div>
  );
}

// ─── 作成中の大会ラッパー ────────────────────────────────────────────────────────
function IncompleteTournamentGroupsWrapper({
  onCountChange
}: {
  onCountChange: (count: number) => void;
}) {
  const [showCard, setShowCard] = useState(false);

  const handleCountChange = (count: number) => {
    setShowCard(count > 0);
    onCountChange(count);
  };

  return (
    <>
      {showCard && (
        <div>
          <Card className="border-2 border-amber-300 bg-amber-50/50">
            <CardHeader>
              <CardTitle className="text-amber-800 flex items-center gap-2">
                ⚠️ 作成中の大会
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-amber-700 mb-4 text-sm">
                大会は作成されましたが、まだ部門が設定されていません。
                部門を作成して大会を完成させましょう。
              </p>
              <IncompleteTournamentGroups onCountChange={handleCountChange} />
            </CardContent>
          </Card>
        </div>
      )}
      {!showCard && (
        <div style={{ display: 'none' }}>
          <IncompleteTournamentGroups onCountChange={handleCountChange} />
        </div>
      )}
    </>
  );
}

// ─── 管理者タブ ────────────────────────────────────────────────────────────────
function AdminTabContent({ isSuperadmin, currentUserId, initialTournamentData, initialSportTypes }: { isSuperadmin: boolean; currentUserId: string; initialTournamentData?: TournamentDashboardData | null; initialSportTypes?: SportType[] }) {
  const [hasIncompleteGroups, setHasIncompleteGroups] = useState<boolean | null>(null);
  const [showAllAdmins, setShowAllAdmins] = useState(false);

  // デバッグログ
  useEffect(() => {
    console.log('[AdminTabContent] hasIncompleteGroups:', hasIncompleteGroups);
  }, [hasIncompleteGroups]);

  return (
    <div className="space-y-8">
      {/* システム管理者メニュー（スーパーユーザーのみ） */}
      {isSuperadmin && (
        <div>
          <h2 className="text-xl font-bold text-gray-900 mb-4">システム管理者メニュー</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card className="border-purple-200 bg-purple-50">
              <CardHeader>
                <CardTitle className="text-purple-800 flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  マスタ管理
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-purple-700 mb-4">
                  システムの基本データを管理します
                </p>
                <div className="space-y-2">
                  <Button asChild variant="outline" className="w-full border-2 border-purple-300 hover:border-purple-400 hover:bg-purple-100">
                    <Link href="/admin/administrators">利用者マスタ</Link>
                  </Button>
                  <Button asChild variant="outline" className="w-full border-2 border-purple-300 hover:border-purple-400 hover:bg-purple-100">
                    <Link href="/admin/sport-types">競技種別マスタ</Link>
                  </Button>
                  <Button asChild variant="outline" className="w-full border-2 border-purple-300 hover:border-purple-400 hover:bg-purple-100">
                    <Link href="/admin/tournament-formats">大会フォーマット</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="border-blue-200 bg-blue-50">
              <CardHeader>
                <CardTitle className="text-blue-800 flex items-center">
                  📢 お知らせ管理
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-blue-700 mb-4">
                  TOPページに表示するお知らせの作成・編集・削除を行います
                </p>
                <div className="space-y-2">
                  <Button asChild variant="outline" className="w-full border-2 border-blue-300 hover:border-blue-400 hover:bg-blue-100">
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
        <h2 className="text-xl font-bold text-gray-900 mb-4">大会管理者メニュー</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card className="border-green-200 bg-green-50">
            <CardHeader>
              <CardTitle className="text-green-800 flex items-center gap-2">
                <Trophy className="h-5 w-5" />
                大会の登録
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-green-700 mb-4">
                新しい大会を作成します
              </p>
              <div className="space-y-2">
                <Button asChild variant="outline" className="w-full border-2 border-green-300 hover:border-green-400 hover:bg-green-100">
                  <Link href="/admin/tournament-groups/create">大会を作成する</Link>
                </Button>
                <Button asChild variant="outline" className="w-full border-2 border-green-300 hover:border-green-400 hover:bg-green-100">
                  <Link href="/admin/tournaments/duplicate">大会を複製する</Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-blue-200 bg-blue-50">
            <CardHeader>
              <CardTitle className="text-blue-800 flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                会場の管理
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-blue-700 mb-4">
                大会運営に必要な基本データを管理します
              </p>
              <div className="space-y-2">
                <Button asChild variant="outline" className="w-full border-2 border-blue-300 hover:border-blue-400 hover:bg-blue-100">
                  <Link href="/admin/venues">会場を登録する</Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-purple-200 bg-purple-50">
            <CardHeader>
              <CardTitle className="text-purple-800 flex items-center gap-2">
                <ImageIcon className="h-5 w-5" />
                ロゴの管理
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-purple-700 mb-4">
                組織ロゴの設定・管理を行います
              </p>
              <div className="space-y-2">
                <Button asChild variant="outline" className="w-full border-2 border-purple-300 hover:border-purple-400 hover:bg-purple-100">
                  <Link href="/admin/profile">ロゴを登録する</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 作成中の大会（常にコンポーネントをレンダリングして、データがある場合のみカードを表示） */}
      <IncompleteTournamentGroupsWrapper
        onCountChange={(count) => setHasIncompleteGroups(count > 0)}
      />

      {/* 大会状況 */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">大会状況</h2>
          {isSuperadmin && (
            <label className="flex items-center gap-2 text-sm text-gray-500 cursor-pointer">
              <input
                type="checkbox"
                checked={showAllAdmins}
                onChange={(e) => setShowAllAdmins(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              他管理者が作成した大会も表示する
            </label>
          )}
        </div>
        {initialTournamentData ? (
          <TournamentStatusList data={initialTournamentData} isSuperadmin={isSuperadmin} currentUserId={currentUserId} showAllAdmins={showAllAdmins} initialSportTypes={initialSportTypes} />
        ) : (
          <TournamentDashboardList />
        )}
      </div>
    </div>
  );
}

// ─── 大会状況リスト（サーバーデータを使った表示専用コンポーネント） ────────────
function TournamentStatusList({ data, isSuperadmin, currentUserId, showAllAdmins, initialSportTypes }: { data: TournamentDashboardData; isSuperadmin: boolean; currentUserId: string; showAllAdmins?: boolean; initialSportTypes?: SportType[] }) {
  const router = useRouter();

  // スーパー管理者で showAllAdmins が true の場合は全て表示、false の場合は自分が作成した大会のみ
  const filterTournaments = (tournaments: Tournament[]) => {
    // スーパー管理者でない場合は全て表示
    if (!isSuperadmin) {
      return tournaments;
    }
    // スーパー管理者で showAllAdmins が true の場合、全て表示
    if (showAllAdmins) {
      return tournaments;
    }
    // スーパー管理者で showAllAdmins が false（デフォルト）の場合、自分が作成した大会のみ
    const loginUserId = String(currentUserId);
    return tournaments.filter(t => t.created_by === loginUserId);
  };

  // groupedデータ内の大会もフィルタリング
  const filterGroupedData = (groupedData: GroupedTournamentData): GroupedTournamentData => {
    const filteredGrouped: GroupedTournamentData['grouped'] = {};

    Object.entries(groupedData.grouped).forEach(([key, value]) => {
      const filteredTournaments = filterTournaments(value.tournaments);
      if (filteredTournaments.length > 0) {
        filteredGrouped[key] = {
          ...value,
          tournaments: filteredTournaments
        };
      }
    });

    return {
      grouped: filteredGrouped,
      ungrouped: filterTournaments(groupedData.ungrouped)
    };
  };

  // フィルタリング済みデータ
  const filteredData = {
    planning: filterTournaments(data.planning),
    recruiting: filterTournaments(data.recruiting),
    before_event: filterTournaments(data.before_event),
    ongoing: filterTournaments(data.ongoing),
    completed: filterTournaments(data.completed),
    total: data.total,
    grouped: {
      planning: filterGroupedData(data.grouped.planning),
      recruiting: filterGroupedData(data.grouped.recruiting),
      before_event: filterGroupedData(data.grouped.before_event),
      ongoing: filterGroupedData(data.grouped.ongoing),
      completed: filterGroupedData(data.grouped.completed)
    }
  };

  // 削除・アーカイブ中フラグ
  const [deleting, setDeleting] = useState<number | null>(null);
  const [archiving, setArchiving] = useState<number | null>(null);

  // フォーマット変更関連のstate
  const [showFormatSelectionModal, setShowFormatSelectionModal] = useState(false);
  const [showFormatChangeDialog, setShowFormatChangeDialog] = useState(false);
  const [formatChangeCheckResult, setFormatChangeCheckResult] = useState<FormatChangeCheckResponse['data'] | null>(null);
  const [selectedTournamentId, setSelectedTournamentId] = useState<number | null>(null);
  const [isFormatChanging, setIsFormatChanging] = useState(false);
  const [availableFormats, setAvailableFormats] = useState<Array<{ format_id: number; format_name: string; target_team_count: number; format_description?: string; template_count?: number; sport_type_id?: number; sport_code?: string; default_match_duration?: number | null; default_break_duration?: number | null; matchday_count?: number; phase_stats?: Array<{ phase: string; phase_name: string; order: number; block_count: number; max_court_number: number | null }> }>>([]);
  const [selectedNewFormatId, setSelectedNewFormatId] = useState<number | null>(null);
  const [selectedNewFormatName, setSelectedNewFormatName] = useState<string>('');

  // 競技種別マスタ（初期値はサーバーから渡されたデータ、フォールバック用にfetchも残す）
  const [sportTypes, setSportTypes] = useState<SportType[]>(initialSportTypes || []);

  // 初期データがない場合のみクライアント側でfetch
  useEffect(() => {
    if (!initialSportTypes || initialSportTypes.length === 0) {
      fetch('/api/sport-types')
        .then(res => res.json())
        .then(data => {
          if (data.success && data.data) setSportTypes(data.data);
        })
        .catch(err => console.error('Failed to fetch sport types:', err));
    }
  }, [initialSportTypes]);

  // 競技種別アイコン取得
  const getSportIcon = (sportCode: string) => {
    switch (sportCode) {
      case 'soccer': return '⚽';
      case 'baseball': return '⚾';
      case 'basketball': return '🏀';
      case 'pk': return '🥅';
      default: return '⚽';
    }
  };

  // フォーマット一覧は初回レンダー時に取得
  const [formatsLoaded, setFormatsLoaded] = useState(false);
  const loadFormats = async (): Promise<typeof availableFormats> => {
    if (formatsLoaded && availableFormats.length > 0) return availableFormats;
    try {
      const res = await fetch('/api/admin/tournament-formats');
      const result = await res.json();
      if (result.success && result.formats) {
        setAvailableFormats(result.formats);
        setFormatsLoaded(true);
        return result.formats;
      }
    } catch (err) {
      console.error('フォーマット取得エラー:', err);
    }
    setFormatsLoaded(true);
    return [];
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

  // アーカイブハンドラ（HTML版アーカイブのみ。DBレコード削除は行わない）
  const handleArchiveTournament = async (tournament: Tournament) => {
    if (!confirm(`大会「${tournament.tournament_name}」をアーカイブしますか？\n\nHTMLアーカイブが作成され、is_archivedフラグが設定されます。\nDBレコードは削除されません。`)) return;
    setArchiving(tournament.tournament_id);
    try {
      const archiveRes = await fetch(`/api/tournaments/${tournament.tournament_id}/archive`, { method: 'POST' });
      const archiveResult = await archiveRes.json();
      if (!archiveResult.success) { alert(`アーカイブエラー: ${archiveResult.error}`); return; }
      const sizeKb = archiveResult.data?.file_size ? `${(archiveResult.data.file_size / 1024).toFixed(2)} KB` : '';
      alert(`✅ HTMLアーカイブが完了しました。${sizeKb ? `\nファイルサイズ: ${sizeKb}` : ''}`);
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
    const formats = await loadFormats();
    setSelectedTournamentId(tournament.tournament_id);
    setIsFormatChanging(true);
    try {
      const checkResult = await checkFormatChangeEligibility(tournament.tournament_id);
      if (checkResult.success && checkResult.data) {
        setFormatChangeCheckResult(checkResult.data);
        const tournamentSportTypeId = Number(tournament.sport_type_id);
        const otherFormats = formats.filter(f =>
          f.format_id !== checkResult.data!.current_format_id &&
          (!tournamentSportTypeId || Number(f.sport_type_id) === tournamentSportTypeId)
        );
        if (otherFormats.length === 0) {
          alert(`変更可能な他のフォーマットが見つかりません。`);
          setIsFormatChanging(false);
          return;
        }
        setAvailableFormats(otherFormats);
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
        alert(`✅ ${result.message}\n\n次は「組合せ作成」から新しいフォーマットでチームを配置してください。`);
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

  const TournamentCard = ({ tournament }: { tournament: Tournament }) => {
    // 競技種別アイコンを取得
    const sportType = sportTypes.find(s => s.sport_type_id === tournament.sport_type_id);
    const sportIcon = sportType ? getSportIcon(sportType.sport_code) : null;

    return (
    <div className="border rounded-lg overflow-hidden hover:border-primary hover:-translate-y-1 hover:shadow-lg transition-all duration-300 relative">
      <div className="p-4 relative">
        <div className="mb-3">
          <h4 className="font-semibold text-base sm:text-lg text-gray-900 flex items-start gap-2">
            {sportIcon && <span className="text-lg sm:text-xl flex-shrink-0">{sportIcon}</span>}
            <span>{tournament.tournament_name}</span>
          </h4>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <button
              onClick={(e) => {
                e.stopPropagation();
                const publicUrl = `${window.location.origin}/public/tournaments/${tournament.tournament_id}`;
                const qrPageUrl = `/qr?url=${encodeURIComponent(publicUrl)}&title=${encodeURIComponent(tournament.tournament_name)}`;
                window.open(qrPageUrl, '_blank', 'width=500,height=700');
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border border-gray-300 bg-white text-gray-700 hover:bg-primary/10 hover:text-primary hover:border-primary/30 transition-colors cursor-pointer shadow-sm"
              title="部門詳細ページのQRコードを表示"
            >
              <QrCode className="w-3.5 h-3.5" />
              QR
            </button>
            <div className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ${
              tournament.status === 'planning'
                ? 'bg-gray-100 text-gray-800'
                : tournament.status === 'recruiting'
                ? 'bg-blue-100 text-blue-800'
                : tournament.status === 'before_event'
                ? 'bg-yellow-100 text-yellow-800'
                : tournament.status === 'ongoing'
                ? 'bg-green-100 text-green-800'
                : 'bg-gray-100 text-gray-800'
            }`}>
              {getStatusLabel(tournament.status)}
            </div>
          </div>
          <div className="flex items-center text-sm text-gray-600 mt-1">
            <Trophy className="w-4 h-4 mr-1" />
            <span>{tournament.format_name || `フォーマットID: ${tournament.format_id}`}</span>
          </div>
          {tournament.organization_name && (
            <div className="flex items-center text-xs text-gray-500 mt-1">
              <span>主催: {tournament.organization_name}</span>
            </div>
          )}
        </div>

        <div className="space-y-2 mb-4">
          <div className="flex items-center text-sm text-gray-600">
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
              <div className="text-xs font-medium text-gray-600 mb-2">参加状況</div>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5 sm:gap-2">
                <div className="p-1 sm:p-1.5 bg-gray-50 rounded-lg border border-gray-200 text-center">
                  <div className="text-[10px] sm:text-xs text-gray-700 font-medium mb-0.5 whitespace-nowrap">想定チーム数</div>
                  <div className="text-base font-bold text-gray-700">{tournament.team_count}</div>
                </div>
                <div className="p-1 sm:p-1.5 bg-gray-50 rounded-lg border border-gray-200 text-center">
                  <div className="text-[10px] sm:text-xs text-gray-700 font-medium mb-0.5 whitespace-nowrap">参加確定</div>
                  <div className="text-base font-bold text-gray-700">{tournament.confirmed_count || 0}</div>
                </div>
                <div className="p-1 sm:p-1.5 bg-gray-50 rounded-lg border border-gray-200 text-center">
                  <div className="text-[10px] sm:text-xs text-gray-700 font-medium mb-0.5 whitespace-nowrap">キャンセル待</div>
                  <div className="text-base font-bold text-gray-700">{tournament.waitlisted_count || 0}</div>
                </div>
                <div className="p-1 sm:p-1.5 bg-gray-50 rounded-lg border border-gray-200 text-center">
                  <div className="text-[10px] sm:text-xs text-gray-700 font-medium mb-0.5 whitespace-nowrap">辞退申請中</div>
                  <div className="text-base font-bold text-gray-700">{tournament.withdrawal_requested_count || 0}</div>
                </div>
                <div className="p-1 sm:p-1.5 bg-gray-50 rounded-lg border border-gray-200 text-center">
                  <div className="text-[10px] sm:text-xs text-gray-700 font-medium mb-0.5 whitespace-nowrap">キャンセル済</div>
                  <div className="text-base font-bold text-gray-700">{tournament.cancelled_count || 0}</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 操作ボタン（カテゴリ別） */}
        {!tournament.is_archived ? (
          <div className="space-y-3 bg-blue-50/80 rounded-lg p-3">

            {/* ── 基本情報 ── */}
            <div>
              <p className="text-xs font-semibold text-blue-600 mb-2">基本情報</p>
              <div className="flex gap-2 flex-wrap">
                <Button asChild size="sm" variant="outline" className="text-sm bg-white hover:border-blue-300 hover:bg-blue-50">
                  <Link href={`/admin/tournaments/${tournament.tournament_id}`} target="_blank" rel="noopener noreferrer">
                    <Eye className="w-4 h-4 mr-1" />
                    公開画面を見る
                  </Link>
                </Button>
                {tournament.has_matchdays ? (
                  <Button asChild size="sm" variant="outline" className="text-sm bg-white hover:border-blue-300 hover:bg-blue-50">
                    <Link href={`/admin/tournaments/${tournament.tournament_id}/edit-league`}>
                      <FileEdit className="w-4 h-4 mr-1" />
                      部門編集
                    </Link>
                  </Button>
                ) : (
                  <Button asChild size="sm" variant="outline" className="text-sm bg-white hover:border-blue-300 hover:bg-blue-50">
                    <Link href={`/admin/tournaments/${tournament.tournament_id}/edit`}>
                      <FileEdit className="w-4 h-4 mr-1" />
                      部門編集
                    </Link>
                  </Button>
                )}
                {(tournament.status === 'planning' || tournament.status === 'recruiting' || tournament.status === 'before_event') ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleFormatChangeClick(tournament)}
                    disabled={isFormatChanging && selectedTournamentId === tournament.tournament_id}
                    className="text-sm bg-white hover:border-blue-300 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
                    title="部門のフォーマットを変更（試合データは削除されます）"
                  >
                    {isFormatChanging && selectedTournamentId === tournament.tournament_id ? (
                      <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-1" />確認中...</>
                    ) : (
                      <><Settings className="w-4 h-4 mr-1" />フォーマット変更</>
                    )}
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" disabled className="text-sm bg-white cursor-not-allowed opacity-50" title="開催中のため変更できません">
                    <Lock className="w-4 h-4 mr-1" />
                    フォーマット変更
                  </Button>
                )}
                {tournament.has_matchdays && (
                  <Button asChild size="sm" variant="outline" className="text-sm bg-white hover:border-blue-300 hover:bg-blue-50">
                    <Link href={`/admin/tournaments/${tournament.tournament_id}/matchday-settings`}>
                      <Calendar className="w-4 h-4 mr-1" />
                      日程・会場設定
                    </Link>
                  </Button>
                )}
                {!tournament.has_matchdays && (
                  <Button asChild size="sm" variant="outline" className="text-sm bg-white hover:border-blue-300 hover:bg-blue-50">
                    <Link href={`/admin/tournaments/${tournament.tournament_id}/court-venue-settings`}>
                      <MapPin className="w-4 h-4 mr-1" />
                      会場・コート設定
                    </Link>
                  </Button>
                )}
              </div>
            </div>

            {/* ── 事前準備 ── */}
            <div>
              <p className="text-xs font-semibold text-blue-600 mb-2">事前準備</p>
              <div className="flex gap-2 flex-wrap">
                {/* チーム登録・組合せは planning/recruiting/before_event のみ有効 */}
                {(tournament.status === 'planning' || tournament.status === 'recruiting' || tournament.status === 'before_event') ? (
                  <>
                    <Button asChild size="sm" variant="outline" className="text-sm bg-white hover:border-blue-300 hover:bg-blue-50">
                      <Link href={`/admin/tournaments/${tournament.tournament_id}/rules`}>
                        <FileText className="w-4 h-4 mr-1" />
                        ルール設定
                      </Link>
                    </Button>
                    <Button asChild size="sm" variant="outline" className="text-sm bg-white hover:border-blue-300 hover:bg-blue-50">
                      <Link href={`/admin/tournaments/${tournament.tournament_id}/teams`}>
                        <Users className="w-4 h-4 mr-1" />
                        チーム手動登録
                      </Link>
                    </Button>
                    <Button asChild size="sm" variant="outline" className="text-sm bg-white hover:border-blue-300 hover:bg-blue-50">
                      <Link href={`/admin/tournaments/${tournament.tournament_id}/participants`}>
                        <Users className="w-4 h-4 mr-1" />
                        参加チーム管理
                      </Link>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDrawClick(tournament)}
                      className="text-sm bg-white hover:border-blue-300 hover:bg-blue-50"
                    >
                      <Shuffle className="w-4 h-4 mr-1" />
                      組合せ作成
                    </Button>
                    <Button asChild size="sm" variant="outline" className="text-sm bg-white hover:border-blue-300 hover:bg-blue-50">
                      <Link href={`/admin/tournaments/${tournament.tournament_id}/qr-list`}>
                        <QrCode className="w-4 h-4 mr-1" />
                        審判カード印刷
                      </Link>
                    </Button>
                  </>
                ) : (
                  /* 開催中・完了: 変更系は無効表示、参加チーム管理のみ有効 */
                  <>
                    <Button asChild size="sm" variant="outline" className="text-sm bg-white hover:border-blue-300 hover:bg-blue-50">
                      <Link href={`/admin/tournaments/${tournament.tournament_id}/rules`}>
                        <FileText className="w-4 h-4 mr-1" />
                        ルール設定
                      </Link>
                    </Button>
                    <Button size="sm" variant="outline" disabled className="text-sm bg-white cursor-not-allowed opacity-50" title="開催中のため変更できません">
                      <Lock className="w-4 h-4 mr-1" />
                      チーム手動登録
                    </Button>
                    <Button asChild size="sm" variant="outline" className="text-sm bg-white hover:border-blue-300 hover:bg-blue-50">
                      <Link href={`/admin/tournaments/${tournament.tournament_id}/participants`}>
                        <Users className="w-4 h-4 mr-1" />
                        参加チーム管理
                      </Link>
                    </Button>
                    <Button size="sm" variant="outline" disabled className="text-sm bg-white cursor-not-allowed opacity-50" title="開催中のため変更できません">
                      <Lock className="w-4 h-4 mr-1" />
                      組合せ作成
                    </Button>
                    <Button asChild size="sm" variant="outline" className="text-sm bg-white hover:border-blue-300 hover:bg-blue-50">
                      <Link href={`/admin/tournaments/${tournament.tournament_id}/qr-list`}>
                        <QrCode className="w-4 h-4 mr-1" />
                        審判カード印刷
                      </Link>
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* ── 当日運営 ── */}
            <div>
              <p className="text-xs font-semibold text-blue-600 mb-2">当日運営</p>
              <div className="flex gap-2 flex-wrap">
                <Button asChild size="sm" variant="outline" className="text-sm bg-white hover:border-blue-300 hover:bg-blue-50">
                  <Link href={`/admin/tournaments/${tournament.tournament_id}/matches`}>
                    <ClipboardList className="w-4 h-4 mr-1" />
                    試合結果入力
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline" className="text-sm bg-white hover:border-blue-300 hover:bg-blue-50">
                  <Link href={`/admin/tournaments/${tournament.tournament_id}/manual-rankings`}>
                    <Trophy className="w-4 h-4 mr-1" />
                    手動順位設定
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline" className="text-sm bg-white hover:border-blue-300 hover:bg-blue-50">
                  <Link href={`/admin/tournaments/${tournament.tournament_id}/match-overrides`}>
                    <Target className="w-4 h-4 mr-1" />
                    選出条件変更
                  </Link>
                </Button>
              </div>
            </div>

            {/* ── 管理・その他 ── */}
            <div>
              <p className="text-xs font-semibold text-blue-600 mb-2">管理・その他</p>
              <div className="flex gap-2 flex-wrap">
                <Button asChild size="sm" variant="outline" className="text-sm bg-white hover:border-blue-300 hover:bg-blue-50">
                  <Link href={`/admin/tournaments/${tournament.tournament_id}/participants/email`}>
                    <Mail className="w-4 h-4 mr-1" />
                    メール送信
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline" className="text-sm bg-white hover:border-blue-300 hover:bg-blue-50">
                  <Link href={`/admin/tournaments/${tournament.tournament_id}/files`}>
                    <FileText className="w-4 h-4 mr-1" />
                    ファイル管理
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline" className="text-sm bg-white hover:border-yellow-300 hover:bg-yellow-50">
                  <Link href={`/admin/tournaments/${tournament.tournament_id}/sponsor-banners`}>
                    <Star className="w-4 h-4 mr-1" />
                    スポンサー管理
                  </Link>
                </Button>
                {tournament.status === 'completed' ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleArchiveTournament(tournament)}
                    disabled={archiving === tournament.tournament_id}
                    className="text-sm bg-white hover:border-purple-300 hover:bg-purple-50"
                  >
                    {archiving === tournament.tournament_id ? (
                      <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-600 mr-1" />アーカイブ中...</>
                    ) : (
                      <><Archive className="w-4 h-4 mr-1" />アーカイブ</>
                    )}
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" disabled className="text-sm bg-white cursor-not-allowed opacity-50" title="大会終了後にアーカイブできます">
                    <Lock className="w-4 h-4 mr-1" />
                    アーカイブ
                  </Button>
                )}
                {isSuperadmin && (
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
          <div className="bg-blue-50/80 rounded-lg p-3">
            <p className="text-xs font-semibold text-blue-600 mb-2">管理・その他</p>
            <div className="flex gap-2 flex-wrap">
              <Button asChild size="sm" variant="outline" className="text-sm bg-white hover:border-blue-300 hover:bg-blue-50">
                <Link href={`/admin/tournaments/${tournament.tournament_id}`} target="_blank" rel="noopener noreferrer">
                  <Eye className="w-4 h-4 mr-1" />
                  公開画面を見る
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline" className="text-sm bg-white hover:border-purple-300 hover:bg-purple-50">
                <Link href={`/public/tournaments/${tournament.tournament_id}/archived`}>
                  <Archive className="w-4 h-4 mr-1" />
                  アーカイブ表示
                </Link>
              </Button>
              {isSuperadmin && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDeleteTournament(tournament)}
                  disabled={deleting === tournament.tournament_id}
                  className="text-sm bg-white border-red-200 text-red-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
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
  };

  const renderGroupedSection = (groupedData: GroupedTournamentData) => {
    const groups = Object.values(groupedData.grouped);
    const ungrouped = groupedData.ungrouped;

    return (
      <>
        {groups.map(({ group, tournaments: divisions }) => (
          <Card key={group.group_id} className="overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-blue-50 to-blue-100">
              <CardTitle className="text-xl sm:text-2xl mb-2 flex items-center gap-2">
                {group.logo_blob_url ? (
                  <div className="w-8 h-8 relative flex-shrink-0">
                    <Image
                      src={group.logo_blob_url}
                      alt="組織ロゴ"
                      fill
                      className="object-contain rounded"
                      sizes="32px"
                    />
                  </div>
                ) : null}
                {group.group_name}
              </CardTitle>
              {group.group_description && (
                <p className="text-sm text-gray-500 mb-3">{group.group_description}</p>
              )}
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" variant="outline" className="text-sm border-blue-400 bg-white/70 hover:bg-white"
                  onClick={() => {
                    const publicUrl = `${window.location.origin}/public/tournaments/groups/${group.group_id}`;
                    const qrPageUrl = `/qr?url=${encodeURIComponent(publicUrl)}&title=${encodeURIComponent(group.group_name || '')}`;
                    window.open(qrPageUrl, '_blank', 'width=500,height=700');
                  }}
                >
                  <QrCode className="w-4 h-4 mr-1" />
                  大会QR
                </Button>
                <Button asChild size="sm" variant="outline" className="text-sm border-blue-400 bg-white/70 hover:bg-white">
                  <Link href={`/admin/tournament-groups/${group.group_id}/edit`}>
                    <FileEdit className="w-4 h-4 mr-1" />
                    大会編集
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline" className="text-sm border-blue-400 bg-white/70 hover:bg-white">
                  <Link href={`/admin/operators?group_id=${group.group_id}`}>
                    <UserCog className="w-4 h-4 mr-1" />
                    運営者管理
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline" className="text-sm border-blue-400 bg-white/70 hover:bg-white">
                  <Link href={`/admin/tournaments/create-new?group_id=${group.group_id}`}>
                    <Plus className="w-4 h-4 mr-1" />
                    部門作成
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-gray-900">所属部門</h4>
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
      {filteredData.planning.length > 0 && (
        <>
          <div className="flex items-center text-gray-500 mb-4">
            <Clock className="w-5 h-5 mr-2" />
            <h3 className="text-xl font-bold">募集前の大会 ({totalGroups(filteredData.grouped.planning)}件)</h3>
          </div>
          {renderGroupedSection(filteredData.grouped.planning)}
        </>
      )}

      {/* 開催中の大会 */}
      {filteredData.ongoing.length > 0 && (
        <>
          <div className="flex items-center text-green-700 mb-4">
            <Trophy className="w-5 h-5 mr-2" />
            <h3 className="text-xl font-bold">開催中の大会 ({totalGroups(filteredData.grouped.ongoing)}件)</h3>
          </div>
          {renderGroupedSection(filteredData.grouped.ongoing)}
        </>
      )}

      {/* 募集中の大会 */}
      {filteredData.recruiting.length > 0 && (
        <>
          <div className="flex items-center text-blue-700 mb-4 mt-8">
            <CalendarDays className="w-5 h-5 mr-2" />
            <h3 className="text-xl font-bold">募集中の大会 ({totalGroups(filteredData.grouped.recruiting)}件)</h3>
          </div>
          {renderGroupedSection(filteredData.grouped.recruiting)}
        </>
      )}

      {/* 開催前の大会 */}
      {filteredData.before_event.length > 0 && (
        <>
          <div className="flex items-center text-orange-700 mb-4 mt-8">
            <CalendarDays className="w-5 h-5 mr-2" />
            <h3 className="text-xl font-bold">開催前の大会 ({totalGroups(filteredData.grouped.before_event)}件)</h3>
          </div>
          {renderGroupedSection(filteredData.grouped.before_event)}
        </>
      )}

      {/* 完了した大会 */}
      {filteredData.completed.length > 0 && (
        <>
          <div className="flex items-center text-gray-700 mb-4 mt-8">
            <Trophy className="w-5 h-5 mr-2" />
            <h3 className="text-xl font-bold">完了した大会（過去1年以内） ({totalGroups(filteredData.grouped.completed)}件)</h3>
          </div>
          {renderGroupedSection(filteredData.grouped.completed)}
        </>
      )}

      {/* 大会がない場合 */}
      {filteredData.total === 0 && (
        <Card>
          <CardContent className="text-center py-12">
            <Trophy className="w-12 h-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              現在、表示可能な大会はありません
            </h3>
            <p className="text-gray-600 mb-6">
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

// ─── 運営者用の大会状況リスト（権限に応じた表示制御） ────────────
function OperatorTournamentStatusList({ data, initialSportTypes }: { data: TournamentDashboardData; initialSportTypes?: SportType[] }) {
  // 競技種別マスタ（初期値はサーバーから渡されたデータ、フォールバック用にfetchも残す）
  const [sportTypes, setSportTypes] = useState<SportType[]>(initialSportTypes || []);

  // 初期データがない場合のみクライアント側でfetch
  useEffect(() => {
    if (!initialSportTypes || initialSportTypes.length === 0) {
      fetch('/api/sport-types')
        .then(res => res.json())
        .then(data => {
          if (data.success && data.data) setSportTypes(data.data);
        })
        .catch(err => console.error('Failed to fetch sport types:', err));
    }
  }, [initialSportTypes]);

  // 競技種別アイコン取得
  const getSportIcon = (sportCode: string) => {
    switch (sportCode) {
      case 'soccer': return '⚽';
      case 'baseball': return '⚾';
      case 'basketball': return '🏀';
      case 'pk': return '🥅';
      default: return '⚽';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const TournamentCard = ({ tournament }: { tournament: Tournament }) => {
    // 競技種別アイコンを取得
    const sportType = sportTypes.find(s => s.sport_type_id === tournament.sport_type_id);
    const sportIcon = sportType ? getSportIcon(sportType.sport_code) : null;

    // 運営者権限を取得（nullの場合はすべてfalse）
    const permissions = tournament.operator_permissions || {};

    return (
    <div className="border rounded-lg overflow-hidden hover:border-primary hover:-translate-y-1 hover:shadow-lg transition-all duration-300 relative">
      <div className="p-4 relative">
        <div className="mb-3">
          <h4 className="font-semibold text-base sm:text-lg text-gray-900 flex items-start gap-2">
            {sportIcon && <span className="text-lg sm:text-xl flex-shrink-0">{sportIcon}</span>}
            <span>{tournament.tournament_name}</span>
          </h4>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <button
              onClick={(e) => {
                e.stopPropagation();
                const publicUrl = `${window.location.origin}/public/tournaments/${tournament.tournament_id}`;
                const qrPageUrl = `/qr?url=${encodeURIComponent(publicUrl)}&title=${encodeURIComponent(tournament.tournament_name)}`;
                window.open(qrPageUrl, '_blank', 'width=500,height=700');
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border border-gray-300 bg-white text-gray-700 hover:bg-primary/10 hover:text-primary hover:border-primary/30 transition-colors cursor-pointer shadow-sm"
              title="部門詳細ページのQRコードを表示"
            >
              <QrCode className="w-3.5 h-3.5" />
              QR
            </button>
            <div className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ${
              tournament.status === 'planning'
                ? 'bg-gray-100 text-gray-800'
                : tournament.status === 'recruiting'
                ? 'bg-blue-100 text-blue-800'
                : tournament.status === 'before_event'
                ? 'bg-yellow-100 text-yellow-800'
                : tournament.status === 'ongoing'
                ? 'bg-green-100 text-green-800'
                : 'bg-gray-100 text-gray-800'
            }`}>
              {getStatusLabel(tournament.status)}
            </div>
          </div>
          <div className="flex items-center text-sm text-gray-600 mt-1">
            <Trophy className="w-4 h-4 mr-1" />
            <span>{tournament.format_name || `フォーマットID: ${tournament.format_id}`}</span>
          </div>
          {tournament.organization_name && (
            <div className="flex items-center text-xs text-gray-500 mt-1">
              <span>主催: {tournament.organization_name}</span>
            </div>
          )}
        </div>

        <div className="space-y-2 mb-4">
          <div className="flex items-center text-sm text-gray-600">
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
              <div className="text-xs font-medium text-gray-600 mb-2">参加状況</div>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5 sm:gap-2">
                <div className="p-1 sm:p-1.5 bg-gray-50 rounded-lg border border-gray-200 text-center">
                  <div className="text-[10px] sm:text-xs text-gray-700 font-medium mb-0.5 whitespace-nowrap">想定チーム数</div>
                  <div className="text-base font-bold text-gray-700">{tournament.team_count}</div>
                </div>
                <div className="p-1 sm:p-1.5 bg-gray-50 rounded-lg border border-gray-200 text-center">
                  <div className="text-[10px] sm:text-xs text-gray-700 font-medium mb-0.5 whitespace-nowrap">参加確定</div>
                  <div className="text-base font-bold text-gray-700">{tournament.confirmed_count || 0}</div>
                </div>
                <div className="p-1 sm:p-1.5 bg-gray-50 rounded-lg border border-gray-200 text-center">
                  <div className="text-[10px] sm:text-xs text-gray-700 font-medium mb-0.5 whitespace-nowrap">キャンセル待</div>
                  <div className="text-base font-bold text-gray-700">{tournament.waitlisted_count || 0}</div>
                </div>
                <div className="p-1 sm:p-1.5 bg-gray-50 rounded-lg border border-gray-200 text-center">
                  <div className="text-[10px] sm:text-xs text-gray-700 font-medium mb-0.5 whitespace-nowrap">辞退申請中</div>
                  <div className="text-base font-bold text-gray-700">{tournament.withdrawal_requested_count || 0}</div>
                </div>
                <div className="p-1 sm:p-1.5 bg-gray-50 rounded-lg border border-gray-200 text-center">
                  <div className="text-[10px] sm:text-xs text-gray-700 font-medium mb-0.5 whitespace-nowrap">キャンセル済</div>
                  <div className="text-base font-bold text-gray-700">{tournament.cancelled_count || 0}</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 操作ボタン（運営者向け：権限に応じて表示） */}
        {!tournament.is_archived ? (
          <div className="space-y-3 bg-blue-50/80 rounded-lg p-3">
            {/* ── 基本情報 ── */}
            <div>
              <p className="text-xs font-semibold text-blue-600 mb-2">基本情報</p>
              <div className="flex gap-2 flex-wrap">
                <Button asChild size="sm" variant="outline" className="text-sm bg-white hover:border-blue-300 hover:bg-blue-50">
                  <Link href={`/admin/tournaments/${tournament.tournament_id}`} target="_blank" rel="noopener noreferrer">
                    <Eye className="w-4 h-4 mr-1" />
                    公開画面を見る
                  </Link>
                </Button>
                {permissions.canManageCourts && tournament.has_matchdays && (
                  <Button asChild size="sm" variant="outline" className="text-sm bg-white hover:border-blue-300 hover:bg-blue-50">
                    <Link href={`/admin/tournaments/${tournament.tournament_id}/matchday-settings`}>
                      <Calendar className="w-4 h-4 mr-1" />
                      日程・会場設定
                    </Link>
                  </Button>
                )}
                {permissions.canManageCourts && !tournament.has_matchdays && (
                  <Button asChild size="sm" variant="outline" className="text-sm bg-white hover:border-blue-300 hover:bg-blue-50">
                    <Link href={`/admin/tournaments/${tournament.tournament_id}/court-venue-settings`}>
                      <MapPin className="w-4 h-4 mr-1" />
                      会場・コート設定
                    </Link>
                  </Button>
                )}
              </div>
            </div>

            {/* ── 事前準備 ── */}
            {(permissions.canManageRules || permissions.canRegisterTeams || permissions.canCreateDraws || permissions.canManageParticipants || permissions.canPrintRefereeCards) && (
              <div>
                <p className="text-xs font-semibold text-blue-600 mb-2">事前準備</p>
                <div className="flex gap-2 flex-wrap">
                  {permissions.canManageRules && (
                    <Button asChild size="sm" variant="outline" className="text-sm bg-white hover:border-blue-300 hover:bg-blue-50">
                      <Link href={`/admin/tournaments/${tournament.tournament_id}/rules`}>
                        <Settings className="w-4 h-4 mr-1" />
                        ルール設定
                      </Link>
                    </Button>
                  )}
                  {permissions.canRegisterTeams && (
                    <Button asChild size="sm" variant="outline" className="text-sm bg-white hover:border-blue-300 hover:bg-blue-50">
                      <Link href={`/admin/tournaments/${tournament.tournament_id}/teams`}>
                        <UserPlus className="w-4 h-4 mr-1" />
                        チーム登録
                      </Link>
                    </Button>
                  )}
                  {permissions.canCreateDraws && (
                    <Button asChild size="sm" variant="outline" className="text-sm bg-white hover:border-blue-300 hover:bg-blue-50">
                      <Link href={`/admin/tournaments/${tournament.tournament_id}/draw`}>
                        <Shuffle className="w-4 h-4 mr-1" />
                        組合せ作成
                      </Link>
                    </Button>
                  )}
                  {permissions.canManageParticipants && (
                    <Button asChild size="sm" variant="outline" className="text-sm bg-white hover:border-blue-300 hover:bg-blue-50">
                      <Link href={`/admin/tournaments/${tournament.tournament_id}/participants`}>
                        <Users className="w-4 h-4 mr-1" />
                        参加チーム管理
                      </Link>
                    </Button>
                  )}
                  {permissions.canPrintRefereeCards && (
                    <Button asChild size="sm" variant="outline" className="text-sm bg-white hover:border-blue-300 hover:bg-blue-50">
                      <Link href={`/admin/tournaments/${tournament.tournament_id}/qr-list`}>
                        <QrCode className="w-4 h-4 mr-1" />
                        審判カード印刷
                      </Link>
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* ── 当日運営 ── */}
            {(permissions.canInputResults || permissions.canConfirmResults || permissions.canSetManualRankings || permissions.canChangePromotionRules) && (
              <div>
                <p className="text-xs font-semibold text-blue-600 mb-2">当日運営</p>
                <div className="flex gap-2 flex-wrap">
                  {(permissions.canInputResults || permissions.canConfirmResults) && (
                    <Button asChild size="sm" variant="outline" className="text-sm bg-white hover:border-blue-300 hover:bg-blue-50">
                      <Link href={`/admin/tournaments/${tournament.tournament_id}/matches`}>
                        <ClipboardList className="w-4 h-4 mr-1" />
                        試合結果入力
                      </Link>
                    </Button>
                  )}
                  {permissions.canSetManualRankings && (
                    <Button asChild size="sm" variant="outline" className="text-sm bg-white hover:border-blue-300 hover:bg-blue-50">
                      <Link href={`/admin/tournaments/${tournament.tournament_id}/manual-rankings`}>
                        <Trophy className="w-4 h-4 mr-1" />
                        手動順位設定
                      </Link>
                    </Button>
                  )}
                  {permissions.canChangePromotionRules && (
                    <Button asChild size="sm" variant="outline" className="text-sm bg-white hover:border-blue-300 hover:bg-blue-50">
                      <Link href={`/admin/tournaments/${tournament.tournament_id}/match-overrides`}>
                        <Target className="w-4 h-4 mr-1" />
                        選出条件変更
                      </Link>
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* ── 管理・その他 ── */}
            {(permissions.canSendEmails || permissions.canManageFiles || permissions.canManageSponsors) && (
              <div>
                <p className="text-xs font-semibold text-blue-600 mb-2">管理・その他</p>
                <div className="flex gap-2 flex-wrap">
                  {permissions.canSendEmails && (
                    <Button asChild size="sm" variant="outline" className="text-sm bg-white hover:border-blue-300 hover:bg-blue-50">
                      <Link href={`/admin/tournaments/${tournament.tournament_id}/participants/email`}>
                        <Mail className="w-4 h-4 mr-1" />
                        メール送信
                      </Link>
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* アーカイブ済み */
          <div className="bg-blue-50/80 rounded-lg p-3">
            <p className="text-xs font-semibold text-blue-600 mb-2">閲覧</p>
            <div className="flex gap-2 flex-wrap">
              <Button asChild size="sm" variant="outline" className="text-sm bg-white hover:border-blue-300 hover:bg-blue-50">
                <Link href={`/admin/tournaments/${tournament.tournament_id}`} target="_blank" rel="noopener noreferrer">
                  <Eye className="w-4 h-4 mr-1" />
                  公開画面を見る
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline" className="text-sm bg-white hover:border-purple-300 hover:bg-purple-50">
                <Link href={`/public/tournaments/${tournament.tournament_id}/archived`}>
                  <Archive className="w-4 h-4 mr-1" />
                  アーカイブ表示
                </Link>
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
    );
  };

  const renderGroupedSection = (groupedData: GroupedTournamentData) => {
    const groups = Object.values(groupedData.grouped);
    const ungrouped = groupedData.ungrouped;

    return (
      <>
        {groups.map(({ group, tournaments: divisions }) => (
          <Card key={group.group_id} className="overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-blue-50 to-blue-100">
              <CardTitle className="text-xl sm:text-2xl mb-2 flex items-center gap-2">
                {group.logo_blob_url ? (
                  <div className="w-8 h-8 relative flex-shrink-0">
                    <Image
                      src={group.logo_blob_url}
                      alt="組織ロゴ"
                      fill
                      className="object-contain rounded"
                      sizes="32px"
                    />
                  </div>
                ) : null}
                {group.group_name}
              </CardTitle>
              {group.group_description && (
                <p className="text-sm text-gray-500 mb-3">{group.group_description}</p>
              )}
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-gray-900">所属部門</h4>
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
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              現在、担当している大会はありません
            </h3>
            <p className="text-gray-600">
              管理者から大会へのアクセス権限が付与されると、ここに表示されます
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── 運営者タブ ──────────────────────────────────────────────────────
function OperatorTabContent({ initialTournamentData, initialSportTypes }: { initialTournamentData?: TournamentDashboardData | null; initialSportTypes?: SportType[] }) {
  return (
    <div className="space-y-8">
      {/* 運営者メニュー */}
      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-4">運営者メニュー</h2>
        <p className="text-sm text-gray-500 mb-6">管理者から付与されたアクセス権限のある大会が表示されます</p>
      </div>

      {/* 大会状況 */}
      <div>
        <div className="mb-4">
          <h2 className="text-xl font-bold text-gray-900">担当大会一覧</h2>
        </div>
        {initialTournamentData ? (
          <OperatorTournamentStatusList data={initialTournamentData} initialSportTypes={initialSportTypes} />
        ) : (
          <div className="text-center py-8">
            <p className="text-gray-600">大会データを読み込み中...</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── チームタブ ────────────────────────────────────────────────────────────────
// ── チーム管理タブ用 型定義 ──────────────────────────────
interface TeamInfo {
  team_id: string;
  team_name: string;
  team_omission: string | null;
  contact_phone: string | null;
  prefecture_id: number | null;
  is_active: boolean;
  member_role: string;
  joined_at: string;
  player_count: number;
  manager_count: number;
}
interface JoinedTournament {
  tournament_id: number;
  tournament_name: string;
  event_start_date: string | null;
  tournament_team_id: number;
  tournament_team_name: string;
  participation_status: string;
  assigned_block: string | null;
  withdrawal_status: string;
  withdrawal_requested_at: string | null;
  sport_type_id: number | null;
  tournament_status: string | null;
  recruitment_end_date: string | null;
  tournament_group_id: number | null;
  group_name: string | null;
  logo_blob_url: string | null;
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
  sport_type_id: number | null;
  logo_blob_url: string | null;
}
type TeamPanelTab = 'search' | 'joined' | 'past';

// ── チームカード展開パネル ──────────────────────────────
function TeamExpandedPanel({ team }: {
  team: TeamInfo;
}) {
  const searchParams = useSearchParams();
  const teamId = team.team_id;

  // URLパラメータからタブを取得（参加登録後のリダイレクト用）
  const teamTabFromUrl = searchParams.get('teamTab') as TeamPanelTab | null;

  const [activeTab, setActiveTab] = useState<TeamPanelTab>(
    teamTabFromUrl && ['search', 'joined', 'past'].includes(teamTabFromUrl)
      ? teamTabFromUrl
      : 'search'
  );
  const [panelMsg, setPanelMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 大会
  const [joined, setJoined] = useState<JoinedTournament[]>([]);
  const [available, setAvailable] = useState<AvailableTournament[]>([]);
  const [pastTournaments, setPastTournaments] = useState<AvailableTournament[]>([]);
  const [tournamentsLoading, setTournamentsLoading] = useState(true);
  const [pastTournamentsLoading, setPastTournamentsLoading] = useState(true);

  // 検索関連
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [selectedPrefecture, setSelectedPrefecture] = useState<string>('');
  const [selectedSportType, setSelectedSportType] = useState<string>('');
  const [prefectures, setPrefectures] = useState<Array<{prefecture_id: number; prefecture_name: string}>>([]);
  const [sportTypes, setSportTypes] = useState<Array<{sport_type_id: number; sport_name: string; sport_code: string}>>([]);
  const [showInitialMessage, setShowInitialMessage] = useState(false);

  // セッションストレージのキー
  const SEARCH_STATE_KEY = `team_${teamId}_search_state`;
  const SEARCH_INITIALIZED_KEY = `team_${teamId}_search_initialized`;

  // 辞退モーダル関連
  const [withdrawalModalOpen, setWithdrawalModalOpen] = useState(false);
  const [selectedWithdrawal, setSelectedWithdrawal] = useState<{
    tournamentTeamId: number;
    tournamentTeamName: string;
    tournamentName: string;
  } | null>(null);

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

  // 過去に参加した大会を取得
  const fetchPastTournaments = useCallback(async () => {
    setPastTournamentsLoading(true);
    try {
      const res = await fetch(`/api/my/teams/${teamId}/tournaments/past`);
      if (!res.ok) return;
      const result = await res.json();
      if (result.success) {
        setPastTournaments(result.data);
      }
    } finally {
      setPastTournamentsLoading(false);
    }
  }, [teamId]);

  // 検索実行
  const handleSearch = useCallback(() => {
    // 検索条件をセッションストレージに保存
    const searchState = {
      keyword: searchKeyword,
      prefectureId: selectedPrefecture,
      sportTypeId: selectedSportType,
    };
    sessionStorage.setItem(SEARCH_STATE_KEY, JSON.stringify(searchState));

    // 初回メッセージを非表示
    setShowInitialMessage(false);

    fetchTournaments(searchKeyword, selectedPrefecture, selectedSportType);
  }, [fetchTournaments, searchKeyword, selectedPrefecture, selectedSportType, SEARCH_STATE_KEY]);

  // 検索クリア
  const handleClearSearch = useCallback(() => {
    setSearchKeyword('');
    setSelectedPrefecture('');
    setSelectedSportType('');
    setShowInitialMessage(false);

    // セッションストレージもクリア（初期化フラグは保持）
    sessionStorage.removeItem(SEARCH_STATE_KEY);

    fetchTournaments('', '', '');
  }, [fetchTournaments, SEARCH_STATE_KEY]);

  // 大会参加辞退（モーダルを開く）
  const handleWithdrawal = (tournamentTeamId: number, teamName: string, tournamentName: string) => {
    setSelectedWithdrawal({
      tournamentTeamId,
      tournamentTeamName: teamName,
      tournamentName,
    });
    setWithdrawalModalOpen(true);
  };

  // 辞退申請成功時のコールバック
  const handleWithdrawalSuccess = () => {
    setPanelMsg({ type: 'success', text: '辞退申請を受け付けました。管理者の承認をお待ちください。' });
    // 大会一覧を再取得
    fetchTournaments();
    // モーダルを閉じる
    setWithdrawalModalOpen(false);
    setSelectedWithdrawal(null);
  };

  // 初回マウント時に必ずデータを取得
  useEffect(() => {
    console.log('[チーム詳細パネル] 初回データ取得');

    // このチームの検索画面を初めて表示したかチェック
    const isInitialized = sessionStorage.getItem(SEARCH_INITIALIZED_KEY);
    const savedState = sessionStorage.getItem(SEARCH_STATE_KEY);

    let keyword = '';
    let prefectureId = '';
    let sportTypeId = '';

    if (isInitialized && savedState) {
      // 既に初期化済みで検索条件がある場合は復元
      try {
        const parsed = JSON.parse(savedState);
        keyword = parsed.keyword || '';
        prefectureId = parsed.prefectureId || '';
        sportTypeId = parsed.sportTypeId || '';

        setSearchKeyword(keyword);
        setSelectedPrefecture(prefectureId);
        setSelectedSportType(sportTypeId);
      } catch (err) {
        console.error('Failed to parse saved search state:', err);
      }
    } else {
      // 初回の場合はチームの主要地域で検索
      const initialPrefectureId = team.prefecture_id ? String(team.prefecture_id) : '';

      if (initialPrefectureId) {
        prefectureId = initialPrefectureId;
        setSelectedPrefecture(initialPrefectureId);
        setShowInitialMessage(true);
      }

      // 初期化完了フラグをセット
      sessionStorage.setItem(SEARCH_INITIALIZED_KEY, 'true');
    }

    // 大会データをフェッチ（初回は必ず実行）
    fetchTournaments(keyword, prefectureId, sportTypeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 「大会を探す」タブに切り替わった時の処理（検索条件の更新時のみ）
  useEffect(() => {
    // 「大会を探す」タブが表示されていない場合は何もしない
    if (activeTab !== 'search') return;

    console.log('[大会を探す] タブ切り替え', {
      teamId,
      team_prefecture_id: team.prefecture_id
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

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

  // 「過去に参加した大会」タブに切り替わった時にデータ取得
  useEffect(() => {
    if (activeTab === 'past') {
      fetchPastTournaments();
    }
  }, [activeTab, fetchPastTournaments]);

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

  const panelTabs: { key: TeamPanelTab; label: string; icon: React.ReactNode }[] = [
    { key: 'search', label: '大会を探す', icon: <Search className="w-4 h-4" /> },
    { key: 'joined', label: '申込済の大会', icon: <Trophy className="w-4 h-4" /> },
    { key: 'past', label: '過去に参加した大会', icon: <Archive className="w-4 h-4" /> },
  ];

  return (
    <div className="border-t border-gray-200">
      {/* パネルタブ */}
      <div className="grid grid-cols-3 gap-1">
        {panelTabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setPanelMsg(null); }}
            className={`flex items-center justify-center gap-1.5 py-3 text-xs sm:text-sm font-medium rounded-md transition-colors ${
              activeTab === tab.key
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-gray-50 text-gray-500 hover:bg-gray-50/80 hover:text-gray-900'
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
              ? 'bg-green-50 border border-green-200 text-green-800'
              : 'bg-red-50 border border-red-200 text-red-800'
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

        {/* 大会を探すタブ */}
        {activeTab === 'search' && (
          tournamentsLoading ? <div className="text-center py-4"><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 mx-auto" /></div> : (
            <div className="space-y-4">
              {/* 初回訪問時のメッセージ */}
              {showInitialMessage && team.prefecture_id && (
                <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="flex items-start gap-2 flex-1">
                    <MapPin className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div className="text-sm text-blue-800">
                      <p className="font-medium">あなたの活動地域の大会を表示しています</p>
                      <p className="text-xs mt-1 opacity-80">
                        {prefectures.find(p => p.prefecture_id === team.prefecture_id)?.prefecture_name || '登録地域'}の大会を表示中です。他の地域の大会を探す場合は、検索条件を変更してください。
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowInitialMessage(false)}
                    className="opacity-60 hover:opacity-100 flex-shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* 検索UI */}
              <div className="border border-gray-200 rounded-lg mb-6 bg-gray-50/20">
                {/* 検索ヘッダー（常に表示） */}
                <button
                  onClick={() => setSearchExpanded(!searchExpanded)}
                  className="w-full flex items-center justify-between p-4 hover:bg-gray-50/30 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Search className="w-5 h-5 text-blue-600" />
                    <span className="font-medium">大会を検索</span>
                  </div>
                  {searchExpanded ? (
                    <ChevronUp className="w-5 h-5 text-gray-500" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-500" />
                  )}
                </button>

                {/* 検索条件エリア（折り畳み） */}
                {searchExpanded && (
                  <div className="p-4 space-y-4 border-t border-gray-200">
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
                        <SelectTrigger className="bg-white">
                          <SelectValue placeholder="都道府県を選択" />
                        </SelectTrigger>
                        <SelectContent className="bg-white">
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
                              ? 'border-blue-600 bg-blue-50 text-blue-700'
                              : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/50'
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
                                ? 'border-blue-600 bg-blue-50 text-blue-700'
                                : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/50'
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
                      <Button onClick={handleSearch} className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground">
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
                <div className="text-sm font-medium text-gray-500 mb-3">参加申込できる大会</div>
                {available.length === 0 ? (
                  <p className="text-sm text-gray-500">現在募集中の大会はありません</p>
                ) : (
                  <div className="space-y-4">
                    {(() => {
                      // 大会グループごとにグループ化
                      const grouped = new Map<number | null, { group_name: string | null; logo_blob_url: string | null; tournaments: typeof available }>();
                      available.forEach(t => {
                        const key = t.tournament_group_id;
                        if (!grouped.has(key)) {
                          grouped.set(key, { group_name: t.group_name, logo_blob_url: t.logo_blob_url, tournaments: [] });
                        }
                        grouped.get(key)!.tournaments.push(t);
                      });

                      return Array.from(grouped.entries()).map(([groupId, { group_name, logo_blob_url, tournaments }]) => {
                        return (
                        <div key={groupId ?? 'no-group'} className="border border-gray-200 rounded-lg p-5">
                          <div className="text-lg font-semibold mb-3 flex items-center gap-2">
                            {logo_blob_url ? (
                              <div className="w-7 h-7 relative flex-shrink-0">
                                <Image
                                  src={logo_blob_url}
                                  alt="組織ロゴ"
                                  fill
                                  className="object-contain rounded"
                                  sizes="28px"
                                />
                              </div>
                            ) : null}
                            {group_name || '大会'}
                          </div>
                          <div className="space-y-3">
                            {tournaments.map(t => {
                              // この部門に申込済みかチェック
                              const joinedTeams = joined.filter(j => j.tournament_id === t.tournament_id);
                              const isJoined = joinedTeams.length > 0;
                              const joinedCount = joinedTeams.length;
                              // 競技種別アイコンを取得
                              const sportType = sportTypes.find(s => s.sport_type_id === t.sport_type_id);
                              const sportIcon = sportType ? getSportIcon(sportType.sport_code) : null;

                              return (
                              <div key={t.tournament_id} className="flex items-center justify-between p-4 bg-gray-50/40 rounded-lg">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    {sportIcon && <span className="text-lg flex-shrink-0">{sportIcon}</span>}
                                    <div className="text-base font-semibold truncate">{t.tournament_name}</div>
                                    {isJoined && (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 flex-shrink-0">
                                        ✓ 申込済 {joinedCount > 1 ? `${joinedCount}チーム` : ''}
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-sm text-gray-500">
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
                                {isJoined ? (
                                  <Button asChild size="default" variant="outline" className="border-blue-400 text-blue-700 hover:bg-blue-50 flex-shrink-0 ml-3">
                                    <Link href={`/my/tournaments/${t.tournament_id}/apply?mode=new`}>追加で申込</Link>
                                  </Button>
                                ) : (
                                  <Button asChild size="default" variant="outline" className="border-green-400 text-green-700 hover:bg-green-50 flex-shrink-0 ml-3">
                                    <Link href={`/my/tournaments/${t.tournament_id}/apply`}>申込</Link>
                                  </Button>
                                )}
                              </div>
                              );
                            })}
                          </div>
                        </div>
                        );
                      });
                    })()}
                  </div>
                )}
              </div>
            </div>
          )
        )}

        {/* 申込済の大会タブ */}
        {activeTab === 'joined' && (
          tournamentsLoading ? <div className="text-center py-4"><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 mx-auto" /></div> : (() => {
            // 終了した大会を除外
            const activeJoined = joined.filter(t => t.tournament_status !== 'completed');
            return (
            <div className="space-y-4">
              {activeJoined.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Trophy className="h-12 w-12 mx-auto mb-4 opacity-30" />
                  <p className="text-sm">参加申込済みの大会はありません</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {(() => {
                    // 大会グループごとにグループ化
                    const grouped = new Map<number | null, { group_name: string | null; logo_blob_url: string | null; tournaments: typeof activeJoined }>();
                    activeJoined.forEach(t => {
                      const key = t.tournament_group_id ?? null;
                      const groupName = t.group_name ?? null;
                      const logoBlobUrl = t.logo_blob_url ?? null;

                      if (!grouped.has(key)) {
                        grouped.set(key, { group_name: groupName, logo_blob_url: logoBlobUrl, tournaments: [] });
                      }
                      grouped.get(key)!.tournaments.push(t);
                    });

                    return Array.from(grouped.entries()).map(([groupId, { group_name, logo_blob_url, tournaments }]) => {

                      // 部門（tournament_id）ごとにグループ化
                      const tournamentGroups = new Map<number, typeof joined>();
                      tournaments.forEach(t => {
                        if (!tournamentGroups.has(t.tournament_id)) {
                          tournamentGroups.set(t.tournament_id, []);
                        }
                        tournamentGroups.get(t.tournament_id)!.push(t);
                      });

                      return (
                        <div key={groupId ?? 'no-group'} className="border border-gray-200 rounded-lg p-5">
                          <div className="text-lg font-semibold mb-3 flex items-center gap-2">
                            {logo_blob_url ? (
                              <div className="w-7 h-7 relative flex-shrink-0">
                                <Image
                                  src={logo_blob_url}
                                  alt="組織ロゴ"
                                  fill
                                  className="object-contain rounded"
                                  sizes="28px"
                                />
                              </div>
                            ) : null}
                            {group_name || '大会'}
                          </div>
                          <div className="space-y-4">
                            {Array.from(tournamentGroups.entries()).map(([tournamentId, teams]) => {
                              const firstTeam = teams[0];
                              const availableTournament = available.find(a => a.tournament_id === tournamentId);
                              // 競技種別アイコンを取得
                              const sportType = sportTypes.find(s => s.sport_type_id === firstTeam.sport_type_id);
                              const sportIcon = sportType ? getSportIcon(sportType.sport_code) : null;
                              // 募集期間内かチェック
                              const isRecruitmentOpen = firstTeam.recruitment_end_date
                                ? new Date(firstTeam.recruitment_end_date) >= new Date()
                                : false;

                              return (
                                <div key={tournamentId} className="border border-gray-200 rounded-lg overflow-hidden bg-gradient-to-br from-background to-muted/10">
                                  {/* 部門ヘッダー */}
                                  <div className="px-5 py-4">
                                    <div className="flex items-center justify-between gap-3 mb-4">
                                      <div className="flex-1 min-w-0">
                                        <div className="text-lg font-bold truncate text-gray-900 flex items-center gap-2">
                                          {sportIcon && <span className="text-lg flex-shrink-0">{sportIcon}</span>}
                                          {firstTeam.tournament_name}
                                        </div>
                                        <div className="text-sm text-gray-500 mt-1.5 flex items-center gap-2">
                                          {availableTournament?.event_start_date && availableTournament?.event_end_date && (
                                            <div className="flex items-center gap-1.5">
                                              <CalendarDays className="w-3.5 h-3.5" />
                                              <span>
                                                {availableTournament.event_start_date === availableTournament.event_end_date
                                                  ? availableTournament.event_start_date
                                                  : `${availableTournament.event_start_date} 〜 ${availableTournament.event_end_date}`
                                                }
                                              </span>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                      <div className="flex gap-2 flex-shrink-0">
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => window.open(`/public/tournaments/${tournamentId}`, '_blank', 'noopener,noreferrer')}
                                        >
                                          公開画面を見る
                                        </Button>
                                        {isRecruitmentOpen && (
                                          <Button
                                            asChild
                                            size="sm"
                                            variant="outline"
                                            className="border-blue-400 text-blue-700 hover:bg-blue-50"
                                          >
                                            <Link href={`/my/tournaments/${tournamentId}/apply?mode=new`}>追加で申込</Link>
                                          </Button>
                                        )}
                                      </div>
                                    </div>

                                    {/* 参加チーム一覧 */}
                                    <div className="space-y-1">
                                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                        <Users className="w-3.5 h-3.5" />
                                        参加チーム {teams.length > 1 && `(${teams.length})`}
                                      </div>
                                      <div className="space-y-1.5">
                                        {teams.map(t => {
                                          const isWithdrawalRequested = t.withdrawal_status === 'withdrawal_requested';
                                          const isWithdrawalApproved = t.withdrawal_status === 'withdrawal_approved';
                                          const isWithdrawalRejected = t.withdrawal_status === 'withdrawal_rejected';

                                          return (
                                            <div key={t.tournament_team_id} className="pl-5 py-2 rounded-md hover:bg-gray-50/30 transition-colors group">
                                              <div className="flex items-center gap-2">
                                                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                                                  isWithdrawalApproved ? 'bg-gray-400' :
                                                  isWithdrawalRequested ? 'bg-yellow-500' :
                                                  isWithdrawalRejected ? 'bg-red-500' :
                                                  'bg-green-500'
                                                }`} />
                                                <div className="font-medium text-base text-gray-900 flex-1 truncate">
                                                  {t.tournament_team_name}
                                                </div>
                                                {t.assigned_block && (
                                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 flex-shrink-0">
                                                    ブロック {t.assigned_block}
                                                  </span>
                                                )}
                                                {isWithdrawalRejected && (
                                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 flex-shrink-0">
                                                    辞退却下
                                                  </span>
                                                )}
                                                {!isWithdrawalApproved && (
                                                  <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="border-blue-300 text-blue-600 hover:bg-blue-50 hover:border-blue-400 flex-shrink-0"
                                                    asChild
                                                  >
                                                    <Link href={`/my/tournaments/${t.tournament_id}/apply?team=${teamId}&tournament_team_id=${t.tournament_team_id}`}>
                                                      <Pencil className="w-3.5 h-3.5 mr-1" />
                                                      チーム情報を編集
                                                    </Link>
                                                  </Button>
                                                )}
                                                <Button
                                                  size="sm"
                                                  variant="outline"
                                                  className="border-red-300 text-red-600 hover:bg-red-50 hover:border-red-400 flex-shrink-0"
                                                  disabled={isWithdrawalRequested || isWithdrawalApproved}
                                                  onClick={() => !isWithdrawalRequested && !isWithdrawalApproved && handleWithdrawal(t.tournament_team_id, t.tournament_team_name, t.tournament_name)}
                                                >
                                                  {isWithdrawalApproved ? '辞退承認済み' : isWithdrawalRequested ? '辞退申請中' : '参加を辞退する'}
                                                </Button>
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              )}
            </div>
            );
          })()
        )}

        {/* 過去に参加した大会タブ */}
        {activeTab === 'past' && (
          pastTournamentsLoading ? <div className="text-center py-4"><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 mx-auto" /></div> : (
            <div className="space-y-4">
              {pastTournaments.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Archive className="h-12 w-12 mx-auto mb-4 opacity-30" />
                  <p className="text-sm">過去に参加した大会はありません</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {(() => {
                    // 大会グループごとにグループ化
                    const grouped = new Map<number | null, { group_name: string | null; logo_blob_url: string | null; tournaments: typeof pastTournaments }>();
                    pastTournaments.forEach(t => {
                      const key = t.tournament_group_id ?? null;
                      const groupName = t.group_name ?? null;
                      const logoBlobUrl = t.logo_blob_url ?? null;

                      if (!grouped.has(key)) {
                        grouped.set(key, { group_name: groupName, logo_blob_url: logoBlobUrl, tournaments: [] });
                      }
                      grouped.get(key)!.tournaments.push(t);
                    });

                    return Array.from(grouped.entries()).map(([groupId, { group_name, logo_blob_url, tournaments: groupTournaments }]) => (
                      <div key={groupId ?? 'no-group'} className="border border-gray-200 rounded-lg p-5">
                        <div className="text-lg font-semibold mb-3 flex items-center gap-2">
                          {logo_blob_url ? (
                            <div className="w-7 h-7 relative flex-shrink-0">
                              <Image
                                src={logo_blob_url}
                                alt="組織ロゴ"
                                fill
                                className="object-contain rounded"
                                sizes="28px"
                              />
                            </div>
                          ) : null}
                          {group_name || '大会'}
                        </div>
                        <div className="space-y-3">
                          {groupTournaments.map(t => {
                            // 競技種別アイコンを取得
                            const sportType = sportTypes.find(s => s.sport_type_id === t.sport_type_id);
                            const sportIcon = sportType ? getSportIcon(sportType.sport_code) : null;

                            return (
                              <div key={t.tournament_id} className="border border-gray-200 rounded-lg p-4 bg-gradient-to-br from-background to-muted/10 hover:border-primary hover:-translate-y-1 hover:shadow-lg transition-all duration-300">
                                <div className="flex items-start justify-between gap-4">
                                  <div className="flex-1 min-w-0">
                                    <div className="text-base font-bold truncate text-gray-900 flex items-center gap-2 mb-2">
                                      {sportIcon && <span className="text-base flex-shrink-0">{sportIcon}</span>}
                                      {t.tournament_name}
                                    </div>
                                    <div className="text-sm text-gray-500 space-y-1">
                                      {t.event_start_date && t.event_end_date && (
                                        <div className="flex items-center gap-1.5">
                                          <CalendarDays className="w-3.5 h-3.5" />
                                          <span>
                                            {t.event_start_date === t.event_end_date
                                              ? t.event_start_date
                                              : `${t.event_start_date} 〜 ${t.event_end_date}`
                                            }
                                          </span>
                                        </div>
                                      )}
                                      {t.venue_name && (
                                        <div className="flex items-center gap-1.5">
                                          <MapPin className="w-3.5 h-3.5" />
                                          <span className="truncate">{t.venue_name}</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex-shrink-0">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => window.open(`/public/tournaments/${t.tournament_id}`, '_blank', 'noopener,noreferrer')}
                                    >
                                      <Eye className="w-4 h-4 mr-1" />
                                      公開画面を見る
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              )}
            </div>
          )
        )}
      </div>

      {/* 辞退申請モーダル */}
      {selectedWithdrawal && (
        <WithdrawalModal
          isOpen={withdrawalModalOpen}
          onClose={() => {
            setWithdrawalModalOpen(false);
            setSelectedWithdrawal(null);
          }}
          onSuccess={handleWithdrawalSuccess}
          tournamentTeamId={selectedWithdrawal.tournamentTeamId}
          tournamentTeamName={selectedWithdrawal.tournamentTeamName}
          tournamentName={selectedWithdrawal.tournamentName}
          teamId={teamId}
        />
      )}
    </div>
  );
}

// ── チームID紐付けセクション ──────────────────────────────
function TeamLinkSection({ onLinked }: { onLinked: () => void }) {
  const [linkTeamId, setLinkTeamId] = useState('');
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState('');

  const handleLink = async () => {
    if (!linkTeamId.trim()) {
      setLinkError('チームIDを入力してください');
      return;
    }

    setLinking(true);
    setLinkError('');

    try {
      const res = await fetch('/api/my/teams/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team_id: linkTeamId.trim() }),
      });

      const result = await res.json();

      if (result.success) {
        alert(result.message);
        setLinkTeamId('');
        onLinked();
      } else {
        setLinkError(result.error || '紐付けに失敗しました');
      }
    } catch {
      setLinkError('通信エラーが発生しました');
    } finally {
      setLinking(false);
    }
  };

  return (
    <Card className="border-dashed border-2 border-orange-300">
      <CardContent className="p-4">
        <h4 className="font-medium text-sm mb-2 flex items-center gap-1">
          <Target className="w-4 h-4 text-orange-600" />
          チームIDで紐付ける
        </h4>
        <p className="text-xs text-gray-500 mb-3">
          管理者から伝えられたチームIDを入力して、チームを自分のアカウントに紐付けます。
        </p>
        <div className="flex gap-2">
          <Input
            value={linkTeamId}
            onChange={(e) => { setLinkTeamId(e.target.value); setLinkError(''); }}
            placeholder="チームIDを入力"
            className="text-sm"
          />
          <Button
            onClick={handleLink}
            disabled={linking}
            size="sm"
            variant="outline"
            className="border-orange-400 text-orange-700 hover:bg-orange-50 whitespace-nowrap"
          >
            {linking ? '紐付け中...' : '紐付ける'}
          </Button>
        </div>
        {linkError && (
          <p className="text-xs text-destructive mt-2 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            {linkError}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ── チームタブコンテンツ ──────────────────────────────
function TeamTabContent({ teamIds: _teamIds, initialTeamData }: {
  teamIds: string[];
  initialTeamData?: TeamDashboardItem[] | null;
}) {
  const [teams, setTeams] = useState<TeamInfo[]>((initialTeamData ?? []) as TeamInfo[]);
  const [loading, setLoading] = useState(!initialTeamData);
  const [showLinkConfirm, setShowLinkConfirm] = useState(false);

  const fetchTeams = useCallback(async () => {
    try {
      const res = await fetch('/api/my/teams');
      if (!res.ok) return;
      const result = await res.json();
      if (result.success) {
        setTeams(result.data);
      }
    } catch (err) {
      console.error('チーム取得エラー:', err);
    } finally {
      setLoading(false);
    }
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
      <div className="text-center py-12 text-gray-500">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4" />
        <p className="text-sm">読み込み中...</p>
      </div>
    );
  }

  if (teams.length === 0) {
    return (
      <div className="max-w-md mx-auto text-center py-12 space-y-6">
        <div>
          <Users className="h-12 w-12 mx-auto mb-4 text-gray-500 opacity-40" />
          <p className="text-lg font-medium text-gray-900 mb-2">チーム情報が未登録です</p>
          <p className="text-sm text-gray-500 mb-6">
            大会に参加するには、チームを登録するか、管理者から伝えられたチームIDで紐付けてください。
          </p>
          <Button asChild variant="outline" className="border-2 border-blue-400 hover:border-blue-500 hover:bg-blue-50">
            <Link href="/my/teams/new">
              <UserPlus className="mr-2 h-4 w-4" />
              チームを登録する
            </Link>
          </Button>
        </div>

        {/* 制約事項 */}
        <div className="text-left bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-2">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0" />
            <p className="text-sm font-medium text-amber-800">ご利用上の注意</p>
          </div>
          <ul className="text-sm text-amber-800 space-y-1.5 list-disc list-inside">
            <li>1つのアカウントで管理できるチームは<strong>1チームまで</strong>です</li>
            <li>チームの担当者は<strong>最大2名まで</strong>登録できます（メール招待で追加）</li>
            <li>チームIDで紐付けを行うと、現在登録済みのチーム情報との紐付けが解除されます。チームのデータ（選手・大会参加情報）は残りますが、再度紐付けない限りアクセスできなくなります</li>
          </ul>
        </div>

        <TeamLinkSection onLinked={fetchTeams} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {teams.map((team) => {
        return (
          <Card key={team.team_id} className="overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-green-50 to-green-100 pb-3">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <CardTitle className="text-lg mb-1 flex items-center gap-2">
                    <span className="truncate">{team.team_name}</span>
                    {team.team_omission && (
                      <span className="text-sm font-normal text-gray-500 flex-shrink-0">（{team.team_omission}）</span>
                    )}
                  </CardTitle>
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-200 text-blue-800">
                      担当者
                    </span>
                    <span className="text-xs">チームID: {team.team_id}</span>
                    <span className="text-xs">選手 {team.player_count}名</span>
                    <span className="text-xs">担当者 {team.manager_count}/2名</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 pt-1">
                  <Button asChild size="sm" variant="outline" className="text-sm border-blue-400 bg-white/70 hover:bg-white">
                    <Link href={`/my/teams/${team.team_id}/edit`}>
                      <Pencil className="w-4 h-4 mr-1" />
                      チーム情報
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="outline" className="text-sm border-purple-400 bg-white/70 hover:bg-white">
                    <Link href={`/my/teams/${team.team_id}/managers`}>
                      <UserCog className="w-4 h-4 mr-1" />
                      代表者
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="outline" className="text-sm border-green-400 bg-white/70 hover:bg-white">
                    <Link href={`/my/teams/${team.team_id}/players`}>
                      <Users className="w-4 h-4 mr-1" />
                      選手登録
                    </Link>
                  </Button>
                </div>
              </div>
            </CardHeader>

            <TeamExpandedPanel
              team={team}
            />
          </Card>
        );
      })}

      {/* チームIDで紐付けるセクション（既存チームの上書き） */}
      {!showLinkConfirm ? (
        <div className="text-center pt-4">
          <button
            onClick={() => setShowLinkConfirm(true)}
            className="text-sm text-orange-600 hover:text-orange-800 underline"
          >
            別のチームIDで紐付け直す
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <Card className="border-orange-300 bg-orange-50">
            <CardContent className="p-4">
              <div className="flex items-start gap-2 mb-3">
                <AlertCircle className="w-4 h-4 text-orange-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-orange-800">
                  別のチームIDで紐付けると、現在のチーム紐付けが解除されます。
                  チームのデータ（選手・大会参加情報）は削除されません。
                </p>
              </div>
              <TeamLinkSection onLinked={fetchTeams} />
              <button
                onClick={() => setShowLinkConfirm(false)}
                className="text-xs text-gray-500 hover:text-gray-900 mt-2 underline"
              >
                キャンセル
              </button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
