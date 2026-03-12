'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { RefreshCw, Copy, Check } from 'lucide-react';
import TournamentAccessSelector from './tournament-access-selector';
import type { TournamentAccessConfig, OperatorFormData } from '@/lib/types/operator';

// 作成モード用のスキーマ
const createOperatorSchema = z.object({
  operatorLoginId: z.string().min(3, 'ログインIDは3文字以上で入力してください'),
  password: z.string().min(6, 'パスワードは6文字以上で入力してください'),
  operatorName: z.string().min(1, '名前を入力してください'),
});

// 編集モード用のスキーマ（パスワードは空または6文字以上）
const editOperatorSchema = z.object({
  operatorLoginId: z.string().min(3, 'ログインIDは3文字以上で入力してください'),
  password: z.string().refine(
    (val) => val === '' || val.length >= 6,
    { message: 'パスワードは6文字以上で入力してください' }
  ),
  operatorName: z.string().min(1, '名前を入力してください'),
});

interface OperatorFormProps {
  operatorId?: number;
  initialData?: Partial<OperatorFormData>;
  mode: 'create' | 'edit';
  groupId?: number; // 大会グループから来た場合のID
}

// ランダムパスワード生成関数
const generateRandomPassword = (length = 8): string => {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
};

export default function OperatorForm({
  operatorId,
  initialData,
  mode,
  groupId,
}: OperatorFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  // 編集モードでgroupIdが指定されている場合、そのグループの部門のみを抽出
  const filterByGroupId = (access: TournamentAccessConfig[]) => {
    if (!groupId || mode === 'create') return access;
    return access.filter(a => a.groupId === groupId);
  };

  const [tournamentAccess, setTournamentAccess] = useState<TournamentAccessConfig[]>(
    filterByGroupId(initialData?.tournamentAccess || [])
  );

  // 他の大会の部門のアクセス権を保持（編集時のみ）
  const [otherGroupsAccess] = useState<TournamentAccessConfig[]>(() => {
    if (mode === 'create' || !groupId || !initialData?.tournamentAccess) return [];
    // groupIdに属さない部門のアクセス権を保持
    return initialData.tournamentAccess.filter(a => a.groupId !== groupId);
  });

  // 登録完了ダイアログの状態
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState<{
    loginId: string;
    password: string;
  } | null>(null);
  const [copiedField, setCopiedField] = useState<'loginId' | 'password' | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm({
    resolver: zodResolver(mode === 'create' ? createOperatorSchema : editOperatorSchema),
    defaultValues: {
      operatorLoginId: initialData?.operatorLoginId || '',
      password: '',
      operatorName: initialData?.operatorName || '',
    },
  });

  const passwordValue = watch('password');

  const handleGeneratePassword = () => {
    const newPassword = generateRandomPassword(8);
    setValue('password', newPassword, { shouldValidate: true });
  };

  const handleCopyToClipboard = async (text: string, field: 'loginId' | 'password') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (error) {
      console.error('クリップボードへのコピーに失敗しました:', error);
    }
  };

  const onSubmit = async (data: Record<string, string>) => {
    setLoading(true);

    try {
      // 編集モードでgroupIdが指定されている場合、他の大会のアクセス権も含める
      const allTournamentAccess = mode === 'edit' && groupId
        ? [...tournamentAccess, ...otherGroupsAccess]
        : tournamentAccess;

      const formData: OperatorFormData = {
        operatorLoginId: data.operatorLoginId,
        password: data.password,
        operatorName: data.operatorName,
        tournamentAccess: allTournamentAccess,
      };

      const url =
        mode === 'create'
          ? '/api/admin/operators'
          : `/api/admin/operators/${operatorId}`;

      const method = mode === 'create' ? 'POST' : 'PUT';

      // 編集モードでパスワードが空の場合は削除
      if (mode === 'edit' && !formData.password) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { password, ...rest } = formData;
        Object.assign(formData, rest);
      }

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '登録に失敗しました');
      }

      // 新規作成の場合は認証情報ダイアログを表示
      if (mode === 'create') {
        setCreatedCredentials({
          loginId: data.operatorLoginId,
          password: data.password,
        });
        setShowSuccessDialog(true);
      } else {
        // 編集の場合は通常のアラート
        alert('運営者情報を更新しました');
        const url = groupId
          ? `/admin/operators?group_id=${groupId}`
          : '/admin/operators';
        router.push(url);
        router.refresh();
      }
    } catch (error) {
      console.error('運営者の登録/更新に失敗しました:', error);
      const message = error instanceof Error ? error.message : '処理に失敗しました';
      alert(message);
    } finally {
      setLoading(false);
    }
  };

  const handleCloseSuccessDialog = () => {
    setShowSuccessDialog(false);
    setCreatedCredentials(null);
    const url = groupId
      ? `/admin/operators?group_id=${groupId}`
      : '/admin/operators';
    router.push(url);
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* 基本情報 */}
      <Card>
        <CardHeader>
          <CardTitle>基本情報</CardTitle>
          <CardDescription>運営者の基本情報を入力してください</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="operatorLoginId">
              ログインID <span className="text-destructive">*</span>
            </Label>
            <Input
              id="operatorLoginId"
              {...register('operatorLoginId')}
              placeholder="operator001"
              disabled={mode === 'edit'}
            />
            {errors.operatorLoginId && (
              <p className="text-sm text-destructive">{errors.operatorLoginId.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">
              パスワード {mode === 'create' && <span className="text-destructive">*</span>}
            </Label>
            <div className="flex gap-2">
              <Input
                id="password"
                type="text"
                {...register('password')}
                placeholder={mode === 'edit' ? '変更する場合のみ入力' : '6文字以上'}
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleGeneratePassword}
                title="ランダムパスワード生成"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
            {passwordValue && (
              <p className="text-sm text-muted-foreground">
                現在のパスワード: <span className="font-mono font-semibold">{passwordValue}</span>
              </p>
            )}
            {errors.password && (
              <p className="text-sm text-destructive">{errors.password.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="operatorName">
              名前 <span className="text-destructive">*</span>
            </Label>
            <Input
              id="operatorName"
              {...register('operatorName')}
              placeholder="山田 太郎"
            />
            {errors.operatorName && (
              <p className="text-sm text-destructive">{errors.operatorName.message}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* アクセス可能な部門と権限 */}
      <TournamentAccessSelector
        value={tournamentAccess}
        onChange={setTournamentAccess}
        groupId={groupId}
      />

      {/* アクション */}
      <div className="flex justify-end gap-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            const url = groupId
              ? `/admin/operators?group_id=${groupId}`
              : '/admin/operators';
            router.push(url);
          }}
          disabled={loading}
        >
          キャンセル
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? '処理中...' : mode === 'create' ? '登録' : '更新'}
        </Button>
      </div>

      {/* 登録完了ダイアログ */}
      <Dialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>運営者を登録しました</DialogTitle>
            <DialogDescription>
              以下のログイン情報を運営者に伝えてください。
              <br />
              <span className="text-destructive font-semibold">
                この画面を閉じると二度と表示されません。
              </span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* ログインID */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">ログインID</Label>
              <div className="flex items-center gap-2">
                <div className="flex-1 p-3 bg-muted rounded-md font-mono text-sm">
                  {createdCredentials?.loginId}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() =>
                    createdCredentials &&
                    handleCopyToClipboard(createdCredentials.loginId, 'loginId')
                  }
                  title="コピー"
                >
                  {copiedField === 'loginId' ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            {/* パスワード */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">パスワード</Label>
              <div className="flex items-center gap-2">
                <div className="flex-1 p-3 bg-muted rounded-md font-mono text-sm">
                  {createdCredentials?.password}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() =>
                    createdCredentials &&
                    handleCopyToClipboard(createdCredentials.password, 'password')
                  }
                  title="コピー"
                >
                  {copiedField === 'password' ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={handleCloseSuccessDialog} className="w-full">
              確認しました
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
}
