'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Bell, AlertCircle } from 'lucide-react';

interface Announcement {
  announcement_id: number;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export default function AnnouncementList() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAnnouncements = async () => {
      try {
        const response = await fetch('/api/announcements');
        if (!response.ok) {
          throw new Error('お知らせの取得に失敗しました');
        }
        const result = await response.json();
        setAnnouncements(result.announcements);
      } catch (err) {
        console.error('Error fetching announcements:', err);
        setError(err instanceof Error ? err.message : 'エラーが発生しました');
      } finally {
        setLoading(false);
      }
    };

    fetchAnnouncements();
  }, []);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-blue-600" />
            お知らせ
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">読み込み中...</div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-blue-600" />
            お知らせ
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" />
            <span>{error}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (announcements.length === 0) {
    return null; // お知らせがない場合は表示しない
  }

  return (
    <Card className="bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-blue-800 dark:text-blue-200">
          <Bell className="h-5 w-5" />
          お知らせ
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {announcements.map((announcement) => (
            <div
              key={announcement.announcement_id}
              className="bg-white dark:bg-gray-900 rounded-lg p-4 border border-blue-100 dark:border-blue-900 hover:shadow-md transition-shadow"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-foreground">{announcement.title}</h3>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(announcement.created_at).toLocaleDateString('ja-JP', {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                    })}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {announcement.content}
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
