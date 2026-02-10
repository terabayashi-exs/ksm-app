"use client";

import { useState } from "react";
import type { TournamentPhase, TournamentPhases, PhaseFormatType } from "@/lib/types/tournament-phases";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  AlertTriangle,
  Info
} from "lucide-react";
import { validatePhaseConfiguration, PHASE_PRESETS, reorderPhases } from "./phase-utils";

interface PhaseConfigurationSectionProps {
  phases: TournamentPhases;
  onPhasesChange: (phases: TournamentPhases) => void;
}

export function PhaseConfigurationSection({ phases, onPhasesChange }: PhaseConfigurationSectionProps) {
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // フェーズ追加
  const addPhase = () => {
    const nextOrder = phases.phases.length + 1;
    const newPhase: TournamentPhase = {
      id: `phase_${nextOrder}`,
      order: nextOrder,
      name: `フェーズ${nextOrder}`,
      format_type: "league",
      display_name: "",
      description: ""
    };
    const newPhases = {
      phases: [...phases.phases, newPhase]
    };
    onPhasesChange(newPhases);
    validateAndUpdate(newPhases);
  };

  // フェーズ削除
  const removePhase = (index: number) => {
    const newPhasesArray = phases.phases.filter((_, i) => i !== index);
    const reorderedPhases = reorderPhases(newPhasesArray);
    const newPhases = { phases: reorderedPhases };
    onPhasesChange(newPhases);
    validateAndUpdate(newPhases);
  };

  // フェーズ更新
  const updatePhase = (index: number, field: keyof TournamentPhase, value: string | number) => {
    const newPhasesArray = [...phases.phases];
    newPhasesArray[index] = {
      ...newPhasesArray[index],
      [field]: value
    };
    const newPhases = { phases: newPhasesArray };
    onPhasesChange(newPhases);
    validateAndUpdate(newPhases);
  };

  // フェーズ移動
  const movePhase = (index: number, direction: 'up' | 'down') => {
    const newPhasesArray = [...phases.phases];

    if (direction === 'up' && index > 0) {
      [newPhasesArray[index - 1], newPhasesArray[index]] = [newPhasesArray[index], newPhasesArray[index - 1]];
    } else if (direction === 'down' && index < newPhasesArray.length - 1) {
      [newPhasesArray[index], newPhasesArray[index + 1]] = [newPhasesArray[index + 1], newPhasesArray[index]];
    }

    const reorderedPhases = reorderPhases(newPhasesArray);
    const newPhases = { phases: reorderedPhases };
    onPhasesChange(newPhases);
    validateAndUpdate(newPhases);
  };

  // プリセット読み込み
  const loadPreset = (presetKey: string) => {
    if (presetKey && PHASE_PRESETS[presetKey]) {
      const preset = PHASE_PRESETS[presetKey];
      onPhasesChange(preset.phases);
      validateAndUpdate(preset.phases);
    }
  };

  // バリデーション実行
  const validateAndUpdate = (phasesToValidate: TournamentPhases) => {
    const validation = validatePhaseConfiguration(phasesToValidate);
    setValidationErrors(validation.errors);
  };

  return (
    <div className="space-y-4">
      {/* ヘッダー */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <p className="text-sm text-gray-600 mb-2">
            大会を複数のフェーズに分けて管理できます（例: 1次予選 → 2次予選 → 決勝）
          </p>

          {/* プリセット選択 */}
          <div className="flex items-center gap-2">
            <Label className="text-xs text-gray-500 whitespace-nowrap">プリセットから選択:</Label>
            <Select onValueChange={loadPreset}>
              <SelectTrigger className="h-8 text-xs w-[280px]">
                <SelectValue placeholder="プリセットを選択..." />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PHASE_PRESETS).map(([key, preset]) => (
                  <SelectItem key={key} value={key} className="text-xs">
                    {preset.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addPhase}
          className="shrink-0"
        >
          <Plus className="h-4 w-4 mr-1" />
          フェーズ追加
        </Button>
      </div>

      {/* バリデーションエラー表示 */}
      {validationErrors.length > 0 && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-800 font-medium mb-1 flex items-center">
            <AlertTriangle className="h-4 w-4 mr-2" />
            フェーズ設定にエラーがあります
          </p>
          <ul className="text-xs text-red-700 list-disc list-inside space-y-1">
            {validationErrors.map((error, index) => (
              <li key={index}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      {/* 警告メッセージ */}
      <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
        <p className="text-sm text-yellow-800 font-medium mb-1 flex items-center">
          <Info className="h-4 w-4 mr-2" />
          詳細フェーズ設定モード
        </p>
        <p className="text-xs text-yellow-700">
          3フェーズ以上の構成や、カスタムフェーズIDを使用しています。
          試合テンプレートの「フェーズ」列と整合性を保つように注意してください。
        </p>
      </div>

      {/* フェーズリスト */}
      <div className="space-y-3">
        {phases.phases.map((phase, index) => (
          <Card key={`${phase.id}-${index}`} className="p-4">
            <div className="grid grid-cols-12 gap-3 items-start">
              {/* 順序移動ボタン */}
              <div className="col-span-1 flex flex-col space-y-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => movePhase(index, 'up')}
                  disabled={index === 0}
                  className="h-8 w-8 p-0"
                >
                  <ArrowUp className="h-3 w-3" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => movePhase(index, 'down')}
                  disabled={index === phases.phases.length - 1}
                  className="h-8 w-8 p-0"
                >
                  <ArrowDown className="h-3 w-3" />
                </Button>
              </div>

              {/* フェーズ設定フォーム */}
              <div className="col-span-10 grid grid-cols-1 md:grid-cols-4 gap-3">
                {/* 順序 */}
                <div className="space-y-1">
                  <Label className="text-xs">順序 *</Label>
                  <Input
                    type="number"
                    value={phase.order}
                    onChange={(e) => updatePhase(index, 'order', parseInt(e.target.value) || 1)}
                    className="h-9"
                    min={1}
                  />
                </div>

                {/* ID */}
                <div className="space-y-1">
                  <Label className="text-xs">フェーズID *</Label>
                  <Input
                    value={phase.id}
                    onChange={(e) => updatePhase(index, 'id', e.target.value)}
                    placeholder="preliminary"
                    className="h-9"
                  />
                  <p className="text-[10px] text-gray-500">
                    英小文字・数字・_のみ
                  </p>
                </div>

                {/* 名前 */}
                <div className="space-y-1">
                  <Label className="text-xs">フェーズ名 *</Label>
                  <Input
                    value={phase.name}
                    onChange={(e) => updatePhase(index, 'name', e.target.value)}
                    placeholder="予選"
                    className="h-9"
                  />
                </div>

                {/* 形式 */}
                <div className="space-y-1">
                  <Label className="text-xs">形式 *</Label>
                  <Select
                    value={phase.format_type}
                    onValueChange={(value) => updatePhase(index, 'format_type', value as PhaseFormatType)}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="league">リーグ戦</SelectItem>
                      <SelectItem value="tournament">トーナメント戦</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* 表示名（オプション） */}
                <div className="space-y-1 md:col-span-2">
                  <Label className="text-xs">表示名（オプション）</Label>
                  <Input
                    value={phase.display_name || ""}
                    onChange={(e) => updatePhase(index, 'display_name', e.target.value)}
                    placeholder="名前と異なる場合のみ入力"
                    className="h-9"
                  />
                </div>

                {/* 説明（オプション） */}
                <div className="space-y-1 md:col-span-2">
                  <Label className="text-xs">説明（オプション）</Label>
                  <Input
                    value={phase.description || ""}
                    onChange={(e) => updatePhase(index, 'description', e.target.value)}
                    placeholder="フェーズの補足説明"
                    className="h-9"
                  />
                </div>
              </div>

              {/* 削除ボタン */}
              <div className="col-span-1 flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removePhase(index)}
                  disabled={phases.phases.length <= 1}
                  className="h-8 w-8 p-0"
                >
                  <Trash2 className="h-4 w-4 text-red-600" />
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* 空状態 */}
      {phases.phases.length === 0 && (
        <div className="text-center p-8 border-2 border-dashed border-gray-300 rounded-lg">
          <p className="text-sm text-gray-500 mb-3">
            フェーズが設定されていません
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={addPhase}
          >
            <Plus className="h-4 w-4 mr-2" />
            最初のフェーズを追加
          </Button>
        </div>
      )}

      {/* プレビュー */}
      {phases.phases.length > 0 && (
        <div className="mt-4 p-3 bg-gray-50 border rounded-md">
          <p className="text-xs font-semibold text-gray-700 mb-2">フェーズ構成プレビュー:</p>
          <div className="flex items-center flex-wrap gap-2">
            {phases.phases.map((phase, index) => (
              <div key={phase.id} className="flex items-center">
                <Badge variant="outline" className="text-xs">
                  {phase.display_name || phase.name} ({phase.format_type === 'league' ? 'リーグ' : 'トーナメント'})
                </Badge>
                {index < phases.phases.length - 1 && (
                  <span className="text-gray-400 mx-2">→</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
