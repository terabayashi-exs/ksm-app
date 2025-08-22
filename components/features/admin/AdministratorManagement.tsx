'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, Edit, Trash2, Plus, User, Mail, Users } from 'lucide-react';

interface Administrator {
  admin_id: number;
  admin_name: string;
  email: string;
  role: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface AdministratorFormData {
  admin_name: string;
  email: string;
  password: string;
  role: string;
  is_active: boolean;
}

export default function AdministratorManagement() {
  const [administrators, setAdministrators] = useState<Administrator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingAdmin, setEditingAdmin] = useState<Administrator | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState<AdministratorFormData>({
    admin_name: '',
    email: '',
    password: '',
    role: 'admin',
    is_active: true
  });
  const [saving, setSaving] = useState(false);

  // 利用者一覧を取得
  const fetchAdministrators = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/administrators');
      if (!response.ok) {
        throw new Error('利用者データの取得に失敗しました');
      }
      const result = await response.json();
      if (result.success) {
        setAdministrators(result.data);
      } else {
        throw new Error(result.error || '利用者データの取得に失敗しました');
      }
    } catch (err) {
      console.error('Error fetching administrators:', err);
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdministrators();
  }, []);

  // フォームリセット
  const resetForm = () => {
    setFormData({
      admin_name: '',
      email: '',
      password: '',
      role: 'admin',
      is_active: true
    });
    setEditingAdmin(null);
    setIsCreating(false);
    setError(null);
  };

  // 新規作成開始
  const startCreating = () => {
    resetForm();
    setIsCreating(true);
  };

  // 編集開始
  const startEditing = (admin: Administrator) => {
    setFormData({
      admin_name: admin.admin_name,
      email: admin.email,
      password: '', // パスワードは空にする
      role: admin.role,
      is_active: admin.is_active
    });
    setEditingAdmin(admin);
    setIsCreating(false);
    setError(null);
  };

  // 保存処理
  const handleSave = async () => {
    if (!formData.admin_name.trim()) {
      setError('管理者名を入力してください');
      return;
    }
    if (!formData.email.trim()) {
      setError('メールアドレスを入力してください');
      return;
    }
    if (!editingAdmin && !formData.password.trim()) {
      setError('新規作成時はパスワードを入力してください');
      return;
    }
    if (formData.password && formData.password.length < 6) {
      setError('パスワードは6文字以上で入力してください');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const url = editingAdmin 
        ? `/api/administrators/${editingAdmin.admin_id}`
        : '/api/administrators';
      
      const method = editingAdmin ? 'PUT' : 'POST';

      const requestData: Partial<AdministratorFormData> = { ...formData };
      // 編集時でパスワードが空の場合は削除
      if (editingAdmin && !formData.password.trim()) {
        delete (requestData as { password?: string }).password;
      }

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData),
      });

      if (!response.ok) {
        throw new Error('保存に失敗しました');
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || '保存に失敗しました');
      }

      // 一覧を再取得
      await fetchAdministrators();
      resetForm();
      
    } catch (err) {
      console.error('Error saving administrator:', err);
      setError(err instanceof Error ? err.message : '保存中にエラーが発生しました');
    } finally {
      setSaving(false);
    }
  };

  // 削除処理
  const handleDelete = async (admin: Administrator) => {
    // 管理者が1人になる場合は削除を防ぐ
    if (administrators.length <= 1) {
      setError('利用者を全て削除することはできません。最低1人の利用者が必要です。');
      return;
    }

    if (!confirm(`利用者「${admin.admin_name}」を削除しますか？\n\n※この操作は取り消せません。`)) {
      return;
    }

    try {
      const response = await fetch(`/api/administrators/${admin.admin_id}`, {
        method: 'DELETE',
      });

      const result = await response.json();
      
      if (!response.ok || !result.success) {
        setError(result.error || '削除に失敗しました');
        return;
      }

      // 一覧を再取得
      await fetchAdministrators();
      setError(null);
      
    } catch (err) {
      console.error('Error deleting administrator:', err);
      setError(err instanceof Error ? err.message : '削除中にエラーが発生しました');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-600">利用者データを読み込み中...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* エラー表示 */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-4">
            <div className="flex items-start space-x-2 text-red-700">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div className="text-sm whitespace-pre-line">{error}</div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 新規登録ボタン */}
      {!isCreating && !editingAdmin && (
        <div className="flex justify-end">
          <Button onClick={startCreating} className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            新規利用者登録
          </Button>
        </div>
      )}

      {/* 登録・編集フォーム */}
      {(isCreating || editingAdmin) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              {editingAdmin ? '利用者編集' : '新規利用者登録'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="admin_name">管理者名 *</Label>
                <Input
                  id="admin_name"
                  value={formData.admin_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, admin_name: e.target.value }))}
                  placeholder="例: 田中太郎"
                />
              </div>
              <div>
                <Label htmlFor="email">メールアドレス *</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="例: admin@example.com"
                />
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="password">
                  パスワード {editingAdmin ? '（変更する場合のみ入力）' : '*'}
                </Label>
                <Input
                  id="password"
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                  placeholder="6文字以上"
                />
              </div>
              <div>
                <Label htmlFor="role">権限</Label>
                <select
                  id="role"
                  value={formData.role}
                  onChange={(e) => setFormData(prev => ({ ...prev, role: e.target.value }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                >
                  <option value="admin">管理者</option>
                </select>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="is_active"
                checked={formData.is_active}
                onChange={(e) => setFormData(prev => ({ ...prev, is_active: e.target.checked }))}
              />
              <Label htmlFor="is_active">利用可能</Label>
            </div>

            <div className="flex gap-2 pt-4">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? '保存中...' : '保存'}
              </Button>
              <Button variant="outline" onClick={resetForm}>
                キャンセル
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 利用者一覧 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            登録済み利用者一覧
          </CardTitle>
        </CardHeader>
        <CardContent>
          {administrators.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              登録された利用者がいません
            </div>
          ) : (
            <div className="space-y-4">
              {administrators.map((admin) => (
                <div
                  key={admin.admin_id}
                  className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium text-gray-900">{admin.admin_name}</h3>
                      {!admin.is_active && (
                        <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">
                          利用停止中
                        </span>
                      )}
                      <span className="px-2 py-1 bg-blue-100 text-blue-600 text-xs rounded">
                        {admin.role === 'admin' ? '管理者' : admin.role}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-sm text-gray-600 mb-1">
                      <Mail className="h-4 w-4" />
                      <span>{admin.email}</span>
                    </div>
                    <div className="text-sm text-gray-500">
                      登録日: {new Date(admin.created_at).toLocaleDateString('ja-JP')}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => startEditing(admin)}
                      className="flex items-center gap-1"
                    >
                      <Edit className="h-4 w-4" />
                      編集
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(admin)}
                      className="flex items-center gap-1 text-red-600 hover:text-red-700 hover:border-red-300"
                      disabled={administrators.length <= 1}
                    >
                      <Trash2 className="h-4 w-4" />
                      削除
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}