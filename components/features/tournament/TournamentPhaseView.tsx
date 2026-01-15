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
  phase: 'preliminary' | 'final';
  phaseName: string; // 表示用の名称（例：「予選」「決勝」）
}

interface MatchData {
  match_type: string;
  phase: string;
  block_name: string;
  display_round_name: string;
}

/**
 * 予選・決勝を形式に応じて表示するコンポーネント
 * - リーグ戦形式の場合：戦績表を表示
 * - トーナメント形式の場合：トーナメント表を表示
 */
export default function TournamentPhaseView({
  tournamentId,
  phase,
  phaseName
}: TournamentPhaseViewProps) {
  const [matchType, setMatchType] = useState<'league' | 'tournament' | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMatches, setHasMatches] = useState(false);

  useEffect(() => {
    async function fetchPhaseType() {
      try {
        setLoading(true);
        setError(null);

        // 大会情報を取得してフォーマットタイプを判定
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

        console.log(`[TournamentPhaseView] Tournament ${tournamentId}, Phase ${phase}:`);
        console.log(`[TournamentPhaseView] preliminary_format_type: "${tournament.preliminary_format_type}", final_format_type: "${tournament.final_format_type}"`);

        // 試合データの存在確認
        const matchesResponse = await fetch(`/api/tournaments/${tournamentId}/public-matches`, {
          cache: 'no-store'
        });

        if (!matchesResponse.ok) {
          throw new Error('試合データの取得に失敗しました');
        }

        const matchesData = await matchesResponse.json();

        if (!matchesData.success || !matchesData.data) {
          throw new Error('試合データが見つかりません');
        }

        // 指定されたphaseの試合を抽出
        const phaseMatches = matchesData.data.filter((match: MatchData) => match.phase === phase);

        console.log(`[TournamentPhaseView] Found ${phaseMatches.length} matches for this phase`);

        if (phaseMatches.length === 0) {
          setHasMatches(false);
          setLoading(false);
          return;
        }

        setHasMatches(true);

        // m_tournament_formatsのpreliminary_format_type/final_format_typeで判定
        const formatType = phase === 'preliminary'
          ? tournament.preliminary_format_type
          : tournament.final_format_type;

        console.log(`[TournamentPhaseView] Format type for ${phase}: "${formatType}"`);

        if (formatType === 'league') {
          console.log(`[TournamentPhaseView] Detected LEAGUE format`);
          setMatchType('league');
        } else if (formatType === 'tournament') {
          console.log(`[TournamentPhaseView] Detected TOURNAMENT format`);
          setMatchType('tournament');
        } else {
          // フォールバック: 値が設定されていない場合はデフォルト動作
          console.warn(`[TournamentPhaseView] Unknown format type "${formatType}", defaulting to league for preliminary, tournament for final`);
          setMatchType(phase === 'preliminary' ? 'league' : 'tournament');
        }

        setLoading(false);
      } catch (err) {
        console.error('Phase type fetch error:', err);
        setError(err instanceof Error ? err.message : '不明なエラーが発生しました');
        setLoading(false);
      }
    }

    fetchPhaseType();
  }, [tournamentId, phase]);

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

  if (!hasMatches) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          {phaseName}の試合データがありません。
        </AlertDescription>
      </Alert>
    );
  }

  // match_typeに応じてコンポーネントを表示
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
        <div className="mb-4 text-sm text-muted-foreground">
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
        <div className="grid md:grid-cols-2 gap-6 mt-8">
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
