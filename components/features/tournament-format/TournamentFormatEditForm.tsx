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
  Save,
  ArrowUp,
  ArrowDown
} from "lucide-react";

interface TournamentFormatEditFormProps {
  format: {
    format_id: number;
    format_name: string;
    target_team_count: number;
    format_description?: string;
  };
  templates: Array<{
    match_number: number;
    match_code: string;
    match_type: string;
    phase: string;
    round_name?: string;
    block_name?: string;
    team1_source?: string;
    team2_source?: string;
    team1_display_name: string;
    team2_display_name: string;
    day_number: number;
    execution_priority: number;
    court_number?: number;
    suggested_start_time?: string;
  }>;
}

// Simple interfaces for now
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
}

interface TournamentFormatFormData {
  format_name: string;
  target_team_count: number;
  format_description: string;
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

export default function TournamentFormatEditForm({ format, templates }: TournamentFormatEditFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
    control
  } = useForm<TournamentFormatFormData>({
    defaultValues: {
      format_name: format.format_name || "",
      target_team_count: Number(format.target_team_count) || 8,
      format_description: format.format_description || "",
      templates: templates.map(t => ({
        match_number: Number(t.match_number) || 1,
        match_code: t.match_code || "",
        match_type: t.match_type || "通常",
        phase: t.phase || "preliminary",
        round_name: t.round_name || "",
        block_name: t.block_name || "",
        team1_source: t.team1_source || "",
        team2_source: t.team2_source || "",
        team1_display_name: t.team1_display_name || "",
        team2_display_name: t.team2_display_name || "",
        day_number: Number(t.day_number) || 1,
        execution_priority: Number(t.execution_priority) || 1,
        court_number: t.court_number ? Number(t.court_number) : undefined,
        suggested_start_time: t.suggested_start_time || ""
      }))
    }
  });

  const { fields, append, remove, update } = useFieldArray({
    control,
    name: "templates"
  });

  // 変更検知
  useEffect(() => {
    setHasChanges(isDirty);
  }, [isDirty]);

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
      suggested_start_time: ""
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
    if (!hasChanges) {
      alert("変更がありません");
      return;
    }

    setIsSubmitting(true);
    
    try {
      const response = await fetch(`/api/admin/tournament-formats/${format.format_id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });

      const result = await response.json();

      if (result.success) {
        alert("フォーマットを更新しました");
        router.push("/admin/tournament-formats");
      } else {
        alert(`エラー: ${result.error}`);
      }
    } catch (error) {
      alert("更新中にエラーが発生しました");
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 編集警告 */}
      {hasChanges && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center space-x-2 text-yellow-800">
            <AlertTriangle className="h-5 w-5" />
            <span className="font-medium">未保存の変更があります</span>
          </div>
          <p className="text-sm text-yellow-700 mt-1">
            変更内容を保存するには「更新」ボタンをクリックしてください。
          </p>
        </div>
      )}

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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r">実行優先度</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r">コート番号</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r">試合開始時間</th>
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
                          className={errors.templates?.[index]?.match_code ? "border-red-500 w-20" : "w-20"}
                          placeholder="A1"
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
                            <SelectItem value="final">決勝T</SelectItem>
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
                          className={errors.templates?.[index]?.team1_display_name ? "border-red-500 w-32" : "w-32"}
                          placeholder="A1チーム"
                        />
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap border-r">
                        <Input
                          {...register(`templates.${index}.team2_display_name`)}
                          className={errors.templates?.[index]?.team2_display_name ? "border-red-500 w-32" : "w-32"}
                          placeholder="A2チーム"
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
          <Button 
            type="submit" 
            disabled={isSubmitting || !hasChanges} 
            className="bg-green-600 hover:bg-green-700"
          >
            <Save className="h-4 w-4 mr-2" />
            {isSubmitting ? "更新中..." : "フォーマットを更新"}
          </Button>
        </div>
      </form>
    </div>
  );
}