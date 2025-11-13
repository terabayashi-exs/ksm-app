"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
// import { zodResolver } from "@hookform/resolvers/zod";
// import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { 
  Settings, 
  Calendar, 
  Plus, 
  Trash2, 
  Copy,
  AlertTriangle,
  ArrowUp,
  ArrowDown
} from "lucide-react";

// Simple interfaces for now
interface SportType {
  sport_type_id: number;
  sport_name: string;
  sport_code: string;
  max_period_count: number;
  regular_period_count: number;
  score_type: string;
  default_match_duration: number;
  score_unit: string;
  period_definitions: string;
  result_format: string;
}

interface MatchTemplate {
  match_number: number;
  match_code: string;
  match_type: string;
  phase: string;
  round_name: string;
  block_name: string;
  team1_source: string;
  team2_source: string;
  team1_display_name: string;
  team2_display_name: string;
  day_number: number;
  execution_priority: number;
  court_number?: number;
  suggested_start_time: string;
  // 新しい順位設定フィールド
  loser_position_start?: number;
  loser_position_end?: number;
  winner_position?: number;
  position_note?: string;
}

interface TournamentFormatFormData {
  format_name: string;
  sport_type_id: number;
  target_team_count: number;
  format_description: string;
  preliminary_format_type: string | null;
  final_format_type: string | null;
  templates: MatchTemplate[];
}

// TODO: Add back Zod validation later
// バリデーションスキーマ
/*
const templateSchema = z.object({
  match_number: z.number().min(1),
  match_code: z.string().min(1, "試合コードは必須です"),
  match_type: z.string().min(0).default("通常"),
  phase: z.string().min(1, "フェーズは必須です"),
  round_name: z.string().min(0).default(""),
  block_name: z.string().min(0).default(""),
  team1_source: z.string().min(0).default(""),
  team2_source: z.string().min(0).default(""),
  team1_display_name: z.string().min(1, "チーム1の表示名は必須です"),
  team2_display_name: z.string().min(1, "チーム2の表示名は必須です"),
  day_number: z.number().min(1).default(1),
  execution_priority: z.number().min(1).default(1),
  court_number: z.number().optional(),
  suggested_start_time: z.string().min(0).default("")
});

const formatSchema = z.object({
  format_name: z.string().min(1, "フォーマット名は必須です").max(100),
  target_team_count: z.number().min(2, "チーム数は2以上で入力してください").max(128),
  format_description: z.string().min(0).default(""),
  templates: z.array(templateSchema).min(1, "試合テンプレートを最低1つ作成してください")
});

type TournamentFormatForm = z.infer<typeof formatSchema>;
*/

