// components/layout/Header.tsx
"use client";

import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { User, Settings, LogOut } from "lucide-react";

export default function Header() {
  const { data: session, status } = useSession();

  return (
    <header className="bg-card shadow-sm border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* ロゴ */}
          <div className="flex items-center">
            <Link href="/" className="flex items-center">
              <div className="relative h-12">
                <Image
                  src="/images/systemlogo_1000_313-タイトルあり.png"
                  alt="楽勝 GO"
                  width={1000}
                  height={313}
                  className="h-full w-auto"
                  style={{ objectFit: 'contain' }}
                  priority
                />
              </div>
            </Link>
          </div>


          {/* ユーザーメニュー */}
          <div className="flex items-center space-x-4">
            {/* テーマ切り替えボタン（モバイルでは非表示） */}
            <div className="hidden md:block">
              <ThemeToggle />
            </div>

            {status === "loading" ? (
              <div className="w-8 h-8 bg-muted rounded-full animate-pulse"></div>
            ) : session?.user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="flex items-center space-x-2">
                    <User className="h-4 w-4" />
                    <span className="hidden sm:inline">
                      {session.user.name}
                    </span>
                    <span className="text-xs text-muted-foreground hidden sm:inline">
                      ({session.user.role === "admin" ? "管理者" : "チーム"})
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <div className="px-3 py-2 border-b border-border">
                    <p className="font-medium text-foreground">{session.user.name}</p>
                    <p className="text-sm text-muted-foreground">{session.user.email}</p>
                  </div>
                  
                  {session.user.role === "admin" ? (
                    <DropdownMenuItem asChild>
                      <Link href="/admin" className="flex items-center">
                        <Settings className="mr-2 h-4 w-4" />
                        管理者ダッシュボード
                      </Link>
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem asChild>
                      <Link href="/team" className="flex items-center">
                        <User className="mr-2 h-4 w-4" />
                        チームダッシュボード
                      </Link>
                    </DropdownMenuItem>
                  )}
                  
                  <DropdownMenuItem 
                    onClick={() => signOut({ redirect: false }).then(() => window.location.href = '/')}
                    className="text-red-600 cursor-pointer"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    ログアウト
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <div className="flex items-center space-x-2">
                <Button variant="outline" asChild>
                  <Link href="/auth/login">ログイン</Link>
                </Button>
                <Button asChild>
                  <Link href="/auth/register">チーム登録</Link>
                </Button>
              </div>
            )}

          </div>
        </div>
      </div>
    </header>
  );
}