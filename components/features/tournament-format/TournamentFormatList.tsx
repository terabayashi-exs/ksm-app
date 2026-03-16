"use client";

import { useState, useEffect, useMemo } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Edit, Trash2, Copy, Users, Calendar, Lock, Globe, ShieldCheck, Search, X } from "lucide-react";
import FormatDetailBadges, { getSportIcon } from "./FormatDetailBadges";
import { FormatAccessModal } from "./FormatAccessModal";

interface SportType {
  sport_type_id: number;
  sport_name: string;
  sport_code: string;
}

interface TournamentFormat {
  format_id: number;
  format_name: string;
  sport_type_id: number;
  target_team_count: number;
  format_description: string;
  default_match_duration: number | null;
  default_break_duration: number | null;
  created_at: string;
  sport_name: string;
  sport_code: string;
  template_count?: number;
  matchday_count?: number;
  visibility?: string;
  phase_stats?: Array<{ phase: string; phase_name: string; order: number; block_count: number; max_court_number: number | null }>;
}

export default function TournamentFormatList() {
  const { data: session } = useSession();
  const isSuperadmin = (session?.user as { isSuperadmin?: boolean } | undefined)?.isSuperadmin ?? false;
  const [formats, setFormats] = useState<TournamentFormat[]>([]);
  const [sportTypes, setSportTypes] = useState<SportType[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [togglingVisibilityId, setTogglingVisibilityId] = useState<number | null>(null);
  const [accessModalFormat, setAccessModalFormat] = useState<TournamentFormat | null>(null);

  // 検索条件
  const [searchKeyword, setSearchKeyword] = useState("");
  const [selectedSportTypeId, setSelectedSportTypeId] = useState("");

  // フォーマット一覧・競技種別を取得
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [fmtRes, sportRes] = await Promise.all([
          fetch("/api/admin/tournament-formats"),
          fetch("/api/sport-types"),
        ]);
        const fmtData = await fmtRes.json();
        const sportData = await sportRes.json();

        if (fmtData.success) setFormats(fmtData.formats);
        if (sportData.success) setSportTypes(sportData.data || sportData.sport_types || []);
      } catch (error) {
        console.error("データ取得エラー:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const fetchFormats = async () => {
    try {
      const response = await fetch("/api/admin/tournament-formats");
      const data = await response.json();
      if (data.success) setFormats(data.formats);
    } catch (error) {
      console.error("フォーマット取得エラー:", error);
    }
  };

  // クライアントサイドフィルタリング
  const filteredFormats = useMemo(() => {
    let result = formats;

    // フリーワード検索（フォーマット名・説明）
    if (searchKeyword.trim()) {
      const kw = searchKeyword.trim().toLowerCase();
      result = result.filter(f =>
        f.format_name.toLowerCase().includes(kw) ||
        (f.format_description && f.format_description.toLowerCase().includes(kw))
      );
    }

    // 競技種別フィルタ
    if (selectedSportTypeId) {
      const sportId = Number(selectedSportTypeId);
      result = result.filter(f => Number(f.sport_type_id) === sportId);
    }

    return result;
  }, [formats, searchKeyword, selectedSportTypeId]);

  const hasActiveFilter = searchKeyword.trim() !== "" || selectedSportTypeId !== "";

  const handleClearSearch = () => {
    setSearchKeyword("");
    setSelectedSportTypeId("");
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
        fetchFormats();
        alert(`フォーマットを複製しました: ${data.newFormat.format_name}`);
      } else {
        alert(`複製エラー: ${data.error}`);
      }
    } catch (error) {
      alert("複製中にエラーが発生しました");
      console.error("複製エラー:", error);
    }
  };

  // visibility切替
  const handleToggleVisibility = async (formatId: number, currentVisibility: string) => {
    const newVisibility = currentVisibility === 'public' ? 'restricted' : 'public';
    const action = newVisibility === 'restricted' ? '制限' : '公開';

    if (!confirm(`このフォーマットを「${action}」に変更しますか？`)) return;

    setTogglingVisibilityId(formatId);
    try {
      const response = await fetch(`/api/admin/tournament-formats/${formatId}/visibility`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibility: newVisibility }),
      });

      const data = await response.json();

      if (data.success) {
        setFormats(formats.map(f =>
          f.format_id === formatId ? { ...f, visibility: newVisibility } : f
        ));
      } else {
        alert(`変更エラー: ${data.error}`);
      }
    } catch (error) {
      alert("変更中にエラーが発生しました");
      console.error("visibility変更エラー:", error);
    } finally {
      setTogglingVisibilityId(null);
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
        <Button asChild className="bg-primary hover:bg-primary/90">
          <Link href="/admin/tournament-formats/create">
            最初のフォーマットを作成
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 検索フィルター */}
      <div className="border border-gray-200 rounded-lg p-4 space-y-4">
        {/* フリーワード検索 */}
        <div>
          <label className="text-sm font-medium mb-1.5 block text-gray-700">フリーワード検索</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              type="text"
              placeholder="フォーマット名・説明で検索"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* 競技種別 */}
        {sportTypes.length > 0 && (
          <div>
            <label className="text-sm font-medium mb-1.5 block text-gray-700">競技から絞り込み</label>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedSportTypeId("")}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 transition-all text-sm ${
                  selectedSportTypeId === ""
                    ? "border-blue-600 bg-blue-50 text-blue-700"
                    : "border-gray-200 hover:border-blue-300 hover:bg-blue-50/50"
                }`}
              >
                <span>&#x1F3C6;</span>
                <span>全て</span>
              </button>
              {sportTypes.map((sport) => (
                <button
                  key={sport.sport_type_id}
                  onClick={() => setSelectedSportTypeId(String(sport.sport_type_id))}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 transition-all text-sm ${
                    selectedSportTypeId === String(sport.sport_type_id)
                      ? "border-blue-600 bg-blue-50 text-blue-700"
                      : "border-gray-200 hover:border-blue-300 hover:bg-blue-50/50"
                  }`}
                >
                  <span>{getSportIcon(sport.sport_code)}</span>
                  <span>{sport.sport_name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* クリアボタン */}
        {hasActiveFilter && (
          <div className="flex items-center justify-between pt-1">
            <p className="text-sm text-gray-500">
              {filteredFormats.length}件 / {formats.length}件 表示中
            </p>
            <Button variant="outline" size="sm" onClick={handleClearSearch}>
              <X className="w-4 h-4 mr-1" />
              条件をクリア
            </Button>
          </div>
        )}
      </div>

      {/* フォーマット一覧 */}
      {filteredFormats.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          検索条件に一致するフォーマットがありません
        </div>
      ) : (
        filteredFormats.map((format) => {
          const visibility = format.visibility || 'public';
          const isRestricted = visibility === 'restricted';

          return (
          <div
            key={format.format_id}
            className="border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-3 mb-2">
                  <h3 className="text-lg font-semibold text-gray-900">
                    <span className="mr-1.5">{getSportIcon(format.sport_code)}</span>
                    {format.format_name}
                  </h3>
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
                  {isRestricted ? (
                    <Badge className="bg-orange-100 text-orange-800 flex items-center space-x-1">
                      <Lock className="h-3 w-3" />
                      <span>制限</span>
                    </Badge>
                  ) : (
                    <Badge className="bg-green-100 text-green-800 flex items-center space-x-1">
                      <Globe className="h-3 w-3" />
                      <span>公開</span>
                    </Badge>
                  )}
                </div>

                <p className="text-gray-600 mb-3 leading-relaxed">
                  {format.format_description}
                </p>

                <FormatDetailBadges
                  default_match_duration={format.default_match_duration}
                  default_break_duration={format.default_break_duration}
                  matchday_count={format.matchday_count}
                  phase_stats={format.phase_stats}
                />
              </div>

              <div className="flex items-center space-x-2 ml-6">
                {isSuperadmin && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleToggleVisibility(format.format_id, visibility)}
                      disabled={togglingVisibilityId === format.format_id}
                      className={isRestricted
                        ? "hover:bg-green-50 hover:border-green-300"
                        : "hover:bg-orange-50 hover:border-orange-300"
                      }
                    >
                      {isRestricted ? (
                        <><Globe className="h-4 w-4 mr-1" />公開にする</>
                      ) : (
                        <><Lock className="h-4 w-4 mr-1" />制限にする</>
                      )}
                    </Button>
                    {isRestricted && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setAccessModalFormat(format)}
                        className="hover:bg-purple-50 hover:border-purple-300"
                      >
                        <ShieldCheck className="h-4 w-4 mr-1" />
                        アクセス管理
                      </Button>
                    )}
                  </>
                )}
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
                  className="hover:bg-destructive/5 hover:border-destructive/30 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  {deletingId === format.format_id ? "削除中..." : "削除"}
                </Button>
              </div>
            </div>
          </div>
          );
        })
      )}

      <div className="text-center pt-6">
        <Button asChild variant="outline" className="border-2 border-blue-200 hover:bg-blue-50">
          <Link href="/admin/tournament-formats/create">
            + 新しいフォーマットを作成
          </Link>
        </Button>
      </div>

      {/* アクセス管理モーダル */}
      {accessModalFormat && (
        <FormatAccessModal
          formatId={accessModalFormat.format_id}
          formatName={accessModalFormat.format_name}
          onClose={() => setAccessModalFormat(null)}
        />
      )}
    </div>
  );
}
