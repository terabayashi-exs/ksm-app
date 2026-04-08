"use client";

import { AlertCircle, CheckCircle, Loader2, Mail } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  teamId: string;
  teamName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export default function TeamManagerInviteDialog({
  teamId,
  teamName,
  open,
  onOpenChange,
  onSuccess,
}: Props) {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  async function handleSend() {
    if (!email.trim()) return;
    setSending(true);
    setResult(null);
    try {
      const res = await fetch(`/api/admin/teams/${teamId}/invite-manager`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setResult({ success: true, message: data.message || "認証メールを送信しました" });
        onSuccess?.();
      } else {
        setResult({ success: false, message: data.error || "送信に失敗しました" });
      }
    } catch {
      setResult({ success: false, message: "通信エラーが発生しました" });
    } finally {
      setSending(false);
    }
  }

  function handleClose() {
    setEmail("");
    setResult(null);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            担当者登録（メール認証）
          </DialogTitle>
          <DialogDescription>
            {teamName}{" "}
            の担当者として登録するメールアドレスを入力してください。認証メールが送信されます。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {result ? (
            <div
              className={`flex items-start gap-3 p-4 rounded-lg ${result.success ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}
            >
              {result.success ? (
                <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
              )}
              <p className={`text-sm ${result.success ? "text-green-800" : "text-red-800"}`}>
                {result.message}
              </p>
            </div>
          ) : null}

          {!result?.success && (
            <>
              <div className="space-y-2">
                <Label htmlFor="invite-email">メールアドレス</Label>
                <Input
                  id="invite-email"
                  type="email"
                  autoComplete="off"
                  placeholder="example@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSend();
                  }}
                  disabled={sending}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={handleClose} disabled={sending}>
                  キャンセル
                </Button>
                <Button onClick={handleSend} disabled={sending || !email.trim()}>
                  {sending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                      送信中...
                    </>
                  ) : (
                    "認証メール送信"
                  )}
                </Button>
              </div>
            </>
          )}

          {result?.success && (
            <div className="flex justify-end">
              <Button variant="outline" onClick={handleClose}>
                閉じる
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
