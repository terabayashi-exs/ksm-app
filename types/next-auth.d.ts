// types/next-auth.d.ts
import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface User {
    loginUserId: number;
    roles: ("admin" | "team" | "operator")[];
    isSuperadmin: boolean;
    // 後方互換
    role: "admin" | "team" | "operator";
    teamId?: string;
    teamIds?: string[];
    administratorId?: string;
    operatorId?: string;
    accessibleTournaments?: number[];
    authorities?: { tournamentId: number; permissions: string }[];
  }

  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      loginUserId: number;
      roles: ("admin" | "team" | "operator")[];
      isSuperadmin: boolean;
      // 後方互換
      role: "admin" | "team" | "operator";
      teamId?: string;
      teamIds?: string[];
      administratorId?: string;
      operatorId?: string;
      accessibleTournaments?: number[];
      authorities?: { tournamentId: number; permissions: string }[];
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    loginUserId: number;
    roles: ("admin" | "team" | "operator")[];
    isSuperadmin: boolean;
    // 後方互換
    role: "admin" | "team" | "operator";
    teamId?: string;
    teamIds?: string[];
    administratorId?: string;
    operatorId?: string;
    accessibleTournaments?: number[];
    authorities?: { tournamentId: number; permissions: string }[];
  }
}
