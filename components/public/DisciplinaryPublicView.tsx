'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ShieldAlert } from 'lucide-react';
import {
  CARD_TYPE_LABELS,
  getReasonLabel,
  type CardType,
} from '@/lib/disciplinary-constants';
import { formatDateOnly } from '@/lib/utils';

interface DisciplinaryAction {
  action_id: number;
  match_id: number;
  tournament_team_id: number;
  player_name: string;
  card_type: CardType;
  reason_code: number;
  reason_text: string | null;
  suspension_matches: number;
  created_at: string;
  match_code?: string;
  tournament_date?: string;
}

interface TeamData {
  tournament_team_id: number;
  team_name: string;
  penaltyPoints: number;
  actions: DisciplinaryAction[];
}

interface Settings {
  yellow_threshold: number;
  is_enabled: number;
}

interface DisciplinaryPublicViewProps {
  teams: TeamData[];
  settings: Settings;
}

function CardIcon({ cardType }: { cardType: CardType }) {
  if (cardType === 'yellow') {
    return (
      <span className="inline-block w-4 h-5 bg-yellow-400 rounded-sm border border-yellow-500" title="イエローカード" />
    );
  }
  if (cardType === 'red' || cardType === 'second_yellow') {
    return (
      <span className="inline-block w-4 h-5 bg-red-500 rounded-sm border border-red-600" title={CARD_TYPE_LABELS[cardType]} />
    );
  }
  return null;
}

export default function DisciplinaryPublicView({ teams, settings }: DisciplinaryPublicViewProps) {
  if (!settings.is_enabled) {
    return (
      <div className="text-center py-12 text-gray-500">
        この部門では懲罰機能は無効です。
      </div>
    );
  }

  if (teams.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <ShieldAlert className="h-12 w-12 mx-auto mb-4 text-gray-300" />
        <p>現在、記録されている懲罰はありません。</p>
      </div>
    );
  }

  const totalActions = teams.reduce((sum, t) => sum + t.actions.length, 0);

  return (
    <div className="space-y-6">
      {/* サマリー */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="text-center p-3 bg-gray-50 rounded-lg">
          <p className="text-2xl font-bold text-gray-900">{totalActions}</p>
          <p className="text-xs text-gray-500">総カード数</p>
        </div>
        <div className="text-center p-3 bg-yellow-50 rounded-lg">
          <p className="text-2xl font-bold text-yellow-600">
            {teams.reduce((sum, t) => sum + t.actions.filter((a) => a.card_type === 'yellow').length, 0)}
          </p>
          <p className="text-xs text-gray-500">イエロー</p>
        </div>
        <div className="text-center p-3 bg-red-50 rounded-lg">
          <p className="text-2xl font-bold text-red-600">
            {teams.reduce((sum, t) => sum + t.actions.filter((a) => a.card_type === 'red' || a.card_type === 'second_yellow').length, 0)}
          </p>
          <p className="text-xs text-gray-500">レッド</p>
        </div>
        <div className="text-center p-3 bg-gray-50 rounded-lg">
          <p className="text-2xl font-bold text-gray-900">{settings.yellow_threshold}</p>
          <p className="text-xs text-gray-500">累積閾値</p>
        </div>
      </div>

      {/* チームごとの懲罰一覧 */}
      {teams.map((team) => (
        <Card key={team.tournament_team_id}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              <span>{team.team_name}</span>
              <span className="text-sm font-normal text-gray-500">
                懲罰ポイント: <span className="font-bold text-gray-900">{team.penaltyPoints}</span>
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="pb-2 pr-4">選手</th>
                    <th className="pb-2 pr-4">カード</th>
                    <th className="pb-2 pr-4 hidden sm:table-cell">理由</th>
                    <th className="pb-2 pr-4 hidden md:table-cell">試合</th>
                    <th className="pb-2 hidden md:table-cell">日付</th>
                  </tr>
                </thead>
                <tbody>
                  {team.actions.map((action) => (
                    <tr key={action.action_id} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-medium">{action.player_name}</td>
                      <td className="py-2 pr-4">
                        <div className="flex items-center gap-1.5">
                          <CardIcon cardType={action.card_type} />
                          <span className="hidden sm:inline text-xs text-gray-600">
                            {CARD_TYPE_LABELS[action.card_type]}
                          </span>
                        </div>
                      </td>
                      <td className="py-2 pr-4 text-gray-600 hidden sm:table-cell max-w-48 truncate">
                        {getReasonLabel(action.reason_code)}
                      </td>
                      <td className="py-2 pr-4 text-gray-500 hidden md:table-cell">
                        {action.match_code || `#${action.match_id}`}
                      </td>
                      <td className="py-2 text-gray-500 hidden md:table-cell">
                        {action.tournament_date ? formatDateOnly(action.tournament_date) : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
