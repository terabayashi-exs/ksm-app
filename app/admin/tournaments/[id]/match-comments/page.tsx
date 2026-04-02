'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Header from '@/components/layout/Header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ChevronRight, Home, Save, Loader2, MessageSquare, Calendar, Clock } from 'lucide-react';

interface MatchComment {
  match_id: number;
  match_code: string;
  tournament_date: string;
  start_time: string;
  team1_display_name: string;
  team2_display_name: string;
  match_comment: string | null;
  matchday: number | null;
  court_name: string | null;
  venue_name: string | null;
  phase: string;
  display_round_name: string;
  block_name: string | null;
}

export default function MatchCommentsPage() {
  const params = useParams();
  const tournamentId = params.id as string;

  const [matches, setMatches] = useState<MatchComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingComments, setEditingComments] = useState<Record<number, string>>({});
  const [savingIds, setSavingIds] = useState<Set<number>>(new Set());
  const [filterMatchday, setFilterMatchday] = useState<string>('all');
  const [filterDate, setFilterDate] = useState<string>('all');

  const fetchMatches = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/admin/tournaments/${tournamentId}/match-comments`);
      const data = await res.json();
      if (data.success) {
        setMatches(data.matches);
        // 初期値をセット
        const initial: Record<number, string> = {};
        data.matches.forEach((m: MatchComment) => {
          initial[m.match_id] = m.match_comment || '';
        });
        setEditingComments(initial);
      }
    } catch (error) {
      console.error('取得エラー:', error);
    } finally {
      setLoading(false);
    }
  }, [tournamentId]);

  useEffect(() => {
    fetchMatches();
  }, [fetchMatches]);

  const handleSave = async (matchId: number) => {
    setSavingIds(prev => new Set(prev).add(matchId));
    try {
      const res = await fetch(`/api/admin/tournaments/${tournamentId}/match-comments`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ match_id: matchId, match_comment: editingComments[matchId] }),
      });
      const data = await res.json();
      if (data.success) {
        setMatches(prev => prev.map(m =>
          m.match_id === matchId ? { ...m, match_comment: editingComments[matchId] || null } : m
        ));
      }
    } catch (error) {
      console.error('保存エラー:', error);
    } finally {
      setSavingIds(prev => { const s = new Set(prev); s.delete(matchId); return s; });
    }
  };

  // 節の有無を判定
  const hasMatchdays = useMemo(() => {
    return matches.some(m => m.matchday != null && m.matchday > 0);
  }, [matches]);

  const uniqueMatchdays = useMemo(() => {
    return [...new Set(matches.map(m => m.matchday).filter((md): md is number => md != null && md > 0))].sort((a, b) => a - b);
  }, [matches]);

  const uniqueDates = useMemo(() => {
    return [...new Set(matches.map(m => m.tournament_date).filter(Boolean))].sort();
  }, [matches]);

  const filteredMatches = useMemo(() => {
    let result = matches;
    if (filterMatchday !== 'all') {
      result = result.filter(m => m.matchday === parseInt(filterMatchday));
    }
    if (filterDate !== 'all') {
      result = result.filter(m => m.tournament_date === filterDate);
    }
    return result;
  }, [matches, filterMatchday, filterDate]);

  const formatShortDate = (dateStr: string): string => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    return `${d.getMonth() + 1}/${d.getDate()}(${weekdays[d.getDay()]})`;
  };

  const isChanged = (matchId: number) => {
    const original = matches.find(m => m.match_id === matchId)?.match_comment || '';
    return editingComments[matchId] !== original;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white">
        <Header />
        <div className="flex justify-center items-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <Header />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <nav className="flex flex-wrap items-center gap-1.5 text-sm mb-6">
          <Link href="/" className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 transition-colors whitespace-nowrap">
            <Home className="h-3.5 w-3.5" />
            <span>Home</span>
          </Link>
          <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <Link href="/my?tab=admin" className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 transition-colors whitespace-nowrap">
            マイダッシュボード
          </Link>
          <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <span className="inline-flex items-center px-2.5 py-1.5 rounded-md bg-primary/10 text-primary font-medium">
            試合コメント
          </span>
        </nav>

        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">試合コメント</h1>
          <p className="text-sm text-gray-500 mt-1">
            各試合にコメントを設定できます。設定したコメントは日程・結果ページに表示されます。
          </p>
        </div>

        {/* フィルター */}
        <div className="flex flex-wrap gap-4 mb-6">
          {hasMatchdays && (
            <div>
              <label className="block text-sm font-medium mb-1">節</label>
              <select
                value={filterMatchday}
                onChange={(e) => setFilterMatchday(e.target.value)}
                className="p-2 border rounded-md text-sm"
              >
                <option value="all">すべて</option>
                {uniqueMatchdays.map(md => (
                  <option key={md} value={md}>第{md}節</option>
                ))}
              </select>
            </div>
          )}
          {!hasMatchdays && uniqueDates.length > 1 && (
            <div>
              <label className="block text-sm font-medium mb-1">開催日</label>
              <select
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="p-2 border rounded-md text-sm"
              >
                <option value="all">すべて</option>
                {uniqueDates.map(date => (
                  <option key={date} value={date}>{formatShortDate(date)}</option>
                ))}
              </select>
            </div>
          )}
          <div className="flex items-end">
            <span className="text-sm text-gray-500">{filteredMatches.length}試合</span>
          </div>
        </div>

        {/* 試合一覧 */}
        <div className="space-y-3">
          {filteredMatches.map((match) => (
            <Card key={match.match_id}>
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                  {/* 試合情報 */}
                  <div className="sm:w-64 shrink-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-lg text-primary">{match.match_code}</span>
                      {match.matchday && (
                        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">第{match.matchday}節</span>
                      )}
                    </div>
                    <div className="text-sm font-medium">
                      {match.team1_display_name || '未定'} vs {match.team2_display_name || '未定'}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                      {match.tournament_date && (
                        <span className="flex items-center gap-0.5">
                          <Calendar className="h-3 w-3" />
                          {formatShortDate(match.tournament_date)}
                        </span>
                      )}
                      {match.start_time && (
                        <span className="flex items-center gap-0.5">
                          <Clock className="h-3 w-3" />
                          {match.start_time.substring(0, 5)}
                        </span>
                      )}
                      {match.venue_name && <span>{match.venue_name}</span>}
                    </div>
                  </div>
                  {/* コメント入力 */}
                  <div className="flex-1">
                    <div className="flex items-center gap-1 mb-1">
                      <MessageSquare className="h-3.5 w-3.5 text-gray-400" />
                      <span className="text-xs text-gray-500">コメント</span>
                    </div>
                    <div className="flex gap-2">
                      <Textarea
                        value={editingComments[match.match_id] ?? ''}
                        onChange={(e) => setEditingComments(prev => ({ ...prev, [match.match_id]: e.target.value }))}
                        placeholder="例: 審判担当: ○○チーム"
                        className="text-sm min-h-[60px] resize-none"
                        rows={2}
                      />
                      <Button
                        size="sm"
                        onClick={() => handleSave(match.match_id)}
                        disabled={!isChanged(match.match_id) || savingIds.has(match.match_id)}
                        className="shrink-0 self-end"
                      >
                        {savingIds.has(match.match_id) ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
