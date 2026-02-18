// app/auth/register/page.tsx
'use client';

import { useState, Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, ArrowLeft, UserPlus, AlertCircle, CheckCircle, Eye, EyeOff, Mail } from 'lucide-react';

// ─── メールアドレス入力フォーム（トークンなし） ───────────────────────────────
function EmailInputForm() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/request-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (data.success) {
        setSuccess(true);
      } else {
        setError(data.error || 'メール送信に失敗しました');
      }
    } catch (err) {
      console.error('Email submission error:', err);
      setError('エラーが発生しました。もう一度お試しください。');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          <div className="text-center">
            <div className="flex justify-center mb-4">
              <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-full">
                <Mail className="h-12 w-12 text-green-600" />
              </div>
            </div>
            <h2 className="mt-6 text-3xl font-extrabold text-foreground">
              メールを送信しました
            </h2>
          </div>

          <Card>
            <CardContent className="pt-6">
              <div className="text-center space-y-4">
                <p className="text-foreground">
                  <strong>{email}</strong> に登録用のリンクを送信しました。
                </p>
                <p className="text-muted-foreground text-sm">
                  メールボックスをご確認いただき、メール内のリンクをクリックして登録を完了してください。
                </p>
                <p className="text-muted-foreground text-sm">
                  リンクの有効期限は10分です。
                </p>
                <div className="pt-4">
                  <Button variant="outline" asChild>
                    <Link href="/">
                      <ArrowLeft className="mr-2 h-4 w-4" />
                      トップページに戻る
                    </Link>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-full">
              <Mail className="h-12 w-12 text-blue-600" />
            </div>
          </div>
          <h2 className="mt-6 text-3xl font-extrabold text-foreground">
            アカウント登録申請
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            メールアドレスを入力してください
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>メールアドレス確認</CardTitle>
            <CardDescription>
              入力されたメールアドレスに認証用のリンクをお送りします
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">メールアドレス</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required
                  placeholder="example@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  autoComplete="email"
                />
                <p className="text-xs text-muted-foreground">
                  登録に使用するメールアドレスを入力してください
                </p>
              </div>

              {error && (
                <div className="text-red-600 text-sm text-center bg-red-50 dark:bg-red-950/20 p-2 rounded">
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? '送信中...' : '認証メールを送信'}
              </Button>
            </form>

            <div className="mt-6 text-center space-y-2">
              <p className="text-sm text-muted-foreground">
                既にアカウントをお持ちの方は{' '}
                <Link
                  href="/auth/login"
                  className="font-medium text-blue-600 hover:text-blue-500"
                >
                  こちらからログイン
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="text-center">
          <Link
            href="/"
            className="text-sm font-medium text-blue-600 hover:text-blue-500"
          >
            ← トップページに戻る
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── アカウント登録フォーム（トークンあり） ───────────────────────────────────
function AccountRegisterForm({ token }: { token: string }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirmation, setShowPasswordConfirmation] = useState(false);
  const [isVerifying, setIsVerifying] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // トークン検証
  useEffect(() => {
    const verifyToken = async () => {
      try {
        const response = await fetch('/api/auth/verify-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });

        const data = await response.json();

        if (data.success) {
          setEmail(data.email);
          setIsVerifying(false);
        } else {
          setError(data.error || 'トークンの検証に失敗しました');
          setTimeout(() => {
            router.push('/auth/register');
          }, 3000);
        }
      } catch (err) {
        console.error('Token verification error:', err);
        setError('トークンの検証中にエラーが発生しました');
        setTimeout(() => {
          router.push('/auth/register');
        }, 3000);
      }
    };

    verifyToken();
  }, [token, router]);

  if (isVerifying) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">トークンを確認しています...</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8 text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-full">
              <CheckCircle className="h-12 w-12 text-green-600" />
            </div>
          </div>
          <h2 className="text-3xl font-extrabold text-foreground">登録完了</h2>
          <p className="text-muted-foreground">
            アカウントの登録が完了しました。<br />
            ログインページからログインしてください。
          </p>
          <Button asChild className="w-full">
            <Link href="/auth/login">ログインページへ</Link>
          </Button>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== passwordConfirmation) {
      setError('パスワードが一致しません');
      return;
    }
    if (password.length < 6) {
      setError('パスワードは6文字以上で入力してください');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/register-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, display_name: displayName, password }),
      });

      const data = await response.json();

      if (data.success) {
        setSuccess(true);
      } else {
        setError(data.error || '登録に失敗しました');
      }
    } catch (err) {
      console.error('Registration error:', err);
      setError('エラーが発生しました。もう一度お試しください。');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-full">
              <UserPlus className="h-12 w-12 text-blue-600" />
            </div>
          </div>
          <h2 className="mt-6 text-3xl font-extrabold text-foreground">
            アカウント登録
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            表示名とパスワードを設定してください
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>アカウント情報入力</CardTitle>
            <CardDescription>
              以下の情報を入力してアカウントを作成してください
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* メールアドレス（読み取り専用） */}
              <div className="space-y-2">
                <Label htmlFor="email">メールアドレス</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  readOnly
                  disabled
                  className="bg-muted"
                />
                <p className="text-xs text-muted-foreground">
                  ※ メール認証済みのアドレスです（変更不可）
                </p>
              </div>

              {/* 表示名 */}
              <div className="space-y-2">
                <Label htmlFor="display_name">表示名 *</Label>
                <Input
                  id="display_name"
                  type="text"
                  required
                  placeholder="例: 山田太郎"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  disabled={isLoading}
                />
                <p className="text-xs text-muted-foreground">
                  ダッシュボードやログイン後に表示される名前です
                </p>
              </div>

              {/* パスワード */}
              <div className="space-y-2">
                <Label htmlFor="password">パスワード *</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="6文字以上で入力してください"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* パスワード確認 */}
              <div className="space-y-2">
                <Label htmlFor="password_confirmation">パスワード（確認） *</Label>
                <div className="relative">
                  <Input
                    id="password_confirmation"
                    type={showPasswordConfirmation ? 'text' : 'password'}
                    required
                    placeholder="パスワードを再度入力してください"
                    value={passwordConfirmation}
                    onChange={(e) => setPasswordConfirmation(e.target.value)}
                    disabled={isLoading}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswordConfirmation((prev) => !prev)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showPasswordConfirmation ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="flex items-center space-x-2 p-2 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-md">
                  <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                  <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                </div>
              )}

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    登録中...
                  </>
                ) : (
                  <>
                    <UserPlus className="mr-2 h-4 w-4" />
                    アカウントを作成する
                  </>
                )}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-sm text-muted-foreground">
                既にアカウントをお持ちの方は{' '}
                <Link href="/auth/login" className="text-blue-600 hover:text-blue-500 font-medium">
                  こちらからログイン
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="text-center">
          <Link href="/" className="text-sm font-medium text-blue-600 hover:text-blue-500">
            <ArrowLeft className="inline h-3 w-3 mr-1" />
            トップページに戻る
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── ルーティングコンポーネント ────────────────────────────────────────────────
function RegisterPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  if (token) {
    return <AccountRegisterForm token={token} />;
  }

  return <EmailInputForm />;
}

export default function RegisterPageWrapper() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <RegisterPage />
    </Suspense>
  );
}
