'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import Image from 'next/image';
import { Calendar, MapPin, Users, Trophy, ChevronDown, ChevronUp, CheckCircle, Building2 } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { getStatusLabel, type TournamentStatus } from '@/lib/tournament-status';

interface Tournament {
  tournament_id: number;
  tournament_name: string;
  format_name: string;
  venue_name: string;
  team_count: number;
  status: TournamentStatus;
  event_start_date: string;
  category_name?: string | null;
  logo_blob_url?: string | null;
  organization_name?: string | null;
  is_joined?: boolean;
  recruitment_start_date?: string;
  recruitment_end_date?: string;
}

interface TournamentGroup {
  group_id: number;
  group_name: string;
  group_description?: string;
  group_color: string;
  display_order: number;
  organizer?: string | null;
  venue_name?: string | null;
  event_start_date?: string | null;
  event_end_date?: string | null;
}

interface TournamentGroupCardProps {
  group: TournamentGroup;
  tournaments: Tournament[];
  userRole?: string;
}

export default function TournamentGroupCard({ group, tournaments, userRole }: TournamentGroupCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const formatDateRange = (startDate: string | null | undefined, endDate: string | null | undefined) => {
    if (!startDate && !endDate) return '';
    if (!endDate || startDate === endDate) {
      return startDate ? formatDate(startDate) : '';
    }
    // startDateとendDateがnullでないことを保証
    if (!startDate || !endDate) return '';
    return `${formatDate(startDate)} 〜 ${formatDate(endDate)}`;
  };

  const getStatusBadge = (status: TournamentStatus) => {
    switch (status) {
      case 'before_recruitment':
        return 'bg-gray-100 text-gray-800';
      case 'recruiting':
        return 'bg-blue-100 text-blue-800';
      case 'before_event':
        return 'bg-yellow-100 text-yellow-800';
      case 'ongoing':
        return 'bg-green-100 text-green-800';
      case 'completed':
        return 'bg-muted text-foreground';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status: TournamentStatus) => {
    return getStatusLabel(status);
  };

  // 代表的なロゴを取得（最初の大会のロゴ）
  const representativeLogo = tournaments.find(t => t.logo_blob_url)?.logo_blob_url;
  const representativeOrganization = tournaments.find(t => t.organization_name)?.organization_name;

  return (
    <Card className="hover:shadow-lg transition-shadow bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border-2 border-blue-200 dark:border-blue-800 relative overflow-hidden">
      {/* グループカラーの左ボーダー */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1"
        style={{ backgroundColor: group.group_color }}
      />
      
      {/* 背景ロゴ */}
      {representativeLogo && (
        <div className="absolute inset-0 opacity-5">
          <Image
            src={representativeLogo}
            alt={representativeOrganization || '主催者ロゴ'}
            fill
            className="object-contain object-center"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          />
        </div>
      )}

      <CardHeader className="relative z-10">
        <div className="flex items-center justify-between mb-2">
          <CardTitle className="text-xl font-bold">{group.group_name}</CardTitle>
          <div className="text-sm text-muted-foreground">
            {tournaments.length}部門
          </div>
        </div>
        {group.group_description && (
          <CardDescription className="text-base">
            {group.group_description}
          </CardDescription>
        )}

        {/* 大会情報 */}
        <div className="flex flex-wrap gap-3 mt-3 text-sm text-muted-foreground">
          {group.organizer && (
            <span className="flex items-center gap-1">
              <Building2 className="h-4 w-4" />
              {group.organizer}
            </span>
          )}
          {group.venue_name && (
            <span className="flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              {group.venue_name}
            </span>
          )}
          {(group.event_start_date || group.event_end_date) && (
            <span className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              {formatDateRange(group.event_start_date, group.event_end_date)}
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className="relative z-10">
        {/* 大会リスト */}
        {isExpanded && (
          <div className="space-y-3">
            {tournaments.map((tournament) => (
            <div
              key={tournament.tournament_id}
              className="border-2 border-blue-200 dark:border-blue-800 rounded-lg p-4 bg-gradient-to-r from-white to-blue-50 dark:from-blue-950/20 dark:to-indigo-950/20 hover:shadow-md transition-all"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-semibold text-base">
                      {tournament.category_name || tournament.tournament_name}
                    </h4>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(tournament.status)}`}>
                      {getStatusText(tournament.status)}
                    </span>
                    {tournament.is_joined && (
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 flex items-center">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        参加済み
                      </span>
                    )}
                  </div>
                  
                  {tournament.category_name && (
                    <p className="text-sm text-muted-foreground mb-2">
                      {tournament.tournament_name}
                    </p>
                  )}
                  
                  <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Trophy className="h-3 w-3" />
                      {tournament.format_name}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {tournament.team_count}チーム
                    </span>
                    {tournament.event_start_date && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(tournament.event_start_date)}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {tournament.venue_name || '会場未定'}
                    </span>
                  </div>
                </div>
                
                <div className="flex flex-col gap-1 ml-4">
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/public/tournaments/${tournament.tournament_id}`}>
                      詳細
                    </Link>
                  </Button>
                  
                  {/* 参加済みの場合は参加選手変更ボタンを表示 */}
                  {tournament.is_joined && userRole === 'team' && (
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/tournaments/${tournament.tournament_id}/teams`}>
                        選手変更
                      </Link>
                    </Button>
                  )}
                  
                  {/* 未参加かつ募集期間中の場合に参加ボタンを表示 */}
                  {!tournament.is_joined &&
                   tournament.recruitment_start_date && 
                   tournament.recruitment_end_date && 
                   new Date(tournament.recruitment_start_date) <= new Date() && 
                   new Date() <= new Date(tournament.recruitment_end_date) &&
                   tournament.status !== 'ongoing' &&
                   tournament.status !== 'completed' && (
                    <Button asChild size="sm" variant="outline">
                      <Link href={
                        userRole === 'team' 
                          ? `/tournaments/${tournament.tournament_id}/join`
                          : `/auth/login?callbackUrl=${encodeURIComponent(`/tournaments/${tournament.tournament_id}/join`)}`
                      }>
                        参加
                      </Link>
                    </Button>
                  )}
                </div>
              </div>
            </div>
            ))}
          </div>
        )}

        {/* 展開/折りたたみボタン */}
        {tournaments.length > 0 && (
          <div className="mt-4 text-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-muted-foreground hover:text-foreground"
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="h-4 w-4 mr-1" />
                  折りたたむ
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4 mr-1" />
                  部門を表示
                </>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}