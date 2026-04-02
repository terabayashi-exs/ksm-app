"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bell } from "lucide-react";

interface Notice {
  tournament_notice_id: number;
  content: string;
  updated_at: string | null;
}

interface Props {
  tournamentId: number;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
}

export default function PublicNoticeList({ tournamentId }: Props) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotices = useCallback(async () => {
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/notices`, { cache: "no-store" });
      const data = await res.json();
      if (data.success && data.notices.length > 0) {
        setNotices(data.notices);
      }
    } catch {
      // 静かに失敗
    } finally {
      setLoading(false);
    }
  }, [tournamentId]);

  useEffect(() => {
    fetchNotices();
  }, [fetchNotices]);

  if (loading || notices.length === 0) return null;

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold flex items-center">
        <Bell className="h-5 w-5 mr-2 text-amber-600" />
        お知らせ
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {notices.map((notice) => (
          <Card key={notice.tournament_notice_id} className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center">
                <Bell className="h-5 w-5 mr-2 text-amber-600 flex-shrink-0" />
                <span className="line-clamp-1">お知らせ</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-sm text-gray-700 whitespace-pre-wrap mb-3">
                {notice.content}
              </p>
              {notice.updated_at && (
                <div className="text-xs text-gray-500">
                  📅 {formatDate(notice.updated_at)}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
