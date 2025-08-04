// lib/auth.ts
import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "./db";
import type { User } from "next-auth";

export interface ExtendedUser extends User {
  id: string;
  email: string;
  role: "admin" | "team";
  teamId?: string;
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    CredentialsProvider({
      id: "admin",
      name: "管理者ログイン",
      credentials: {
        loginId: { label: "ログインID", type: "text" },
        password: { label: "パスワード", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.loginId || !credentials?.password) {
          return null;
        }

        try {
          // 管理者テーブルから認証情報を取得
          const result = await db.execute(
            "SELECT admin_login_id, password_hash, email FROM m_administrators WHERE admin_login_id = ?",
            [credentials.loginId as string]
          );

          if (result.rows.length === 0) {
            return null;
          }

          const admin = result.rows[0];
          const isValidPassword = await bcrypt.compare(
            credentials.password as string,
            admin.password_hash as string
          );

          if (!isValidPassword) {
            return null;
          }

          return {
            id: admin.admin_login_id as string,
            email: admin.email as string,
            name: admin.admin_login_id as string,
            role: "admin" as const
          };
        } catch (error) {
          console.error("Admin authentication error:", error);
          return null;
        }
      }
    }),
    CredentialsProvider({
      id: "team",
      name: "チーム代表者ログイン",
      credentials: {
        teamId: { label: "チームID", type: "text" },
        password: { label: "パスワード", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.teamId || !credentials?.password) {
          return null;
        }

        try {
          // チームテーブルから認証情報を取得
          const result = await db.execute(
            `SELECT team_id, team_name, contact_email, password_hash, is_active 
             FROM m_teams 
             WHERE team_id = ? AND is_active = 1`,
            [credentials.teamId as string]
          );

          if (result.rows.length === 0) {
            return null;
          }

          const team = result.rows[0];
          const isValidPassword = await bcrypt.compare(
            credentials.password as string,
            team.password_hash as string
          );

          if (!isValidPassword) {
            return null;
          }

          return {
            id: team.team_id as string,
            email: team.contact_email as string,
            name: team.team_name as string,
            role: "team" as const,
            teamId: team.team_id as string
          };
        } catch (error) {
          console.error("Team authentication error:", error);
          return null;
        }
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as ExtendedUser).role;
        token.teamId = (user as ExtendedUser).teamId;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        (session.user as ExtendedUser).role = token.role as "admin" | "team";
        (session.user as ExtendedUser).teamId = token.teamId as string | undefined;
        (session.user as ExtendedUser).id = token.sub as string;
      }
      return session;
    },
    async redirect({ url, baseUrl }) {
      // 認証後のリダイレクト処理
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      else if (new URL(url).origin === baseUrl) return url;
      return baseUrl;
    }
  },
  pages: {
    signIn: "/auth/login",
    error: "/auth/error",
    signOut: "/"
  },
  session: {
    strategy: "jwt" as const,
    maxAge: 24 * 60 * 60 // 24時間
  },
  secret: process.env.NEXTAUTH_SECRET
});