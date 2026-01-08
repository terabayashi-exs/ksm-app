import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import TournamentFormatEditForm from "@/components/features/tournament-format/TournamentFormatEditForm";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditTournamentFormatPage({ params }: Props) {
  const resolvedParams = await params;
  const session = await auth();
  
  if (!session || session.user.role !== "admin" || session.user.id !== "admin") {
    redirect("/auth/login");
  }

  // フォーマット情報を取得（競技種別も含む）
  const formatResult = await db.execute(`
    SELECT 
      tf.*,
      st.sport_name,
      st.sport_code
    FROM m_tournament_formats tf
    LEFT JOIN m_sport_types st ON tf.sport_type_id = st.sport_type_id
    WHERE tf.format_id = ?
  `, [resolvedParams.id]);

  if (formatResult.rows.length === 0) {
    notFound();
  }

  const format = formatResult.rows[0];

  // 関連する試合テンプレートを取得
  const templatesResult = await db.execute(`
    SELECT * FROM m_match_templates 
    WHERE format_id = ? 
    ORDER BY match_number
  `, [resolvedParams.id]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-6">
            <div className="flex items-center space-x-4">
              <Button asChild variant="ghost" size="sm">
                <Link href="/admin/tournament-formats" className="flex items-center text-gray-600 hover:text-gray-900">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  フォーマット一覧に戻る
                </Link>
              </Button>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">大会フォーマット編集</h1>
                <p className="text-sm text-gray-500 mt-1">
                  {String(format.format_name)} の編集
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <TournamentFormatEditForm
          format={{
            format_id: Number(format.format_id),
            format_name: String(format.format_name),
            sport_type_id: Number(format.sport_type_id || 1),
            target_team_count: Number(format.target_team_count),
            format_description: String(format.format_description || ""),
            preliminary_format_type: format.preliminary_format_type ? String(format.preliminary_format_type) : null,
            final_format_type: format.final_format_type ? String(format.final_format_type) : null
          }}
          templates={templatesResult.rows.map(t => ({
            match_number: Number(t.match_number),
            match_code: String(t.match_code),
            match_type: String(t.match_type || "通常"),
            phase: String(t.phase || "preliminary"),
            round_name: String(t.round_name || ""),
            block_name: String(t.block_name || ""),
            team1_source: String(t.team1_source || ""),
            team2_source: String(t.team2_source || ""),
            team1_display_name: String(t.team1_display_name || ""),
            team2_display_name: String(t.team2_display_name || ""),
            day_number: Number(t.day_number || 1),
            execution_priority: Number(t.execution_priority || 1),
            court_number: t.court_number ? Number(t.court_number) : undefined,
            suggested_start_time: String(t.suggested_start_time || ""),
            // 新しい順位設定フィールド
            loser_position_start: t.loser_position_start ? Number(t.loser_position_start) : undefined,
            loser_position_end: t.loser_position_end ? Number(t.loser_position_end) : undefined,
            winner_position: t.winner_position ? Number(t.winner_position) : undefined,
            position_note: String(t.position_note || "")
          }))}
        />
      </div>
    </div>
  );
}