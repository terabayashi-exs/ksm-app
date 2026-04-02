'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Calendar, Trophy, Users, BarChart3, Award, GitBranch } from 'lucide-react';
import type { TournamentPhase } from '@/lib/types/tournament-phases';

interface TournamentTabNavProps {
  tournamentId: number;
  phases: TournamentPhase[];
  sportCode?: string;
}

function getPhaseIcon(phase: TournamentPhase) {
  if (phase.format_type === 'tournament') {
    return <Award className="h-4 w-4 mr-1.5" />;
  }
  return <GitBranch className="h-4 w-4 mr-1.5" />;
}

interface TabDef {
  value: string;
  href: string;
  label: string;
  icon: React.ReactNode;
}

export default function TournamentTabNav({ tournamentId, phases, sportCode: _sportCode }: TournamentTabNavProps) {
  const pathname = usePathname();
  const basePath = `/tournaments/${tournamentId}`;

  const tabs: TabDef[] = [
    {
      value: 'schedule',
      href: `${basePath}/schedule`,
      label: '日程・結果',
      icon: <Calendar className="h-4 w-4 mr-1.5" />,
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
      icon: <BarChart3 className="h-4 w-4 mr-1.5" />,
    },
    {
      value: 'teams',
      href: `${basePath}/teams`,
      label: '参加チーム',
      icon: <Users className="h-4 w-4 mr-1.5" />,
    },
    // TODO: テスト完了後に懲罰タブを有効化する
    // ...(sportCode && isDisciplinarySport(sportCode) ? [{
    //   value: 'disciplinary',
    //   href: `${basePath}/disciplinary`,
    //   label: '懲罰',
    //   icon: <ShieldAlert className="h-4 w-4 mr-1.5" />,
    // }] : []),
    {
      value: 'overview',
      href: basePath,
      label: '概要',
      icon: <Trophy className="h-4 w-4 mr-1.5" />,
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
            flex items-center justify-center whitespace-nowrap py-2.5 px-1 text-[11px] sm:text-sm rounded-md font-medium transition-colors
            ${isActive(tab)
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'bg-gray-50 text-gray-500 hover:bg-gray-50/80 hover:text-gray-900'
            }
          `}
        >
          <span className="hidden sm:inline-flex items-center">{tab.icon}</span>
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
