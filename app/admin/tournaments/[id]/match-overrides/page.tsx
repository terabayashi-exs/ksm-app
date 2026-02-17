// app/admin/tournaments/[id]/match-overrides/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Pencil, ArrowLeft, AlertCircle, List } from 'lucide-react';
import { MatchOverrideDialog } from '@/components/features/admin/MatchOverrideDialog';
import { BulkMatchOverrideDialog } from '@/components/features/admin/BulkMatchOverrideDialog';

interface MatchTemplate {
  match_code: string;
  phase: string;
  round_name: string;
  team1_source: string | null;
  team2_source: string | null;
  team1_display_name: string;
  team2_display_name: string;
}

interface MatchOverride {
  override_id: number;
  match_code: string;
  team1_source_override: string | null;
  team2_source_override: string | null;
  override_reason: string | null;
  round_name: string | null;
  original_team1_source: string | null;
  original_team2_source: string | null;
}

export default function MatchOverridesPage() {
  const params = useParams();
  const router = useRouter();
  const tournamentId = parseInt(params.id as string);

  const [templates, setTemplates] = useState<MatchTemplate[]>([]);
  const [overrides, setOverrides] = useState<MatchOverride[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedMatch, setSelectedMatch] = useState<{
    matchCode: string;
    team1Source: string | null;
    team2Source: string | null;
    originalTeam1Source: string | null;
    originalTeam2Source: string | null;
  } | null>(null);
  const [isBulkDialogOpen, setIsBulkDialogOpen] = useState(false);

  useEffect(() => {
    loadData();
  }, [tournamentId]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadData = async () => {
    setIsLoading(true);
    try {
      // 決勝トーナメントのテンプレートを取得
      const tournamentResponse = await fetch(`/api/tournaments/${tournamentId}`);
      const tournamentData = await tournamentResponse.json();

      if (!tournamentData.success) {
        throw new Error('大会情報の取得に失敗しました');
      }

      const formatId = tournamentData.data.format_id;

      const templatesResponse = await fetch(`/api/tournaments/formats/${formatId}/templates`);
      const templatesData = await templatesResponse.json();

      if (templatesData.success && templatesData.data && templatesData.data.templates && Array.isArray(templatesData.data.templates)) {
        // 選出条件が設定されている試合のみフィルタリング（team1_source または team2_source が存在する試合）
        // 予選トーナメント・決勝トーナメント両方に対応
        const matchesWithSource = templatesData.data.templates.filter(
          (t: MatchTemplate) => t.team1_source || t.team2_source
        );
        setTemplates(matchesWithSource);
      } else {
        console.error('テンプレートデータの取得に失敗:', templatesData);
        setTemplates([]);
      }

      // オーバーライド情報を取得
      const overridesResponse = await fetch(`/api/tournaments/${tournamentId}/match-overrides`);
      const overridesData = await overridesResponse.json();

      if (overridesData.success) {
        setOverrides(overridesData.data);
      }
    } catch (error) {
      console.error('データ取得エラー:', error);
      alert('データの取得に失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditMatch = (matchCode: string, originalTeam1Source: string | null, originalTeam2Source: string | null) => {
    // オーバーライドがあればその値を、なければ元の値を使用
    const override = overrides.find(o => o.match_code === matchCode);

    setSelectedMatch({
      matchCode,
      team1Source: override?.team1_source_override || originalTeam1Source,
      team2Source: override?.team2_source_override || originalTeam2Source,
      originalTeam1Source,
      originalTeam2Source,
    });
  };

  const getCurrentSource = (matchCode: string, position: 'team1' | 'team2', originalSource: string | null): string | null => {
    const override = overrides.find(o => o.match_code === matchCode);
    if (override) {
      return position === 'team1' ? override.team1_source_override : override.team2_source_override;
    }
    return originalSource;
  };

  const hasOverride = (matchCode: string): boolean => {
    return overrides.some(o => o.match_code === matchCode);
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-8">
        <p className="text-center text-gray-500">読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 max-w-6xl">
      <div className="mb-6">
        <Button
          variant="outline"
          onClick={() => router.push('/admin')}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          ダッシュボードに戻る
        </Button>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">試合進出条件の設定</h1>
            <p className="text-gray-600">
              トーナメント形式の各試合について、進出元チームを個別に設定できます。
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => setIsBulkDialogOpen(true)}
          >
            <List className="h-4 w-4 mr-2" />
            一括変更
          </Button>
        </div>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>使い方</CardTitle>
          <CardDescription>
            チーム辞退などにより進出条件を変更する必要がある場合に使用します
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="list-disc list-inside space-y-2 text-sm text-gray-700">
            <li><strong>個別変更</strong>: 各試合の「編集」ボタンをクリックして進出条件を変更できます</li>
            <li><strong>一括変更</strong>: 「一括変更」ボタンで複数の試合の進出条件を一度に変更できます（例: Aブロック3位→Bブロック4位）</li>
            <li>オーバーライドが設定されていない場合は、元のテンプレート条件が使用されます</li>
            <li>変更を削除すると元の条件に戻ります</li>
            <li>
              変更後は、「チーム進出処理」を実行してトーナメント試合にチームを割り当ててください
            </li>
          </ul>
        </CardContent>
      </Card>

      {templates.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-gray-500">選出条件が設定された試合が見つかりません</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {templates.map(template => {
            const currentTeam1Source = getCurrentSource(template.match_code, 'team1', template.team1_source);
            const currentTeam2Source = getCurrentSource(template.match_code, 'team2', template.team2_source);
            const isOverridden = hasOverride(template.match_code);
            const override = overrides.find(o => o.match_code === template.match_code);

            return (
              <Card key={template.match_code} className={isOverridden ? 'border-blue-300 bg-blue-50/50' : ''}>
                <CardContent className="py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-lg font-semibold">{template.match_code}</h3>
                        <Badge variant="outline">{template.round_name}</Badge>
                        {isOverridden && <Badge className="bg-blue-500">オーバーライド設定済み</Badge>}
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-gray-500 mb-1">チーム1 進出元</p>
                          <div className="flex items-center gap-2">
                            {isOverridden && currentTeam1Source !== template.team1_source && (
                              <>
                                <span className="text-gray-400 line-through">{template.team1_source}</span>
                                <span className="text-blue-600 font-semibold">→ {currentTeam1Source}</span>
                              </>
                            )}
                            {(!isOverridden || currentTeam1Source === template.team1_source) && (
                              <span className="font-medium">{currentTeam1Source || '未設定'}</span>
                            )}
                          </div>
                          <p className="text-xs text-gray-400 mt-1">表示名: {template.team1_display_name}</p>
                        </div>

                        <div>
                          <p className="text-gray-500 mb-1">チーム2 進出元</p>
                          <div className="flex items-center gap-2">
                            {isOverridden && currentTeam2Source !== template.team2_source && (
                              <>
                                <span className="text-gray-400 line-through">{template.team2_source}</span>
                                <span className="text-blue-600 font-semibold">→ {currentTeam2Source}</span>
                              </>
                            )}
                            {(!isOverridden || currentTeam2Source === template.team2_source) && (
                              <span className="font-medium">{currentTeam2Source || '未設定'}</span>
                            )}
                          </div>
                          <p className="text-xs text-gray-400 mt-1">表示名: {template.team2_display_name}</p>
                        </div>
                      </div>

                      {override?.override_reason && (
                        <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-sm">
                          <div className="flex items-start gap-2">
                            <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5" />
                            <div>
                              <p className="font-semibold text-yellow-800">変更理由</p>
                              <p className="text-yellow-700">{override.override_reason}</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditMatch(template.match_code, template.team1_source, template.team2_source)}
                    >
                      <Pencil className="h-4 w-4 mr-2" />
                      編集
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {selectedMatch && (
        <MatchOverrideDialog
          open={!!selectedMatch}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedMatch(null);
            }
          }}
          tournamentId={tournamentId}
          matchCode={selectedMatch.matchCode}
          currentTeam1Source={selectedMatch.team1Source}
          currentTeam2Source={selectedMatch.team2Source}
          originalTeam1Source={selectedMatch.originalTeam1Source}
          originalTeam2Source={selectedMatch.originalTeam2Source}
          onSave={loadData}
        />
      )}

      <BulkMatchOverrideDialog
        open={isBulkDialogOpen}
        onOpenChange={setIsBulkDialogOpen}
        tournamentId={tournamentId}
        onSave={loadData}
      />
    </div>
  );
}
