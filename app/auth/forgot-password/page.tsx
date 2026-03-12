// app/auth/forgot-password/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft, Mail } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess(false);

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "エラーが発生しました");
      } else {
        setSuccess(true);
      }
    } catch (error) {
      console.error("Forgot password error:", error);
      setError("パスワードリセット申請中にエラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h2 className="mt-6 text-3xl font-extrabold text-foreground">
            大会GO
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            パスワードリセット
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">パスワードを忘れた方</CardTitle>
            <CardDescription>
              登録メールアドレスを入力してください。
              パスワードリセット用のリンクをメールでお送りします。
            </CardDescription>
          </CardHeader>

          <CardContent>
            {!success ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">登録メールアドレス</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    required
                    placeholder="example@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                  />
                  <p className="text-xs text-muted-foreground">
                    アカウント登録時に入力したメールアドレス
                  </p>
                </div>

                {error && (
                  <div className="text-destructive text-sm bg-destructive/5 dark:bg-red-950/20 p-3 rounded border border-destructive/20 dark:border-red-800">
                    {error}
                  </div>
                )}

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "送信中..." : "リセットリンクを送信"}
                </Button>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                  <div className="flex items-start">
                    <Mail className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5 mr-3" />
                    <div className="flex-1">
                      <h3 className="text-sm font-medium text-green-800 dark:text-green-300">
                        メールを送信しました
                      </h3>
                      <p className="mt-2 text-sm text-green-700 dark:text-green-400">
                        登録されているメールアドレスにパスワードリセット用のリンクを送信しました。
                        メールをご確認ください。
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-primary/5 dark:bg-blue-950/20 border border-primary/20 dark:border-blue-800 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-primary dark:text-blue-300 mb-2">
                    重要事項
                  </h4>
                  <ul className="text-sm text-primary dark:text-blue-400 space-y-1 list-disc list-inside">
                    <li>リンクの有効期限は1時間です</li>
                    <li>リンクは1回のみ使用可能です</li>
                    <li>メールが届かない場合は迷惑メールフォルダをご確認ください</li>
                  </ul>
                </div>

                <Button
                  onClick={() => router.push("/auth/login")}
                  className="w-full"
                  variant="outline"
                >
                  ログイン画面に戻る
                </Button>
              </div>
            )}

            {!success && (
              <div className="mt-6 text-center space-y-2">
                <Link
                  href="/auth/login"
                  className="inline-flex items-center text-sm font-medium text-primary hover:text-primary/80"
                >
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  ログイン画面に戻る
                </Link>
                <p className="text-sm text-muted-foreground">
                  アカウント登録がお済みでない場合は{" "}
                  <Link
                    href="/auth/register"
                    className="font-medium text-primary hover:text-primary/80"
                  >
                    こちらから登録
                  </Link>
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
