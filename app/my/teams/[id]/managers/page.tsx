// app/my/teams/[id]/managers/page.tsx
export const metadata = { title: "担当者管理" };

import { redirect } from "next/navigation";
import TeamManagersClient from "@/components/features/my/TeamManagersClient";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function TeamManagersPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) {
    redirect("/auth/login");
  }

  const { id: teamId } = await params;
  const loginUserId = (session.user as { loginUserId?: number }).loginUserId;

  if (!loginUserId) {
    redirect("/auth/login");
  }

  // チームの存在確認と権限チェック
  const teamResult = await db.execute({
    sql: `
      SELECT t.team_id, t.team_name, t.team_omission
      FROM m_teams t
      INNER JOIN m_team_members tm ON t.team_id = tm.team_id
      WHERE t.team_id = ? AND tm.login_user_id = ? AND tm.is_active = 1
    `,
    args: [teamId, loginUserId],
  });

  if (teamResult.rows.length === 0) {
    redirect("/my?tab=team");
  }

  const team = teamResult.rows[0];

  return (
    <TeamManagersClient
      teamId={teamId}
      teamName={team.team_name as string}
      teamOmission={team.team_omission as string | null}
    />
  );
}
