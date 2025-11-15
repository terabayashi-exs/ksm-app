"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Edit, Trash2, Copy, Users, Calendar } from "lucide-react";

interface TournamentFormat {
  format_id: number;
  format_name: string;
  sport_type_id: number;
  target_team_count: number;
  format_description: string;
  created_at: string;
  sport_name: string;
  sport_code: string;
  template_count?: number;
}

export default function TournamentFormatList() {
  const [formats, setFormats] = useState<TournamentFormat[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // フォーマット一覧を取得
  useEffect(() => {
    fetchFormats();
  }, []);

  const fetchFormats = async () => {
    try {
      const response = await fetch("/api/admin/tournament-formats");
      const data = await response.json();
      
      if (data.success) {
        setFormats(data.formats);
      }
    } catch (error) {
      console.error("フォーマット取得エラー:", error);
    } finally {
      setLoading(false);
    }
  };

  // フォーマット削除
  const handleDelete = async (formatId: number, formatName: string) => {
    if (!confirm(`「${formatName}」を削除しますか？\n\n⚠️ 関連する試合テンプレートも全て削除されます。\nこの操作は元に戻せません。`)) {
      return;
    }

    setDeletingId(formatId);
    
    try {
      const response = await fetch(`/api/admin/tournament-formats/${formatId}`, {
        method: "DELETE",
      });
      
      const data = await response.json();
      
      if (data.success) {
        setFormats(formats.filter(f => f.format_id !== formatId));
        alert("フォーマットを削除しました");
      } else {
        alert(`削除エラー: ${data.error}`);
      }
    } catch (error) {
      alert("削除中にエラーが発生しました");
      console.error("削除エラー:", error);
    } finally {
      setDeletingId(null);
    }
  };

  // フォーマット複製
  const handleDuplicate = async (formatId: number) => {
    try {
      const response = await fetch(`/api/admin/tournament-formats/${formatId}/duplicate`, {
        method: "POST",
      });
      
      const data = await response.json();
      
      if (data.success) {
        fetchFormats(); // リストを再取得
        alert(`フォーマットを複製しました: ${data.newFormat.format_name}`);
      } else {
        alert(`複製エラー: ${data.error}`);
      }
    } catch (error) {
      alert("複製中にエラーが発生しました");
      console.error("複製エラー:", error);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="text-gray-500">読み込み中...</div>
      </div>
    );
  }

  if (formats.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-500 mb-4">登録されている大会フォーマットがありません</div>
        <Button asChild className="bg-blue-600 hover:bg-blue-700">
          <Link href="/admin/tournament-formats/create">
            最初のフォーマットを作成
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {formats.map((format) => (
        <div
          key={format.format_id}
          className="border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow"
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center space-x-3 mb-2">
                <h3 className="text-lg font-semibold text-gray-900">
                  {format.format_name}
                </h3>
                <Badge variant="default" className="bg-blue-600 hover:bg-blue-700">
                  {format.sport_name}
                </Badge>
                <Badge variant="secondary" className="flex items-center space-x-1">
                  <Users className="h-3 w-3" />
                  <span>{format.target_team_count}チーム</span>
                </Badge>
                {format.template_count !== undefined && (
                  <Badge variant="outline" className="flex items-center space-x-1">
                    <Calendar className="h-3 w-3" />
                    <span>{format.template_count}試合</span>
                  </Badge>
                )}
              </div>
              
              <p className="text-gray-600 mb-3 leading-relaxed">
                {format.format_description}
              </p>
              
              <div className="text-sm text-gray-500">
                作成日: {new Date(format.created_at).toLocaleDateString('ja-JP')}
              </div>
            </div>
            
            <div className="flex items-center space-x-2 ml-6">
              <Button
                asChild
                variant="outline"
                size="sm"
                className="hover:bg-blue-50 hover:border-blue-300"
              >
                <Link href={`/admin/tournament-formats/${format.format_id}/edit`}>
                  <Edit className="h-4 w-4 mr-1" />
                  編集
                </Link>
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDuplicate(format.format_id)}
                className="hover:bg-green-50 hover:border-green-300"
              >
                <Copy className="h-4 w-4 mr-1" />
                複製
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDelete(format.format_id, format.format_name)}
                disabled={deletingId === format.format_id}
                className="hover:bg-red-50 hover:border-red-300 hover:text-red-600"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                {deletingId === format.format_id ? "削除中..." : "削除"}
              </Button>
            </div>
          </div>
        </div>
      ))}
      
      <div className="text-center pt-6">
        <Button asChild variant="outline" className="border-2 border-blue-200 hover:bg-blue-50">
          <Link href="/admin/tournament-formats/create">
            + 新しいフォーマットを作成
          </Link>
        </Button>
      </div>
    </div>
  );
}