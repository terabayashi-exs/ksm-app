'use client';

import { useState } from 'react';
import { Check, Info, Users, Trophy, Lock } from 'lucide-react';
import FormatDetailBadges, { getSportIcon } from '@/components/features/tournament-format/FormatDetailBadges';

interface TournamentFormat {
  format_id: number;
  format_name: string;
  target_team_count: number;
  format_description?: string;
  template_count?: number;
  sport_code?: string;
  default_match_duration?: number | null;
  default_break_duration?: number | null;
  matchday_count?: number;
  phase_stats?: Array<{ phase: string; phase_name: string; order: number; block_count: number; max_court_number: number | null }>;
  visibility?: string;
  isAccessible?: boolean;
}

interface FormatSelectionModalProps {
  currentFormatId: number;
  currentFormatName: string;
  availableFormats: TournamentFormat[];
  onSelect: (formatId: number, formatName: string) => void;
  onCancel: () => void;
}

export function FormatSelectionModal({
  currentFormatId,
  currentFormatName,
  availableFormats,
  onSelect,
  onCancel
}: FormatSelectionModalProps) {
  const [selectedFormatId, setSelectedFormatId] = useState<number | null>(null);

  // 現在のフォーマット以外をフィルタリング
  const selectableFormats = availableFormats.filter(f => f.format_id !== currentFormatId);

  // チーム数でソート
  const sortedFormats = [...selectableFormats].sort((a, b) => a.target_team_count - b.target_team_count);

  const selectedFormat = sortedFormats.find(f => f.format_id === selectedFormatId);

  const handleConfirm = () => {
    if (selectedFormat) {
      onSelect(selectedFormat.format_id, selectedFormat.format_name);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* ヘッダー */}
        <div className="p-6 border-b bg-gradient-to-r from-blue-50 to-blue-100">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            フォーマット変更
          </h2>
          <p className="text-sm text-gray-600">
            変更先のフォーマットを選択してください
          </p>
          <div className="mt-3 flex items-center gap-2 text-sm text-gray-700 bg-white px-3 py-2 rounded-md">
            <Trophy className="h-4 w-4 text-blue-600" />
            <span>現在: <strong>{currentFormatName}</strong></span>
          </div>
        </div>

        {/* コンテンツ */}
        <div className="flex-1 overflow-y-auto p-6">
          {sortedFormats.length === 0 ? (
            <div className="text-center py-12">
              <Trophy className="w-12 h-12 mx-auto text-gray-400 mb-4" />
              <p className="text-gray-600">変更可能な他のフォーマットがありません</p>
              <p className="text-sm text-gray-500 mt-2">
                新しいフォーマットを作成してください
              </p>
            </div>
          ) : (
            <>
              <div className="mb-4 p-4 bg-orange-50 border border-orange-200 rounded-lg">
                <div className="flex items-start gap-2">
                  <Info className="h-5 w-5 text-orange-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-orange-900">
                      注意事項
                    </p>
                    <p className="text-sm text-orange-700 mt-1">
                      フォーマットを変更すると、全ての試合データ・ブロック情報・組合せ情報が削除されます。
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                {sortedFormats.map((format) => {
                  const isSelected = selectedFormatId === format.format_id;
                  const locked = format.isAccessible === false;

                  return (
                    <button
                      key={format.format_id}
                      onClick={() => !locked && setSelectedFormatId(format.format_id)}
                      disabled={locked}
                      className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                        locked
                          ? 'opacity-50 cursor-not-allowed border-gray-200 bg-gray-50'
                          : isSelected
                            ? 'border-blue-500 bg-blue-50 shadow-md'
                            : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {/* チェックマーク / ロック */}
                        {locked ? (
                          <div className="flex-shrink-0 w-6 h-6 rounded-full border-2 border-gray-300 flex items-center justify-center mt-1">
                            <Lock className="h-3 w-3 text-gray-400" />
                          </div>
                        ) : (
                          <div className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center mt-1 ${
                            isSelected
                              ? 'border-blue-500 bg-blue-500'
                              : 'border-gray-300'
                          }`}>
                            {isSelected && <Check className="h-4 w-4 text-white" />}
                          </div>
                        )}

                        {/* フォーマット情報 */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className={`font-bold text-lg ${
                              locked ? 'text-gray-500' : isSelected ? 'text-blue-900' : 'text-gray-900'
                            }`}>
                              {format.sport_code && <span className="mr-1.5">{getSportIcon(format.sport_code)}</span>}
                              {format.format_name}
                            </h3>
                            {locked && (
                              <span className="inline-flex items-center text-xs text-orange-600 border border-orange-300 rounded px-1.5 py-0.5">
                                <Lock className="h-3 w-3 mr-1" />
                                利用するには購入が必要です
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-4 text-sm text-gray-600 mb-2">
                            <div className="flex items-center gap-1">
                              <Users className="h-4 w-4" />
                              <span>{format.target_team_count}チーム</span>
                            </div>
                            {format.template_count !== undefined && (
                              <div className="flex items-center gap-1">
                                <Trophy className="h-4 w-4" />
                                <span>{format.template_count}試合</span>
                              </div>
                            )}
                          </div>

                          {format.format_description && (
                            <p className={`text-sm mb-2 ${
                              isSelected ? 'text-blue-700' : 'text-gray-600'
                            }`}>
                              {format.format_description}
                            </p>
                          )}

                          <FormatDetailBadges
                            default_match_duration={format.default_match_duration}
                            default_break_duration={format.default_break_duration}
                            matchday_count={format.matchday_count}
                            phase_stats={format.phase_stats}
                          />
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* フッター */}
        <div className="p-6 border-t bg-gray-50">
          {selectedFormat && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
              <p className="text-sm text-blue-900">
                <strong>選択中:</strong> {selectedFormat.format_name} ({selectedFormat.target_team_count}チーム)
              </p>
            </div>
          )}

          <div className="flex gap-3 justify-end">
            <button
              onClick={onCancel}
              className="px-5 py-2.5 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 font-medium"
            >
              キャンセル
            </button>
            <button
              onClick={handleConfirm}
              disabled={!selectedFormatId}
              className="px-5 py-2.5 text-primary-foreground bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              このフォーマットを選択
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
