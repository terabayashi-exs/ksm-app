'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { DEFAULT_OPERATOR_PERMISSIONS } from '@/lib/types/operator';
import type { TournamentAccessConfig } from '@/lib/types/operator';

interface Tournament {
  tournament_id: number;
  tournament_name: string;
  category_name: string | null;
  group_id: number;
  group_name: string;
}

interface TournamentAccessSelectorProps {
  value: TournamentAccessConfig[];
  onChange: (value: TournamentAccessConfig[]) => void;
  groupId?: number;
}

export default function TournamentAccessSelector({
  value,
  onChange,
  groupId,
}: TournamentAccessSelectorProps) {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTournaments();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  const fetchTournaments = async () => {
    try {
      setLoading(true);
      const url = groupId
        ? `/api/tournament-groups/${groupId}/tournaments`
        : '/api/admin/tournaments/all';
      const response = await fetch(url);
      if (!response.ok) throw new Error('部門一覧の取得に失敗しました');
      const data = await response.json();
      setTournaments(data);
    } catch (error) {
      console.error('部門一覧の取得に失敗しました:', error);
      alert('部門一覧の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const toggleTournament = (tournamentId: number, tournamentName: string, categoryName: string | null, groupId: number, groupName: string) => {
    const existing = value.find((t) => t.tournamentId === tournamentId);
    if (existing) {
      onChange(value.filter((t) => t.tournamentId !== tournamentId));
    } else {
      onChange([
        ...value,
        {
          tournamentId,
          tournamentName,
          categoryName: categoryName || '',
          groupId,
          groupName,
          permissions: DEFAULT_OPERATOR_PERMISSIONS,
        },
      ]);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>アクセス可能な部門と権限</CardTitle>
          <CardDescription>読み込み中...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // groupIdが指定されていない場合の警告
  if (!groupId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>アクセス可能な部門と権限</CardTitle>
          <CardDescription className="text-orange-600">
            ⚠️ この画面は大会の運営者管理画面からアクセスしてください。
            <br />
            大会を指定せずに運営者を登録することはできません。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            大会一覧から特定の大会を選択し、その大会の「運営者管理」ボタンから運営者を追加してください。
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>アクセス可能な部門</CardTitle>
        <CardDescription>
          この運営者がアクセスできる部門を選択してください
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {tournaments.map((tournament) => {
            const isSelected = value.some((t) => t.tournamentId === tournament.tournament_id);

            return (
              <div key={tournament.tournament_id} className="flex items-center gap-3">
                <Checkbox
                  id={`tournament-${tournament.tournament_id}`}
                  checked={isSelected}
                  onCheckedChange={() =>
                    toggleTournament(
                      tournament.tournament_id,
                      tournament.tournament_name,
                      tournament.category_name,
                      tournament.group_id,
                      tournament.group_name
                    )
                  }
                />
                <Label
                  htmlFor={`tournament-${tournament.tournament_id}`}
                  className="cursor-pointer flex-1 text-base"
                >
                  {tournament.category_name || tournament.tournament_name}
                </Label>
              </div>
            );
          })}

          {tournaments.length === 0 && (
            <p className="text-sm text-muted-foreground">部門が見つかりません</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
