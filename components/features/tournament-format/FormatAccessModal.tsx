"use client";

import { Loader2, Search, Trash2, UserPlus, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Grant {
  grant_id: number;
  format_id: number;
  login_user_id: number;
  user_display_name: string;
  user_email: string;
  granted_by_display_name: string | null;
  granted_at: string;
  notes: string | null;
}

interface SearchUser {
  login_user_id: number;
  display_name: string;
  email: string;
}

interface FormatAccessModalProps {
  formatId: number;
  formatName: string;
  onClose: () => void;
}

export function FormatAccessModal({ formatId, formatName, onClose }: FormatAccessModalProps) {
  const [grants, setGrants] = useState<Grant[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const fetchGrants = useCallback(async () => {
    try {
      const response = await fetch(`/api/admin/format-access-grants?format_id=${formatId}`);
      const data = await response.json();
      if (data.success) {
        setGrants(data.grants);
      }
    } catch (error) {
      console.error("grant取得エラー:", error);
    } finally {
      setLoading(false);
    }
  }, [formatId]);

  useEffect(() => {
    fetchGrants();
  }, [fetchGrants]);

  // ユーザー検索
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const response = await fetch(
        `/api/admin/format-access-grants?search_users=${encodeURIComponent(searchQuery.trim())}`,
      );
      const data = await response.json();
      if (data.success) {
        // 既にgrantされているユーザーを除外
        const grantedUserIds = new Set(grants.map((g) => g.login_user_id));
        setSearchResults(
          (data.users || []).filter((u: SearchUser) => !grantedUserIds.has(u.login_user_id)),
        );
      }
    } catch (error) {
      console.error("ユーザー検索エラー:", error);
    } finally {
      setSearching(false);
    }
  };

  // アクセス付与
  const handleGrant = async (userId: number) => {
    setAdding(true);
    try {
      const response = await fetch("/api/admin/format-access-grants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format_id: formatId, login_user_id: userId }),
      });
      const data = await response.json();
      if (data.success) {
        await fetchGrants();
        setSearchResults(searchResults.filter((u) => u.login_user_id !== userId));
      } else {
        alert(`付与エラー: ${data.error}`);
      }
    } catch {
      alert("付与中にエラーが発生しました");
    } finally {
      setAdding(false);
    }
  };

  // アクセス取消
  const handleRevoke = async (grantId: number) => {
    if (!confirm("このユーザーのアクセス権を取り消しますか？")) return;
    setDeletingId(grantId);
    try {
      const response = await fetch("/api/admin/format-access-grants", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grant_id: grantId }),
      });
      const data = await response.json();
      if (data.success) {
        setGrants(grants.filter((g) => g.grant_id !== grantId));
      } else {
        alert(`取消エラー: ${data.error}`);
      }
    } catch {
      alert("取消中にエラーが発生しました");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[80vh] overflow-hidden flex flex-col">
        {/* ヘッダー */}
        <div className="p-4 border-b flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">アクセス管理</h2>
            <p className="text-sm text-gray-600">{formatName}</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* ユーザー検索 */}
        <div className="p-4 border-b">
          <div className="flex gap-2">
            <Input
              placeholder="ユーザー名またはメールで検索..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
            <Button onClick={handleSearch} disabled={searching} size="sm">
              {searching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* 検索結果 */}
          {searchResults.length > 0 && (
            <div className="mt-2 border rounded-md max-h-40 overflow-y-auto">
              {searchResults.map((user) => (
                <div
                  key={user.login_user_id}
                  className="flex items-center justify-between p-2 hover:bg-gray-50 border-b last:border-b-0"
                >
                  <div>
                    <p className="text-sm font-medium">{user.display_name}</p>
                    <p className="text-xs text-gray-500">{user.email}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleGrant(user.login_user_id)}
                    disabled={adding}
                  >
                    <UserPlus className="h-3 w-3 mr-1" />
                    付与
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 現在のgrant一覧 */}
        <div className="flex-1 overflow-y-auto p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-2">
            アクセス権を持つユーザー ({grants.length}件)
          </h3>

          {loading ? (
            <div className="text-center py-4 text-gray-500">読み込み中...</div>
          ) : grants.length === 0 ? (
            <div className="text-center py-4 text-gray-500 text-sm">
              まだアクセス権が付与されていません
            </div>
          ) : (
            <div className="space-y-2">
              {grants.map((grant) => (
                <div
                  key={grant.grant_id}
                  className="flex items-center justify-between p-3 border rounded-md"
                >
                  <div>
                    <p className="text-sm font-medium">{grant.user_display_name}</p>
                    <p className="text-xs text-gray-500">{grant.user_email}</p>
                    {grant.granted_by_display_name && (
                      <p className="text-xs text-gray-400 mt-1">
                        付与者: {grant.granted_by_display_name}
                      </p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleRevoke(grant.grant_id)}
                    disabled={deletingId === grant.grant_id}
                    className="hover:bg-destructive/5 hover:border-destructive/30 hover:text-destructive"
                  >
                    <Trash2 className="h-3 w-3 mr-1" />
                    {deletingId === grant.grant_id ? "..." : "取消"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* フッター */}
        <div className="p-4 border-t bg-gray-50">
          <Button onClick={onClose} variant="outline" className="w-full">
            閉じる
          </Button>
        </div>
      </div>
    </div>
  );
}
