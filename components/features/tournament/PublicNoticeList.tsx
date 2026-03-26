"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bell } from "lucide-react";

interface Notice {
  tournament_notice_id: number;
  content: string;
}

interface Props {
  tournamentId: number;
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
    <Card id="tournament-notices">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center text-base">
          <Bell className="h-5 w-5 mr-2 text-amber-600" />
          お知らせ
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="max-h-[5em] overflow-y-auto space-y-2">
          {notices.map((notice) => (
            <p key={notice.tournament_notice_id} className="text-sm text-gray-700 whitespace-pre-wrap">
              {notice.content}
            </p>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
