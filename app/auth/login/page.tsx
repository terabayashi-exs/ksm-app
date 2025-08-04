// app/(auth)/login/page.tsx
"use client";

import { useState, Suspense } from "react";
import { signIn, getSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

function LoginForm() {
  const [activeTab, setActiveTab] = useState<"admin" | "team">("admin");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/";

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    
    try {
      const result = await signIn(activeTab, {
        redirect: false,
        ...(activeTab === "admin" 
          ? {
              loginId: formData.get("loginId") as string,
              password: formData.get("password") as string,
            }
          : {
              teamId: formData.get("teamId") as string,
              password: formData.get("password") as string,
            }
        )
      });

      if (result?.error) {
        setError("ログインに失敗しました。認証情報を確認してください。");
      } else if (result?.ok) {
        // セッション情報を取得してリダイレクト先を決定
        const session = await getSession();
        if (session?.user?.role === "admin") {
          router.push("/admin");
        } else if (session?.user?.role === "team") {
          router.push("/team");
        } else {
          router.push(callbackUrl);
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
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
            PK選手権大会システム
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            ログインしてシステムにアクセス
          </p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex space-x-1 rounded-lg bg-gray-100 p-1">
              <button
                type="button"
                onClick={() => setActiveTab("admin")}
                className={`flex-1 rounded-md py-2 px-3 text-sm font-medium transition-colors ${
                  activeTab === "admin"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-900"
                }`}
              >
                管理者
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("team")}
                className={`flex-1 rounded-md py-2 px-3 text-sm font-medium transition-colors ${
                  activeTab === "team"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-900"
                }`}
              >
                チーム代表者
              </button>
            </div>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {activeTab === "admin" ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="loginId">ログインID</Label>
                    <Input
                      id="loginId"
                      name="loginId"
                      type="text"
                      required
                      placeholder="管理者ログインID"
                      disabled={loading}
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
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="teamId">チームID</Label>
                    <Input
                      id="teamId"
                      name="teamId"
                      type="text"
                      required
                      placeholder="チームID"
                      disabled={loading}
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
                    />
                  </div>
                </>
              )}

              {error && (
                <div className="text-red-600 text-sm text-center bg-red-50 p-2 rounded">
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "ログイン中..." : "ログイン"}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-sm text-gray-600">
                チーム登録がお済みでない場合は{" "}
                <Link
                  href={`/auth/register${callbackUrl !== '/' ? `?callbackUrl=${encodeURIComponent(callbackUrl)}` : ''}`}
                  className="font-medium text-blue-600 hover:text-blue-500"
                >
                  こちらから登録
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <LoginForm />
    </Suspense>
  );
}