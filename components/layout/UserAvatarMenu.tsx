// components/layout/UserAvatarMenu.tsx
"use client";

import { ChevronDown, LogOut, User } from "lucide-react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface UserAvatarMenuProps {
  userName: string;
  userEmail?: string;
  showDashboardLink?: boolean;
}

export default function UserAvatarMenu({
  userName,
  userEmail,
  showDashboardLink = true,
}: UserAvatarMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 px-2 py-1.5 rounded-full text-white/90 hover:text-white hover:bg-white/10 transition-colors cursor-pointer">
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
            {userName?.charAt(0) || "U"}
          </div>
          <span className="text-sm font-medium">{userName}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <div className="px-3 py-2 border-b border-gray-200">
          <p className="font-medium text-gray-900">{userName}</p>
          {userEmail && <p className="text-sm text-gray-500">{userEmail}</p>}
        </div>

        {showDashboardLink && (
          <DropdownMenuItem asChild>
            <Link href="/my" className="flex items-center">
              <User className="mr-2 h-4 w-4" />
              マイダッシュボード
            </Link>
          </DropdownMenuItem>
        )}

        <DropdownMenuItem
          onClick={() => signOut({ redirect: false }).then(() => (window.location.href = "/"))}
          className="text-destructive cursor-pointer"
        >
          <LogOut className="mr-2 h-4 w-4" />
          ログアウト
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
