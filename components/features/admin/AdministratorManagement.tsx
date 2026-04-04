'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { AlertCircle, Edit, Trash2, Plus, User, Mail, Users, Search, UserCheck, UserPlus, Shield, X } from 'lucide-react';

interface Administrator {
  admin_id: number;
  admin_name: string;
  email: string;
  role: string;
  is_active: boolean;
  is_superadmin: boolean;
  organization_name: string;
  created_at: string;
  updated_at: string;
}

interface GeneralUser {
  login_user_id: number;
  display_name: string;
  email: string;
  is_active: boolean;
  organization_name: string;
  roles: string[];
  created_at: string;
  updated_at: string;
}

interface AdministratorFormData {
  admin_name: string;
  email: string;
  password: string;
  is_active: boolean;
  is_superadmin: boolean;
  organization_name: string;
}

interface EmailCheckResult {
  exists: boolean;
  already_admin?: boolean;
  user?: {
    login_user_id: number;
    display_name: string;
    email: string;
  };
}

type CreateStep = 'email' | 'existing_confirm' | 'new_form';
type UserCreateStep = 'email' | 'already_exists' | 'edit_form' | 'new_form';

// ── 検索バーコンポーネント（フォーカス維持のため外部定義） ──
function SearchBar({ inputValue, onInputChange, onSearch, onClear, appliedQuery, placeholder, count, total }: {
  inputValue: string; onInputChange: (v: string) => void; onSearch: () => void; onClear: () => void;
  appliedQuery: string; placeholder: string; count: number; total: number;
}) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <div className="relative flex-1 max-w-sm">
        <Input
          value={inputValue}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onSearch(); }}
          placeholder={placeholder}
          className="pr-8"
        />
        {inputValue && (
          <button
            onClick={onClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <Button variant="outline" size="sm" onClick={onSearch} className="shrink-0">
        <Search className="h-4 w-4 mr-1" />
        検索
      </Button>
      <span className="text-sm text-gray-500 whitespace-nowrap">
        {appliedQuery ? `${count} / ${total} 件` : `${total} 件`}
      </span>
    </div>
  );
}

export default function AdministratorManagement() {
  const [administrators, setAdministrators] = useState<Administrator[]>([]);
  const [generalUsers, setGeneralUsers] = useState<GeneralUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingAdmin, setEditingAdmin] = useState<Administrator | null>(null);
  const [activeTab, setActiveTab] = useState('admin');

  // 検索（入力中テキストと確定済みクエリを分離）
  const [adminSearchInput, setAdminSearchInput] = useState('');
  const [adminSearch, setAdminSearch] = useState('');
  const [userSearchInput, setUserSearchInput] = useState('');
  const [userSearch, setUserSearch] = useState('');

  // ページネーション
  const ITEMS_PER_PAGE = 10;
  const [adminDisplayCount, setAdminDisplayCount] = useState(ITEMS_PER_PAGE);
  const [userDisplayCount, setUserDisplayCount] = useState(ITEMS_PER_PAGE);

  // 新規登録フロー
  const [isCreating, setIsCreating] = useState(false);
  const [createStep, setCreateStep] = useState<CreateStep>('email');
  const [emailInput, setEmailInput] = useState('');
  const [emailCheckResult, setEmailCheckResult] = useState<EmailCheckResult | null>(null);
  const [checkingEmail, setCheckingEmail] = useState(false);

  // 一般ユーザー追加フロー
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [userCreateStep, setUserCreateStep] = useState<UserCreateStep>('email');
  const [userEmailInput, setUserEmailInput] = useState('');
  const [userCheckResult, setUserCheckResult] = useState<EmailCheckResult | null>(null);
  const [checkingUserEmail, setCheckingUserEmail] = useState(false);
  const [userFormData, setUserFormData] = useState({ display_name: '', email: '', password: '' });
  const [userEditData, setUserEditData] = useState({ login_user_id: 0, display_name: '', password: '' });
  const [savingUser, setSavingUser] = useState(false);

  const [formData, setFormData] = useState<AdministratorFormData>({
    admin_name: '', email: '', password: '', is_active: true, is_superadmin: false, organization_name: ''
  });
  const [saving, setSaving] = useState(false);

  // フィルタされた管理者一覧
  const filteredAdministrators = useMemo(() => {
    setAdminDisplayCount(ITEMS_PER_PAGE);
    if (!adminSearch.trim()) return administrators;
    const q = adminSearch.toLowerCase();
    return administrators.filter(a =>
      a.admin_name.toLowerCase().includes(q) ||
      a.email.toLowerCase().includes(q) ||
      (a.organization_name && a.organization_name.toLowerCase().includes(q))
    );
  }, [administrators, adminSearch]);

  // 表示中の管理者（ページネーション適用）
  const visibleAdministrators = useMemo(() => {
    return filteredAdministrators.slice(0, adminDisplayCount);
  }, [filteredAdministrators, adminDisplayCount]);

  const hasMoreAdmins = adminDisplayCount < filteredAdministrators.length;

  // フィルタされた一般ユーザー一覧
  const filteredGeneralUsers = useMemo(() => {
    setUserDisplayCount(ITEMS_PER_PAGE);
    if (!userSearch.trim()) return generalUsers;
    const q = userSearch.toLowerCase();
    return generalUsers.filter(u =>
      u.display_name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.organization_name && u.organization_name.toLowerCase().includes(q))
    );
  }, [generalUsers, userSearch]);

  // 表示中の一般ユーザー（ページネーション適用）
  const visibleGeneralUsers = useMemo(() => {
    return filteredGeneralUsers.slice(0, userDisplayCount);
  }, [filteredGeneralUsers, userDisplayCount]);

  const hasMoreUsers = userDisplayCount < filteredGeneralUsers.length;

  // 管理者一覧を取得
  const fetchAdministrators = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/administrators');
      if (!response.ok) throw new Error('管理者データの取得に失敗しました');
      const result = await response.json();
      if (result.success) {
        setAdministrators(result.data);
      } else {
        throw new Error(result.error || '管理者データの取得に失敗しました');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  // 一般ユーザー一覧を取得
  const fetchGeneralUsers = async () => {
    try {
      setLoadingUsers(true);
      const response = await fetch('/api/administrators/create-user');
      if (!response.ok) throw new Error('一般ユーザーデータの取得に失敗しました');
      const result = await response.json();
      if (result.success) {
        setGeneralUsers(result.data);
      } else {
        throw new Error(result.error || '一般ユーザーデータの取得に失敗しました');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    fetchAdministrators();
    fetchGeneralUsers();
  }, []);

  // フォームリセット
  const resetAll = () => {
    setFormData({ admin_name: '', email: '', password: '', is_active: true, is_superadmin: false, organization_name: '' });
    setEditingAdmin(null);
    setIsCreating(false);
    setCreateStep('email');
    setEmailInput('');
    setEmailCheckResult(null);
    setIsCreatingUser(false);
    setUserCreateStep('email');
    setUserEmailInput('');
    setUserCheckResult(null);
    setUserFormData({ display_name: '', email: '', password: '' });
    setUserEditData({ login_user_id: 0, display_name: '', password: '' });
    setError(null);
  };

  // ── 新規登録フロー ──────────────────────────────────────────────

  const handleCheckEmail = async () => {
    if (!emailInput.trim()) { setError('メールアドレスを入力してください'); return; }
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
        setCreateStep('existing_confirm');
      } else {
        setFormData(prev => ({ ...prev, email: emailInput.trim() }));
        setCreateStep('new_form');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setCheckingEmail(false);
    }
  };

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
      await fetchGeneralUsers();
      resetAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setSaving(false);
    }
  };

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

  // ── 一般ユーザー追加フロー ──────────────────────────────────────

  const handleCheckUserEmail = async () => {
    if (!userEmailInput.trim()) { setError('メールアドレスを入力してください'); return; }
    setError(null);
    setCheckingUserEmail(true);
    try {
      const response = await fetch('/api/administrators/check-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmailInput.trim() }),
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.error);

      setUserCheckResult(result);

      if (result.exists) {
        setUserCreateStep('already_exists');
      } else {
        setUserFormData(prev => ({ ...prev, email: userEmailInput.trim() }));
        setUserCreateStep('new_form');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setCheckingUserEmail(false);
    }
  };

  const handleCreateUser = async () => {
    if (!userFormData.display_name.trim()) { setError('表示名を入力してください'); return; }
    if (!userFormData.email.trim()) { setError('メールアドレスを入力してください'); return; }
    if (!userFormData.password.trim()) { setError('パスワードを入力してください'); return; }
    if (userFormData.password.length < 6) { setError('パスワードは6文字以上で入力してください'); return; }

    setSavingUser(true);
    setError(null);
    try {
      const response = await fetch('/api/administrators/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userFormData),
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.error);
      await fetchGeneralUsers();
      resetAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setSavingUser(false);
    }
  };

  const handleUpdateUser = async () => {
    if (!userEditData.display_name.trim()) { setError('表示名を入力してください'); return; }
    if (userEditData.password && userEditData.password.length < 6) { setError('パスワードは6文字以上で入力してください'); return; }

    setSavingUser(true);
    setError(null);
    try {
      const response = await fetch('/api/administrators/create-user', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userEditData),
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.error);
      await fetchGeneralUsers();
      resetAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setSavingUser(false);
    }
  };

  // ── 編集フロー ──────────────────────────────────────────────────

  const startEditing = (admin: Administrator) => {
    setFormData({ admin_name: admin.admin_name, email: admin.email, password: '', is_active: admin.is_active, is_superadmin: admin.is_superadmin, organization_name: admin.organization_name || '' });
    setEditingAdmin(admin);
    setIsCreating(false);
    setError(null);
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 100);
  };

  // 一般ユーザー編集開始
  const startEditingUser = (user: GeneralUser) => {
    setUserEditData({
      login_user_id: user.login_user_id,
      display_name: user.display_name,
      password: '',
    });
    setUserCheckResult({
      exists: true,
      user: {
        login_user_id: user.login_user_id,
        display_name: user.display_name,
        email: user.email,
      }
    });
    setUserCreateStep('edit_form');
    setIsCreatingUser(true);
    setError(null);
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
    if (!confirm(`管理者「${admin.admin_name}」の管理者権限を削除しますか？\n\n※アカウント自体は削除されません。管理者ロールのみ削除されます。`)) return;

    try {
      const response = await fetch(`/api/administrators/${admin.admin_id}`, { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok || !result.success) { setError(result.error || '削除に失敗しました'); return; }
      await fetchAdministrators();
      await fetchGeneralUsers();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '削除中にエラーが発生しました');
    }
  };

  // ── ロール表示ヘルパー ──
  const getRoleBadges = (roles: string[]) => {
    const roleLabels: Record<string, { label: string; className: string }> = {
      operator: { label: '運営者', className: 'bg-green-100 text-green-700' },
      team: { label: 'チーム代表', className: 'bg-orange-100 text-orange-700' },
    };
    return roles.map(r => roleLabels[r]).filter(Boolean);
  };

  if (loading && loadingUsers) {
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

      {/* ── 管理者新規登録フロー ── */}
      {isCreating && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              管理者を追加
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {createStep === 'email' && (
              <>
                <p className="text-sm text-gray-500">
                  追加したい管理者のメールアドレスを入力してください。既にアカウントがある場合はそのアカウントに管理者権限を付与します。
                </p>
                <div>
                  <Label htmlFor="check_email">メールアドレス <span className="text-destructive">*</span></Label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      id="check_email" type="email" autoComplete="off"
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
                  <Button variant="outline" onClick={() => { setCreateStep('email'); setError(null); }}>戻る</Button>
                  <Button variant="outline" onClick={resetAll}>キャンセル</Button>
                </div>
              </>
            )}

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
                    <Label htmlFor="admin_name">表示名（氏名） <span className="text-destructive">*</span></Label>
                    <Input id="admin_name" autoComplete="off" value={formData.admin_name}
                      onChange={(e) => setFormData(prev => ({ ...prev, admin_name: e.target.value }))} placeholder="例: 田中太郎" />
                  </div>
                  <div>
                    <Label htmlFor="email_display">メールアドレス</Label>
                    <Input id="email_display" value={formData.email} disabled className="bg-gray-50" />
                  </div>
                </div>
                <div>
                  <Label htmlFor="organization_name">組織名</Label>
                  <Input id="organization_name" value={formData.organization_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, organization_name: e.target.value }))} placeholder="例: 富山県サッカー協会" />
                  <p className="text-xs text-gray-500 mt-1">TOPページで大会のグルーピング表示に使用されます</p>
                </div>
                <div>
                  <Label htmlFor="password">初期パスワード <span className="text-destructive">*</span></Label>
                  <Input id="password" type="password" autoComplete="new-password" value={formData.password}
                    onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))} placeholder="6文字以上" />
                  <p className="text-xs text-gray-500 mt-1">本人に別途パスワードをお知らせください</p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <input type="checkbox" id="is_active" checked={formData.is_active ?? true}
                      onChange={(e) => setFormData(prev => ({ ...prev, is_active: e.target.checked }))} />
                    <Label htmlFor="is_active">利用可能</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input type="checkbox" id="is_superadmin" checked={formData.is_superadmin ?? false}
                      onChange={(e) => setFormData(prev => ({ ...prev, is_superadmin: e.target.checked }))} />
                    <Label htmlFor="is_superadmin">スーパー管理者</Label>
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" onClick={handleCreateNew} disabled={saving}>
                    {saving ? '作成中...' : 'アカウントを作成して追加'}
                  </Button>
                  <Button variant="outline" onClick={() => { setCreateStep('email'); setError(null); }}>戻る</Button>
                  <Button variant="outline" onClick={resetAll}>キャンセル</Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── 一般ユーザー追加フロー ── */}
      {isCreatingUser && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-green-600" />
              一般ユーザーを追加
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {userCreateStep === 'email' && (
              <>
                <p className="text-sm text-gray-500">
                  登録したいユーザーのメールアドレスを入力してください。既にアカウントが存在する場合は登録できません。
                </p>
                <div>
                  <Label htmlFor="user_check_email">メールアドレス <span className="text-destructive">*</span></Label>
                  <div className="flex gap-2 mt-1">
                    <Input id="user_check_email" type="email" autoComplete="off"
                      value={userEmailInput}
                      onChange={(e) => { setUserEmailInput(e.target.value); setError(null); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleCheckUserEmail(); }}
                      placeholder="例: user@example.com" />
                    <Button onClick={handleCheckUserEmail} disabled={checkingUserEmail} className="shrink-0">
                      <Search className="h-4 w-4 mr-1" />
                      {checkingUserEmail ? '確認中...' : '確認'}
                    </Button>
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" onClick={resetAll}>キャンセル</Button>
                </div>
              </>
            )}

            {userCreateStep === 'already_exists' && userCheckResult?.user && (
              <>
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-2">
                  <div className="flex items-center gap-2 text-blue-800 font-medium">
                    <UserCheck className="h-5 w-5" />
                    既にアカウントが登録されています
                  </div>
                  <div className="text-sm text-blue-700 space-y-1 ml-7">
                    <div><span className="font-medium">表示名：</span>{userCheckResult.user.display_name}</div>
                    <div><span className="font-medium">メール：</span>{userCheckResult.user.email}</div>
                  </div>
                </div>
                <p className="text-sm text-gray-500">
                  このユーザーの表示名やパスワードを変更する場合は「編集する」をクリックしてください。
                </p>
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" onClick={() => {
                    setUserEditData({
                      login_user_id: userCheckResult.user!.login_user_id,
                      display_name: userCheckResult.user!.display_name,
                      password: '',
                    });
                    setUserCreateStep('edit_form');
                  }}>
                    編集する
                  </Button>
                  <Button variant="outline" onClick={() => { setUserCreateStep('email'); setError(null); }}>戻る</Button>
                  <Button variant="outline" onClick={resetAll}>キャンセル</Button>
                </div>
              </>
            )}

            {userCreateStep === 'edit_form' && userCheckResult?.user && (
              <>
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-1">
                  <div className="flex items-center gap-2 text-blue-800 font-medium text-sm">
                    <Edit className="h-4 w-4" />
                    「{userCheckResult.user.email}」のアカウント情報を編集
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="user_edit_display_name">表示名（氏名） <span className="text-destructive">*</span></Label>
                    <Input id="user_edit_display_name" autoComplete="off" value={userEditData.display_name}
                      onChange={(e) => setUserEditData(prev => ({ ...prev, display_name: e.target.value }))} placeholder="例: 田中太郎" />
                  </div>
                  <div>
                    <Label htmlFor="user_edit_email_display">メールアドレス</Label>
                    <Input id="user_edit_email_display" value={userCheckResult.user.email} disabled className="bg-gray-50" />
                  </div>
                </div>
                <div>
                  <Label htmlFor="user_edit_password">パスワード（変更する場合のみ入力）</Label>
                  <Input id="user_edit_password" type="password" autoComplete="new-password" value={userEditData.password}
                    onChange={(e) => setUserEditData(prev => ({ ...prev, password: e.target.value }))} placeholder="6文字以上" />
                  <p className="text-xs text-gray-500 mt-1">空欄の場合、パスワードは変更されません</p>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" onClick={handleUpdateUser} disabled={savingUser}>
                    {savingUser ? '更新中...' : '更新する'}
                  </Button>
                  <Button variant="outline" onClick={() => {
                    if (userEmailInput) {
                      setUserCreateStep('already_exists');
                    } else {
                      resetAll();
                    }
                    setError(null);
                  }}>戻る</Button>
                  <Button variant="outline" onClick={resetAll}>キャンセル</Button>
                </div>
              </>
            )}

            {userCreateStep === 'new_form' && (
              <>
                <div className="rounded-lg border border-green-200 bg-green-50 p-4 space-y-1">
                  <div className="flex items-center gap-2 text-green-800 font-medium text-sm">
                    <UserPlus className="h-4 w-4" />
                    「{userEmailInput}」は未登録です
                  </div>
                  <p className="text-sm text-green-700 ml-6">新規アカウントを作成します。</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="user_display_name">表示名（氏名） <span className="text-destructive">*</span></Label>
                    <Input id="user_display_name" autoComplete="off" value={userFormData.display_name}
                      onChange={(e) => setUserFormData(prev => ({ ...prev, display_name: e.target.value }))} placeholder="例: 田中太郎" />
                  </div>
                  <div>
                    <Label htmlFor="user_email_display">メールアドレス</Label>
                    <Input id="user_email_display" value={userFormData.email} disabled className="bg-gray-50" />
                  </div>
                </div>
                <div>
                  <Label htmlFor="user_password">初期パスワード <span className="text-destructive">*</span></Label>
                  <Input id="user_password" type="password" autoComplete="new-password" value={userFormData.password}
                    onChange={(e) => setUserFormData(prev => ({ ...prev, password: e.target.value }))} placeholder="6文字以上" />
                  <p className="text-xs text-gray-500 mt-1">本人に別途パスワードをお知らせください</p>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" onClick={handleCreateUser} disabled={savingUser}>
                    {savingUser ? '作成中...' : 'アカウントを作成'}
                  </Button>
                  <Button variant="outline" onClick={() => { setUserCreateStep('email'); setError(null); }}>戻る</Button>
                  <Button variant="outline" onClick={resetAll}>キャンセル</Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── 管理者編集フォーム ── */}
      {editingAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              管理者編集
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit_admin_name">表示名（氏名） <span className="text-destructive">*</span></Label>
                <Input id="edit_admin_name" autoComplete="off" value={formData.admin_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, admin_name: e.target.value }))} placeholder="例: 田中太郎" />
              </div>
              <div>
                <Label htmlFor="edit_email">メールアドレス <span className="text-destructive">*</span></Label>
                <Input id="edit_email" type="email" autoComplete="off" value={formData.email}
                  onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))} placeholder="例: admin@example.com" />
              </div>
            </div>
            <div>
              <Label htmlFor="edit_organization_name">組織名</Label>
              <Input id="edit_organization_name" value={formData.organization_name}
                onChange={(e) => setFormData(prev => ({ ...prev, organization_name: e.target.value }))} placeholder="例: 富山県サッカー協会" />
              <p className="text-xs text-gray-500 mt-1">TOPページで大会のグルーピング表示に使用されます</p>
            </div>
            <div>
              <Label htmlFor="edit_password">パスワード（変更する場合のみ入力）</Label>
              <Input id="edit_password" type="password" autoComplete="new-password" value={formData.password}
                onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))} placeholder="6文字以上" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <input type="checkbox" id="edit_is_active" checked={formData.is_active ?? true}
                  onChange={(e) => setFormData(prev => ({ ...prev, is_active: e.target.checked }))} />
                <Label htmlFor="edit_is_active">利用可能</Label>
              </div>
              <div className="flex items-center space-x-2">
                <input type="checkbox" id="edit_is_superadmin" checked={formData.is_superadmin ?? false}
                  onChange={(e) => setFormData(prev => ({ ...prev, is_superadmin: e.target.checked }))} />
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

      {/* ── タブ切り替え ── */}
      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); resetAll(); }}>
        <TabsList className="grid grid-cols-2 w-full max-w-md">
          <TabsTrigger value="admin" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            管理者 ({administrators.length})
          </TabsTrigger>
          <TabsTrigger value="user" className="flex items-center gap-2">
            <User className="h-4 w-4" />
            一般ユーザー ({generalUsers.length})
          </TabsTrigger>
        </TabsList>

        {/* ── 管理者タブ ── */}
        <TabsContent value="admin">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  管理者一覧
                </CardTitle>
                {!isCreating && !editingAdmin && (
                  <Button variant="outline" size="sm" onClick={() => { resetAll(); setIsCreating(true); }} className="flex items-center gap-2">
                    <Plus className="h-4 w-4" />
                    管理者を追加
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <SearchBar
                inputValue={adminSearchInput}
                onInputChange={setAdminSearchInput}
                onSearch={() => setAdminSearch(adminSearchInput)}
                onClear={() => { setAdminSearchInput(''); setAdminSearch(''); }}
                appliedQuery={adminSearch}
                placeholder="氏名・メール・組織名で検索"
                count={filteredAdministrators.length}
                total={administrators.length}
              />
              {loading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                </div>
              ) : filteredAdministrators.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  {adminSearch ? '検索条件に一致する管理者がいません' : '登録された管理者がいません'}
                </div>
              ) : (
                <div className="space-y-4">
                  {visibleAdministrators.map((admin) => (
                    <div key={admin.admin_id} className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className="font-medium text-gray-900">{admin.admin_name}</h3>
                        {!admin.is_active && (
                          <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">利用停止中</span>
                        )}
                        <span className="px-2 py-1 bg-blue-100 text-blue-600 text-xs rounded">管理者</span>
                        {admin.is_superadmin && (
                          <span className="px-2 py-1 bg-purple-100 text-purple-600 text-xs rounded font-semibold">スーパー管理者</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-sm text-gray-600 mb-1">
                        <Mail className="h-4 w-4 flex-shrink-0" />
                        <span className="truncate">{admin.email}</span>
                      </div>
                      {admin.organization_name && (
                        <div className="text-sm text-gray-500 mb-1">組織名: {admin.organization_name}</div>
                      )}
                      <div className="text-sm text-gray-500 mb-3">
                        登録日: {new Date(admin.created_at).toLocaleDateString('ja-JP')}
                      </div>
                      <div className="flex gap-2 border-t border-gray-100 pt-3">
                        <Button variant="outline" size="sm" onClick={() => startEditing(admin)} className="flex items-center gap-1">
                          <Edit className="h-4 w-4" />
                          編集
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleDelete(admin)}
                          className="flex items-center gap-1 text-red-600 hover:text-red-700 hover:border-red-300"
                          disabled={administrators.length <= 1}>
                          <Trash2 className="h-4 w-4" />
                          削除
                        </Button>
                      </div>
                    </div>
                  ))}
                  {hasMoreAdmins && (
                    <div className="text-center pt-2">
                      <Button
                        variant="outline"
                        onClick={() => setAdminDisplayCount(prev => prev + ITEMS_PER_PAGE)}
                        className="w-full max-w-xs"
                      >
                        さらに表示する（残り {filteredAdministrators.length - adminDisplayCount} 件）
                      </Button>
                    </div>
                  )}
                  <div className="text-center text-xs text-gray-400">
                    {visibleAdministrators.length} / {filteredAdministrators.length} 件表示中
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── 一般ユーザータブ ── */}
        <TabsContent value="user">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  一般ユーザー一覧
                </CardTitle>
                {!isCreatingUser && (
                  <Button variant="outline" size="sm" onClick={() => { resetAll(); setIsCreatingUser(true); }}
                    className="flex items-center gap-2 border-green-400 text-green-700 hover:bg-green-50">
                    <UserPlus className="h-4 w-4" />
                    一般ユーザーを追加
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <SearchBar
                inputValue={userSearchInput}
                onInputChange={setUserSearchInput}
                onSearch={() => setUserSearch(userSearchInput)}
                onClear={() => { setUserSearchInput(''); setUserSearch(''); }}
                appliedQuery={userSearch}
                placeholder="氏名・メール・組織名で検索"
                count={filteredGeneralUsers.length}
                total={generalUsers.length}
              />
              {loadingUsers ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                </div>
              ) : filteredGeneralUsers.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  {userSearch ? '検索条件に一致するユーザーがいません' : '登録された一般ユーザーがいません'}
                </div>
              ) : (
                <div className="space-y-4">
                  {visibleGeneralUsers.map((user) => (
                    <div key={user.login_user_id} className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className="font-medium text-gray-900">{user.display_name || '(未設定)'}</h3>
                        {!user.is_active && (
                          <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">利用停止中</span>
                        )}
                        {user.roles.length === 0 && (
                          <span className="px-2 py-1 bg-gray-50 text-gray-500 text-xs rounded">ロールなし</span>
                        )}
                        {getRoleBadges(user.roles).map((badge, i) => (
                          <span key={i} className={`px-2 py-1 text-xs rounded ${badge.className}`}>{badge.label}</span>
                        ))}
                      </div>
                      <div className="flex items-center gap-1 text-sm text-gray-600 mb-1">
                        <Mail className="h-4 w-4 flex-shrink-0" />
                        <span className="truncate">{user.email}</span>
                      </div>
                      {user.organization_name && (
                        <div className="text-sm text-gray-500 mb-1">組織名: {user.organization_name}</div>
                      )}
                      <div className="text-sm text-gray-500 mb-3">
                        登録日: {new Date(user.created_at).toLocaleDateString('ja-JP')}
                      </div>
                      <div className="flex gap-2 border-t border-gray-100 pt-3">
                        <Button variant="outline" size="sm" onClick={() => startEditingUser(user)} className="flex items-center gap-1">
                          <Edit className="h-4 w-4" />
                          編集
                        </Button>
                      </div>
                    </div>
                  ))}
                  {hasMoreUsers && (
                    <div className="text-center pt-2">
                      <Button
                        variant="outline"
                        onClick={() => setUserDisplayCount(prev => prev + ITEMS_PER_PAGE)}
                        className="w-full max-w-xs"
                      >
                        さらに表示する（残り {filteredGeneralUsers.length - userDisplayCount} 件）
                      </Button>
                    </div>
                  )}
                  <div className="text-center text-xs text-gray-400">
                    {visibleGeneralUsers.length} / {filteredGeneralUsers.length} 件表示中
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
