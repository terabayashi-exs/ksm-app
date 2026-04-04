"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Bell, Plus, Trash2, Save, Loader2, Eye, EyeOff, Edit } from "lucide-react";

interface Notice {
  tournament_notice_id: number;
  tournament_id: number;
  content: string;
  display_order: number;
  is_active: number;
  created_at: string | null;
  updated_at: string | null;
}

interface Props {
  tournamentId: number;
  tournamentName: string;
}

export default function TournamentNoticeManagement({ tournamentId, tournamentName: _tournamentName }: Props) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newContent, setNewContent] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");

  const fetchNotices = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/tournaments/${tournamentId}/notices`);
      const data = await res.json();
      if (data.success) {
        setNotices(data.notices);
      }
    } catch (e) {
      console.error("お知らせ取得エラー:", e);
    } finally {
      setLoading(false);
    }
  }, [tournamentId]);

  useEffect(() => {
    fetchNotices();
  }, [fetchNotices]);

  async function handleAdd() {
    if (!newContent.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/tournaments/${tournamentId}/notices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newContent }),
      });
      const data = await res.json();
      if (data.success) {
        setNewContent("");
        await fetchNotices();
      } else {
        alert(data.error || "作成に失敗しました");
      }
    } catch {
      alert("通信エラーが発生しました");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(noticeId: number) {
    if (!editContent.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/tournaments/${tournamentId}/notices`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notice_id: noticeId, content: editContent }),
      });
      const data = await res.json();
      if (data.success) {
        setEditingId(null);
        setEditContent("");
        await fetchNotices();
      } else {
        alert(data.error || "更新に失敗しました");
      }
    } catch {
      alert("通信エラーが発生しました");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(notice: Notice) {
    try {
      const res = await fetch(`/api/admin/tournaments/${tournamentId}/notices`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notice_id: notice.tournament_notice_id, is_active: !notice.is_active }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchNotices();
      }
    } catch {
      alert("通信エラーが発生しました");
    }
  }

  async function handleDelete(noticeId: number) {
    if (!confirm("このお知らせを削除しますか？")) return;
    try {
      const res = await fetch(`/api/admin/tournaments/${tournamentId}/notices`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notice_id: noticeId }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchNotices();
      }
    } catch {
      alert("通信エラーが発生しました");
    }
  }

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
      {/* 新規追加 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-amber-600" />
            お知らせを追加
          </CardTitle>
          <p className="text-sm text-gray-500">
            部門詳細画面の概要ページに表示されるお知らせメッセージを追加します
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Textarea
              placeholder="お知らせ内容を入力..."
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              rows={3}
            />
            <div className="flex justify-end">
              <Button onClick={handleAdd} disabled={saving || !newContent.trim()} size="sm">
                {saving ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-1" />追加中...</>
                ) : (
                  <><Plus className="h-4 w-4 mr-1" />追加</>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* お知らせ一覧 */}
      <Card>
        <CardHeader>
          <CardTitle>お知らせ一覧（{notices.length}件）</CardTitle>
        </CardHeader>
        <CardContent>
          {notices.length === 0 ? (
            <p className="text-gray-500 text-center py-8">お知らせはまだありません</p>
          ) : (
            <div className="space-y-3">
              {notices.map((notice) => (
                <div
                  key={notice.tournament_notice_id}
                  className={`p-4 rounded-lg border ${notice.is_active ? "bg-white" : "bg-gray-50 opacity-60"}`}
                >
                  {editingId === notice.tournament_notice_id ? (
                    <div className="space-y-2">
                      <Textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        rows={3}
                      />
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => { setEditingId(null); setEditContent(""); }}>
                          キャンセル
                        </Button>
                        <Button size="sm" onClick={() => handleUpdate(notice.tournament_notice_id)} disabled={saving}>
                          <Save className="h-4 w-4 mr-1" />
                          保存
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="whitespace-pre-wrap text-sm">{notice.content}</p>
                        {notice.updated_at && (
                          <span className="text-xs text-gray-400 mt-1 block">
                            更新: {notice.updated_at}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="flex items-center space-x-2">
                          <Switch
                            checked={Boolean(notice.is_active)}
                            onCheckedChange={() => handleToggleActive(notice)}
                          />
                          <span className="text-sm">
                            {notice.is_active ? (
                              <span className="flex items-center text-green-600">
                                <Eye className="h-4 w-4 mr-1" />
                                公開
                              </span>
                            ) : (
                              <span className="flex items-center text-gray-500">
                                <EyeOff className="h-4 w-4 mr-1" />
                                非公開
                              </span>
                            )}
                          </span>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => { setEditingId(notice.tournament_notice_id); setEditContent(notice.content); }}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(notice.tournament_notice_id)}
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