export default function TournamentFormatCreateForm() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sportTypes, setSportTypes] = useState<SportType[]>([]);
  const [sportTypesLoading, setSportTypesLoading] = useState(true);

  const {
    register,
    handleSubmit,
    formState: { errors },
    control,
    setValue,
    watch
  } = useForm<TournamentFormatFormData>({
    defaultValues: {
      format_name: "",
      sport_type_id: 1, // デフォルトでPK選手権を選択
      target_team_count: 8,
      format_description: "",
      preliminary_format_type: "league",
      final_format_type: "tournament",
      templates: [{
        match_number: 1,
        match_code: "A1",
        match_type: "通常",
        phase: "preliminary",
        round_name: "予選Aブロック",
        block_name: "A",
        team1_source: "",
        team2_source: "",
        team1_display_name: "A1チーム",
        team2_display_name: "A2チーム",
        day_number: 1,
        execution_priority: 1,
        court_number: undefined,
        suggested_start_time: "",
        // 新しい順位設定フィールドのデフォルト値
        loser_position_start: undefined,
        loser_position_end: undefined,
        winner_position: undefined,
        position_note: ""
      }]
    }
  });

  const { fields, append, remove, update } = useFieldArray({
    control,
    name: "templates"
  });

  const selectedSportTypeId = watch("sport_type_id");
  const preliminaryFormatType = watch("preliminary_format_type", "league");
  const finalFormatType = watch("final_format_type", "tournament");

  // 競技種別データの取得
  useEffect(() => {
    const fetchSportTypes = async () => {
      try {
        const response = await fetch('/api/sport-types');
        const result = await response.json();
        
        if (result.success) {
          setSportTypes(result.data);
        } else {
          console.error('競技種別取得エラー:', result.error);
        }
      } catch (error) {
        console.error('競技種別取得エラー:', error);
      } finally {
        setSportTypesLoading(false);
      }
    };

    fetchSportTypes();
  }, []);

  // 新しいテンプレート追加
  const addTemplate = () => {
    const nextNumber = fields.length + 1;
    append({
      match_number: nextNumber,
      match_code: `T${nextNumber}`,
      match_type: "通常",
      phase: "preliminary",
      round_name: "",
      block_name: "",
      team1_source: "",
      team2_source: "",
      team1_display_name: `T${nextNumber}チーム1`,
      team2_display_name: `T${nextNumber}チーム2`,
      day_number: 1,
      execution_priority: nextNumber,
      court_number: undefined,
      suggested_start_time: "",
      // 新しい順位設定フィールド
      loser_position_start: undefined,
      loser_position_end: undefined,
      winner_position: undefined,
      position_note: ""
    });
  };

  // テンプレート複製
  const duplicateTemplate = (index: number) => {
    const template = fields[index];
    const nextNumber = fields.length + 1;
    append({
      ...template,
      match_number: nextNumber,
      match_code: `${template.match_code}_copy`,
      execution_priority: nextNumber
    });
  };

  // 順番移動
  const moveTemplate = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index > 0) {
      const temp = fields[index];
      const prev = fields[index - 1];
      update(index, prev);
      update(index - 1, temp);
    } else if (direction === 'down' && index < fields.length - 1) {
      const temp = fields[index];
      const next = fields[index + 1];
      update(index, next);
      update(index + 1, temp);
    }
  };


  // フォーム送信
  const onSubmit = async (data: TournamentFormatFormData) => {
    setIsSubmitting(true);
    
    try {
      const response = await fetch("/api/admin/tournament-formats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });

      const result = await response.json();

      if (result.success) {
        alert("フォーマットを作成しました");
        router.push("/admin/tournament-formats");
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
      {/* フォーマット基本情報 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Settings className="h-5 w-5 text-blue-600" />
            <span>フォーマット基本情報</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="format_name">フォーマット名 *</Label>
              <Input
                id="format_name"
                {...register("format_name")}
                placeholder="例: 16チーム予選リーグ+決勝トーナメント"
                className={errors.format_name ? "border-red-500" : ""}
              />
              {errors.format_name && (
                <p className="text-sm text-red-600">{errors.format_name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="sport_type_id">競技種別 *</Label>
              {sportTypesLoading ? (
                <div className="flex items-center space-x-2 p-3 border rounded-md">
                  <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin"></div>
                  <span className="text-sm text-gray-600">読み込み中...</span>
                </div>
              ) : (
                <Select
                  value={String(selectedSportTypeId || 1)}
                  onValueChange={(value) => setValue("sport_type_id", parseInt(value), { shouldValidate: true })}
                >
                  <SelectTrigger className={errors.sport_type_id ? "border-red-500" : ""}>
                    <SelectValue placeholder="競技種別を選択" />
                  </SelectTrigger>
                  <SelectContent>
                    {sportTypes.map((sportType) => (
                      <SelectItem key={sportType.sport_type_id} value={String(sportType.sport_type_id)}>
                        {sportType.sport_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {errors.sport_type_id && (
                <p className="text-sm text-red-600">{errors.sport_type_id.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="target_team_count">対象チーム数 *</Label>
              <Input
                id="target_team_count"
                type="number"
                {...register("target_team_count", { valueAsNumber: true })}
                min={4}
                max={128}
                className={errors.target_team_count ? "border-red-500" : ""}
              />
              {errors.target_team_count && (
                <p className="text-sm text-red-600">{errors.target_team_count.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="format_description">フォーマット説明</Label>
            <Textarea
              id="format_description"
              {...register("format_description")}
              placeholder="このフォーマットの詳細や特徴を記載してください"
              rows={3}
            />
          </div>

          {/* 試合形式選択 */}
          <div className="border-t pt-4 mt-4">
            <h3 className="text-sm font-semibold mb-3 text-gray-700">試合形式設定</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* 予選試合形式 */}
              <div className="space-y-2">
                <Label htmlFor="preliminary_format_type">
                  予選試合形式
                  <span className="text-xs text-gray-500 ml-2">
                    (予選がない場合は「なし」を選択)
                  </span>
                </Label>
                <Select
                  value={preliminaryFormatType || "none"}
                  onValueChange={(value) => setValue("preliminary_format_type", value === "none" ? null : value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="予選形式を選択" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">なし（予選なし）</SelectItem>
                    <SelectItem value="league">リーグ戦</SelectItem>
                    <SelectItem value="tournament">トーナメント戦</SelectItem>
                  </SelectContent>
                </Select>
                {preliminaryFormatType === "league" && (
                  <p className="text-xs text-gray-600">
                    💡 複数ブロック（A, B, C...）でのリーグ戦形式
                  </p>
                )}
                {preliminaryFormatType === "tournament" && (
                  <p className="text-xs text-gray-600">
                    💡 単一トーナメントブロックでの勝ち抜き形式
                  </p>
                )}
                {preliminaryFormatType === null && (
                  <p className="text-xs text-gray-600">
                    💡 予選なし、いきなり決勝からスタート
                  </p>
                )}
              </div>

              {/* 決勝試合形式 */}
              <div className="space-y-2">
                <Label htmlFor="final_format_type">
                  決勝試合形式
                  <span className="text-xs text-gray-500 ml-2">
                    (決勝がない場合は「なし」を選択)
                  </span>
                </Label>
                <Select
                  value={finalFormatType || "none"}
                  onValueChange={(value) => setValue("final_format_type", value === "none" ? null : value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="決勝形式を選択" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">なし（決勝なし）</SelectItem>
                    <SelectItem value="league">リーグ戦</SelectItem>
                    <SelectItem value="tournament">トーナメント戦</SelectItem>
                  </SelectContent>
                </Select>
                {finalFormatType === "league" && (
                  <p className="text-xs text-gray-600">
                    💡 複数ブロック（1位リーグ、2位リーグ...）でのリーグ戦形式
                  </p>
                )}
                {finalFormatType === "tournament" && (
                  <p className="text-xs text-gray-600">
                    💡 決勝トーナメントブロックでの勝ち抜き形式
                  </p>
                )}
                {finalFormatType === null && (
                  <p className="text-xs text-gray-600">
                    💡 決勝なし、予選のみで大会終了
                  </p>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 試合テンプレート */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Calendar className="h-5 w-5 text-green-600" />
              <span>試合テンプレート</span>
              <Badge variant="outline">{fields.length}試合</Badge>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addTemplate}
            >
              <Plus className="h-4 w-4 mr-1" />
              試合追加
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {errors.templates && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-600 flex items-center">
                <AlertTriangle className="h-4 w-4 mr-2" />
                {errors.templates.message}
              </p>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="min-w-full border border-gray-200 rounded-lg">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r">順番</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r">試合番号</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r">試合コード</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r">フェーズ</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r">ラウンド名</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r">ブロック名</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r">チーム1表示名</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r">チーム2表示名</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r">チーム1ソース</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r">チーム2ソース</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r">日付番号</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r">実行優先度</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r">コート番号</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r">試合開始時間</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r">敗者順位開始</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r">敗者順位終了</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r">勝者順位</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r">順位説明</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {fields.map((field, index) => (
                  <tr key={field.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 whitespace-nowrap border-r">
                      <div className="flex items-center space-x-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => moveTemplate(index, 'up')}
                          disabled={index === 0}
                        >
                          <ArrowUp className="h-3 w-3" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => moveTemplate(index, 'down')}
                          disabled={index === fields.length - 1}
                        >
                          <ArrowDown className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap border-r">
                      <Input
                        type="number"
                        {...register(`templates.${index}.match_number`, { valueAsNumber: true })}
                        className="w-16"
                        min={1}
                        placeholder="1"
                      />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap border-r">
                      <Input
                        {...register(`templates.${index}.match_code`)}
                        placeholder="A1"
                        className={errors.templates?.[index]?.match_code ? "border-red-500 w-20" : "w-20"}
                      />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap border-r">
                      <Select
                        value={field.phase}
                        onValueChange={(value) => update(index, { ...field, phase: value })}
                      >
                        <SelectTrigger className="w-24">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="preliminary">予選</SelectItem>
                          <SelectItem value="final">決勝</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap border-r">
                      <Input
                        {...register(`templates.${index}.round_name`)}
                        className="w-32"
                        placeholder="予選Aブロック"
                      />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap border-r">
                      <Input
                        {...register(`templates.${index}.block_name`)}
                        className="w-20"
                        placeholder="A"
                      />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap border-r">
                      <Input
                        {...register(`templates.${index}.team1_display_name`)}
                        placeholder="A1チーム"
                        className={errors.templates?.[index]?.team1_display_name ? "border-red-500 w-32" : "w-32"}
                      />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap border-r">
                      <Input
                        {...register(`templates.${index}.team2_display_name`)}
                        placeholder="A2チーム"
                        className={errors.templates?.[index]?.team2_display_name ? "border-red-500 w-32" : "w-32"}
                      />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap border-r">
                      <Input
                        {...register(`templates.${index}.team1_source`)}
                        className="w-28"
                        placeholder="T1_winner"
                      />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap border-r">
                      <Input
                        {...register(`templates.${index}.team2_source`)}
                        className="w-28"
                        placeholder="T2_winner"
                      />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap border-r">
                      <Input
                        type="number"
                        {...register(`templates.${index}.day_number`, { valueAsNumber: true })}
                        className="w-16"
                        min={1}
                        placeholder="1"
                      />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap border-r">
                      <Input
                        type="number"
                        {...register(`templates.${index}.execution_priority`, { valueAsNumber: true })}
                        className="w-16"
                        min={1}
                        placeholder="1"
                      />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap border-r">
                      <Input
                        type="number"
                        {...register(`templates.${index}.court_number`, { valueAsNumber: true })}
                        className="w-16"
                        min={1}
                        max={8}
                        placeholder="1"
                      />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap border-r">
                      <Input
                        type="time"
                        {...register(`templates.${index}.suggested_start_time`)}
                        className="w-24"
                        placeholder="09:00"
                      />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap border-r">
                      <Input
                        type="number"
                        {...register(`templates.${index}.loser_position_start`, { valueAsNumber: true })}
                        className="w-16"
                        min={1}
                        max={50}
                        placeholder="5"
                      />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap border-r">
                      <Input
                        type="number"
                        {...register(`templates.${index}.loser_position_end`, { valueAsNumber: true })}
                        className="w-16"
                        min={1}
                        max={50}
                        placeholder="5"
                      />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap border-r">
                      <Input
                        type="number"
                        {...register(`templates.${index}.winner_position`, { valueAsNumber: true })}
                        className="w-16"
                        min={1}
                        max={50}
                        placeholder="1"
                      />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap border-r">
                      <Input
                        {...register(`templates.${index}.position_note`)}
                        className="w-24"
                        placeholder="決勝戦"
                      />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-center">
                      <div className="flex items-center justify-center space-x-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => duplicateTemplate(index)}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => remove(index)}
                          disabled={fields.length <= 1}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* 送信ボタン */}
      <div className="flex justify-end space-x-4 pt-6">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          キャンセル
        </Button>
        <Button type="submit" disabled={isSubmitting} className="bg-blue-600 hover:bg-blue-700">
          {isSubmitting ? "作成中..." : "フォーマットを作成"}
        </Button>
      </div>
    </form>
  );
}