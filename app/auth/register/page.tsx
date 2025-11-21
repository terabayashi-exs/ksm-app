'use client';

import { useState, Suspense } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, ArrowLeft, UserPlus, AlertCircle, CheckCircle, Plus, Trash2, Users } from 'lucide-react';
import { teamWithPlayersRegisterSchema, type TeamWithPlayersRegisterForm } from '@/lib/validations';

function TeamRegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/';
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');

  const form = useForm<TeamWithPlayersRegisterForm>({
    resolver: zodResolver(teamWithPlayersRegisterSchema),
    defaultValues: {
      team_id: '',
      team_name: '',
      team_omission: '',
      contact_person: '',
      contact_email: '',
      contact_phone: '',
      password: '',
      password_confirmation: '',
      players: [
        { player_name: '', player_number: undefined }
      ]
    }
  });

  const watchedPlayers = form.watch('players');

  // 選手の追加
  const addPlayer = () => {
    const currentPlayers = form.getValues('players');
    form.setValue('players', [
      ...currentPlayers,
      { player_name: '', player_number: undefined }
    ]);
  };

  // 選手の削除
  const removePlayer = (index: number) => {
    const currentPlayers = form.getValues('players');
    if (currentPlayers.length > 1) {
      form.setValue('players', currentPlayers.filter((_, i) => i !== index));
    }
  };

  const onSubmit = async (data: TeamWithPlayersRegisterForm) => {
    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch('/api/teams/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (result.success) {
        setSuccess(`チーム・選手登録が完了しました。${result.data?.players_count}人の選手が登録されました。自動ログインしています...`);
        
        // 自動ログイン処理
        try {
          console.log('Attempting auto login with:', { teamId: data.team_id, callbackUrl });
          const signInResult = await signIn('team', {
            redirect: false,
            teamId: data.team_id,
            password: data.password,
          });

          console.log('Auto login result:', signInResult);

          if (signInResult?.ok) {
            // ログイン成功 - 遷移先を決定
            if (callbackUrl !== '/' && callbackUrl.includes('/tournaments/')) {
              setSuccess(`チーム・選手登録が完了しました。大会参加画面に移動します...`);
            } else {
              setSuccess(`チーム・選手登録が完了しました。チームダッシュボードに移動します...`);
            }
            setTimeout(() => {
              // 大会参加用のコールバックURLがある場合は大会参加画面へ
              // そうでなければチームダッシュボードへ
              if (callbackUrl !== '/' && callbackUrl.includes('/tournaments/')) {
                router.push(callbackUrl);
              } else {
                router.push('/team');
              }
            }, 1500);
          } else {
            // ログイン失敗 - 手動ログインページに遷移
            console.warn('Auto login failed:', signInResult?.error);
            setSuccess(`チーム・選手登録が完了しました。ログインページに移動します...`);
            setTimeout(() => {
              router.push(`/auth/login${callbackUrl !== '/' ? `?callbackUrl=${encodeURIComponent(callbackUrl)}` : ''}`);
            }, 2000);
          }
        } catch (loginError) {
          console.error('Auto login error:', loginError);
          // 自動ログイン失敗 - 手動ログインページに遷移
          setSuccess(`チーム・選手登録が完了しました。ログインページに移動します...`);
          setTimeout(() => {
            // 大会参加用の場合はコールバックURL付き、そうでなければ通常のログインページ
            if (callbackUrl !== '/' && callbackUrl.includes('/tournaments/')) {
              router.push(`/auth/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
            } else {
              router.push('/auth/login');
            }
          }, 2000);
        }
      } else {
        console.error('Registration failed:', result);
        if (result.field) {
          // 特定のフィールドエラーの場合
          form.setError(result.field as keyof TeamWithPlayersRegisterForm, {
            type: 'server',
            message: result.error
          });
        } else {
          const errorMessage = result.error || '登録に失敗しました';
          const detailMessage = result.details ? ` (詳細: ${result.details})` : '';
          setError(errorMessage + detailMessage);
        }
      }
    } catch (error) {
      console.error('Registration error:', error);
      setError('ネットワークエラーが発生しました: ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        {/* ヘッダー */}
        <div className="text-center">
          <div className="bg-blue-600 text-white p-3 rounded-lg mx-auto w-fit mb-4">
            <UserPlus className="h-8 w-8" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">チーム登録</h1>
        </div>

        {/* 戻るリンク */}
        <div className="text-center">
          <Button variant="ghost" asChild>
            <Link href="/" className="inline-flex items-center">
              <ArrowLeft className="w-4 h-4 mr-2" />
              TOPページに戻る
            </Link>
          </Button>
        </div>

        {/* エラー・成功メッセージ */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert className="border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800 dark:text-green-200">{success}</AlertDescription>
          </Alert>
        )}

        {/* 登録フォーム */}
        <Card>
          <CardHeader>
            <CardTitle>チーム情報入力</CardTitle>
            <CardDescription>
              以下の情報を入力してチーム登録を行ってください
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* チームID */}
              <div className="space-y-2">
                <Label htmlFor="team_id">チームID *</Label>
                <Input
                  id="team_id"
                  type="text"
                  placeholder="例: team001"
                  {...form.register('team_id')}
                  className={form.formState.errors.team_id ? 'border-red-500' : ''}
                />
                <p className="text-xs text-muted-foreground">
                  ログイン時に使用します。英数字、ハイフン、アンダースコアが使用可能です
                </p>
                {form.formState.errors.team_id && (
                  <div className="flex items-center space-x-2 p-2 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-md">
                    <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                    <p className="text-sm text-red-600 dark:text-red-400">
                      {form.formState.errors.team_id.message}
                    </p>
                  </div>
                )}
              </div>

              {/* チーム名 */}
              <div className="space-y-2">
                <Label htmlFor="team_name">チーム名 *</Label>
                <Input
                  id="team_name"
                  type="text"
                  placeholder="例: サッカークラブA"
                  {...form.register('team_name')}
                  className={form.formState.errors.team_name ? 'border-red-500' : ''}
                />
                {form.formState.errors.team_name && (
                  <div className="flex items-center space-x-2 p-2 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-md">
                    <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                    <p className="text-sm text-red-600 dark:text-red-400">
                      {form.formState.errors.team_name.message}
                    </p>
                  </div>
                )}
              </div>

              {/* チーム略称 */}
              <div className="space-y-2">
                <Label htmlFor="team_omission">チーム略称</Label>
                <Input
                  id="team_omission"
                  type="text"
                  placeholder="例: SCA"
                  {...form.register('team_omission')}
                  className={form.formState.errors.team_omission ? 'border-red-500' : ''}
                />
                <p className="text-xs text-muted-foreground">
                  トーナメント表などで表示される短縮名です（任意）
                </p>
                {form.formState.errors.team_omission && (
                  <div className="flex items-center space-x-2 p-2 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-md">
                    <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                    <p className="text-sm text-red-600 dark:text-red-400">
                      {form.formState.errors.team_omission.message}
                    </p>
                  </div>
                )}
              </div>

              {/* 連絡担当者名 */}
              <div className="space-y-2">
                <Label htmlFor="contact_person">連絡担当者名 *</Label>
                <Input
                  id="contact_person"
                  type="text"
                  placeholder="例: 山田太郎"
                  {...form.register('contact_person')}
                  className={form.formState.errors.contact_person ? 'border-red-500' : ''}
                />
                {form.formState.errors.contact_person && (
                  <div className="flex items-center space-x-2 p-2 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-md">
                    <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                    <p className="text-sm text-red-600 dark:text-red-400">
                      {form.formState.errors.contact_person.message}
                    </p>
                  </div>
                )}
              </div>

              {/* メールアドレス */}
              <div className="space-y-2">
                <Label htmlFor="contact_email">メールアドレス *</Label>
                <Input
                  id="contact_email"
                  type="email"
                  placeholder="例: team@example.com"
                  {...form.register('contact_email')}
                  className={form.formState.errors.contact_email ? 'border-red-500' : ''}
                />
                {form.formState.errors.contact_email && (
                  <div className="flex items-center space-x-2 p-2 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-md">
                    <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                    <p className="text-sm text-red-600 dark:text-red-400">
                      {form.formState.errors.contact_email.message}
                    </p>
                  </div>
                )}
              </div>

              {/* 電話番号 */}
              <div className="space-y-2">
                <Label htmlFor="contact_phone">電話番号</Label>
                <Input
                  id="contact_phone"
                  type="tel"
                  placeholder="例: 090-1234-5678"
                  {...form.register('contact_phone')}
                  className={form.formState.errors.contact_phone ? 'border-red-500' : ''}
                />
                {form.formState.errors.contact_phone && (
                  <div className="flex items-center space-x-2 p-2 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-md">
                    <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                    <p className="text-sm text-red-600 dark:text-red-400">
                      {form.formState.errors.contact_phone.message}
                    </p>
                  </div>
                )}
              </div>

              {/* パスワード */}
              <div className="space-y-2">
                <Label htmlFor="password">パスワード *</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="6文字以上で入力してください"
                  {...form.register('password')}
                  className={form.formState.errors.password ? 'border-red-500' : ''}
                />
                {form.formState.errors.password && (
                  <div className="flex items-center space-x-2 p-2 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-md">
                    <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                    <p className="text-sm text-red-600 dark:text-red-400">
                      {form.formState.errors.password.message}
                    </p>
                  </div>
                )}
              </div>

              {/* パスワード確認 */}
              <div className="space-y-2">
                <Label htmlFor="password_confirmation">パスワード確認 *</Label>
                <Input
                  id="password_confirmation"
                  type="password"
                  placeholder="パスワードを再度入力してください"
                  {...form.register('password_confirmation')}
                  className={form.formState.errors.password_confirmation ? 'border-red-500' : ''}
                />
                {form.formState.errors.password_confirmation && (
                  <div className="flex items-center space-x-2 p-2 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-md">
                    <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                    <p className="text-sm text-red-600 dark:text-red-400">
                      {form.formState.errors.password_confirmation.message}
                    </p>
                  </div>
                )}
              </div>

              {/* 選手登録 */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-medium">選手登録 *</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addPlayer}
                    className="flex items-center"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    選手追加
                  </Button>
                </div>

                <div className="space-y-4">
                  {watchedPlayers?.map((player, index) => (
                    <Card key={index} className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-medium text-sm">選手 {index + 1}</h4>
                        {watchedPlayers.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removePlayer(index)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {/* 選手名 */}
                        <div className="space-y-1">
                          <Label htmlFor={`player_name_${index}`}>選手名 *</Label>
                          <Input
                            id={`player_name_${index}`}
                            type="text"
                            placeholder="例: 山田太郎"
                            {...form.register(`players.${index}.player_name`)}
                            className={form.formState.errors.players?.[index]?.player_name ? 'border-red-500' : ''}
                          />
                          {form.formState.errors.players?.[index]?.player_name && (
                            <p className="text-xs text-red-600 dark:text-red-400">
                              {form.formState.errors.players[index]?.player_name?.message}
                            </p>
                          )}
                        </div>

                        {/* 背番号 */}
                        <div className="space-y-1">
                          <Label htmlFor={`player_number_${index}`}>背番号（任意）</Label>
                          <Input
                            id={`player_number_${index}`}
                            type="number"
                            min="1"
                            max="99"
                            placeholder="未入力可"
                            {...form.register(`players.${index}.player_number`, { 
                              setValueAs: (value) => {
                                if (value === '' || value === null || value === undefined) {
                                  return undefined;
                                }
                                const num = parseInt(value, 10);
                                return isNaN(num) ? undefined : num;
                              }
                            })}
                            className={form.formState.errors.players?.[index]?.player_number ? 'border-red-500' : ''}
                          />
                          {form.formState.errors.players?.[index]?.player_number && (
                            <p className="text-xs text-red-600 dark:text-red-400">
                              {form.formState.errors.players[index]?.player_number?.message}
                            </p>
                          )}
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>

                {form.formState.errors.players?.root && (
                  <p className="text-sm text-red-600 dark:text-red-400">
                    {form.formState.errors.players.root.message}
                  </p>
                )}

                <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    📝 最低1人の選手登録が必要です。背番号は空白でも登録可能です。背番号を設定する場合は重複しないようにしてください。
                  </p>
                </div>
              </div>

              {/* 送信ボタン */}
              <Button
                type="submit"
                className="w-full"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    登録中...
                  </>
                ) : (
                  <>
                    <Users className="mr-2 h-4 w-4" />
                    チーム・選手登録
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* ログインリンク */}
        <div className="text-center">
          <p className="text-sm text-muted-foreground">
            既にアカウントをお持ちの方は{' '}
            <Link href="/auth/login" className="text-blue-600 hover:text-blue-500 font-medium">
              こちらからログイン
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function TeamRegisterPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <TeamRegisterForm />
    </Suspense>
  );
}