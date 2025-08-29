import { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Download, BarChart3, Clock } from 'lucide-react';
import { db } from '@/lib/db';
import { notFound } from 'next/navigation';

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

async function getTournament(id: string) {
  try {
    const result = await db.execute({
      sql: `
        SELECT 
          tournament_id, tournament_name, status, 
          recruitment_start_date, recruitment_end_date,
          tournament_dates, format_id, visibility
        FROM t_tournaments 
        WHERE tournament_id = ? AND visibility = 'open'
      `,
      args: [parseInt(id)]
    });

    if (result.rows.length === 0) {
      return null;
    }

    return {
      tournament_id: result.rows[0].tournament_id as number,
      tournament_name: result.rows[0].tournament_name as string,
      status: result.rows[0].status as string,
      recruitment_start_date: result.rows[0].recruitment_start_date as string | null,
      recruitment_end_date: result.rows[0].recruitment_end_date as string | null,
      tournament_dates: result.rows[0].tournament_dates as string | null,
      format_id: result.rows[0].format_id as number,
    };
  } catch (error) {
    console.error('Error fetching tournament:', error);
    return null;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const resolvedParams = await params;
  const tournament = await getTournament(resolvedParams.id);
  
  if (!tournament) {
    return {
      title: '大会が見つかりません'
    };
  }

  return {
    title: `${tournament.tournament_name} - 結果表 | KSM-App`,
    description: `${tournament.tournament_name}の結果表（PDF版）をご覧いただけます。`,
  };
}

export default async function TournamentResultsPdfPage({ params }: PageProps) {
  const resolvedParams = await params;
  const tournament = await getTournament(resolvedParams.id);

  if (!tournament) {
    notFound();
  }

  const pdfUrl = `/tournament-results/tournament-${tournament.tournament_id}-results.pdf`;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link 
              href={`/public/tournaments/${tournament.tournament_id}`}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              大会詳細に戻る
            </Link>
          </div>
          <div className="mt-2">
            <h1 className="text-2xl font-bold text-gray-900">
              {tournament.tournament_name}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <BarChart3 className="h-4 w-4 text-blue-600" />
              <span className="text-sm text-gray-600">結果表（PDF版）</span>
            </div>
          </div>
        </div>
      </div>

      {/* メインコンテンツ */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* 案内・操作エリア */}
        <div className="mb-6 space-y-4">
          {/* 更新情報 */}
          <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded-r-lg">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0">
                <Clock className="h-5 w-5 text-blue-600 mt-0.5" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-medium text-blue-800">
                  📊 結果表について
                </h3>
                <div className="mt-1 text-sm text-blue-700">
                  <p>この結果表は手動で作成・更新されます。最新の順位・戦績は「順位表」「戦績表」ページをご確認ください。</p>
                  <p className="text-xs mt-1 opacity-75">
                    ※ ファイルの最終更新日時はダウンロードボタンから確認できます
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* ダウンロードボタン */}
          <div className="flex justify-center">
            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition-colors shadow-sm"
            >
              <Download className="h-4 w-4" />
              PDFをダウンロード・別タブで開く
            </a>
          </div>
        </div>

        {/* PDF表示エリア */}
        <div className="bg-white rounded-lg shadow-sm border">
          <div className="p-4 border-b">
            <h2 className="text-lg font-semibold text-gray-900">結果表</h2>
          </div>
          
          {/* PDF Viewer */}
          <div className="relative">
            <iframe
              src={pdfUrl}
              className="w-full h-[800px] border-0"
              title={`${tournament.tournament_name} 結果表`}
            />
            
            {/* PDF読み込みエラー時のフォールバック */}
            <div className="absolute inset-0 flex items-center justify-center bg-gray-50 hidden" id="pdf-error-fallback">
              <div className="text-center">
                <BarChart3 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">PDFを表示できません</h3>
                <p className="text-gray-600 mb-4">
                  ブラウザでPDFが表示できない場合は、<br />
                  下のボタンからダウンロードしてご覧ください。
                </p>
                <a
                  href={pdfUrl}
                  download={`tournament-${tournament.tournament_id}-results.pdf`}
                  className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
                >
                  <Download className="h-4 w-4" />
                  PDFをダウンロード
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* 注意事項 */}
        <div className="mt-6 bg-gray-50 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-900 mb-2">ご利用上の注意</h3>
          <ul className="text-xs text-gray-600 space-y-1">
            <li>• スマートフォンでご覧の場合は、拡大・縮小で見やすく調整してください</li>
            <li>• 最新の順位・戦績は「順位表」「戦績表」ページで確認できます</li>
            <li>• PDF表示に問題がある場合は、ダウンロードしてPDFビューアーでご覧ください</li>
          </ul>
        </div>
      </div>
    </div>
  );
}