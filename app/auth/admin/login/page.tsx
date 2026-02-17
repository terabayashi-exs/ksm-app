// app/auth/admin/login/page.tsx
"use client";

import { useState, Suspense } from "react";
import { signIn, getSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield } from "lucide-react";

function AdminLoginForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/admin";

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const loginId = formData.get("loginId") as string;
    const password = formData.get("password") as string;

    try {
      // まず管理者としてログイン試行
      let result = await signIn("admin", {
        redirect: false,
        loginId,
        password,
      });

      // 管理者ログインが失敗したら運営者として試行
      if (result?.error) {
        result = await signIn("operator", {
          redirect: false,
          loginId,
          password,
        });
      }

      if (result?.error) {
        setError("ログインに失敗しました。認証情報を確認してください。");
      } else if (result?.ok) {
        // セッション情報を取得してリダイレクト
        const session = await getSession();
        if (session?.user?.role === "admin" || session?.user?.role === "operator") {
          router.push(callbackUrl);
          router.refresh();
        } else {
          setError("権限がありません。");
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
            <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-full">
              <Shield className="h-12 w-12 text-blue-600" />
            </div>
          </div>
          <h2 className="mt-6 text-3xl font-extrabold text-foreground">
            管理者・運営者ログイン
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            管理者・運営者専用ログインページ
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-center">ログイン情報を入力</CardTitle>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="loginId">ログインID</Label>
                <Input
                  id="loginId"
                  name="loginId"
                  type="text"
                  required
                  placeholder="ログインID"
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
            </form>

            <div className="mt-6 text-center">
              <p className="text-sm text-muted-foreground">
                チーム代表者の方は{" "}
                <Link
                  href="/auth/team/login"
                  className="font-medium text-blue-600 hover:text-blue-500"
                >
                  チーム代表者ログイン
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

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <AdminLoginForm />
    </Suspense>
  );
}
