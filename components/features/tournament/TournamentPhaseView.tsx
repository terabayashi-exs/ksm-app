// components/features/tournament/TournamentPhaseView.tsx
'use client';

import { useEffect, useState } from 'react';
import TournamentResults from './TournamentResults';
import TournamentBracket from './TournamentBracket';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, Loader2, Trophy, Download } from 'lucide-react';

interface TournamentPhaseViewProps {
  tournamentId: number;
  phase: string; // フェーズID（例：'preliminary', 'final'）
  phaseName: string; // 表示用の名称（例：「予選」「決勝トーナメント」）
  formatType?: 'league' | 'tournament'; // 形式タイプ（phases JSONから直接渡す）
}

/**
 * フェーズを形式に応じて表示するコンポーネント
 * - リーグ戦形式の場合：戦績表を表示
 * - トーナメント形式の場合：トーナメント表を表示
 */
export default function TournamentPhaseView({
  tournamentId,
  phase,
  phaseName,
  formatType: formatTypeProp
}: TournamentPhaseViewProps) {
  const [matchType, setMatchType] = useState<'league' | 'tournament' | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function resolveFormatType() {
      try {
        setLoading(true);
        setError(null);

        // formatTypePropが直接渡されている場合はAPI呼び出し不要
        if (formatTypeProp) {
          console.log(`[TournamentPhaseView] Phase ${phase}: formatType from props = "${formatTypeProp}"`);
          setMatchType(formatTypeProp);
          setLoading(false);
          return;
        }

        // formatTypePropが未指定の場合のみAPIから判定
        const tournamentResponse = await fetch(`/api/tournaments/${tournamentId}`, {
          cache: 'no-store'
        });

        if (!tournamentResponse.ok) {
          throw new Error('大会情報の取得に失敗しました');
        }

        const tournamentData = await tournamentResponse.json();

        if (!tournamentData.success || !tournamentData.data) {
          throw new Error('大会情報が見つかりません');
        }

        const tournament = tournamentData.data;

        // phases JSONからフェーズIDに対応するformat_typeを取得
        let resolvedFormatType: string | undefined;

        if (tournament.phases?.phases) {
          const phaseConfig = tournament.phases.phases.find((p: { id: string }) => p.id === phase);
          resolvedFormatType = phaseConfig?.format_type;
        }

        console.log(`[TournamentPhaseView] Phase ${phase}: resolved formatType = "${resolvedFormatType}"`);

        if (resolvedFormatType === 'league') {
          setMatchType('league');
        } else if (resolvedFormatType === 'tournament') {
          setMatchType('tournament');
        } else {
          // フォールバック: デフォルトはリーグ戦
          console.warn(`[TournamentPhaseView] Unknown format type "${resolvedFormatType}", defaulting to league`);
          setMatchType('league');
        }

        setLoading(false);
      } catch (err) {
        console.error('Phase type fetch error:', err);
        setError(err instanceof Error ? err.message : '不明なエラーが発生しました');
        setLoading(false);
      }
    }

    resolveFormatType();
  }, [tournamentId, phase, formatTypeProp]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">読み込み中...</span>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  // match_typeに応じてコンポーネントを表示
  // 試合データの有無は各子コンポーネント内でハンドリングされる
  if (matchType === 'league') {
    return (
      <div>
        <div className="mb-4 text-sm text-muted-foreground">
          {phaseName}はリーグ戦形式です。各チームの対戦結果を戦績表で表示しています。
        </div>
        <TournamentResults tournamentId={tournamentId} phase={phase} />
      </div>
    );
  } else if (matchType === 'tournament') {
    const handlePrint = () => {
      window.print();
    };

    return (
      <div className="space-y-6">
        <div className="mb-4 text-sm text-muted-foreground no-print">
          {phaseName}はトーナメント形式です。トーナメント表で試合の進行状況を表示しています。
        </div>

        {/* ヘッダー */}
        <div className="text-center no-print">
          <div className="flex items-center justify-center mb-2">
            <Trophy className="h-6 w-6 mr-2 text-yellow-600" />
            <h2 className="text-2xl font-bold text-foreground">
              {phaseName}トーナメント
            </h2>
            <Button
              onClick={handlePrint}
              variant="outline"
              size="sm"
              className="flex items-center gap-2 ml-4"
            >
              <Download className="h-4 w-4" />
              PDF出力（印刷）
            </Button>
          </div>
        </div>

        <TournamentBracket tournamentId={tournamentId} phase={phase} />

        {/* 操作ガイドと注意事項 */}
        <div className="grid md:grid-cols-2 gap-6 mt-8 no-print">
          <Card className="bg-green-50 border-green-200">
            <CardContent className="pt-4">
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 mt-0.5">
                  <div className="h-2 w-2 bg-green-400 rounded-full"></div>
                </div>
                <div className="text-sm text-green-700">
                  <p className="font-medium mb-1">PDF出力方法</p>
                  <ul className="list-disc list-inside space-y-1 text-green-600">
                    <li>「PDF出力（印刷）」ボタンをクリック</li>
                    <li>印刷ダイアログで「送信先」を「PDFに保存」を選択</li>
                    <li>用紙サイズを「A4」、向きを「横」に設定</li>
                    <li>「詳細設定」で「背景のグラフィック」をオンにする</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="pt-4">
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 mt-0.5">
                  <div className="h-2 w-2 bg-blue-400 rounded-full"></div>
                </div>
                <div className="text-sm text-blue-700">
                  <p className="font-medium mb-1">トーナメント表の見方</p>
                  <ul className="list-disc list-inside space-y-1 text-blue-600">
                    <li>実線は勝利チームの勝ち上がり、点線は敗者の進出先（3位決定戦）</li>
                    <li>太字は勝利チーム、数字は得点を表示</li>
                    <li>［T1］などは試合コードを表示</li>
                    <li>各ブロック上位2チームが決勝トーナメントに進出</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return null;
}
