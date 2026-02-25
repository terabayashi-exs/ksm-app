// lib/auth.ts
import NextAuth from "next-auth";
import { getServerSession } from "next-auth";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "./db";
import type { User } from "next-auth";

export interface ExtendedUser extends User {
  id: string;
  email: string;
  loginUserId: number;
  roles: ("admin" | "team" | "operator")[];
  isSuperadmin: boolean;
  // 後方互換性のため維持（既存コードが参照している箇所のため）
  role: "admin" | "team" | "operator";
  teamId?: string;
  teamIds?: string[];
  administratorId?: string;
  operatorId?: string;
  accessibleTournaments?: number[];
  // 新: 大会スコープ権限
  authorities?: { tournamentId: number; permissions: string }[];
}

const authConfig: NextAuthOptions = {
  providers: [
    // ==========================================
    // 統合ログインProvider（m_login_users）
    // ==========================================
    CredentialsProvider({
      id: "login",
      name: "統合ログイン",
      credentials: {
        email: { label: "メールアドレス", type: "email" },
        password: { label: "パスワード", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        try {
          // m_login_users からメールアドレスで検索
          const userResult = await db.execute({
            sql: `SELECT login_user_id, email, password_hash, display_name, is_superadmin, is_active
                  FROM m_login_users
                  WHERE email = ? AND is_active = 1`,
            args: [credentials.email as string]
          });

          if (userResult.rows.length === 0) {
            return null;
          }

          const user = userResult.rows[0];
          const isValidPassword = await bcrypt.compare(
            credentials.password as string,
            user.password_hash as string
          );

          if (!isValidPassword) {
            return null;
          }

          const loginUserId = Number(user.login_user_id);

          // ロールを取得
          const rolesResult = await db.execute({
            sql: `SELECT role FROM m_login_user_roles WHERE login_user_id = ?`,
            args: [loginUserId]
          });
          const roles = rolesResult.rows.map(r => r.role as "admin" | "team" | "operator");

          // 大会スコープ権限を取得
          const authResult = await db.execute({
            sql: `SELECT tournament_id, permissions FROM m_login_user_authority WHERE login_user_id = ?`,
            args: [loginUserId]
          });
          const authorities = authResult.rows.map(r => ({
            tournamentId: Number(r.tournament_id),
            permissions: r.permissions as string
          }));
          const accessibleTournaments = authorities.map(a => a.tournamentId);

          // チーム担当者の場合、担当チームIDを取得
          let teamIds: string[] = [];
          if (roles.includes("team")) {
            const teamsResult = await db.execute({
              sql: `SELECT team_id FROM m_team_members WHERE login_user_id = ? AND is_active = 1`,
              args: [loginUserId]
            });
            teamIds = teamsResult.rows.map(r => r.team_id as string);
          }

          // 管理者の場合、m_administrators の administrator_id を取得
          let administratorId: string | undefined;
          if (roles.includes("admin")) {
            const adminResult = await db.execute({
              sql: `SELECT administrator_id FROM m_administrators WHERE email = ? LIMIT 1`,
              args: [user.email as string]
            });
            if (adminResult.rows.length > 0) {
              administratorId = String(adminResult.rows[0].administrator_id);
            }
          }

          // 後方互換: role（単一）は優先順位で決定
          const role = roles.includes("admin") ? "admin"
            : roles.includes("operator") ? "operator"
            : "team";

          return {
            id: String(loginUserId),
            email: user.email as string,
            name: user.display_name as string,
            loginUserId,
            roles,
            isSuperadmin: Number(user.is_superadmin) === 1,
            role,
            teamId: teamIds[0],
            teamIds,
            administratorId,
            accessibleTournaments,
            authorities
          };
        } catch (error) {
          console.error("Login authentication error:", error);
          return null;
        }
      }
    }),

    // ==========================================
    // 既存Provider（段階的移行中は維持）
    // ==========================================
    CredentialsProvider({
      id: "admin",
      name: "管理者ログイン（旧）",
      credentials: {
        loginId: { label: "ログインID", type: "text" },
        password: { label: "パスワード", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.loginId || !credentials?.password) {
          return null;
        }

        try {
          const result = await db.execute(
            "SELECT administrator_id, admin_login_id, password_hash, email FROM m_administrators WHERE admin_login_id = ?",
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
            loginUserId: 0, // 旧Provider用のダミー値
            roles: ["admin" as const],
            isSuperadmin: false,
            role: "admin" as const,
            administratorId: admin.administrator_id as string
          };
        } catch (error) {
          console.error("Admin authentication error:", error);
          return null;
        }
      }
    }),
    // 注: 旧operator認証プロバイダーは削除されました。
    // 運営者は統合ログイン（login）プロバイダーを使用してください。
    CredentialsProvider({
      id: "team",
      name: "チーム代表者ログイン（旧）",
      credentials: {
        teamId: { label: "チームID", type: "text" },
        password: { label: "パスワード", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.teamId || !credentials?.password) {
          return null;
        }

        try {
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
            loginUserId: 0, // 旧Provider用のダミー値
            roles: ["team" as const],
            isSuperadmin: false,
            role: "team" as const,
            teamId: team.team_id as string,
            teamIds: [team.team_id as string]
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
        const u = user as ExtendedUser;
        token.loginUserId = u.loginUserId;
        token.roles = u.roles;
        token.isSuperadmin = u.isSuperadmin;
        // 後方互換
        token.role = u.role;
        token.teamId = u.teamId;
        token.teamIds = u.teamIds;
        token.administratorId = u.administratorId;
        token.operatorId = u.operatorId;
        token.accessibleTournaments = u.accessibleTournaments;
        token.authorities = u.authorities;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        const u = session.user as ExtendedUser;
        u.loginUserId = token.loginUserId as number;
        u.roles = token.roles as ("admin" | "team" | "operator")[];
        u.isSuperadmin = token.isSuperadmin as boolean;
        // 後方互換
        u.role = token.role as "admin" | "team" | "operator";
        u.teamId = token.teamId as string | undefined;
        u.teamIds = token.teamIds as string[] | undefined;
        u.administratorId = token.administratorId as string | undefined;
        u.operatorId = token.operatorId as string | undefined;
        u.accessibleTournaments = token.accessibleTournaments as number[] | undefined;
        u.authorities = token.authorities as { tournamentId: number; permissions: string }[] | undefined;
        u.id = token.sub as string;
      }
      return session;
    },
    async redirect({ url, baseUrl }) {
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
  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === 'development'
};

const handler = NextAuth(authConfig);

export { handler as GET, handler as POST };
export { authConfig as authOptions };

// v4 では getServerSession を使用
export async function auth() {
  return await getServerSession(authConfig);
}
