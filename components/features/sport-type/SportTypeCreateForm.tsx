"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { 
  Settings, 
  Timer,
  Plus, 
  Trash2,
  AlertTriangle,
  ArrowUp,
  ArrowDown
} from "lucide-react";

interface PeriodDefinition {
  period_id: number;
  period_name: string;
  duration: number | null;
  type: 'regular' | 'extra' | 'penalty';
  display_order: number;
}

interface SportTypeFormData {
  sport_name: string;
  sport_code: string;
  max_period_count: number;
  regular_period_count: number;
  score_type: 'numeric' | 'time' | 'rank';
  default_match_duration: number;
  score_unit: string;
  result_format: 'score' | 'time' | 'ranking';
  period_definitions: PeriodDefinition[];
}

export default function SportTypeCreateForm() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    control,
    watch,
    setValue
  } = useForm<SportTypeFormData>({
    defaultValues: {
      sport_name: "",
      sport_code: "",
      max_period_count: 1,
      regular_period_count: 1,
      score_type: 'numeric',
      default_match_duration: 90,
      score_unit: "ゴール",
      result_format: 'score',
      period_definitions: [{
        period_id: 1,
        period_name: "通常時間",
        duration: 90,
        type: 'regular',
        display_order: 1
      }]
    }
  });

  const { fields, append, remove, update } = useFieldArray({
    control,
    name: "period_definitions"
  });

  const scoreType = watch("score_type");

  // ピリオド追加
  const addPeriod = () => {
    const nextId = fields.length + 1;
    append({
      period_id: nextId,
      period_name: `ピリオド${nextId}`,
      duration: null,
      type: 'regular',
      display_order: nextId
    });
  };

  // ピリオド順序変更
  const movePeriod = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index > 0) {
      const temp = fields[index];
      const prev = fields[index - 1];
      update(index, { ...prev, display_order: index + 1 });
      update(index - 1, { ...temp, display_order: index });
    } else if (direction === 'down' && index < fields.length - 1) {
      const temp = fields[index];
      const next = fields[index + 1];
      update(index, { ...next, display_order: index + 1 });
      update(index + 1, { ...temp, display_order: index + 2 });
    }
  };

  // ピリオド数の自動更新
  const updatePeriodCounts = () => {
    const maxCount = fields.length;
    const regularCount = fields.filter(f => f.type === 'regular').length;
    setValue('max_period_count', maxCount);
    setValue('regular_period_count', regularCount);
  };

  // フォーム送信
  const onSubmit = async (data: SportTypeFormData) => {
    setIsSubmitting(true);
    
    try {
      // ピリオド数を自動計算
      updatePeriodCounts();
      
      const response = await fetch("/api/admin/sport-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          period_definitions: JSON.stringify(data.period_definitions)
        })
      });

      const result = await response.json();

      if (result.success) {
        alert("競技種別を作成しました");
        router.push("/admin/sport-types");
      } else {
        alert(`エラー: ${result.error}`);
      }
    } catch (error) {
      alert("作成中にエラーが発生しました");
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* 基本情報 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Settings className="h-5 w-5 text-blue-600" />
            <span>基本情報</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="sport_name">競技名 *</Label>
              <Input
                id="sport_name"
                {...register("sport_name", { required: "競技名は必須です" })}
                placeholder="例: サッカー"
                className={errors.sport_name ? "border-red-500" : ""}
              />
              {errors.sport_name && (
                <p className="text-sm text-red-600">{errors.sport_name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="sport_code">競技コード *</Label>
              <Input
                id="sport_code"
                {...register("sport_code", { 
                  required: "競技コードは必須です",
                  pattern: {
                    value: /^[a-z_]+$/,
                    message: "英小文字とアンダースコアのみ使用可能です"
                  }
                })}
                placeholder="例: soccer"
                className={errors.sport_code ? "border-red-500" : ""}
              />
              {errors.sport_code && (
                <p className="text-sm text-red-600">{errors.sport_code.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="score_type">スコアタイプ *</Label>
              <Select
                value={scoreType}
                onValueChange={(value) => {
                  setValue('score_type', value as 'numeric' | 'time' | 'rank');
                  // スコアタイプに応じてデフォルト値を設定
                  if (value === 'time') {
                    setValue('score_unit', '秒');
                    setValue('result_format', 'time');
                  } else if (value === 'rank') {
                    setValue('score_unit', '位');
                    setValue('result_format', 'ranking');
                  } else {
                    setValue('score_unit', 'ゴール');
                    setValue('result_format', 'score');
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="numeric">数値（得点）</SelectItem>
                  <SelectItem value="time">タイム記録</SelectItem>
                  <SelectItem value="rank">順位</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="score_unit">スコア単位 *</Label>
              <Input
                id="score_unit"
                {...register("score_unit", { required: "スコア単位は必須です" })}
                placeholder="例: ゴール、得点、秒"
                className={errors.score_unit ? "border-red-500" : ""}
              />
              {errors.score_unit && (
                <p className="text-sm text-red-600">{errors.score_unit.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="default_match_duration">標準試合時間（分） *</Label>
              <Input
                id="default_match_duration"
                type="number"
                {...register("default_match_duration", { 
                  required: "標準試合時間は必須です",
                  min: { value: 1, message: "1分以上で入力してください" }
                })}
                className={errors.default_match_duration ? "border-red-500" : ""}
              />
              {errors.default_match_duration && (
                <p className="text-sm text-red-600">{errors.default_match_duration.message}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ピリオド設定 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Timer className="h-5 w-5 text-green-600" />
              <span>ピリオド設定</span>
              <Badge variant="outline">{fields.length}ピリオド</Badge>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addPeriod}
            >
              <Plus className="h-4 w-4 mr-1" />
              ピリオド追加
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {fields.map((field, index) => (
              <div key={field.id} className="border rounded-lg p-4 bg-gray-50 dark:bg-gray-800/50">
                <div className="flex items-start justify-between">
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div className="space-y-2">
                      <Label>ピリオド名</Label>
                      <Input
                        {...register(`period_definitions.${index}.period_name`)}
                        placeholder="例: 前半"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>タイプ</Label>
                      <Select
                        value={field.type}
                        onValueChange={(value) => update(index, { ...field, type: value as 'regular' | 'extra' | 'penalty' })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="regular">通常</SelectItem>
                          <SelectItem value="extra">延長</SelectItem>
                          <SelectItem value="penalty">PK戦</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>時間（分）</Label>
                      <Input
                        type="number"
                        {...register(`period_definitions.${index}.duration`, { valueAsNumber: true })}
                        placeholder="未設定"
                      />
                    </div>

                    <div className="flex items-end space-x-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => movePeriod(index, 'up')}
                        disabled={index === 0}
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => movePeriod(index, 'down')}
                        disabled={index === fields.length - 1}
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => remove(index)}
                        disabled={fields.length <= 1}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p className="text-sm text-blue-800 dark:text-blue-200 flex items-center">
              <AlertTriangle className="h-4 w-4 mr-2" />
              通常ピリオドは必須で、延長・PK戦は大会ごとに使用可否を設定できます
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 送信ボタン */}
      <div className="flex justify-end space-x-4 pt-6">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          キャンセル
        </Button>
        <Button type="submit" disabled={isSubmitting} className="bg-blue-600 hover:bg-blue-700">
          {isSubmitting ? "作成中..." : "競技種別を作成"}
        </Button>
      </div>
    </form>
  );
}