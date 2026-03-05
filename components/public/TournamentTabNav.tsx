'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Calendar, Trophy, Users, BarChart3, Award, GitBranch } from 'lucide-react';
import type { TournamentPhase } from '@/lib/types/tournament-phases';

interface TournamentTabNavProps {
  tournamentId: number;
  phases: TournamentPhase[];
}

function getPhaseIcon(phase: TournamentPhase) {
  if (phase.format_type === 'tournament') {
    return <Award className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />;
  }
  return <GitBranch className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />;
}

interface TabDef {
  value: string;
  href: string;
  label: string;
  shortLabel?: string;
  icon: React.ReactNode;
}

export default function TournamentTabNav({ tournamentId, phases }: TournamentTabNavProps) {
  const pathname = usePathname();
  const basePath = `/public/tournaments/${tournamentId}`;

  const tabs: TabDef[] = [
    {
      value: 'overview',
      href: basePath,
      label: '大会概要',
      shortLabel: '概要',
      icon: <Trophy className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />,
    },
    {
      value: 'schedule',
      href: `${basePath}/schedule`,
      label: '日程・結果',
      shortLabel: '日程',
      icon: <Calendar className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />,
    },
    ...phases.map((phase) => ({
      value: `phase_${phase.id}`,
      href: `${basePath}/phase/${phase.id}`,
      label: phase.name,
      icon: getPhaseIcon(phase),
    })),
    {
      value: 'standings',
      href: `${basePath}/standings`,
      label: '順位表',
      icon: <BarChart3 className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />,
    },
    {
      value: 'teams',
      href: `${basePath}/teams`,
      label: '参加チーム',
      shortLabel: 'チーム',
      icon: <Users className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />,
    },
  ];

  const totalTabs = tabs.length;
  const mobileRows = Math.ceil(totalTabs / 3);

  const smGridColsMap: Record<number, string> = {
    4: 'sm:grid-cols-4',
    5: 'sm:grid-cols-5',
    6: 'sm:grid-cols-6',
    7: 'sm:grid-cols-7',
    8: 'sm:grid-cols-8',
  };
  const mobileGridRowsMap: Record<number, string> = {
    1: 'grid-rows-1',
    2: 'grid-rows-2',
    3: 'grid-rows-3',
  };
  const smGridCols = smGridColsMap[totalTabs] || 'sm:grid-cols-6';
  const mobileGridRows = mobileGridRowsMap[mobileRows] || 'grid-rows-2';

  const isActive = (tab: TabDef) => {
    if (tab.value === 'overview') {
      return pathname === basePath;
    }
    return pathname === tab.href || pathname.startsWith(tab.href + '/');
  };

  return (
    <nav className={`grid w-full mb-8 grid-cols-3 ${mobileGridRows} gap-1 ${smGridCols} sm:grid-rows-1 no-print`}>
      {tabs.map((tab) => (
        <Link
          key={tab.value}
          href={tab.href}
          prefetch={true}
          className={`
            flex items-center justify-center py-3 text-xs sm:text-sm rounded-md font-medium transition-colors
            ${isActive(tab)
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
            }
          `}
        >
          {tab.icon}
          {tab.shortLabel ? (
            <>
              <span className="sm:hidden">{tab.shortLabel}</span>
              <span className="hidden sm:inline">{tab.label}</span>
            </>
          ) : (
            tab.label
          )}
        </Link>
      ))}
    </nav>
  );
}
