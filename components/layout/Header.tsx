// components/layout/Header.tsx
"use client";

import { useState } from "react";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { User, LogOut, Menu, X, Search } from "lucide-react";

interface HeaderProps {
  hideSearchButton?: boolean;
}

export default function Header({ hideSearchButton = false }: HeaderProps) {
  const { data: session, status } = useSession();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-base-800 border-b-[3px] border-primary">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* ロゴ */}
          <div className="flex items-center gap-2">
            <Link href="/" className="flex items-center">
              <div className="relative h-10">
                <Image
                  src="/images/taikaigo-logo-white.svg"
                  alt="大会GO"
                  width={500}
                  height={148}
                  className="h-full w-auto"
                  style={{ objectFit: 'contain' }}
                  priority
                />
              </div>
            </Link>
            <Badge className="text-xs bg-white/15 text-white/80 border-white/20 hover:bg-white/20">
              β版
            </Badge>
          </div>

          {/* デスクトップ: CTAボタン + ユーザーメニュー */}
          <div className="hidden sm:flex items-center space-x-3">
            {status === "loading" ? (
              <div className="w-8 h-8 bg-white/10 rounded-full animate-pulse"></div>
            ) : session?.user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="flex items-center space-x-2 text-white/90 hover:text-white hover:bg-white/10">
                    <User className="h-4 w-4" />
                    <span className="hidden sm:inline">
                      {session.user.name}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <div className="px-3 py-2 border-b border-gray-200">
                    <p className="font-medium text-gray-900">{session.user.name}</p>
                    <p className="text-sm text-gray-500">{session.user.email}</p>
                  </div>

                  <DropdownMenuItem asChild>
                    <Link href="/my" className="flex items-center">
                      <User className="mr-2 h-4 w-4" />
                      マイダッシュボード
                    </Link>
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    onClick={() => signOut({ redirect: false }).then(() => window.location.href = '/')}
                    className="text-destructive cursor-pointer"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    ログアウト
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <>
                {!hideSearchButton && (
                  <Button asChild size="sm">
                    <Link href="/" className="flex items-center">
                      <Search className="mr-1.5 h-3.5 w-3.5" />
                      大会を探す
                    </Link>
                  </Button>
                )}
                <Button asChild size="sm" variant="outline" className="border-white/40 text-white bg-transparent hover:bg-white/10 hover:text-white">
                  <Link href="/auth/login" className="flex items-center">
                    ログイン
                  </Link>
                </Button>
              </>
            )}
          </div>

          {/* モバイル: ハンバーガーメニューボタン */}
          <div className="flex sm:hidden items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={mobileMenuOpen ? "メニューを閉じる" : "メニューを開く"}
              className="text-white/90 hover:text-white hover:bg-white/10"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>
      </div>

      {/* モバイルメニュー */}
      {mobileMenuOpen && (
        <div className="sm:hidden border-t border-white/10 bg-base-800">
          <div className="px-4 py-3 space-y-2">
            {status === "loading" ? (
              <div className="w-full h-10 bg-white/10 rounded-md animate-pulse"></div>
            ) : session?.user ? (
              <>
                <div className="px-3 py-2 border-b border-white/10 mb-2">
                  <p className="font-medium text-white text-sm">{session.user.name}</p>
                  <p className="text-xs text-white/60">{session.user.email}</p>
                </div>
                <Link
                  href="/my"
                  className="flex items-center gap-2 px-3 py-3 text-sm text-white/90 rounded-md hover:bg-white/10"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <User className="h-4 w-4" />
                  マイダッシュボード
                </Link>
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    signOut({ redirect: false }).then(() => window.location.href = '/');
                  }}
                  className="flex items-center gap-2 w-full px-3 py-3 text-sm text-red-400 rounded-md hover:bg-white/10 text-left"
                >
                  <LogOut className="h-4 w-4" />
                  ログアウト
                </button>
              </>
            ) : (
              <>
                {!hideSearchButton && (
                  <Link
                    href="/"
                    className="flex items-center gap-2 px-3 py-3 text-sm text-white/90 rounded-md hover:bg-white/10"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <Search className="h-4 w-4" />
                    大会を探す
                  </Link>
                )}
                <Link
                  href="/auth/login"
                  className="flex items-center gap-2 px-3 py-3 text-sm text-white/90 rounded-md hover:bg-white/10"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <User className="h-4 w-4" />
                  ログイン
                </Link>
                <Link
                  href="/auth/register"
                  className="flex items-center gap-2 px-3 py-3 text-sm text-white/90 rounded-md hover:bg-white/10"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <User className="h-4 w-4" />
                  新規ユーザー登録
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
