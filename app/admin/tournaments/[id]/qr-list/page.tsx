'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Printer,
  Filter,
  Calendar,
  Clock,
  MapPin,
  AlertCircle,
  ChevronRight,
  Home
} from 'lucide-react';

interface QRMatch {
  match_id: number;
  match_code: string;
  match_block_id: number;
  court_number: number;
  court_name: string;
  location_display: string;
  start_time: string;
  tournament_date: string;
  match_status: string;
  block_name: string;
  round_name: string | null;
  phase: string;
  phase_name: string;
  team1_name: string;
  team2_name: string;
  team1_omission: string;
  team2_omission: string;
  referee_url: string;
  qr_image_url: string;
  venue_name: string | null;
  matchday: number | null;
  period_labels: string[];
}

interface TournamentPhaseInfo {
  id: string;
  name: string;
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
  const [filterMatchday, setFilterMatchday] = useState<string>('all');
  const [includeCompleted, setIncludeCompleted] = useState(false);
  const [validity, setValidity] = useState<{ validFrom: string; validUntil: string } | null>(null);
  const [phaseList, setPhaseList] = useState<TournamentPhaseInfo[]>([]);
  const [loadedQrIds, setLoadedQrIds] = useState<Set<number>>(new Set());
  const loadedQrCount = filteredMatches.filter(m => loadedQrIds.has(m.match_id)).length;
  const allQrLoaded = filteredMatches.length > 0 && loadedQrCount >= filteredMatches.length;

