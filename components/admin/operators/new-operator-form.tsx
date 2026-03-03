'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { UserCheck, UserPlus, Mail, AlertCircle, CheckCircle, Loader2, ClipboardList, Calendar, Settings, Wrench } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import TournamentAccessSelector from './tournament-access-selector';
import PermissionEditor from './permission-editor';
import { DEFAULT_OPERATOR_PERMISSIONS, PERMISSION_PRESETS } from '@/lib/types/operator';
import type { TournamentAccessConfig, PermissionPreset, OperatorPermissions } from '@/lib/types/operator';

interface ExistingUser {
  loginUserId: number;
  email: string;
  displayName: string;
  createdAt: string;
  isActive: boolean;
  hasOperatorRole: boolean;
  existingTournaments?: Array<{
    tournamentId: number;
    tournamentName: string;
    categoryName: string;
  }>;
}

interface NewOperatorFormProps {
  groupId?: number;
}

export default function NewOperatorForm({ groupId }: NewOperatorFormProps) {
  const router = useRouter();

  // プリセットのアイコンマップ
  const presetIcons = {
    preparation: ClipboardList,
    event_day: Calendar,
    management: Settings,
    custom: Wrench,
  };

  const [email, setEmail] = useState('');
  const [checking, setChecking] = useState(false);
  const [existingUser, setExistingUser] = useState<ExistingUser | null>(null);
  const [isNewUser, setIsNewUser] = useState(false);
  const [tournamentAccess, setTournamentAccess] = useState<TournamentAccessConfig[]>([]);
  const [selectedPresets, setSelectedPresets] = useState<Set<PermissionPreset>>(new Set(['event_day']));
  const [useCustomPermissions, setUseCustomPermissions] = useState(false);
  const [commonPermissions, setCommonPermissions] = useState(PERMISSION_PRESETS.event_day.permissions);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // メールアドレス確認
  const handleCheckEmail = async () => {
    if (!email || !email.trim()) {
      setError('メールアドレスを入力してください');
      return;
    }

    // メールアドレス形式チェック
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setError('有効なメールアドレスを入力してください');
      return;
    }

    setChecking(true);
    setError(null);
    setExistingUser(null);
    setIsNewUser(false);

    try {
      const res = await fetch('/api/admin/operators/check-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });

      const result = await res.json();

      if (!res.ok) {
        setError(result.error || 'メールアドレスの確認に失敗しました');
        return;
      }

      if (result.exists) {
        setExistingUser(result.user);
        // 運営者ロールを持っている場合でも、追加の部門アクセス権を付与できる
      } else {
        setIsNewUser(true);
      }
    } catch {
      setError('メールアドレスの確認に失敗しました');
    } finally {
      setChecking(false);
    }
  };

  // 既存ユーザーへのロール付与
  const handleAssignRole = async () => {
    if (!existingUser) return;

    if (tournamentAccess.length === 0) {
      setError('アクセス可能な部門を最低1つ選択してください');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      // 有効な権限を全部門に適用
      const effectivePermissions = getEffectivePermissions();
      const accessWithPermissions = tournamentAccess.map(access => ({
        ...access,
        permissions: effectivePermissions
      }));

      const res = await fetch('/api/admin/operators/assign-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loginUserId: existingUser.loginUserId,
          tournamentAccess: accessWithPermissions,
          sendNotification: true,
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        setError(result.error || '運営者権限の付与に失敗しました');
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        router.push('/admin/operators');
        router.refresh();
      }, 2000);
    } catch {
      setError('運営者権限の付与に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  // 新規ユーザーへの招待
  const handleInvite = async () => {
    if (tournamentAccess.length === 0) {
      setError('アクセス可能な部門を最低1つ選択してください');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      // 有効な権限を全部門に適用
      const effectivePermissions = getEffectivePermissions();
      const accessWithPermissions = tournamentAccess.map(access => ({
        ...access,
        permissions: effectivePermissions
      }));

      const res = await fetch('/api/admin/operators/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          tournamentAccess: accessWithPermissions,
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        setError(result.error || '招待メールの送信に失敗しました');
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        router.push('/admin/operators');
        router.refresh();
      }, 2000);
    } catch {
      setError('招待メールの送信に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  // プリセットのトグル処理
  const togglePreset = (preset: Exclude<PermissionPreset, 'custom'>) => {
    setSelectedPresets(prev => {
      const next = new Set(prev);
      if (next.has(preset)) {
        next.delete(preset);
      } else {
        next.add(preset);
      }
      return next;
    });
  };

  // 選択されたプリセットから統合権限を計算
  const calculateMergedPermissions = (): OperatorPermissions => {
    const merged = { ...DEFAULT_OPERATOR_PERMISSIONS };

    selectedPresets.forEach(preset => {
      const presetPermissions = PERMISSION_PRESETS[preset].permissions;
      Object.keys(presetPermissions).forEach(key => {
        const permKey = key as keyof OperatorPermissions;
        if (presetPermissions[permKey]) {
          merged[permKey] = true;
        }
      });
    });

    return merged;
  };

  // 統合権限を取得（カスタムの場合は個別設定、それ以外はプリセット統合）
  const getEffectivePermissions = (): OperatorPermissions => {
    if (useCustomPermissions) {
      return commonPermissions;
    }
    return calculateMergedPermissions();
  };

  // リセット
  const handleReset = () => {
    setEmail('');
    setExistingUser(null);
    setIsNewUser(false);
    setTournamentAccess([]);
    setSelectedPresets(new Set(['event_day']));
    setUseCustomPermissions(false);
    setCommonPermissions(PERMISSION_PRESETS.event_day.permissions);
    setError(null);
    setSuccess(false);
  };

  return (
    <div className="space-y-6">
      {/* ステップ1: メールアドレス入力 */}
      <Card>
        <CardHeader>
          <CardTitle>メールアドレスを入力</CardTitle>
          <CardDescription>
            運営者のメールアドレスを入力してください。既存アカウントがあるか自動判定します。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <div className="flex-1 space-y-2">
              <Label htmlFor="email">メールアドレス</Label>
              <Input
                id="email"
                type="email"
                placeholder="operator@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={existingUser !== null || isNewUser || submitting}
              />
            </div>
            <div className="flex items-end">
              <Button
                onClick={handleCheckEmail}
                disabled={checking || existingUser !== null || isNewUser || submitting}
                variant="outline"
              >
                {checking ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    確認中...
                  </>
                ) : (
                  '確認'
                )}
              </Button>
            </div>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {existingUser && (
            <Alert className={existingUser.hasOperatorRole
              ? "bg-primary/5 dark:bg-primary/10 border-primary/20 dark:border-primary/20"
              : "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800"
            }>
              <UserCheck className={`h-4 w-4 ${existingUser.hasOperatorRole ? 'text-primary' : 'text-green-600'}`} />
              <AlertDescription className={existingUser.hasOperatorRole
                ? "text-primary dark:text-primary/80"
                : "text-green-800 dark:text-green-300"
              }>
                <strong>
                  {existingUser.hasOperatorRole
                    ? '既に運営者として登録されています'
                    : '既存アカウントが見つかりました'}
                </strong>
                <div className="mt-2 text-sm space-y-1">
                  <div>名前: {existingUser.displayName}</div>
                  <div>登録日: {new Date(existingUser.createdAt).toLocaleDateString('ja-JP')}</div>
                  <div>状態: {existingUser.isActive ? '有効' : '無効'}</div>
                  {existingUser.hasOperatorRole && existingUser.existingTournaments && existingUser.existingTournaments.length > 0 && (
                    <div className="mt-2">
                      <div className="font-medium mb-1">現在アクセス可能な部門:</div>
                      <ul className="list-disc list-inside ml-2 space-y-0.5">
                        {existingUser.existingTournaments.map((t, idx) => (
                          <li key={idx}>{t.categoryName || t.tournamentName}</li>
                        ))}
                      </ul>
                      <div className="mt-2 text-xs opacity-80">
                        ※ 下記で追加の部門アクセス権を付与できます
                      </div>
                    </div>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}

          {isNewUser && (
            <Alert className="bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800">
              <Mail className="h-4 w-4 text-yellow-600" />
              <AlertDescription className="text-yellow-800 dark:text-yellow-300">
                <strong>新規ユーザーです</strong>
                <div className="mt-1 text-sm">
                  招待メールを送信します。受信者がアカウント登録を完了すると運営者として登録されます。
                </div>
              </AlertDescription>
            </Alert>
          )}

          {(existingUser || isNewUser) && !success && (
            <Button variant="outline" size="sm" onClick={handleReset}>
              メールアドレスを変更
            </Button>
          )}
        </CardContent>
      </Card>

      {/* ステップ2: 部門選択 */}
      {(existingUser || isNewUser) && !success && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>アクセス可能な部門を選択</CardTitle>
              <CardDescription>
                この運営者がアクセスできる部門を選択してください。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TournamentAccessSelector
                value={tournamentAccess}
                onChange={setTournamentAccess}
                groupId={groupId}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>権限を設定</CardTitle>
              <CardDescription>
                選択した全ての部門に適用される権限を設定してください。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* プリセット選択 */}
              <div className="space-y-3">
                <Label className="text-base font-medium">権限プリセット（複数選択可）</Label>
                <div className="grid gap-3 md:grid-cols-3">
                  {(['preparation', 'event_day', 'management'] as const).map((preset) => {
                    const Icon = presetIcons[preset];
                    const isSelected = selectedPresets.has(preset);
                    return (
                      <div
                        key={preset}
                        className={`relative rounded-lg border-2 p-4 transition-all ${
                          isSelected && !useCustomPermissions
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:border-primary/50'
                        } ${useCustomPermissions ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                        onClick={() => !useCustomPermissions && togglePreset(preset)}
                      >
                        <div className="flex items-start space-x-3">
                          <Checkbox
                            id={`preset-${preset}`}
                            checked={isSelected}
                            onCheckedChange={() => togglePreset(preset)}
                            disabled={useCustomPermissions}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <div className="flex-1 grid gap-1.5">
                            <div className="flex items-center gap-2">
                              <Icon className="h-5 w-5 text-primary" />
                              <Label
                                htmlFor={`preset-${preset}`}
                                className="cursor-pointer font-medium text-base"
                              >
                                {PERMISSION_PRESETS[preset].label}
                              </Label>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {PERMISSION_PRESETS[preset].description}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* カスタム設定の切り替え */}
              <div className="border-t pt-6">
                <div
                  className={`relative rounded-lg border-2 p-4 transition-all ${
                    useCustomPermissions
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                  } cursor-pointer`}
                  onClick={() => {
                    const newValue = !useCustomPermissions;
                    setUseCustomPermissions(newValue);
                    if (newValue) {
                      setCommonPermissions(calculateMergedPermissions());
                    }
                  }}
                >
                  <div className="flex items-start space-x-3">
                    <Checkbox
                      id="use-custom"
                      checked={useCustomPermissions}
                      onCheckedChange={(checked) => {
                        setUseCustomPermissions(checked as boolean);
                        if (checked) {
                          setCommonPermissions(calculateMergedPermissions());
                        }
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="flex-1 grid gap-1.5">
                      <div className="flex items-center gap-2">
                        <Wrench className="h-5 w-5 text-primary" />
                        <Label
                          htmlFor="use-custom"
                          className="cursor-pointer font-medium text-base"
                        >
                          {PERMISSION_PRESETS.custom.label}
                        </Label>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {PERMISSION_PRESETS.custom.description}
                      </p>
                    </div>
                  </div>
                </div>

                {/* カスタム選択時のみ詳細設定を表示 */}
                {useCustomPermissions && (
                  <div className="mt-4 rounded-lg border bg-muted/30 p-4">
                    <PermissionEditor
                      permissions={commonPermissions}
                      onChange={setCommonPermissions}
                    />
                  </div>
                )}
              </div>

              {/* プリセット選択時は権限の概要を表示 */}
              {!useCustomPermissions && (
                <div className="border-t pt-6">
                  <p className="text-base font-medium mb-4">有効な権限（統合結果）</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(getEffectivePermissions())
                      .filter(([_, value]) => value === true)
                      .map(([key]) => {
                        const labels: Record<string, string> = {
                          canManageCourts: 'コート名設定',
                          canManageRules: 'ルール設定',
                          canRegisterTeams: 'チーム登録',
                          canCreateDraws: '組合せ作成・編集',
                          canManageParticipants: '参加チーム管理',
                          canInputResults: '試合結果入力',
                          canConfirmResults: '試合結果確定',
                          canSetManualRankings: '手動順位設定',
                          canChangePromotionRules: '選出条件変更',
                          canManageFiles: 'ファイル管理',
                          canManageSponsors: 'スポンサー管理',
                          canPrintRefereeCards: '審判カード印刷',
                          canSendEmails: 'メール送信',
                        };

                        // カテゴリごとの色分け
                        const preparationPerms = ['canManageCourts', 'canManageRules', 'canRegisterTeams', 'canCreateDraws', 'canManageParticipants', 'canPrintRefereeCards'];
                        const eventDayPerms = ['canInputResults', 'canConfirmResults', 'canSetManualRankings', 'canChangePromotionRules'];
                        const managementPerms = ['canManageFiles', 'canManageSponsors', 'canSendEmails'];

                        let badgeClass = 'bg-primary/10 text-primary';
                        if (preparationPerms.includes(key)) {
                          badgeClass = 'bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400';
                        } else if (eventDayPerms.includes(key)) {
                          badgeClass = 'bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-400';
                        } else if (managementPerms.includes(key)) {
                          badgeClass = 'bg-purple-100 text-purple-700 dark:bg-purple-950/30 dark:text-purple-400';
                        }

                        return (
                          <span
                            key={key}
                            className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${badgeClass}`}
                          >
                            {labels[key] || key}
                          </span>
                        );
                      })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* ステップ3: 登録・招待 */}
      {(existingUser || isNewUser) && !success && (
        <Card>
          <CardHeader>
            <CardTitle>{existingUser ? '運営者として登録' : '招待メールを送信'}</CardTitle>
            <CardDescription>
              {existingUser
                ? '既存アカウントに運営者権限を付与します。通知メールが送信されます。'
                : '招待メールを送信します。受信者がアカウント登録を完了すると運営者として登録されます。'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Button
                onClick={() => router.push('/admin/operators')}
                variant="outline"
                disabled={submitting}
              >
                キャンセル
              </Button>
              <Button
                onClick={existingUser ? handleAssignRole : handleInvite}
                disabled={submitting || tournamentAccess.length === 0}
                variant="outline"
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    処理中...
                  </>
                ) : existingUser ? (
                  <>
                    <UserCheck className="mr-2 h-4 w-4" />
                    {existingUser.hasOperatorRole ? '部門アクセス権を追加' : '運営者として登録'}
                  </>
                ) : (
                  <>
                    <UserPlus className="mr-2 h-4 w-4" />
                    招待メールを送信
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 成功メッセージ */}
      {success && (
        <Alert className="bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800 dark:text-green-300">
            <strong>
              {existingUser
                ? existingUser.hasOperatorRole
                  ? '部門アクセス権を追加しました'
                  : '運営者として登録しました'
                : '招待メールを送信しました'}
            </strong>
            <div className="mt-1 text-sm">
              運営者一覧画面に戻ります...
            </div>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
