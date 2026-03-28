'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, Edit, Trash2, Plus, User, Mail, Users, Search, UserCheck, UserPlus } from 'lucide-react';

interface Administrator {
  admin_id: number;
  admin_name: string; // display_name
  email: string;
  role: string;
  is_active: boolean;
  is_superadmin: boolean;
  organization_name: string;
  created_at: string;
  updated_at: string;
}

interface AdministratorFormData {
  admin_name: string; // display_name
  email: string;
  password: string;
  is_active: boolean;
  is_superadmin: boolean;
  organization_name: string;
}

// メールアドレス確認結果
interface EmailCheckResult {
  exists: boolean;
  already_admin?: boolean;
  user?: {
    login_user_id: number;
    display_name: string;
    email: string;
  };
}

// 新規登録フローの段階
type CreateStep = 'email' | 'existing_confirm' | 'new_form';

export default function AdministratorManagement() {
  const [administrators, setAdministrators] = useState<Administrator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingAdmin, setEditingAdmin] = useState<Administrator | null>(null);

  // 新規登録フロー
  const [isCreating, setIsCreating] = useState(false);
  const [createStep, setCreateStep] = useState<CreateStep>('email');
  const [emailInput, setEmailInput] = useState('');
  const [emailCheckResult, setEmailCheckResult] = useState<EmailCheckResult | null>(null);
  const [checkingEmail, setCheckingEmail] = useState(false);

  const [formData, setFormData] = useState<AdministratorFormData>({
    admin_name: '',
    email: '',
    password: '',
    is_active: true,
    is_superadmin: false,
    organization_name: ''
  });
  const [saving, setSaving] = useState(false);

  // 利用者一覧を取得
  const fetchAdministrators = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/administrators');
      if (!response.ok) throw new Error('利用者データの取得に失敗しました');
      const result = await response.json();
      if (result.success) {
        setAdministrators(result.data);
      } else {
        throw new Error(result.error || '利用者データの取得に失敗しました');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdministrators();
  }, []);

  // フォームリセット
  const resetAll = () => {
    setFormData({ admin_name: '', email: '', password: '', is_active: true, is_superadmin: false, organization_name: '' });
    setEditingAdmin(null);
    setIsCreating(false);
    setCreateStep('email');
    setEmailInput('');
    setEmailCheckResult(null);
    setError(null);
  };

  // ── 新規登録フロー ──────────────────────────────────────────────

  // Step1: メールアドレスで確認
  const handleCheckEmail = async () => {
    if (!emailInput.trim()) {
      setError('メールアドレスを入力してください');
      return;
    }
    setError(null);
    setCheckingEmail(true);
    try {
      const response = await fetch('/api/administrators/check-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailInput.trim() }),
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.error);

      setEmailCheckResult(result);

      if (result.already_admin) {
        setError('このメールアドレスは既に管理者として登録されています');
      } else if (result.exists) {
        // アカウントあり → 確認画面へ
        setCreateStep('existing_confirm');
      } else {
        // アカウントなし → 新規作成フォームへ
        setFormData(prev => ({ ...prev, email: emailInput.trim() }));
        setCreateStep('new_form');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setCheckingEmail(false);
    }
  };

  // Step2a: 既存ユーザーへの admin ロール付与
  const handleAddRole = async () => {
    if (!emailCheckResult?.user) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/administrators/add-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login_user_id: emailCheckResult.user.login_user_id }),
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.error);
      await fetchAdministrators();
      resetAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setSaving(false);
    }
  };

  // Step2b: 新規ユーザー作成（admin ロール付き）
  const handleCreateNew = async () => {
    if (!formData.admin_name.trim()) { setError('管理者名を入力してください'); return; }
    if (!formData.email.trim()) { setError('メールアドレスを入力してください'); return; }
    if (!formData.password.trim()) { setError('パスワードを入力してください'); return; }
    if (formData.password.length < 6) { setError('パスワードは6文字以上で入力してください'); return; }

    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/administrators', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.error);
      await fetchAdministrators();
      resetAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setSaving(false);
    }
  };

  // ── 編集フロー ──────────────────────────────────────────────────

  const startEditing = (admin: Administrator) => {
    setFormData({ admin_name: admin.admin_name, email: admin.email, password: '', is_active: admin.is_active, is_superadmin: admin.is_superadmin, organization_name: admin.organization_name || '' });
    setEditingAdmin(admin);
    setIsCreating(false);
    setError(null);
    // 編集フォームが見えるようにスクロール
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 100);
  };

  const handleUpdate = async () => {
    if (!editingAdmin) return;
    if (!formData.admin_name.trim()) { setError('管理者名を入力してください'); return; }
    if (!formData.email.trim()) { setError('メールアドレスを入力してください'); return; }
    if (formData.password && formData.password.length < 6) { setError('パスワードは6文字以上で入力してください'); return; }

    setSaving(true);
    setError(null);
    try {
      const requestData: Partial<AdministratorFormData> = { ...formData };
      if (!formData.password.trim()) delete (requestData as { password?: string }).password;

      const response = await fetch(`/api/administrators/${editingAdmin.admin_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData),
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.error);
      await fetchAdministrators();
      resetAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setSaving(false);
    }
  };

  // ── 削除 ────────────────────────────────────────────────────────

  const handleDelete = async (admin: Administrator) => {
    if (administrators.length <= 1) {
      setError('利用者を全て削除することはできません。最低1人の管理者が必要です。');
      return;
    }
    if (!confirm(`利用者「${admin.admin_name}」を削除しますか？\n\n※この操作は取り消せません。`)) return;

    try {
      const response = await fetch(`/api/administrators/${admin.admin_id}`, { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok || !result.success) { setError(result.error || '削除に失敗しました'); return; }
      await fetchAdministrators();
      setError(null);
    } catch (err) {
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
      <div className="flex items-center justify-end">
        {!isCreating && !editingAdmin && (
          <Button variant="outline" size="sm" onClick={() => { resetAll(); setIsCreating(true); }} className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            管理者を追加
          </Button>
        )}
      </div>

      {/* ── 新規登録フロー ── */}
      {isCreating && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              管理者を追加
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">

            {/* Step 1: メールアドレス入力 */}
            {createStep === 'email' && (
              <>
                <p className="text-sm text-gray-500">
                  追加したい管理者のメールアドレスを入力してください。既にアカウントがある場合はそのアカウントに管理者権限を付与します。
                </p>
                <div>
                  <Label htmlFor="check_email">メールアドレス *</Label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      id="check_email"
                      type="email"
                      value={emailInput}
                      onChange={(e) => { setEmailInput(e.target.value); setError(null); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleCheckEmail(); }}
                      placeholder="例: user@example.com"
                    />
                    <Button onClick={handleCheckEmail} disabled={checkingEmail} className="shrink-0">
                      <Search className="h-4 w-4 mr-1" />
                      {checkingEmail ? '確認中...' : '確認'}
                    </Button>
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" onClick={resetAll}>キャンセル</Button>
                </div>
              </>
            )}

            {/* Step 2a: 既存ユーザーへのロール付与確認 */}
            {createStep === 'existing_confirm' && emailCheckResult?.user && (
              <>
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-2">
                  <div className="flex items-center gap-2 text-blue-800 font-medium">
                    <UserCheck className="h-5 w-5" />
                    アカウントが見つかりました
                  </div>
                  <div className="text-sm text-blue-700 space-y-1 ml-7">
                    <div><span className="font-medium">表示名：</span>{emailCheckResult.user.display_name}</div>
                    <div><span className="font-medium">メール：</span>{emailCheckResult.user.email}</div>
                  </div>
                </div>
                <p className="text-sm text-gray-500">
                  このユーザーに管理者権限を付与してよいですか？パスワードはそのまま変更されません。
                </p>
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" onClick={handleAddRole} disabled={saving}>
                    {saving ? '処理中...' : '管理者として追加する'}
                  </Button>
                  <Button variant="outline" onClick={() => { setCreateStep('email'); setError(null); }}>
                    戻る
                  </Button>
                  <Button variant="outline" onClick={resetAll}>キャンセル</Button>
                </div>
              </>
            )}

            {/* Step 2b: 新規ユーザー作成フォーム */}
            {createStep === 'new_form' && (
              <>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-1">
                  <div className="flex items-center gap-2 text-amber-800 font-medium text-sm">
                    <User className="h-4 w-4" />
                    「{emailInput}」のアカウントが見つかりませんでした
                  </div>
                  <p className="text-sm text-amber-700 ml-6">新規アカウントを作成して管理者として登録します。</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="admin_name">表示名（氏名）*</Label>
                    <Input
                      id="admin_name"
                      value={formData.admin_name}
                      onChange={(e) => setFormData(prev => ({ ...prev, admin_name: e.target.value }))}
                      placeholder="例: 田中太郎"
                    />
                  </div>
                  <div>
                    <Label htmlFor="email_display">メールアドレス</Label>
                    <Input id="email_display" value={formData.email} disabled className="bg-gray-50" />
                  </div>
                </div>
                <div>
                  <Label htmlFor="organization_name">組織名</Label>
                  <Input
                    id="organization_name"
                    value={formData.organization_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, organization_name: e.target.value }))}
                    placeholder="例: 富山県サッカー協会"
                  />
                  <p className="text-xs text-gray-500 mt-1">TOPページで大会のグルーピング表示に使用されます</p>
                </div>
                <div>
                  <Label htmlFor="password">初期パスワード *</Label>
                  <Input
                    id="password"
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                    placeholder="6文字以上"
                  />
                  <p className="text-xs text-gray-500 mt-1">本人に別途パスワードをお知らせください</p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="is_active"
                      checked={formData.is_active ?? true}
                      onChange={(e) => setFormData(prev => ({ ...prev, is_active: e.target.checked }))}
                    />
                    <Label htmlFor="is_active">利用可能</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="is_superadmin"
                      checked={formData.is_superadmin ?? false}
                      onChange={(e) => setFormData(prev => ({ ...prev, is_superadmin: e.target.checked }))}
                    />
                    <Label htmlFor="is_superadmin">スーパー管理者</Label>
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" onClick={handleCreateNew} disabled={saving}>
                    {saving ? '作成中...' : 'アカウントを作成して追加'}
                  </Button>
                  <Button variant="outline" onClick={() => { setCreateStep('email'); setError(null); }}>
                    戻る
                  </Button>
                  <Button variant="outline" onClick={resetAll}>キャンセル</Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── 編集フォーム ── */}
      {editingAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              利用者編集
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit_admin_name">表示名（氏名）*</Label>
                <Input
                  id="edit_admin_name"
                  value={formData.admin_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, admin_name: e.target.value }))}
                  placeholder="例: 田中太郎"
                />
              </div>
              <div>
                <Label htmlFor="edit_email">メールアドレス *</Label>
                <Input
                  id="edit_email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="例: admin@example.com"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="edit_organization_name">組織名</Label>
              <Input
                id="edit_organization_name"
                value={formData.organization_name}
                onChange={(e) => setFormData(prev => ({ ...prev, organization_name: e.target.value }))}
                placeholder="例: 富山県サッカー協会"
              />
              <p className="text-xs text-gray-500 mt-1">TOPページで大会のグルーピング表示に使用されます</p>
            </div>
            <div>
              <Label htmlFor="edit_password">パスワード（変更する場合のみ入力）</Label>
              <Input
                id="edit_password"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                placeholder="6文字以上"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="edit_is_active"
                  checked={formData.is_active ?? true}
                  onChange={(e) => setFormData(prev => ({ ...prev, is_active: e.target.checked }))}
                />
                <Label htmlFor="edit_is_active">利用可能</Label>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="edit_is_superadmin"
                  checked={formData.is_superadmin ?? false}
                  onChange={(e) => setFormData(prev => ({ ...prev, is_superadmin: e.target.checked }))}
                />
                <Label htmlFor="edit_is_superadmin">スーパー管理者</Label>
              </div>
            </div>
            <div className="flex gap-2 pt-4">
              <Button variant="outline" onClick={handleUpdate} disabled={saving}>
                {saving ? '保存中...' : '保存'}
              </Button>
              <Button variant="outline" onClick={resetAll}>キャンセル</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── 利用者一覧 ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            登録済み管理者一覧
          </CardTitle>
        </CardHeader>
        <CardContent>
          {administrators.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              登録された管理者がいません
            </div>
          ) : (
            <div className="space-y-4">
              {administrators.map((admin) => (
                <div
                  key={admin.admin_id}
                  className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h3 className="font-medium text-gray-900">{admin.admin_name}</h3>
                    {!admin.is_active && (
                      <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">
                        利用停止中
                      </span>
                    )}
                    <span className="px-2 py-1 bg-blue-100 text-blue-600 text-xs rounded">
                      管理者
                    </span>
                    {admin.is_superadmin && (
                      <span className="px-2 py-1 bg-purple-100 text-purple-600 text-xs rounded font-semibold">
                        スーパー管理者
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-sm text-gray-600 mb-1">
                    <Mail className="h-4 w-4 flex-shrink-0" />
                    <span className="truncate">{admin.email}</span>
                  </div>
                  {admin.organization_name && (
                    <div className="text-sm text-gray-500 mb-1">
                      組織名: {admin.organization_name}
                    </div>
                  )}
                  <div className="text-sm text-gray-500 mb-3">
                    登録日: {new Date(admin.created_at).toLocaleDateString('ja-JP')}
                  </div>
                  <div className="flex gap-2 border-t border-gray-100 pt-3">
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
