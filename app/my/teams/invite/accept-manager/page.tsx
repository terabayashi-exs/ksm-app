"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle, AlertCircle, Users } from "lucide-react";
import Link from "next/link";

interface InvitationInfo {
  team_id: string;
  team_name: string;
  invited_email: string;
  expires_at: string;
}

export default function AcceptManagerInvitePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    }>
      <AcceptManagerInviteContent />
    </Suspense>
  );
}

function AcceptManagerInviteContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [loading, setLoading] = useState(true);
  const [invitation, setInvitation] = useState<InvitationInfo | null>(null);
  const [hasAccount, setHasAccount] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loggedInEmail, setLoggedInEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 新規アカウント作成用
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");

  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string; needsLogin?: boolean } | null>(null);

  useEffect(() => {
    if (!token) {
      setError("招待トークンが見つかりません");
      setLoading(false);
      return;
    }

    fetch(`/api/my/teams/invite/accept-manager?token=${token}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setInvitation(data.invitation);
          setHasAccount(data.hasAccount);
          setIsLoggedIn(data.isLoggedIn);
          setLoggedInEmail(data.loggedInEmail);
        } else {
          setError(data.error);
        }
      })
      .catch(() => setError("招待情報の取得に失敗しました"))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleAccept() {
    if (!token) return;
    setProcessing(true);
    setError(null);
    try {
      const body: Record<string, string> = { token };
      if (!hasAccount) {
        if (!displayName.trim()) { setError("表示名を入力してください"); setProcessing(false); return; }
        if (!password || password.length < 6) { setError("パスワードは6文字以上で入力してください"); setProcessing(false); return; }
        body.displayName = displayName.trim();
        body.password = password;
      }

      const res = await fetch("/api/my/teams/invite/accept-manager", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        setResult({ success: true, message: data.message, needsLogin: data.needsLogin });
      } else {
        setError(data.error);
      }
    } catch {
      setError("登録処理に失敗しました");
    } finally {
      setProcessing(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-6 w-6" />
            チーム担当者登録
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* エラー表示 */}
          {error && !result && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
              <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* 成功表示 */}
          {result?.success && (
            <div className="space-y-4">
              <div className="flex items-start gap-2 p-4 rounded-lg bg-green-50 border border-green-200">
                <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
                <p className="text-sm text-green-800">{result.message}</p>
              </div>
              {result.needsLogin ? (
                <div className="text-center space-y-3">
                  <p className="text-sm text-gray-600">
                    アカウントが作成されました。ログインしてマイダッシュボードからチームを管理できます。
                  </p>
                  <Button asChild>
                    <Link href="/auth/login">ログインする</Link>
                  </Button>
                </div>
              ) : (
                <div className="text-center">
                  <Button asChild>
                    <Link href="/my?tab=team">マイダッシュボードへ</Link>
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* 招待情報 & フォーム */}
          {invitation && !result?.success && (
            <>
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-sm text-blue-800">
                  <strong>{invitation.team_name}</strong> のチーム担当者として招待されています。
                </p>
                <p className="text-xs text-blue-600 mt-1">
                  招待先メールアドレス: {invitation.invited_email}
                </p>
              </div>

              {/* ログイン済み & アカウントあり */}
              {isLoggedIn && hasAccount && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-600">
                    {loggedInEmail} でログイン中です。このまま担当者として登録できます。
                  </p>
                  <Button onClick={handleAccept} disabled={processing} className="w-full">
                    {processing ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />登録中...</> : "担当者として登録する"}
                  </Button>
                </div>
              )}

              {/* アカウントあり & 未ログイン */}
              {!isLoggedIn && hasAccount && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-600">
                    このメールアドレスのアカウントが見つかりました。ログインしてから担当者登録を完了してください。
                  </p>
                  <Button asChild className="w-full">
                    <Link href={`/auth/login?callbackUrl=${encodeURIComponent(`/my/teams/invite/accept-manager?token=${token}`)}`}>
                      ログインして登録する
                    </Link>
                  </Button>
                </div>
              )}

              {/* アカウントなし → 新規作成フォーム */}
              {!hasAccount && (
                <div className="space-y-4">
                  <p className="text-sm text-gray-600">
                    アカウントをお持ちでないため、新規アカウントを作成して担当者登録を行います。
                  </p>
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="displayName">表示名（氏名） <span className="text-destructive">*</span></Label>
                      <Input
                        id="displayName"
                        autoComplete="off"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="例: 山田太郎"
                      />
                    </div>
                    <div>
                      <Label htmlFor="password">パスワード <span className="text-destructive">*</span></Label>
                      <Input
                        id="password"
                        type="password"
                        autoComplete="new-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="6文字以上"
                      />
                    </div>
                    <p className="text-xs text-gray-500">
                      メールアドレス: {invitation.invited_email}（変更不可）
                    </p>
                  </div>
                  <Button onClick={handleAccept} disabled={processing} className="w-full">
                    {processing ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />作成中...</> : "アカウント作成して登録する"}
                  </Button>
                </div>
              )}
            </>
          )}

          {/* 招待情報がない場合（エラー時） */}
          {!invitation && !loading && (
            <div className="text-center">
              <Button asChild variant="outline">
                <Link href="/">TOPページへ</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
