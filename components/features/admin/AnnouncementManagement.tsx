'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Edit, Trash2, Plus, Bell, Eye, EyeOff } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Announcement {
  announcement_id: number;
  title: string;
  content: string;
  status: 'draft' | 'published';
  display_order: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface AnnouncementFormData {
  title: string;
  content: string;
  status: 'draft' | 'published';
  display_order: number;
}

export default function AnnouncementManagement() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState<AnnouncementFormData>({
    title: '',
    content: '',
    status: 'draft',
    display_order: 0,
  });
  const [saving, setSaving] = useState(false);

  // お知らせ一覧を取得
  const fetchAnnouncements = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/announcements');
      if (!response.ok) {
        throw new Error('お知らせの取得に失敗しました');
      }
      const result = await response.json();
      setAnnouncements(result.announcements);
    } catch (err) {
      console.error('Error fetching announcements:', err);
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  // フォームリセット
  const resetForm = () => {
    setFormData({
      title: '',
      content: '',
      status: 'draft',
      display_order: 0,
    });
    setEditingAnnouncement(null);
    setIsCreating(false);
    setError(null);
  };

  // 新規作成開始
  const startCreating = () => {
    resetForm();
    setIsCreating(true);
  };

  // 編集開始
  const startEditing = (announcement: Announcement) => {
    setFormData({
      title: announcement.title,
      content: announcement.content,
      status: announcement.status,
      display_order: announcement.display_order,
    });
    setEditingAnnouncement(announcement);
    setIsCreating(false);
    setError(null);
  };

  // 保存処理
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title.trim() || !formData.content.trim()) {
      setError('タイトルと本文は必須です');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const url = editingAnnouncement
        ? `/api/admin/announcements/${editingAnnouncement.announcement_id}`
        : '/api/admin/announcements';

      const method = editingAnnouncement ? 'PATCH' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || '保存に失敗しました');
      }

      await fetchAnnouncements();
      resetForm();
    } catch (err) {
      console.error('Error saving announcement:', err);
      setError(err instanceof Error ? err.message : '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  // 削除処理
  const handleDelete = async (announcementId: number) => {
    if (!confirm('このお知らせを削除してもよろしいですか？')) {
      return;
    }

    try {
      setError(null);
      const response = await fetch(`/api/admin/announcements/${announcementId}`, {
        method: 'DELETE',
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || '削除に失敗しました');
      }

      await fetchAnnouncements();
    } catch (err) {
      console.error('Error deleting announcement:', err);
      setError(err instanceof Error ? err.message : '削除に失敗しました');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="text-muted-foreground">読み込み中...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* エラー表示 */}
      {error && (
        <div className="bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded flex items-center gap-2">
          <AlertCircle className="h-5 w-5" />
          <span>{error}</span>
        </div>
      )}

      {/* 新規作成ボタン */}
      {!isCreating && !editingAnnouncement && (
        <div className="flex justify-end">
          <Button onClick={startCreating} className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            新規お知らせ作成
          </Button>
        </div>
      )}

      {/* 作成・編集フォーム */}
      {(isCreating || editingAnnouncement) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              {editingAnnouncement ? 'お知らせ編集' : '新規お知らせ作成'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">タイトル *</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="お知らせのタイトルを入力"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="content">本文 *</Label>
                <Textarea
                  id="content"
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  placeholder="お知らせの内容を入力"
                  rows={6}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="status">公開状態 *</Label>
                  <Select
                    value={formData.status}
                    onValueChange={(value: 'draft' | 'published') =>
                      setFormData({ ...formData, status: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">下書き</SelectItem>
                      <SelectItem value="published">公開</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="display_order">表示順序</Label>
                  <Input
                    id="display_order"
                    type="number"
                    value={formData.display_order}
                    onChange={(e) =>
                      setFormData({ ...formData, display_order: parseInt(e.target.value) || 0 })
                    }
                    placeholder="0"
                  />
                  <p className="text-xs text-muted-foreground">
                    大きい順に表示されます（同順位は新しい順）
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={resetForm}
                  disabled={saving}
                >
                  キャンセル
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? '保存中...' : '保存'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* お知らせ一覧 */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">お知らせ一覧</h2>
        {announcements.length === 0 ? (
          <Card>
            <CardContent className="py-12">
              <div className="text-center text-muted-foreground">
                <Bell className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>お知らせが登録されていません</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {announcements.map((announcement) => (
              <Card key={announcement.announcement_id}>
                <CardContent className="py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-semibold">{announcement.title}</h3>
                        <Badge variant={announcement.status === 'published' ? 'default' : 'secondary'}>
                          {announcement.status === 'published' ? (
                            <>
                              <Eye className="h-3 w-3 mr-1" />
                              公開中
                            </>
                          ) : (
                            <>
                              <EyeOff className="h-3 w-3 mr-1" />
                              下書き
                            </>
                          )}
                        </Badge>
                        <Badge variant="outline">順序: {announcement.display_order}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                        {announcement.content}
                      </p>
                      <div className="text-xs text-muted-foreground flex gap-4">
                        <span>作成者: {announcement.created_by}</span>
                        <span>作成: {new Date(announcement.created_at).toLocaleString('ja-JP')}</span>
                        <span>更新: {new Date(announcement.updated_at).toLocaleString('ja-JP')}</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => startEditing(announcement)}
                        disabled={saving}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(announcement.announcement_id)}
                        disabled={saving}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
