// types/next-auth.d.ts
import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface User {
    role: "admin" | "team" | "operator";
    teamId?: string;
    administratorId?: string;
    operatorId?: string;
    accessibleTournaments?: number[];
  }

  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: "admin" | "team" | "operator";
      teamId?: string;
      administratorId?: string;
      operatorId?: string;
      accessibleTournaments?: number[];
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: "admin" | "team" | "operator";
    teamId?: string;
    administratorId?: string;
    operatorId?: string;
    accessibleTournaments?: number[];
  }
}