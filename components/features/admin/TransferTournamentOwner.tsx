"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, ArrowRight, ArrowLeft, CheckCircle, AlertTriangle, Loader2 } from "lucide-react";

interface OwnerInfo {
  login_user_id: number;
  display_name: string | null;
  email: string | null;
}

interface GroupData {
  group_id: number;
  group_name: string;
  organizer: string | null;
  event_start_date: string | null;
  event_end_date: string | null;
  tournament_count: number;
  current_owner: OwnerInfo | null;
  legacy_admin_login_id: string | null;
}

interface AdminUser {
  login_user_id: number;
  display_name: string;
  email: string;
}

export default function TransferTournamentOwner() {
  const [groups, setGroups] = useState<GroupData[]>([]);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<GroupData | null>(null);
  const [selectedNewOwner, setSelectedNewOwner] = useState<AdminUser | null>(null);
  const [step, setStep] = useState<"select-group" | "select-owner" | "confirm">("select-group");
  const [loading, setLoading] = useState(true);
  const [transferring, setTransferring] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [groupSearch, setGroupSearch] = useState("");
  const [ownerSearch, setOwnerSearch] = useState("");

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/tournament-groups/transfer-owner");
      const data = await res.json();
      if (data.success) {
        setGroups(data.groups);
        setAdminUsers(data.admin_users);
      }
    } catch (e) {
      console.error("データ取得エラー:", e);
    } finally {
      setLoading(false);
    }
  }

  async function handleTransfer() {
    if (!selectedGroup || !selectedNewOwner) return;
    setTransferring(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/tournament-groups/transfer-owner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          group_id: selectedGroup.group_id,
          new_owner_login_user_id: selectedNewOwner.login_user_id,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setResult({ success: true, message: data.message });
        // データ再取得して一覧を更新
        await fetchData();
      } else {
        setResult({ success: false, message: data.error || "移管に失敗しました" });
      }
    } catch (e) {
      setResult({ success: false, message: "通信エラーが発生しました" });
    } finally {
      setTransferring(false);
    }
  }

  function resetSelection() {
    setSelectedGroup(null);
    setSelectedNewOwner(null);
    setStep("select-group");
    setResult(null);
    setGroupSearch("");
    setOwnerSearch("");
  }

  const filteredGroups = groups.filter((g) => {
    const term = groupSearch.toLowerCase();
    if (!term) return true;
    return (
      g.group_name.toLowerCase().includes(term) ||
      g.organizer?.toLowerCase().includes(term) ||
      g.current_owner?.display_name?.toLowerCase().includes(term) ||
      g.current_owner?.email?.toLowerCase().includes(term) ||
      String(g.group_id).includes(term)
    );
  });

  const filteredOwners = adminUsers.filter((u) => {
    // 現オーナーを除外
    if (selectedGroup?.current_owner?.login_user_id === u.login_user_id) return false;
    const term = ownerSearch.toLowerCase();
    if (!term) return true;
    return (
      u.display_name.toLowerCase().includes(term) ||
      u.email.toLowerCase().includes(term)
    );
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        <span className="ml-2 text-gray-500">読み込み中...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ステップインジケーター */}
      <div className="flex items-center gap-2 text-sm">
        <span className={step === "select-group" ? "font-bold text-blue-600" : "text-gray-500"}>
          1. 大会グループ選択
        </span>
        <ArrowRight className="h-4 w-4 text-gray-300" />
        <span className={step === "select-owner" ? "font-bold text-blue-600" : "text-gray-500"}>
          2. 新オーナー選択
        </span>
        <ArrowRight className="h-4 w-4 text-gray-300" />
        <span className={step === "confirm" ? "font-bold text-blue-600" : "text-gray-500"}>
          3. 確認・実行
        </span>
      </div>

      {/* 成功・エラーメッセージ */}
      {result && (
        <div className={`p-4 rounded-lg flex items-start gap-3 ${result.success ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
          {result.success ? (
            <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
          ) : (
            <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
          )}
          <div>
            <p className={result.success ? "text-green-800" : "text-red-800"}>{result.message}</p>
            {result.success && (
              <Button variant="outline" size="sm" className="mt-2" onClick={resetSelection}>
                別の移管を行う
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Step 1: 大会グループ選択 */}
      {step === "select-group" && !result?.success && (
        <Card>
          <CardHeader>
            <CardTitle>大会グループを選択</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="大会名、主催者、オーナーで検索..."
                value={groupSearch}
                onChange={(e) => setGroupSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {filteredGroups.length === 0 ? (
                <p className="text-gray-500 text-center py-4">該当する大会グループがありません</p>
              ) : (
                filteredGroups.map((g) => (
                  <button
                    key={g.group_id}
                    onClick={() => {
                      setSelectedGroup(g);
                      setStep("select-owner");
                    }}
                    className="w-full text-left p-4 rounded-lg border hover:border-blue-300 hover:bg-blue-50 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{g.group_name}</span>
                          <Badge variant="secondary" className="text-xs">
                            {g.tournament_count}部門
                          </Badge>
                        </div>
                        {g.organizer && (
                          <p className="text-sm text-gray-500 mt-1">主催: {g.organizer}</p>
                        )}
                        {g.event_start_date && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            開催: {g.event_start_date}
                            {g.event_end_date && g.event_end_date !== g.event_start_date
                              ? ` 〜 ${g.event_end_date}`
                              : ""}
                          </p>
                        )}
                      </div>
                      <div className="text-right ml-4 shrink-0">
                        {g.current_owner ? (
                          <div>
                            <p className="text-sm font-medium">{g.current_owner.display_name}</p>
                            <p className="text-xs text-gray-500">{g.current_owner.email}</p>
                          </div>
                        ) : g.legacy_admin_login_id ? (
                          <div>
                            <p className="text-sm text-amber-600">{g.legacy_admin_login_id}</p>
                            <p className="text-xs text-gray-400">（レガシー）</p>
                          </div>
                        ) : (
                          <p className="text-sm text-gray-400">オーナー未設定</p>
                        )}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: 新オーナー選択 */}
      {step === "select-owner" && selectedGroup && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>新しいオーナーを選択</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => { setStep("select-group"); setSelectedNewOwner(null); }}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                戻る
              </Button>
            </div>
            <div className="mt-2 p-3 bg-gray-50 rounded-lg text-sm">
              <span className="text-gray-500">移管対象:</span>{" "}
              <span className="font-medium">{selectedGroup.group_name}</span>
              <span className="text-gray-400 ml-2">
                （現オーナー: {selectedGroup.current_owner?.display_name || selectedGroup.legacy_admin_login_id || "未設定"}）
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="名前またはメールアドレスで検索..."
                value={ownerSearch}
                onChange={(e) => setOwnerSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {filteredOwners.length === 0 ? (
                <p className="text-gray-500 text-center py-4">該当するユーザーがいません</p>
              ) : (
                filteredOwners.map((u) => (
                  <button
                    key={u.login_user_id}
                    onClick={() => {
                      setSelectedNewOwner(u);
                      setStep("confirm");
                    }}
                    className="w-full text-left p-4 rounded-lg border hover:border-blue-300 hover:bg-blue-50 transition-colors"
                  >
                    <p className="font-medium">{u.display_name}</p>
                    <p className="text-sm text-gray-500">{u.email}</p>
                  </button>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: 確認・実行 */}
      {step === "confirm" && selectedGroup && selectedNewOwner && !result?.success && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>移管内容の確認</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => { setStep("select-owner"); setSelectedNewOwner(null); }}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                戻る
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
              {/* 移管元 */}
              <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                <p className="text-xs text-red-600 font-medium mb-1">移管元（現オーナー）</p>
                <p className="font-medium">
                  {selectedGroup.current_owner?.display_name || selectedGroup.legacy_admin_login_id || "未設定"}
                </p>
                {selectedGroup.current_owner?.email && (
                  <p className="text-sm text-gray-500">{selectedGroup.current_owner.email}</p>
                )}
              </div>

              {/* 矢印 */}
              <div className="flex justify-center">
                <ArrowRight className="h-8 w-8 text-blue-400" />
              </div>

              {/* 移管先 */}
              <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                <p className="text-xs text-green-600 font-medium mb-1">移管先（新オーナー）</p>
                <p className="font-medium">{selectedNewOwner.display_name}</p>
                <p className="text-sm text-gray-500">{selectedNewOwner.email}</p>
              </div>
            </div>

            {/* 対象大会情報 */}
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="font-medium">{selectedGroup.group_name}</p>
              {selectedGroup.organizer && (
                <p className="text-sm text-gray-500">主催: {selectedGroup.organizer}</p>
              )}
              <p className="text-sm text-gray-500 mt-1">
                {selectedGroup.tournament_count}部門が一括で移管されます
              </p>
            </div>

            {/* 注意事項 */}
            <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                <div className="text-sm text-amber-800">
                  <p className="font-medium mb-1">移管時の注意事項</p>
                  <ul className="list-disc list-inside space-y-0.5 text-amber-700">
                    <li>大会グループと全部門のオーナーが変更されます</li>
                    <li>移管後は新オーナーのダッシュボードに表示されます</li>
                    <li>運営者のアクセス権限は維持されます</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* 実行ボタン */}
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={resetSelection} disabled={transferring}>
                キャンセル
              </Button>
              <Button onClick={handleTransfer} disabled={transferring} className="bg-blue-600 hover:bg-blue-700 text-white">
                {transferring ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    移管中...
                  </>
                ) : (
                  "移管を実行する"
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
