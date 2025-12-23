// app/auth/team/login/page.tsx
"use client";

import { useState, Suspense } from "react";
import { signIn, getSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users } from "lucide-react";

function TeamLoginForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/team";

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);

    try {
      const result = await signIn("team", {
        redirect: false,
        teamId: formData.get("teamId") as string,
        password: formData.get("password") as string,
      });

      if (result?.error) {
        setError("ログインに失敗しました。認証情報を確認してください。");
      } else if (result?.ok) {
        // セッション情報を取得してリダイレクト
        const session = await getSession();
        if (session?.user?.role === "team") {
          router.push(callbackUrl);
        } else {
          setError("チーム代表者権限がありません。");
        }
      }
    } catch (error) {
      setError("ログイン処理でエラーが発生しました。");
      console.error("Login error:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-full">
              <Users className="h-12 w-12 text-green-600" />
            </div>
          </div>
          <h2 className="mt-6 text-3xl font-extrabold text-foreground">
            チーム代表者ログイン
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            チーム代表者専用ログインページ
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-center">ログイン情報を入力</CardTitle>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="teamId">チームID</Label>
                <Input
                  id="teamId"
                  name="teamId"
                  type="text"
                  required
                  placeholder="チームID"
                  disabled={loading}
                  autoComplete="username"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">パスワード</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  required
                  placeholder="パスワード"
                  disabled={loading}
                  autoComplete="current-password"
                />
              </div>

              {error && (
                <div className="text-red-600 text-sm text-center bg-red-50 dark:bg-red-950/20 p-2 rounded">
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "ログイン中..." : "ログイン"}
              </Button>

              <div className="text-center">
                <Link
                  href="/auth/forgot-password"
                  className="text-sm font-medium text-blue-600 hover:text-blue-500"
                >
                  パスワードを忘れた方はこちら
                </Link>
              </div>
            </form>

            <div className="mt-6 text-center">
              <p className="text-sm text-muted-foreground">
                チーム登録がお済みでない場合は{" "}
                <Link
                  href="/auth/register/email"
                  className="font-medium text-blue-600 hover:text-blue-500"
                >
                  こちらから登録
                </Link>
              </p>
            </div>

            <div className="mt-4 text-center">
              <p className="text-sm text-muted-foreground">
                管理者の方は{" "}
                <Link
                  href="/auth/admin/login"
                  className="font-medium text-blue-600 hover:text-blue-500"
                >
                  管理者ログイン
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

export default function TeamLoginPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <TeamLoginForm />
    </Suspense>
  );
}
