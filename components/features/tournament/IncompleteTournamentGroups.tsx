'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { AlertCircle, Plus } from 'lucide-react';

interface IncompleteTournamentGroup {
  group_id: number;
  group_name: string;
  event_description: string | null;
  organizer: string | null;
  venue_id: number | null;
  created_at: string;
  updated_at: string;
  tournament_count: number;
}

export default function IncompleteTournamentGroups() {
  const [incompleteGroups, setIncompleteGroups] = useState<IncompleteTournamentGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchIncompleteGroups = async () => {
      try {
        const response = await fetch('/api/tournament-groups/incomplete');
        const result = await response.json();

        if (result.success && result.data) {
          setIncompleteGroups(result.data);
        }
      } catch (err) {
        console.error('作成中の大会取得エラー:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchIncompleteGroups();
  }, []);

  if (loading) {
    return (
      <div className="text-sm text-muted-foreground">
        読み込み中...
      </div>
    );
  }

  if (incompleteGroups.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        作成中の大会はありません
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {incompleteGroups.map((group) => (
        <div
          key={group.group_id}
          className="p-4 border-2 border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20 rounded-lg"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                <h3 className="font-semibold text-amber-900 dark:text-amber-100">
                  {group.group_name}
                </h3>
              </div>
              {group.event_description && (
                <p className="text-sm text-amber-700 dark:text-amber-300 mb-2">
                  {group.event_description}
                </p>
              )}
              <div className="flex items-center gap-4 text-xs text-amber-600 dark:text-amber-400">
                {group.organizer && (
                  <span>主催: {group.organizer}</span>
                )}
                <span>作成日: {new Date(group.created_at).toLocaleDateString('ja-JP')}</span>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Button
                asChild
                size="sm"
                className="bg-green-600 hover:bg-green-700 text-white dark:bg-green-700 dark:hover:bg-green-600"
              >
                <Link href={`/admin/tournaments/create-new?group_id=${group.group_id}`}>
                  <Plus className="w-4 h-4 mr-1" />
                  部門作成
                </Link>
              </Button>
              <Button
                asChild
                size="sm"
                variant="outline"
                className="border-amber-300 hover:bg-amber-100 dark:border-amber-700 dark:hover:bg-amber-950/30"
              >
                <Link href={`/admin/tournament-groups/${group.group_id}/edit`}>
                  編集
                </Link>
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
