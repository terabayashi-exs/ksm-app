// components/layout/Header.tsx
"use client";

import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { User, Settings, LogOut } from "lucide-react";

export default function Header() {
  const { data: session, status } = useSession();

  return (
    <header className="bg-card shadow-sm border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* ロゴ・タイトル */}
          <div className="flex items-center">
            <Link href="/" className="flex items-center space-x-2">
              <div className="bg-gradient-to-br from-blue-600 to-blue-700 text-white p-2 rounded-lg shadow-md">
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  {/* トーナメント構造を表現 */}
                  <path 
                    d="M4 6h4v2H4V6zM4 16h4v2H4v-2zM16 6h4v2h-4V6zM16 16h4v2h-4v-2z" 
                    fill="currentColor" 
                    opacity="0.8"
                  />
                  {/* 中央の接続線 */}
                  <path 
                    d="M8 7h4v1H8V7zM8 17h4v-1H8v1zM12 8v8h1V8h-1z" 
                    fill="currentColor"
                  />
                  {/* 勝者の表現（星） */}
                  <path 
                    d="M12 2l1.09 3.26L16 5l-2.91 1.74L14 10l-2-1.2L10 10l.91-3.26L8 5l2.91.26L12 2z" 
                    fill="#FFD700" 
                    opacity="0.9"
                  />
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">
                  Rakusyo GO
                </h1>
                <p className="text-xs text-muted-foreground">
                  Sports Tournament Management
                </p>
              </div>
            </Link>
          </div>


          {/* ユーザーメニュー */}
          <div className="flex items-center space-x-4">
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