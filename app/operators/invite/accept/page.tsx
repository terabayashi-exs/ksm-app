"use client";

import { AlertCircle, CheckCircle, Shield, XCircle } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface InviteInfo {
  email: string;
  invitedByName: string;
  expiresAt: string;
  tournamentNames: string[];
  hasAccount: boolean;
  displayName: string | null;
}

function AcceptInviteContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  // 新規アカウント作成フォーム
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");

  const fetchInviteInfo = useCallback(async () => {
    if (!token) {
      setError("招待トークンが見つかりません");
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`/api/operators/invite/accept?token=${token}`);
      const result = await res.json();
      if (result.success) {
        setInviteInfo(result.data);
      } else {
        setError(result.error);
      }
    } catch {
      setError("招待情報の取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchInviteInfo();
  }, [fetchInviteInfo]);

  const handleAccept = async () => {
    // 新規アカウント作成の場合のバリデーション
    if (inviteInfo && !inviteInfo.hasAccount) {
      if (!displayName.trim()) {
        setError("名前を入力してください");
        return;
      }
      if (!password || password.length < 6) {
        setError("パスワードは6文字以上で入力してください");
        return;
      }
      if (password !== passwordConfirm) {
        setError("パスワードが一致しません");
        return;
      }
    }

    setAccepting(true);
    setError(null);
    try {
      const res = await fetch("/api/operators/invite/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          displayName: inviteInfo?.hasAccount ? undefined : displayName.trim(),
          password: inviteInfo?.hasAccount ? undefined : password,
        }),
      });
      const result = await res.json();
      if (result.success) {
        setAccepted(true);
      } else {
        setError(result.error);
      }
    } catch {
      setError("承認処理に失敗しました");
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            {accepted ? (
              <CheckCircle className="w-12 h-12 text-green-500" />
            ) : error ? (
              <XCircle className="w-12 h-12 text-red-500" />
            ) : (
              <Shield className="w-12 h-12 text-primary" />
            )}
          </div>
          <CardTitle className="text-xl">
            {accepted ? "運営者として登録されました" : error ? "招待エラー" : "運営者への招待"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {accepted ? (
            <div className="text-center space-y-4">
              <p className="text-sm text-gray-500">
                運営者として登録されました。ログインしてマイダッシュボードにアクセスしてください。
              </p>
              <Button asChild className="w-full">
                <Link href="/auth/login">ログインページへ</Link>
              </Button>
            </div>
          ) : error ? (
            <div className="space-y-4">
              <div className="flex items-start gap-2 p-3 bg-destructive/5 rounded-lg border border-destructive/20">
                <AlertCircle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
                <p className="text-sm text-destructive">{error}</p>
              </div>
              <Button asChild variant="outline" className="w-full">
                <Link href="/">TOPページへ</Link>
              </Button>
            </div>
          ) : inviteInfo ? (
            <div className="space-y-4">
              {/* 招待情報 */}
              <div className="p-4 bg-primary/5 rounded-lg border border-primary/20 space-y-2">
                <div className="text-sm">
                  <span className="text-gray-500">招待者：</span>
                  <span className="font-medium">{inviteInfo.invitedByName}</span>
                </div>
                <div className="text-sm">
                  <span className="text-gray-500">招待先メールアドレス：</span>
                  <span className="font-medium">{inviteInfo.email}</span>
                </div>
                <div className="text-sm">
                  <span className="text-gray-500">アクセス可能な部門：</span>
                  <ul className="mt-1 ml-4 list-disc text-xs">
                    {inviteInfo.tournamentNames.map((name, index) => (
                      <li key={index}>{name}</li>
                    ))}
                  </ul>
                </div>
                <div className="text-xs text-gray-500">
                  有効期限: {new Date(inviteInfo.expiresAt).toLocaleString("ja-JP")}
                </div>
              </div>

              {/* 既存アカウントの場合 */}
              {inviteInfo.hasAccount ? (
                <div className="space-y-3">
                  <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                    <p className="text-sm text-green-800">
                      ✓ アカウント「{inviteInfo.displayName}」に運営者権限を付与します
                    </p>
                  </div>
                  <p className="text-xs text-gray-500">
                    ※ 既存のアカウントに運営者ロールが追加されます。
                  </p>
                </div>
              ) : (
                /* 新規アカウント作成フォーム */
                <div className="space-y-3">
                  <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                    <p className="text-sm text-yellow-800">ℹ アカウントを作成してください</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">メールアドレス</Label>
                    <Input
                      id="email"
                      type="email"
                      value={inviteInfo.email}
                      disabled
                      className="bg-gray-50 cursor-not-allowed"
                    />
                    <p className="text-xs text-gray-500">
                      ※ 招待されたメールアドレスが自動入力されています
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="displayName">名前</Label>
                    <Input
                      id="displayName"
                      type="text"
                      placeholder="山田太郎"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      disabled={accepting}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">パスワード（6文字以上）</Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={accepting}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="passwordConfirm">パスワード（確認）</Label>
                    <Input
                      id="passwordConfirm"
                      type="password"
                      placeholder="••••••"
                      value={passwordConfirm}
                      onChange={(e) => setPasswordConfirm(e.target.value)}
                      disabled={accepting}
                    />
                  </div>
                </div>
              )}

              <Button
                onClick={handleAccept}
                disabled={accepting}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                {accepting
                  ? "処理中..."
                  : inviteInfo.hasAccount
                    ? "運営者として登録"
                    : "アカウントを作成して登録"}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      }
    >
      <AcceptInviteContent />
    </Suspense>
  );
}
