'use client';

import { AlertTriangle, CheckCircle, XCircle, Info } from 'lucide-react';
import { FormatChangeCheckResponse } from '@/lib/format-change';

interface FormatChangeDialogProps {
  checkResult: FormatChangeCheckResponse['data'];
  newFormatName: string;
  onConfirm: () => void;
  onCancel: () => void;
  isProcessing?: boolean;
}

export function FormatChangeDialog({
  checkResult,
  newFormatName,
  onConfirm,
  onCancel,
  isProcessing = false
}: FormatChangeDialogProps) {
  if (!checkResult) return null;

  const canChange = checkResult.can_change;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* ヘッダー */}
        <div className={`p-6 border-b ${canChange ? 'bg-orange-50' : 'bg-red-50'}`}>
          <div className="flex items-start gap-3">
            {canChange ? (
              <AlertTriangle className="h-6 w-6 text-orange-500 flex-shrink-0 mt-1" />
            ) : (
              <XCircle className="h-6 w-6 text-red-500 flex-shrink-0 mt-1" />
            )}
            <div>
              <h3 className="font-bold text-xl text-gray-900">
                {canChange ? 'フォーマット変更の確認' : 'フォーマット変更不可'}
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                {checkResult.tournament_name}
              </p>
            </div>
          </div>
        </div>

        {/* コンテンツ */}
        <div className="p-6 space-y-4">
          {/* 変更不可の理由 */}
          {!canChange && checkResult.reasons.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-start gap-2 mb-2">
                <XCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                <h4 className="font-bold text-red-900">変更できない理由</h4>
              </div>
              <ul className="text-sm text-red-800 space-y-2 ml-7">
                {checkResult.reasons.map((reason, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <span className="text-red-600">•</span>
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 試合状況 */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-2 mb-3">
              <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <h4 className="font-bold text-blue-900">現在の試合状況</h4>
            </div>
            <div className="grid grid-cols-3 gap-4 ml-7">
              <div>
                <p className="text-xs text-blue-600">総試合数</p>
                <p className="text-2xl font-bold text-blue-900">
                  {checkResult.match_status.total_matches}
                </p>
              </div>
              <div>
                <p className="text-xs text-blue-600">完了試合</p>
                <p className="text-2xl font-bold text-blue-900">
                  {checkResult.match_status.completed_matches}
                </p>
              </div>
              <div>
                <p className="text-xs text-blue-600">確定試合</p>
                <p className="text-2xl font-bold text-blue-900">
                  {checkResult.match_status.confirmed_matches}
                </p>
              </div>
            </div>
          </div>

          {/* 変更内容 */}
          {canChange && (
            <>
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                <h4 className="font-bold text-purple-900 mb-3">変更内容</h4>
                <div className="flex items-center gap-3 ml-2">
                  <div className="flex-1">
                    <p className="text-xs text-purple-600">現在のフォーマット</p>
                    <p className="font-bold text-purple-900">
                      {checkResult.current_format_name}
                    </p>
                  </div>
                  <div className="text-purple-400 text-2xl">→</div>
                  <div className="flex-1">
                    <p className="text-xs text-purple-600">新しいフォーマット</p>
                    <p className="font-bold text-purple-900">{newFormatName}</p>
                  </div>
                </div>
              </div>

              {/* 削除される情報 */}
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-start gap-2 mb-3">
                  <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <h4 className="font-bold text-red-900">削除されるデータ</h4>
                </div>
                <ul className="text-sm text-red-800 space-y-2 ml-7">
                  <li className="flex items-start gap-2">
                    <span className="text-red-600">✕</span>
                    <span>全ての試合データ（予定されている試合）</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-red-600">✕</span>
                    <span>全ての試合結果（入力済みの結果がある場合）</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-red-600">✕</span>
                    <span>全ての試合ブロック情報</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-red-600">✕</span>
                    <span>チームの組合せ情報（ブロック配置・順位）</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-red-600">✕</span>
                    <span>試合オーバーライド設定（進出条件の調整）</span>
                  </li>
                </ul>
                <div className="mt-3 p-3 bg-red-100 rounded border border-red-300">
                  <p className="text-sm font-bold text-red-900">
                    ⚠️ この操作は元に戻せません
                  </p>
                </div>
              </div>

              {/* 保持される情報 */}
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-start gap-2 mb-3">
                  <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <h4 className="font-bold text-green-900">保持されるデータ</h4>
                </div>
                <ul className="text-sm text-green-800 space-y-2 ml-7">
                  <li className="flex items-start gap-2">
                    <span className="text-green-600">✓</span>
                    <span>参加チーム情報</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-600">✓</span>
                    <span>参加選手情報</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-600">✓</span>
                    <span>大会基本情報（名称・日程・会場など）</span>
                  </li>
                </ul>
              </div>

              {/* 次のステップ */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-bold text-blue-900 mb-2">変更後の手順</h4>
                <ol className="text-sm text-blue-800 space-y-1 ml-5 list-decimal">
                  <li>組合せ抽選画面で新しいフォーマットの組合せを作成</li>
                  <li>チームのブロック配置を確認</li>
                  <li>試合スケジュールを確認・調整</li>
                  <li>必要に応じて進出条件のオーバーライドを設定</li>
                </ol>
              </div>
            </>
          )}

          {/* 変更不可時のアドバイス */}
          {!canChange && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <h4 className="font-bold text-gray-900 mb-2">対処方法</h4>
              <ul className="text-sm text-gray-700 space-y-2 ml-5 list-disc">
                <li>試合結果が入力されている場合は、新しい大会を作成することを推奨します</li>
                <li>どうしても変更が必要な場合は、全ての試合データを手動で削除してください</li>
                <li>大会が進行中・完了済みの場合は、ステータスを変更してください</li>
              </ul>
            </div>
          )}
        </div>

        {/* フッター */}
        <div className="p-6 border-t bg-gray-50 flex gap-3 justify-end">
          <button
            onClick={onCancel}
            disabled={isProcessing}
            className="px-5 py-2.5 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {canChange ? 'キャンセル' : '閉じる'}
          </button>
          {canChange && (
            <button
              onClick={onConfirm}
              disabled={isProcessing}
              className="px-5 py-2.5 text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center gap-2"
            >
              {isProcessing ? (
                <>
                  <span className="animate-spin">⏳</span>
                  <span>変更中...</span>
                </>
              ) : (
                <span>フォーマットを変更する</span>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
