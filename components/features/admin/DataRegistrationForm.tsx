"use client";

import {
  AlertTriangle,
  ArrowRight,
  CheckCircle,
  RefreshCw,
  Search,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// ===== Types =====

interface Tournament {
  tournament_id: number;
  tournament_name: string;
  calculated_status?: string;
}

interface TournamentTeam {
  tournament_team_id: number;
  team_id: string;
  team_name: string;
  team_omission: string | null;
  participation_status: string;
  withdrawal_status: string;
  master_team_name: string | null;
}

interface MasterTeam {
  team_id: string;
  team_name: string;
  team_omission: string | null;
  is_active: number;
}

interface UserInfo {
  login_user_id: number;
  email: string;
  display_name: string;
  is_active: number;
  memberships: {
    team_id: string;
    team_name: string;
    member_role: string;
    is_active: number;
  }[];
}

interface TeamMember {
  member_id: number;
  login_user_id: number;
  member_role: string;
  email: string;
  display_name: string;
}

// ===== Main Component =====

export default function DataRegistrationForm() {
  return (
    <Tabs defaultValue="reassign-team" className="space-y-6">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="reassign-team" className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4" />
          チームID付け替え
        </TabsTrigger>
        <TabsTrigger value="force-representative" className="flex items-center gap-2">
          <UserPlus className="h-4 w-4" />
          代表者強制設定
        </TabsTrigger>
      </TabsList>

      <TabsContent value="reassign-team">
        <TeamReassignmentTab />
      </TabsContent>

      <TabsContent value="force-representative">
        <ForceRepresentativeTab />
      </TabsContent>
    </Tabs>
  );
}

// ===== Tab 1: チームID付け替え =====

function TeamReassignmentTab() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedTournamentId, setSelectedTournamentId] = useState<string>("");
  const [tournamentTeams, setTournamentTeams] = useState<TournamentTeam[]>([]);
  const [selectedTournamentTeamId, setSelectedTournamentTeamId] = useState<string>("");
  const [teamSearchQuery, setTeamSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MasterTeam[]>([]);
  const [selectedNewTeamId, setSelectedNewTeamId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // 大会一覧を取得
  useEffect(() => {
    const fetchTournaments = async () => {
      try {
        const res = await fetch("/api/admin/tournaments/active");
        const data = await res.json();
        if (data.success) {
          setTournaments(data.data ?? []);
        }
      } catch {
        console.error("Failed to fetch tournaments");
      }
    };
    fetchTournaments();
  }, []);

  // 大会選択時にチーム一覧取得
  useEffect(() => {
    if (!selectedTournamentId) {
      setTournamentTeams([]);
      setSelectedTournamentTeamId("");
      return;
    }
    const fetchTeams = async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/admin/data-registration/tournament-teams?tournament_id=${selectedTournamentId}`,
        );
        const data = await res.json();
        if (data.success) {
          setTournamentTeams(data.data ?? []);
        }
      } catch {
        console.error("Failed to fetch tournament teams");
      } finally {
        setLoading(false);
      }
    };
    fetchTeams();
    setSelectedTournamentTeamId("");
    setSelectedNewTeamId("");
    setSearchResults([]);
    setTeamSearchQuery("");
  }, [selectedTournamentId]);

  const handleTeamSearch = async () => {
    if (!teamSearchQuery.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/admin/data-registration/search-teams?q=${encodeURIComponent(teamSearchQuery.trim())}`,
      );
      const data = await res.json();
      if (data.success) {
        setSearchResults(data.data ?? []);
        if ((data.data ?? []).length === 0) {
          setError("チームが見つかりませんでした");
        }
      } else {
        setError(data.error || "検索に失敗しました");
      }
    } catch {
      setError("検索に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const selectedTeam = tournamentTeams.find(
    (t) => String(t.tournament_team_id) === selectedTournamentTeamId,
  );
  const newTeam = searchResults.find((t) => t.team_id === selectedNewTeamId);

  const handleExecute = async () => {
    if (!selectedTournamentTeamId || !selectedNewTeamId) return;
    if (
      !confirm(
        `本当にチームIDを付け替えますか？\n\n対象: ${selectedTeam?.team_name} (tournament_team_id: ${selectedTournamentTeamId})\n変更先: ${newTeam?.team_name} (team_id: ${selectedNewTeamId})`,
      )
    ) {
      return;
    }

    setExecuting(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/admin/data-registration/reassign-team", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tournament_team_id: Number(selectedTournamentTeamId),
          new_team_id: selectedNewTeamId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess(
          `チームIDを付け替えました: ${data.data.old_team_name} (${data.data.old_team_id}) → ${data.data.new_team_name} (${data.data.new_team_id})`,
        );
        // リセット
        setSelectedTournamentTeamId("");
        setSelectedNewTeamId("");
        setSearchResults([]);
        setTeamSearchQuery("");
        // チーム一覧を再取得
        if (selectedTournamentId) {
          const refreshRes = await fetch(
            `/api/admin/data-registration/tournament-teams?tournament_id=${selectedTournamentId}`,
          );
          const refreshData = await refreshRes.json();
          if (refreshData.success) {
            setTournamentTeams(refreshData.data ?? []);
          }
        }
      } else {
        setError(data.error || "付け替えに失敗しました");
      }
    } catch {
      setError("付け替えに失敗しました");
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <RefreshCw className="h-5 w-5" />
            チームID付け替え
          </CardTitle>
          <p className="text-sm text-gray-500">
            大会に参加しているチームの team_id を別のマスターチームに付け替えます
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Step 1: 大会選択 */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">1. 大会を選択</label>
            <Select value={selectedTournamentId} onValueChange={setSelectedTournamentId}>
              <SelectTrigger>
                <SelectValue placeholder="大会を選択してください" />
              </SelectTrigger>
              <SelectContent>
                {tournaments.map((t) => (
                  <SelectItem key={t.tournament_id} value={String(t.tournament_id)}>
                    {t.tournament_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Step 2: 対象チーム選択 */}
          {selectedTournamentId && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">2. 対象チームを選択</label>
              {loading && !tournamentTeams.length ? (
                <p className="text-sm text-gray-500">読み込み中...</p>
              ) : (
                <Select
                  value={selectedTournamentTeamId}
                  onValueChange={setSelectedTournamentTeamId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="チームを選択してください" />
                  </SelectTrigger>
                  <SelectContent>
                    {tournamentTeams.map((t) => (
                      <SelectItem key={t.tournament_team_id} value={String(t.tournament_team_id)}>
                        {t.team_name} (ID: {t.team_id})
                        {t.participation_status === "cancelled" ? " [キャンセル]" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {selectedTeam && (
                <div className="p-3 bg-gray-50 rounded-lg text-sm space-y-1">
                  <p>
                    <span className="font-medium">現在のチーム名:</span> {selectedTeam.team_name}
                  </p>
                  <p>
                    <span className="font-medium">現在のteam_id:</span> {selectedTeam.team_id}
                  </p>
                  <p>
                    <span className="font-medium">マスターチーム名:</span>{" "}
                    {selectedTeam.master_team_name ?? "(不明)"}
                  </p>
                  <p>
                    <span className="font-medium">参加ステータス:</span>{" "}
                    <Badge variant="outline">{selectedTeam.participation_status}</Badge>
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Step 3: 新しいチーム検索 */}
          {selectedTournamentTeamId && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">3. 新しいチームを検索</label>
              <div className="flex gap-2">
                <Input
                  placeholder="チーム名またはteam_idで検索"
                  value={teamSearchQuery}
                  onChange={(e) => setTeamSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleTeamSearch()}
                />
                <Button
                  onClick={handleTeamSearch}
                  disabled={loading || !teamSearchQuery.trim()}
                  variant="outline"
                >
                  <Search className="h-4 w-4 mr-1" />
                  検索
                </Button>
              </div>

              {searchResults.length > 0 && (
                <Select value={selectedNewTeamId} onValueChange={setSelectedNewTeamId}>
                  <SelectTrigger>
                    <SelectValue placeholder="付け替え先のチームを選択" />
                  </SelectTrigger>
                  <SelectContent>
                    {searchResults.map((t) => (
                      <SelectItem key={t.team_id} value={t.team_id}>
                        {t.team_name} (ID: {t.team_id}){!t.is_active ? " [無効]" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {/* 確認パネル */}
          {selectedTeam && newTeam && (
            <Card className="border-amber-200 bg-amber-50">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                  <span className="font-medium text-amber-800">変更内容の確認</span>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex-1 p-3 bg-white rounded border">
                    <p className="font-medium text-gray-700">変更前</p>
                    <p>{selectedTeam.team_name}</p>
                    <p className="text-gray-500">team_id: {selectedTeam.team_id}</p>
                  </div>
                  <ArrowRight className="h-5 w-5 text-amber-600 flex-shrink-0" />
                  <div className="flex-1 p-3 bg-white rounded border">
                    <p className="font-medium text-gray-700">変更後</p>
                    <p>{newTeam.team_name}</p>
                    <p className="text-gray-500">team_id: {newTeam.team_id}</p>
                  </div>
                </div>
                <Button
                  onClick={handleExecute}
                  disabled={executing}
                  className="w-full mt-4 bg-amber-600 hover:bg-amber-700"
                >
                  {executing ? "実行中..." : "付け替えを実行"}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* メッセージ表示 */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}
          {success && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 flex items-center gap-2">
              <CheckCircle className="h-4 w-4 flex-shrink-0" />
              {success}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ===== Tab 2: 代表者強制設定 =====

function ForceRepresentativeTab() {
  const [emailInput, setEmailInput] = useState("");
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [teamSearchQuery, setTeamSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MasterTeam[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleUserSearch = async () => {
    if (!emailInput.trim()) return;
    setLoading(true);
    setError("");
    setUserInfo(null);
    try {
      const res = await fetch(
        `/api/admin/data-registration/search-user?email=${encodeURIComponent(emailInput.trim())}`,
      );
      const data = await res.json();
      if (data.success) {
        setUserInfo(data.data);
      } else {
        setError(data.error || "ユーザーが見つかりません");
      }
    } catch {
      setError("検索に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const handleTeamSearch = async () => {
    if (!teamSearchQuery.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/admin/data-registration/search-teams?q=${encodeURIComponent(teamSearchQuery.trim())}`,
      );
      const data = await res.json();
      if (data.success) {
        setSearchResults(data.data ?? []);
        if ((data.data ?? []).length === 0) {
          setError("チームが見つかりませんでした");
        }
      } else {
        setError(data.error || "検索に失敗しました");
      }
    } catch {
      setError("検索に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  // チーム選択時に現在の担当者を取得
  const fetchTeamMembers = async (teamId: string) => {
    try {
      const res = await fetch(
        `/api/admin/data-registration/team-members?team_id=${encodeURIComponent(teamId)}`,
      );
      const data = await res.json();
      if (data.success) {
        setTeamMembers(data.data ?? []);
      }
    } catch {
      console.error("Failed to fetch team members");
    }
  };

  const handleTeamSelect = (teamId: string) => {
    setSelectedTeamId(teamId);
    setError("");
    setSuccess("");
    if (teamId) {
      fetchTeamMembers(teamId);
    } else {
      setTeamMembers([]);
    }
  };

  const selectedTeam = searchResults.find((t) => t.team_id === selectedTeamId);
  const canAddMember =
    teamMembers.length < 2 &&
    userInfo &&
    !teamMembers.some((m) => m.login_user_id === userInfo.login_user_id);

  const handleExecute = async () => {
    if (!userInfo || !selectedTeamId) return;

    if (
      !confirm(
        `本当に実行しますか？\n\nユーザー: ${userInfo.display_name} (${userInfo.email})\nチーム: ${selectedTeam?.team_name}\n担当者として追加（${teamMembers.length === 0 ? "1人目" : "2人目"}）`,
      )
    ) {
      return;
    }

    setExecuting(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/admin/data-registration/force-representative", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: userInfo.email,
          team_id: selectedTeamId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        const d = data.data;
        setSuccess(
          `${d.display_name} (${d.email}) を ${d.team_name} の担当者に設定しました（${d.member_count}人目）`,
        );
        // 担当者一覧とユーザー情報を再取得
        fetchTeamMembers(selectedTeamId);
        const refreshRes = await fetch(
          `/api/admin/data-registration/search-user?email=${encodeURIComponent(userInfo.email)}`,
        );
        const refreshData = await refreshRes.json();
        if (refreshData.success) {
          setUserInfo(refreshData.data);
        }
      } else {
        setError(data.error || "設定に失敗しました");
      }
    } catch {
      setError("設定に失敗しました");
    } finally {
      setExecuting(false);
    }
  };

  const handleDeleteMember = async (member: TeamMember) => {
    if (
      !confirm(
        `本当に削除しますか？\n\n担当者: ${member.display_name} (${member.email})\nチーム: ${selectedTeam?.team_name}`,
      )
    ) {
      return;
    }

    setExecuting(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/admin/data-registration/team-members", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          team_id: selectedTeamId,
          login_user_id: member.login_user_id,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess(`${member.display_name} (${member.email}) を担当者から削除しました`);
        fetchTeamMembers(selectedTeamId);
        // ユーザー情報も再取得（所属チーム表示を更新）
        if (userInfo) {
          const refreshRes = await fetch(
            `/api/admin/data-registration/search-user?email=${encodeURIComponent(userInfo.email)}`,
          );
          const refreshData = await refreshRes.json();
          if (refreshData.success) {
            setUserInfo(refreshData.data);
          }
        }
      } else {
        setError(data.error || "削除に失敗しました");
      }
    } catch {
      setError("削除に失敗しました");
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <UserPlus className="h-5 w-5" />
            代表者強制設定
          </CardTitle>
          <p className="text-sm text-gray-500">
            特定のメールアドレスのアカウントを指定チームの代表者として強制設定、または既存の担当者を削除します
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Step 1: ユーザー検索 */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">
              1. ユーザーをメールアドレスで検索
            </label>
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="メールアドレスを入力"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleUserSearch()}
              />
              <Button
                onClick={handleUserSearch}
                disabled={loading || !emailInput.trim()}
                variant="outline"
              >
                <Search className="h-4 w-4 mr-1" />
                検索
              </Button>
            </div>

            {userInfo && (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-3">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-blue-600" />
                  <span className="font-medium text-blue-800">ユーザー情報</span>
                </div>
                <div className="text-sm space-y-1">
                  <p>
                    <span className="font-medium">名前:</span> {userInfo.display_name}
                  </p>
                  <p>
                    <span className="font-medium">メール:</span> {userInfo.email}
                  </p>
                  <p>
                    <span className="font-medium">ID:</span> {userInfo.login_user_id}
                  </p>
                  <p>
                    <span className="font-medium">ステータス:</span>{" "}
                    {userInfo.is_active ? (
                      <Badge className="bg-green-100 text-green-700">有効</Badge>
                    ) : (
                      <Badge className="bg-red-100 text-red-700">無効</Badge>
                    )}
                  </p>
                </div>
                {userInfo.memberships.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-1">現在の所属チーム:</p>
                    <div className="space-y-1">
                      {userInfo.memberships.map((m, i) => (
                        <div key={i} className="text-sm flex items-center gap-2">
                          <span>
                            {m.team_name} (ID: {m.team_id})
                          </span>
                          <Badge variant="outline" className="border-blue-400 text-blue-700">
                            担当者
                          </Badge>
                          {!m.is_active && (
                            <Badge className="bg-gray-100 text-gray-500">無効</Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {userInfo.memberships.length === 0 && (
                  <p className="text-sm text-gray-500">所属チームなし</p>
                )}
              </div>
            )}
          </div>

          {/* Step 2: 対象チーム検索 */}
          {userInfo && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">2. 対象チームを検索</label>
              <div className="flex gap-2">
                <Input
                  placeholder="チーム名またはteam_idで検索"
                  value={teamSearchQuery}
                  onChange={(e) => setTeamSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleTeamSearch()}
                />
                <Button
                  onClick={handleTeamSearch}
                  disabled={loading || !teamSearchQuery.trim()}
                  variant="outline"
                >
                  <Search className="h-4 w-4 mr-1" />
                  検索
                </Button>
              </div>

              {searchResults.length > 0 && (
                <Select value={selectedTeamId} onValueChange={handleTeamSelect}>
                  <SelectTrigger>
                    <SelectValue placeholder="チームを選択" />
                  </SelectTrigger>
                  <SelectContent>
                    {searchResults.map((t) => (
                      <SelectItem key={t.team_id} value={t.team_id}>
                        {t.team_name} (ID: {t.team_id}){!t.is_active ? " [無効]" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {/* Step 3: 現在の担当者表示 */}
          {selectedTeamId && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
                3. 現在の担当者状況
                <Badge className="ml-2" variant="outline">
                  {teamMembers.length} / 2 名
                </Badge>
              </label>

              {teamMembers.length === 0 ? (
                <p className="text-sm text-gray-500 p-3 bg-gray-50 rounded-lg">
                  担当者が登録されていません
                </p>
              ) : (
                <div className="space-y-2">
                  {teamMembers.map((member) => (
                    <div
                      key={member.member_id}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                    >
                      <div className="text-sm">
                        <p className="font-medium">{member.display_name}</p>
                        <p className="text-gray-500">{member.email}</p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-red-600 border-red-300 hover:bg-red-50 hover:border-red-400"
                        onClick={() => handleDeleteMember(member)}
                        disabled={executing}
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        削除
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* 追加可否の表示と実行 */}
              {canAddMember ? (
                <Card className="border-amber-200 bg-amber-50">
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-3">
                      <AlertTriangle className="h-5 w-5 text-amber-600" />
                      <span className="font-medium text-amber-800">担当者追加の確認</span>
                    </div>
                    <div className="text-sm space-y-2">
                      <p>
                        <span className="font-medium">ユーザー:</span> {userInfo?.display_name} (
                        {userInfo?.email})
                      </p>
                      <p>
                        <span className="font-medium">チーム:</span> {selectedTeam?.team_name}
                      </p>
                      <p>
                        <span className="font-medium">登録:</span>{" "}
                        {teamMembers.length === 0 ? "1人目の担当者" : "2人目の担当者"}として追加
                      </p>
                    </div>
                    <Button
                      onClick={handleExecute}
                      disabled={executing}
                      className="w-full mt-4 bg-amber-600 hover:bg-amber-700"
                    >
                      {executing ? "実行中..." : "担当者として追加"}
                    </Button>
                  </CardContent>
                </Card>
              ) : userInfo &&
                teamMembers.some((m) => m.login_user_id === userInfo.login_user_id) ? (
                <p className="text-sm text-amber-600 p-3 bg-amber-50 rounded-lg border border-amber-200">
                  このユーザーは既にこのチームの担当者として登録されています
                </p>
              ) : teamMembers.length >= 2 ? (
                <p className="text-sm text-red-600 p-3 bg-red-50 rounded-lg border border-red-200">
                  このチームには既に2名の担当者が登録されています。追加するには先に既存の担当者を削除してください
                </p>
              ) : null}
            </div>
          )}

          {/* メッセージ表示 */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}
          {success && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 flex items-center gap-2">
              <CheckCircle className="h-4 w-4 flex-shrink-0" />
              {success}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
