'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  QrCode,
  Printer,
  Filter,
  Calendar,
  Clock,
  MapPin,
  Users,
  AlertCircle
} from 'lucide-react';

interface QRMatch {
  match_id: number;
  match_code: string;
  match_block_id: number;
  court_number: number;
  court_name: string;
  start_time: string;
  tournament_date: string;
  match_status: string;
  block_name: string;
  phase: string;
  team1_name: string;
  team2_name: string;
  team1_omission: string;
  team2_omission: string;
  referee_url: string;
  qr_image_url: string;
}

export default function QRListPage() {
  const params = useParams();
  const tournamentId = params.id as string;

  const [matches, setMatches] = useState<QRMatch[]>([]);
  const [filteredMatches, setFilteredMatches] = useState<QRMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterPhase, setFilterPhase] = useState<string>('all');
  const [filterBlock, setFilterBlock] = useState<string>('all');
  const [includeCompleted, setIncludeCompleted] = useState(false);
  const [validity, setValidity] = useState<{ validFrom: string; validUntil: string } | null>(null);

  useEffect(() => {
    fetchMatches();
  }, [tournamentId, includeCompleted]);

  useEffect(() => {
    applyFilters();
  }, [matches, filterPhase, filterBlock]);

  const fetchMatches = async () => {
    try {
      setLoading(true);
      const url = `/api/tournaments/${tournamentId}/qr-list${includeCompleted ? '?includeCompleted=true' : ''}`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.success) {
        setMatches(data.matches);
        if (data.validity) {
          setValidity(data.validity);
        }
      } else {
        setError('データの取得に失敗しました');
      }
    } catch (err) {
      console.error('QR一覧取得エラー:', err);
      setError('QRコード一覧の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...matches];

    if (filterPhase !== 'all') {
      filtered = filtered.filter(m => m.phase === filterPhase);
    }

    if (filterBlock !== 'all') {
      filtered = filtered.filter(m => m.block_name === filterBlock);
    }

    setFilteredMatches(filtered);
  };

  const handlePrint = () => {
    window.print();
  };

  const uniquePhases = Array.from(new Set(matches.map(m => m.phase)));

  // ブロックをmatch_block_idの昇順でソート
  const blockMap = new Map<string, number>();
  matches.forEach(m => {
    if (!blockMap.has(m.block_name)) {
      blockMap.set(m.block_name, m.match_block_id);
    }
  });
  const uniqueBlocks = Array.from(blockMap.entries())
    .sort((a, b) => a[1] - b[1])
    .map(entry => entry[0]);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">QRコード一覧を読み込み中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 print:p-4">
      {/* ヘッダー（印刷時非表示） */}
      <div className="no-print mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <QrCode className="h-8 w-8" />
              審判用QRコード一覧
            </h1>
            <p className="text-gray-600 mt-1">
              試合前・進行中の試合のQRコードを表示します（全{filteredMatches.length}試合）
            </p>
            {validity && (
              <p className="text-sm text-blue-600 mt-2 font-medium">
                QRコード有効期限: {new Date(validity.validUntil).toLocaleString('ja-JP', {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit'
                })} まで
              </p>
            )}
          </div>
          <Button onClick={handlePrint} className="flex items-center gap-2">
            <Printer className="h-4 w-4" />
            印刷
          </Button>
        </div>

        {/* 完了試合表示チェックボックス */}
        <div className="mb-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={includeCompleted}
              onChange={(e) => setIncludeCompleted(e.target.checked)}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">完了した試合も表示する</span>
          </label>
        </div>

        {/* フィルター */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Filter className="h-5 w-5" />
              フィルター
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">フェーズ</label>
                <select
                  value={filterPhase}
                  onChange={(e) => setFilterPhase(e.target.value)}
                  className="w-full p-2 border rounded-md"
                >
                  <option value="all">すべて</option>
                  {uniquePhases.map(phase => (
                    <option key={phase} value={phase}>
                      {phase === 'preliminary' ? '予選' : '決勝'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">ブロック</label>
                <select
                  value={filterBlock}
                  onChange={(e) => setFilterBlock(e.target.value)}
                  className="w-full p-2 border rounded-md"
                >
                  <option value="all">すべて</option>
                  {uniqueBlocks.map(block => (
                    <option key={block} value={block}>{block}</option>
                  ))}
                </select>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* QRコード一覧 */}
      {filteredMatches.length === 0 ? (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            表示する試合がありません。フィルター条件を変更してください。
          </AlertDescription>
        </Alert>
      ) : (
        <>
          {/* 10枚ごとにページセクションで区切る */}
          {Array.from({ length: Math.ceil(filteredMatches.length / 10) }, (_, pageIndex) => (
            <div key={pageIndex} className="print-page">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 print-container">
                {filteredMatches.slice(pageIndex * 10, (pageIndex + 1) * 10).map((match) => (
                  <Card
                    key={match.match_id}
                    className="print-card"
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-2xl font-bold text-blue-600 match-title">
                            {match.match_code}
                          </CardTitle>
                          <p className="text-sm text-gray-500 mt-1">
                            {match.phase === 'preliminary' ? '予選' : '決勝'} - {match.block_name}
                          </p>
                        </div>
                        <div className="text-right">
                          <div className="flex items-center gap-1 text-sm text-gray-600 court-info">
                            <MapPin className="h-4 w-4" />
                            {match.court_name}
                          </div>
                          <div className="flex items-center gap-1 text-sm text-gray-600 mt-1 court-info">
                            <Clock className="h-4 w-4" />
                            {match.start_time}
                          </div>
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent>
                      {/* 対戦カード */}
                      <div className="mb-4 p-3 bg-gray-50 rounded-md">
                        <div className="flex items-center gap-2 mb-2">
                          <Users className="h-4 w-4 text-gray-600" />
                          <span className="text-sm font-medium text-gray-600">対戦カード</span>
                        </div>
                        <div className="text-center">
                          <div className="font-bold text-lg team-name">{match.team1_omission}</div>
                          <div className="text-gray-600 text-sm my-1">vs</div>
                          <div className="font-bold text-lg team-name">{match.team2_omission}</div>
                        </div>
                      </div>

                      {/* QRコード */}
                      <div className="text-center">
                        <img
                          src={match.qr_image_url}
                          alt={`QRコード: ${match.match_code}`}
                          className="w-48 h-48 mx-auto border-2 border-gray-300 rounded-md qr-code-image"
                          loading="lazy"
                        />
                        <p className="text-xs text-gray-500 mt-2 no-print">
                          審判はこのQRコードをスキャンして結果を入力
                        </p>
                      </div>

                      {/* 試合日（印刷用） */}
                      <div className="print-only text-center mt-2 text-sm text-gray-600">
                        <Calendar className="h-4 w-4 inline mr-1" />
                        {match.tournament_date}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </>
      )}

      {/* 印刷用スタイル */}
      <style jsx global>{`
        @media print {
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }

          .no-print {
            display: none !important;
          }

          .print-only {
            display: block !important;
          }

          @page {
            size: A4 portrait;
            margin: 25mm 15mm 25mm 15mm;
          }

          /* 印刷時の基本設定 */
          html, body {
            height: 100%;
            margin: 0;
            padding: 0;
          }

          /* コンテナの余白を適切に設定 */
          .container {
            padding: 0 !important;
            margin: 0 !important;
            max-width: 100% !important;
          }

          /* ページラッパー - 各ページごとに区切る */
          .print-page {
            page-break-after: always !important;
            break-after: page !important;
            padding: 8mm !important;
            box-sizing: border-box !important;
          }

          /* 最後のページは改ページしない */
          .print-page:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }

          /* 2列5行のグリッドレイアウト（1ページに10試合） */
          .print-container {
            display: block !important;
            margin: 0 !important;
            padding: 0 !important;
            max-width: 100% !important;
            box-sizing: border-box !important;
          }

          /* ページごとのグリッドグループ */
          .print-card {
            display: inline-block !important;
            width: calc(50% - 2.5mm) !important;
            vertical-align: top !important;
            break-inside: avoid;
            page-break-inside: avoid;
            margin: 0 0 5mm 0 !important;
            height: auto;
            border: 1px solid #ccc !important;
            padding: 2.5mm !important;
            box-sizing: border-box;
          }

          /* 左側のカード（奇数番目）に右マージン */
          .print-card:nth-child(odd) {
            margin-right: 5mm !important;
          }

          /* CardHeader と CardContent の余白調整 */
          .print-card > div {
            padding: 1mm !important;
            margin: 0 !important;
          }

          .print-card .pb-3 {
            padding-bottom: 1mm !important;
          }

          /* QRコードサイズ - 読み取り可能なサイズを維持 */
          .qr-code-image {
            width: 80px !important;
            height: 80px !important;
            margin: 1.5mm auto !important;
          }

          /* フォントサイズ調整 - 読みやすいサイズに */
          .match-title {
            font-size: 22px !important;
            margin-bottom: 1mm !important;
            font-weight: bold !important;
            line-height: 1.3 !important;
          }

          .team-name {
            font-size: 18px !important;
            line-height: 1.4 !important;
            font-weight: bold !important;
            padding: 1.5mm 0 !important;
          }

          /* コート情報と時間 */
          .court-info {
            font-size: 16px !important;
            font-weight: 600 !important;
            line-height: 1.3 !important;
          }

          /* 対戦カード部分 */
          .print-card .mb-4 {
            margin-bottom: 1.5mm !important;
            padding: 2mm !important;
            min-height: 28mm !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: center !important;
          }

          /* アイコンサイズ */
          .print-card svg {
            width: 14px !important;
            height: 14px !important;
          }

          /* vsの余白 */
          .print-card .my-1 {
            margin-top: 1mm !important;
            margin-bottom: 1mm !important;
            font-size: 15px !important;
          }

          /* ヘッダー内の余白調整 */
          .print-card .text-sm {
            margin-top: 0.5mm !important;
            font-size: 14px !important;
            line-height: 1.3 !important;
          }

          /* 試合日表示の余白 */
          .print-only {
            margin-top: 1mm !important;
            font-size: 13px !important;
          }

          /* 対戦カード内のタイトル */
          .print-card .mb-4 .text-sm {
            font-size: 15px !important;
          }
        }

        .print-only {
          display: none;
        }
      `}</style>
    </div>
  );
}
