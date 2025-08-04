// types/next-auth.d.ts
import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface User {
    role: "admin" | "team";
    teamId?: string;
  }

  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: "admin" | "team";
      teamId?: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: "admin" | "team";
    teamId?: string;
  }
}