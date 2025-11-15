'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useRouter } from 'next/navigation';

interface Division {
  tournament_id: number;
  tournament_name: string;
}

interface DivisionSwitcherProps {
  currentDivisionId: number;
  currentDivisionName: string;
  siblingDivisions: Division[];
}

export default function DivisionSwitcher({
  currentDivisionId,
  currentDivisionName,
  siblingDivisions
}: DivisionSwitcherProps) {
  const router = useRouter();

  if (siblingDivisions.length === 0) {
    return null;
  }

  return (
    <Select
      value={currentDivisionId.toString()}
      onValueChange={(value) => router.push(`/public/tournaments/${value}`)}
    >
      <SelectTrigger className="w-[280px]">
        <SelectValue placeholder="部門を選択" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={currentDivisionId.toString()}>
          {currentDivisionName} (現在)
        </SelectItem>
        {siblingDivisions.map((division) => (
          <SelectItem
            key={division.tournament_id}
            value={division.tournament_id.toString()}
          >
            {division.tournament_name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
