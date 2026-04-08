"use client";

import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";

export default function SignOutButton({ size }: { size?: "default" | "sm" | "lg" | "icon" } = {}) {
  const handleSignOut = async () => {
    try {
      await signOut({
        redirect: false, // 確認画面を表示しない
      });
      // サインアウト後にTOPページに遷移
      window.location.href = "/";
    } catch (error) {
      console.error("サインアウトエラー:", error);
      // エラーが発生してもTOPページに遷移
      window.location.href = "/";
    }
  };

  return (
    <Button variant="outline" size={size} onClick={handleSignOut}>
      ログアウト
    </Button>
  );
}