  const fetchMatches = useCallback(async () => {
    try {
      setLoading(true);

      // 大会情報からphasesを取得
      const tournamentRes = await fetch(`/api/tournaments/${tournamentId}`);
      const tournamentData = await tournamentRes.json();
      if (tournamentData.success && tournamentData.data?.phases?.phases) {
        const sorted = [...tournamentData.data.phases.phases]
          .sort((a: { order: number }, b: { order: number }) => a.order - b.order);
        setPhaseList(sorted.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })));
      }

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
  }, [tournamentId, includeCompleted]);

  const applyFilters = useCallback(() => {
    let filtered = [...matches];

    if (filterPhase !== 'all') {
      filtered = filtered.filter(m => m.phase === filterPhase);
    }

    if (filterBlock !== 'all') {
      filtered = filtered.filter(m => m.block_name === filterBlock);
    }

    if (filterMatchday !== 'all') {
      const md = parseInt(filterMatchday);
      filtered = filtered.filter(m => m.matchday === md);
    }

    setFilteredMatches(filtered);
  }, [matches, filterPhase, filterBlock, filterMatchday]);

  useEffect(() => {
    fetchMatches();
  }, [fetchMatches]);

  useEffect(() => {
    applyFilters();
  }, [applyFilters]);

  const handlePrint = () => {
    window.print();
  };

  // 日付の短縮フォーマット（M/d）
  const formatShortDate = (dateStr: string): string => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  // フェーズIDから表示名を取得
  const getPhaseName = (phaseId: string): string => {
    const found = phaseList.find(p => p.id === phaseId);
    if (found) return found.name;
    if (phaseId === 'preliminary') return '予選';
    if (phaseId === 'final') return '決勝';
    return phaseId;
  };

  const uniquePhases = Array.from(new Set(matches.map(m => m.phase)));

  // ブロックをmatch_block_idの昇順でソート（表示名も保持）
  const blockMap = new Map<string, { matchBlockId: number; displayName: string }>();
  matches.forEach(m => {
    if (!blockMap.has(m.block_name)) {
      blockMap.set(m.block_name, {
        matchBlockId: m.match_block_id,
        displayName: m.round_name || m.block_name
      });
    }
  });
  const uniqueBlocks = Array.from(blockMap.entries())
    .sort((a, b) => a[1].matchBlockId - b[1].matchBlockId);

  // 節（matchday）の一覧を取得
  const uniqueMatchdays = Array.from(new Set(matches.map(m => m.matchday).filter((md): md is number => md !== null))).sort((a, b) => a - b);
  const hasMatchdays = uniqueMatchdays.length > 1;

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
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
    <div className="min-h-screen bg-white">
      {/* ヘッダー（印刷時非表示） */}
      <div className="bg-base-800 border-b-[3px] border-primary no-print">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
            <h1 className="text-3xl font-bold text-white">審判用QRコード一覧</h1>
            <p className="text-sm text-white/70 mt-1">
              試合前・進行中の試合のQRコードを表示します（全{filteredMatches.length}試合）
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 print:px-4 print:py-4">
        {/* パンくず（印刷時非表示） */}
        <nav className="flex flex-wrap items-center gap-1.5 text-sm mb-6 no-print">
          <Link href="/" className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 transition-colors whitespace-nowrap"><Home className="h-3.5 w-3.5" /><span>Home</span></Link>
          <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <Link href="/my?tab=admin" className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 transition-colors whitespace-nowrap">マイダッシュボード</Link>
          <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <span className="inline-flex items-center px-2.5 py-1.5 rounded-md bg-primary/10 text-primary font-medium">QRコード一覧</span>
        </nav>

        {validity && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm font-medium mb-6 no-print">
            <Clock className="h-4 w-4 shrink-0" />
            QRコード有効期限: {new Date(validity.validUntil).toLocaleString('ja-JP', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit'
            })} まで
          </div>
        )}

        <div className="no-print mb-6">
          <div className="flex items-center justify-end mb-4">
            <Button variant="outline" onClick={handlePrint} disabled={!allQrLoaded} className="flex items-center gap-2">
              <Printer className="h-4 w-4" />
              {allQrLoaded ? '印刷' : `QR読込中... (${loadedQrCount}/${filteredMatches.length})`}
            </Button>
          </div>

        {/* 完了試合表示チェックボックス */}
        <div className="mb-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={includeCompleted}
              onChange={(e) => setIncludeCompleted(e.target.checked)}
              className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
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
            <div className={`grid grid-cols-1 ${hasMatchdays ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-4`}>
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
                      {getPhaseName(phase)}
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
                  {uniqueBlocks.map(([blockName, info]) => (
                    <option key={blockName} value={blockName}>{info.displayName}</option>
                  ))}
                </select>
              </div>

              {hasMatchdays && (
                <div>
                  <label className="block text-sm font-medium mb-2">節</label>
                  <select
                    value={filterMatchday}
                    onChange={(e) => setFilterMatchday(e.target.value)}
                    className="w-full p-2 border rounded-md"
                  >
                    <option value="all">すべて</option>
                    {uniqueMatchdays.map(md => (
                      <option key={md} value={md}>第{md}節</option>
                    ))}
                  </select>
                </div>
              )}
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
          {/* 8枚ごとにページセクションで区切る（A4に2列×4行） */}
          {Array.from({ length: Math.ceil(filteredMatches.length / 8) }, (_, pageIndex) => (
            <div key={pageIndex} className="print-page">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 print-container">
                {filteredMatches.slice(pageIndex * 8, (pageIndex + 1) * 8).map((match) => (
                  <Card
                    key={match.match_id}
                    className="print-card"
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <CardTitle className="text-2xl font-bold text-primary match-title">
                          {match.match_code}
                        </CardTitle>
                        <div className="flex items-center gap-3 text-base font-semibold text-gray-700 court-info">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-4 w-4" />
                            {formatShortDate(match.tournament_date)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            {match.start_time}
                          </span>
                          <span className="flex items-center gap-1">
                            <MapPin className="h-4 w-4" />
                            {match.location_display}
                          </span>
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent className="pt-0">
                      {/* 対戦カード + スコア記入欄（縦配置） */}
                      <div className="mb-3 p-2 bg-gray-50 rounded-md matchup-area">
                        {/* チーム名（1行） */}
                        <div className="flex items-center justify-center gap-3 mb-2">
                          <span className="font-bold text-lg team-name text-center flex-1 truncate max-w-[40%]">{match.team1_name}</span>
                          <span className="text-gray-500 text-sm font-medium shrink-0">vs</span>
                          <span className="font-bold text-lg team-name text-center flex-1 truncate max-w-[40%]">{match.team2_name}</span>
                        </div>

                        {/* ピリオド別スコア記入欄（縦配置） */}
                        {match.period_labels.length > 0 && (
                          <div className="score-vertical-area">
                            {match.period_labels.map((label, i) => (
                              <div key={i} className="flex items-center justify-center gap-3 score-row">
                                <div className="flex items-center gap-1 flex-1 justify-end">
                                  <span className="text-xs text-gray-500 period-label">{label}</span>
                                  <div className="border border-gray-300 bg-white w-10 h-6 score-input-box"></div>
                                </div>
                                <span className="text-gray-300 text-xs shrink-0 score-separator">-</span>
                                <div className="flex items-center gap-1 flex-1 justify-start">
                                  <div className="border border-gray-300 bg-white w-10 h-6 score-input-box"></div>
                                  <span className="text-xs text-gray-500 period-label">{label}</span>
                                </div>
                              </div>
                            ))}
                            {/* 合計行 */}
                            <div className="flex items-center justify-center gap-3 score-row mt-1 pt-1 border-t border-gray-300">
                              <div className="flex items-center gap-1 flex-1 justify-end">
                                <span className="text-xs font-bold text-gray-700 period-label">計</span>
                                <div className="border-2 border-gray-400 bg-white w-10 h-6 score-input-box"></div>
                              </div>
                              <span className="text-gray-300 text-xs shrink-0 score-separator">-</span>
                              <div className="flex items-center gap-1 flex-1 justify-start">
                                <div className="border-2 border-gray-400 bg-white w-10 h-6 score-input-box"></div>
                                <span className="text-xs font-bold text-gray-700 period-label">計</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* QRコード + 備考欄（横並び） */}
                      <div className="flex items-stretch gap-3 qr-remarks-area flex-1">
                        <div className="shrink-0 flex flex-col items-center qr-code-wrapper">
                          <Image
                            src={match.qr_image_url}
                            alt={`QRコード: ${match.match_code}`}
                            width={192}
                            height={192}
                            className="border-2 border-gray-300 rounded-md qr-code-image"
                            loading="eager"
                            unoptimized
                            onLoad={() => setLoadedQrIds(prev => new Set(prev).add(match.match_id))}
                          />
                          <p className="text-xs text-gray-500 mt-1 text-center no-print">
                            QRスキャンで結果入力
                          </p>
                        </div>
                        <div className="flex-1 border border-gray-300 rounded-md p-1 remarks-box flex flex-col">
                          <div className="text-xs text-gray-400 mb-1 remarks-title">備考（得点者・警告等）</div>
                          <div className="flex-1 min-h-[60px] remarks-content"></div>
                        </div>
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

          @page {
            size: A4 portrait;
            margin: 8mm 8mm 8mm 8mm;
          }

          /* コンテナリセット */
          .container {
            padding: 0 !important;
            margin: 0 !important;
            max-width: 100% !important;
          }

          /* ページラッパー: 1ページ = 2列×4行のグリッド */
          .print-page {
            page-break-after: always !important;
            break-after: page !important;
            padding: 0 !important;
            box-sizing: border-box !important;
          }

          .print-page:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }

          /* CSS Gridで2列×4行を厳密に制御 */
          .print-container {
            display: grid !important;
            grid-template-columns: 1fr 1fr !important;
            grid-template-rows: repeat(4, 1fr) !important;
            gap: 2mm !important;
            margin: 0 !important;
            padding: 0 !important;
            max-width: 100% !important;
            box-sizing: border-box !important;
            /* A4 - 余白(上下16mm) = 281mm を4行で使い切る */
            height: 281mm !important;
          }

          /* カード: グリッドセルに収まる固定サイズ */
          .print-card {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
            margin: 0 !important;
            border: 1px solid #999 !important;
            padding: 2mm !important;
            box-sizing: border-box !important;
            overflow: hidden !important;
            display: flex !important;
            flex-direction: column !important;
          }

          /* CardHeader/CardContent の余白調整 */
          .print-card > div {
            padding: 1mm !important;
            margin: 0 !important;
          }

          .print-card .pb-2 {
            padding-bottom: 0.5mm !important;
          }

          .print-card .pt-0 {
            padding-top: 0 !important;
          }

          /* 試合コード */
          .match-title {
            font-size: 18px !important;
            margin-bottom: 0 !important;
            font-weight: bold !important;
            line-height: 1.2 !important;
          }

          /* 日時・会場情報 */
          .court-info {
            font-size: 11px !important;
            font-weight: 600 !important;
            line-height: 1.3 !important;
            gap: 4px !important;
          }

          .court-info svg {
            width: 10px !important;
            height: 10px !important;
          }

          /* 対戦カード + スコア欄 */
          .matchup-area {
            margin-bottom: 1mm !important;
            padding: 1mm 2mm !important;
          }

          .team-name {
            font-size: 12px !important;
            line-height: 1.2 !important;
            font-weight: bold !important;
            max-width: 40% !important;
          }

          /* スコア記入欄（縦配置） */
          .score-vertical-area {
            margin-top: 1mm !important;
          }

          .score-row {
            margin-bottom: 0.5mm !important;
            gap: 2mm !important;
          }

          .score-input-box {
            width: 10mm !important;
            height: 5mm !important;
          }

          .period-label {
            font-size: 7px !important;
          }

          .score-separator {
            font-size: 8px !important;
          }

          /* CardContent を flex-1 にしてカード内の残りスペースを埋める */
          .print-card .pt-0 {
            flex: 1 !important;
            display: flex !important;
            flex-direction: column !important;
          }

          /* QRコード + 備考欄 */
          .qr-remarks-area {
            gap: 2mm !important;
            flex: 1 !important;
            align-items: stretch !important;
            margin-bottom: 2mm !important;
          }

          .qr-code-wrapper {
            justify-content: center !important;
          }

          .qr-code-image {
            width: 30mm !important;
            height: 30mm !important;
          }

          .remarks-box {
            padding: 1mm !important;
            flex: 1 !important;
            display: flex !important;
            flex-direction: column !important;
          }

          .remarks-title {
            font-size: 7px !important;
            margin-bottom: 0 !important;
          }

          .remarks-content {
            flex: 1 !important;
          }

          /* アイコンサイズ */
          .print-card svg {
            width: 10px !important;
            height: 10px !important;
          }
        }
      `}</style>
      </div>
    </div>
  );
}
