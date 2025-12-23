// app/auth/register/email/page.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Mail, ArrowLeft } from "lucide-react";

export default function RegisterEmailPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

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
    } catch (error) {
      console.error('Email submission error:', error);
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
                  <strong>{email}</strong> にチーム登録用のリンクを送信しました。
                </p>
                <p className="text-muted-foreground text-sm">
                  メールボックスをご確認いただき、メール内のリンクをクリックしてチーム登録を完了してください。
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
            チーム登録申請
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
                  チーム代表者として使用するメールアドレスを入力してください
                </p>
              </div>

              {error && (
                <div className="text-red-600 text-sm text-center bg-red-50 dark:bg-red-950/20 p-2 rounded">
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "送信中..." : "認証メールを送信"}
              </Button>
            </form>

            <div className="mt-6 text-center space-y-2">
              <p className="text-sm text-muted-foreground">
                既にアカウントをお持ちの方は{" "}
                <Link
                  href="/auth/team/login"
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
