"use client";

import { Plus, Trash2 } from "lucide-react";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";

// ============================================================
// CORE ENGINE: Tournament Schedule Generator
// ============================================================

function generateBlocks(teamCount: number, preferredBlockSize = 4) {
  // 4チーム基本、余りは5チームブロックに吸収
  if (teamCount < 4) return [{ size: teamCount, label: "A" }];

  const remainder = teamCount % preferredBlockSize;
  const fullBlocks = Math.floor(teamCount / preferredBlockSize);
  const blocks: Array<{ size: number; label: string }> = [];
  const labels = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

  if (remainder === 0) {
    for (let i = 0; i < fullBlocks; i++) {
      blocks.push({ size: preferredBlockSize, label: labels[i] });
    }
  } else if (remainder === 1 && fullBlocks >= 1) {
    // 1余り → 1つの5チームブロック
    for (let i = 0; i < fullBlocks - 1; i++) {
      blocks.push({ size: preferredBlockSize, label: labels[i] });
    }
    blocks.push({ size: preferredBlockSize + 1, label: labels[fullBlocks - 1] });
  } else if (remainder === 2 && fullBlocks >= 1) {
    // 2余り → 2つの5チームブロック or 1つの6チームブロック
    for (let i = 0; i < fullBlocks - 1; i++) {
      blocks.push({ size: preferredBlockSize, label: labels[i] });
    }
    blocks.push({ size: preferredBlockSize + 2, label: labels[fullBlocks - 1] });
  } else if (remainder === 3) {
    // 3余り → 3チームブロック1つ追加
    for (let i = 0; i < fullBlocks; i++) {
      blocks.push({ size: preferredBlockSize, label: labels[i] });
    }
    blocks.push({ size: 3, label: labels[fullBlocks] });
  } else {
    for (let i = 0; i < fullBlocks; i++) {
      blocks.push({ size: preferredBlockSize, label: labels[i] });
    }
    if (remainder > 0) {
      blocks.push({ size: remainder, label: labels[fullBlocks] });
    }
  }

  return blocks;
}

function generateRoundRobin(blockLabel: string, teamCount: number) {
  // Circle method for round robin
  const teams: string[] = [];
  for (let i = 1; i <= teamCount; i++) {
    teams.push(`${blockLabel}${i}`);
  }

  const rounds: Array<Array<[string, string]>> = [];
  const n = teamCount % 2 === 0 ? teamCount : teamCount + 1;
  const participants = [...teams];
  if (teamCount % 2 !== 0) participants.push("BYE");

  const fixed = participants[0];
  const rotating = participants.slice(1);

  for (let r = 0; r < n - 1; r++) {
    const round: Array<[string, string]> = [];
    const current = [fixed, ...rotating];

    for (let i = 0; i < n / 2; i++) {
      const t1 = current[i];
      const t2 = current[n - 1 - i];
      if (t1 !== "BYE" && t2 !== "BYE") {
        round.push([t1, t2]);
      }
    }
    rounds.push(round);

    // Rotate
    const last = rotating.pop()!;
    rotating.unshift(last);
  }

  return rounds;
}

function buildSchedule(
  blocks: Array<{ size: number; label: string }>,
  courtCount: number,
  mode: string,
): Array<ScheduleSlot> {
  const blockRounds: Record<string, Array<Array<[string, string]>>> = {};

  for (const block of blocks) {
    const rounds = generateRoundRobin(block.label, block.size);
    blockRounds[block.label] = rounds;
  }

  if (mode === "league") {
    // リーグ戦モード：節単位で穴あきなしのスケジュール
    return buildLeagueModeSchedule(blocks, blockRounds, courtCount);
  }

  // 他のモードは Array<Array<>> 形式なので変換
  let rawSchedule: Array<Array<[string, string] | null>>;

  if (mode === "fixed") {
    rawSchedule = buildFixedCourtSchedule(blocks, blockRounds, courtCount);
  } else if (mode === "rotation") {
    rawSchedule = buildRotationSchedule(blocks, blockRounds, courtCount);
  } else if (mode === "optimized") {
    rawSchedule = buildOptimizedSchedule(blocks, blockRounds, courtCount);
  } else {
    rawSchedule = buildFixedCourtSchedule(blocks, blockRounds, courtCount);
  }

  return rawSchedule.map((matches) => ({ matches }));
}

type ScheduleSlot = {
  matches: Array<[string, string] | null>;
  round?: number;
};

function buildLeagueModeSchedule(
  blocks: Array<{ size: number; label: string }>,
  blockRounds: Record<string, Array<Array<[string, string]>>>,
  courtCount: number,
): Array<ScheduleSlot> {
  const schedule: Array<ScheduleSlot> = [];

  // 最大ラウンド数を取得
  const maxRounds = Math.max(...Object.values(blockRounds).map((r) => r.length));

  // 各節（ラウンド）ごとに処理
  for (let roundIdx = 0; roundIdx < maxRounds; roundIdx++) {
    const roundMatches: Array<[string, string]> = [];

    // 全ブロックからこのラウンドの試合を集める
    for (const block of blocks) {
      const rounds = blockRounds[block.label];
      if (roundIdx < rounds.length) {
        roundMatches.push(...rounds[roundIdx]);
      }
    }

    // この節の試合をコート数で割って配置（穴あきなし）
    for (let i = 0; i < roundMatches.length; i += courtCount) {
      const matches: Array<[string, string] | null> = [];
      for (let c = 0; c < courtCount; c++) {
        if (i + c < roundMatches.length) {
          matches.push(roundMatches[i + c]);
        } else {
          matches.push(null);
        }
      }
      schedule.push({ matches, round: roundIdx + 1 });
    }
  }

  return schedule;
}

function buildFixedCourtSchedule(
  blocks: Array<{ size: number; label: string }>,
  blockRounds: Record<string, Array<Array<[string, string]>>>,
  courtCount: number,
): Array<Array<[string, string] | null>> {
  const schedule: Array<Array<[string, string] | null>> = [];

  // ブロックをコートに均等に割り当て（ブロック単位でラウンドロビン）
  const courtAssignments: Record<string, number> = {};
  for (let i = 0; i < blocks.length; i++) {
    courtAssignments[blocks[i].label] = i % courtCount;
  }

  // 試合を配置
  let slotIdx = 0;
  const maxRounds = Math.max(...Object.values(blockRounds).map((r) => r.length));

  for (let roundIdx = 0; roundIdx < maxRounds; roundIdx++) {
    const courtMatches: Record<number, Array<[string, string]>> = {};
    for (let c = 0; c < courtCount; c++) courtMatches[c] = [];

    for (const block of blocks) {
      const rounds = blockRounds[block.label];
      if (roundIdx < rounds.length) {
        const court = courtAssignments[block.label];
        for (const match of rounds[roundIdx]) {
          courtMatches[court].push(match);
        }
      }
    }

    // インターリーブ配置
    let hasMore = true;
    const indices: Record<number, number> = {};
    for (let c = 0; c < courtCount; c++) indices[c] = 0;

    while (hasMore) {
      hasMore = false;
      if (slotIdx >= schedule.length) {
        schedule.push(new Array(courtCount).fill(null));
      }

      for (let c = 0; c < courtCount; c++) {
        if (indices[c] < courtMatches[c].length) {
          schedule[slotIdx][c] = courtMatches[c][indices[c]];
          indices[c]++;
          if (indices[c] < courtMatches[c].length) hasMore = true;
        }
      }
      slotIdx++;
    }
  }

  // 空のスロットを削除
  while (schedule.length > 0 && schedule[schedule.length - 1].every((m) => m === null)) {
    schedule.pop();
  }

  return schedule;
}

function buildRotationSchedule(
  blocks: Array<{ size: number; label: string }>,
  blockRounds: Record<string, Array<Array<[string, string]>>>,
  courtCount: number,
): Array<Array<[string, string] | null>> {
  // Rotation: each block rotates courts across rounds
  const allMatches: Array<{
    match: [string, string];
    block: string;
    court: number;
    roundIdx: number;
    blockIdx: number;
  }> = [];

  for (const block of blocks) {
    const rounds = blockRounds[block.label];
    const blockIdx = blocks.findIndex((b) => b.label === block.label);

    rounds.forEach((round, roundIdx) => {
      // Rotate court assignment by round
      const baseCourt = blockIdx % courtCount;
      const court = (baseCourt + roundIdx) % courtCount;

      for (const match of round) {
        allMatches.push({ match, block: block.label, court, roundIdx, blockIdx });
      }
    });
  }

  // Sort: by round first, then spread across slots
  allMatches.sort((a, b) => {
    if (a.roundIdx !== b.roundIdx) return a.roundIdx - b.roundIdx;
    return a.blockIdx - b.blockIdx;
  });

  // Place into schedule respecting court and no-conflict constraint
  const result: Array<Array<[string, string] | null>> = [];
  const placed = new Set();

  for (const item of allMatches) {
    if (placed.has(item)) continue;

    let slotFound = false;
    for (let s = 0; s < result.length; s++) {
      if (result[s][item.court] === null && !hasConflict(result[s], item.match)) {
        result[s][item.court] = item.match;
        placed.add(item);
        slotFound = true;
        break;
      }
    }

    if (!slotFound) {
      const newSlot = new Array(courtCount).fill(null);
      newSlot[item.court] = item.match;
      result.push(newSlot);
      placed.add(item);
    }
  }

  return result;
}

function hasConflict(slot: Array<[string, string] | null>, match: [string, string]): boolean {
  const teamsInSlot = new Set<string>();
  for (const m of slot) {
    if (m) {
      teamsInSlot.add(m[0]);
      teamsInSlot.add(m[1]);
    }
  }
  return teamsInSlot.has(match[0]) || teamsInSlot.has(match[1]);
}

function buildOptimizedSchedule(
  blocks: Array<{ size: number; label: string }>,
  blockRounds: Record<string, Array<Array<[string, string]>>>,
  courtCount: number,
): Array<Array<[string, string] | null>> {
  // Start with rotation schedule, then optimize with simulated annealing
  const initial = buildRotationSchedule(blocks, blockRounds, courtCount);
  return simulatedAnnealing(initial, courtCount, 80000);
}

function simulatedAnnealing(
  schedule: Array<Array<[string, string] | null>>,
  courtCount: number,
  iterations: number,
): Array<Array<[string, string] | null>> {
  let current = schedule.map((slot) => [...slot]);
  let currentScore = evaluateSchedule(current, courtCount);
  let best = current.map((slot) => [...slot]);
  let bestScore = currentScore;

  let temp = 15.0;
  const cooling = 0.99993;

  const rng = mulberry32(42);

  for (let i = 0; i < iterations; i++) {
    const s1 = Math.floor(rng() * current.length);
    const c1 = Math.floor(rng() * courtCount);
    const s2 = Math.floor(rng() * current.length);
    const c2 = Math.floor(rng() * courtCount);

    if (s1 === s2 && c1 === c2) continue;
    if (!current[s1][c1] && !current[s2][c2]) continue;

    // Check conflict
    const newSchedule = current.map((slot) => [...slot]);
    const tmp = newSchedule[s1][c1];
    newSchedule[s1][c1] = newSchedule[s2][c2];
    newSchedule[s2][c2] = tmp;

    // Validate no team plays twice in same slot
    if (hasSlotConflict(newSchedule[s1]) || hasSlotConflict(newSchedule[s2])) continue;

    const newScore = evaluateSchedule(newSchedule, courtCount);
    const delta = newScore - currentScore;

    if (delta < 0 || rng() < Math.exp(-delta / temp)) {
      current = newSchedule;
      currentScore = newScore;
      if (currentScore < bestScore) {
        best = current.map((slot) => [...slot]);
        bestScore = currentScore;
      }
    }

    temp *= cooling;
  }

  return best;
}

function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hasSlotConflict(slot: Array<[string, string] | null>): boolean {
  const teams = new Set<string>();
  for (const m of slot) {
    if (m) {
      if (teams.has(m[0]) || teams.has(m[1])) return true;
      teams.add(m[0]);
      teams.add(m[1]);
    }
  }
  return false;
}

function evaluateSchedule(
  schedule: Array<Array<[string, string] | null>>,
  courtCount: number,
): number {
  const teamCourts: Record<string, number[]> = {};
  const teamSlots: Record<string, number[]> = {};

  for (let s = 0; s < schedule.length; s++) {
    for (let c = 0; c < courtCount; c++) {
      const m = schedule[s][c];
      if (!m) continue;
      for (const t of m) {
        if (!teamCourts[t]) {
          teamCourts[t] = new Array(courtCount).fill(0);
          teamSlots[t] = [];
        }
        teamCourts[t][c]++;
        teamSlots[t].push(s);
      }
    }
  }

  let courtPenalty = 0;
  for (const courts of Object.values(teamCourts)) {
    const total = courts.reduce((a, b) => a + b, 0);
    if (total > 0) {
      const ideal = total / courtCount;
      courtPenalty += courts.reduce((sum, c) => sum + (c - ideal) ** 2, 0);
    }
  }

  let intervalPenalty = 0;
  let minIntervalPenalty = 0;
  for (const slots of Object.values(teamSlots)) {
    slots.sort((a, b) => a - b);
    if (slots.length > 1) {
      const intervals = [];
      for (let i = 0; i < slots.length - 1; i++) {
        intervals.push(slots[i + 1] - slots[i]);
      }
      const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      intervalPenalty += intervals.reduce((sum, iv) => sum + (iv - avg) ** 2, 0);
      minIntervalPenalty += intervals.filter((iv) => iv <= 1).length * 10;
    }
  }

  return courtPenalty * 2 + intervalPenalty * 0.5 + minIntervalPenalty;
}

// ============================================================
// UI COMPONENTS
// ============================================================

const COURT_COLORS = [
  { bg: "#1e40af", light: "#dbeafe", border: "#3b82f6" },
  { bg: "#b45309", light: "#fef3c7", border: "#f59e0b" },
  { bg: "#047857", light: "#d1fae5", border: "#10b981" },
  { bg: "#7c3aed", light: "#ede9fe", border: "#8b5cf6" },
  { bg: "#be185d", light: "#fce7f3", border: "#ec4899" },
];

interface ScheduleSimulatorProps {
  onExportSchedule: (
    schedule: Array<Array<[string, string] | null>>,
    blocks: Array<{ label: string; size: number }>,
    courtCount: number,
    slotRounds?: Array<number | undefined>,
  ) => void;
}

export default function ScheduleSimulator({ onExportSchedule }: ScheduleSimulatorProps) {
  const [teamCount, setTeamCount] = useState(8);
  const [courtCount, setCourtCount] = useState(2);
  const [blocks, setBlocks] = useState(() => generateBlocks(8));
  const [schedule, setSchedule] = useState<Array<ScheduleSlot> | null>(null);
  const [generating, setGenerating] = useState(false);
  const [mode, setMode] = useState<"fixed" | "rotation" | "optimized" | "league">("fixed");

  const handleTeamCountChange = useCallback((count: number) => {
    const c = Math.max(4, Math.min(64, count));
    setTeamCount(c);
    setBlocks(generateBlocks(c));
    setSchedule(null);
  }, []);

  const handleCourtCountChange = useCallback((count: number) => {
    const c = Math.max(1, Math.min(5, count));
    setCourtCount(c);
    setSchedule(null);
  }, []);

  const handleGenerate = useCallback(() => {
    setGenerating(true);
    setTimeout(() => {
      try {
        const result = buildSchedule(blocks, courtCount, mode);
        setSchedule(result);
      } catch (e) {
        console.error(e);
      }
      setGenerating(false);
    }, 50);
  }, [blocks, courtCount, mode]);

  const handleExport = () => {
    if (schedule) {
      const plainSchedule = schedule.map((slot) => slot.matches);
      const slotRounds = schedule.map((slot) => slot.round);
      onExportSchedule(plainSchedule, blocks, courtCount, slotRounds);
    }
  };

  const totalTeamsFromBlocks = blocks.reduce((sum, b) => sum + b.size, 0);

  const modeLabels = {
    fixed: "コート固定",
    rotation: "ラウンドローテーション",
    optimized: "AI最適化",
    league: "リーグ戦モード",
  };

  const modeDescriptions = {
    fixed: "ブロックをコートに固定配置。運営がシンプル。",
    rotation: "ラウンドごとにコートを回転。公平性とシンプルさのバランス。",
    optimized: "焼きなまし法で最適配置を探索。最高の公平性。",
    league: "節単位で穴あきなしのスケジュール。公式リーグ戦向け。",
  };

  const handleAddBlock = () => {
    const labels = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
    const usedLabels = blocks.map((b) => b.label);
    const availableLabel = labels.find((l) => !usedLabels.includes(l));
    if (availableLabel) {
      setBlocks([...blocks, { size: 4, label: availableLabel }]);
      setSchedule(null);
    }
  };

  const handleRemoveBlock = (index: number) => {
    if (blocks.length > 1) {
      const newBlocks = blocks.filter((_, i) => i !== index);
      setBlocks(newBlocks);
      setSchedule(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Input Panel */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Teams & Courts */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
          <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">基本設定</h3>

          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-600 mb-1 block">チーム数</label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => handleTeamCountChange(teamCount - 1)}
                  className="h-8 w-8 p-0"
                >
                  −
                </Button>
                <input
                  type="number"
                  value={teamCount}
                  onChange={(e) => handleTeamCountChange(parseInt(e.target.value) || 4)}
                  className="w-16 h-8 bg-white rounded-lg text-center text-sm font-bold border border-gray-300 focus:border-blue-500 outline-none"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => handleTeamCountChange(teamCount + 1)}
                  className="h-8 w-8 p-0"
                >
                  +
                </Button>
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-600 mb-1 block">コート数</label>
              <div className="flex gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Button
                    key={n}
                    type="button"
                    size="sm"
                    variant={courtCount === n ? "default" : "outline"}
                    onClick={() => handleCourtCountChange(n)}
                    className="w-9 h-8"
                  >
                    {n}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Block Configuration */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">
              ブロック構成
            </h3>
            <span className="text-xs text-gray-600">
              {blocks.length}ブロック / {totalTeamsFromBlocks}チーム
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {blocks.map((block, i) => (
              <div
                key={i}
                className="flex items-center gap-1 bg-gray-50 rounded-lg px-3 py-2 border border-gray-200"
              >
                <span className="text-sm font-bold text-blue-600">{block.label}</span>
                <select
                  value={block.size}
                  onChange={(e) => {
                    const newBlocks = [...blocks];
                    newBlocks[i] = { ...block, size: parseInt(e.target.value) };
                    setBlocks(newBlocks);
                    setSchedule(null);
                  }}
                  className="bg-white text-gray-800 text-sm rounded px-1.5 py-0.5 border border-gray-300 outline-none cursor-pointer"
                >
                  {[3, 4, 5, 6, 7, 8].map((n) => (
                    <option key={n} value={n}>
                      {n}チーム
                    </option>
                  ))}
                </select>
                {blocks.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveBlock(i)}
                    className="ml-1 text-red-500 hover:text-red-600 transition-colors"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleAddBlock}
              className="text-xs"
              disabled={blocks.length >= 26}
            >
              <Plus className="h-3 w-3 mr-1" />
              ブロック追加
            </Button>
            <button
              type="button"
              onClick={() => {
                setBlocks(generateBlocks(teamCount));
                setSchedule(null);
              }}
              className="text-xs text-blue-600 hover:text-blue-700 transition-colors"
            >
              自動ブロック分けに戻す
            </button>
          </div>
          {totalTeamsFromBlocks !== teamCount && (
            <p className="text-xs text-yellow-600">
              ⚠ チーム数合計が{totalTeamsFromBlocks}です（設定: {teamCount}）
            </p>
          )}
        </div>

        {/* Mode Selection */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">生成モード</h3>
          <div className="space-y-2">
            {(["fixed", "rotation", "optimized", "league"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setSchedule(null);
                }}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all ${
                  mode === m
                    ? "bg-primary/5 border border-primary/20 text-primary"
                    : "bg-gray-50 border border-gray-200 text-gray-700 hover:bg-gray-100"
                }`}
              >
                <div className="font-medium text-xs">{modeLabels[m]}</div>
                <div className="text-xs mt-0.5 opacity-70">{modeDescriptions[m]}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {generating ? "生成中..." : `${modeLabels[mode]}で生成`}
          </Button>
          {schedule && (
            <Button
              type="button"
              onClick={handleExport}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              試合テンプレートに展開
            </Button>
          )}
          {schedule && (
            <div className="ml-auto text-sm text-gray-700 space-y-1">
              <p>生成完了: {schedule.length}スロット</p>
              <p>
                試合数:{" "}
                {schedule.reduce((sum, slot) => sum + slot.matches.filter(Boolean).length, 0)}試合
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Schedule Table */}
      {schedule && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="text-base font-bold text-gray-800 mb-3">生成されたスケジュール</h3>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {mode === "league" && (
                    <th className="px-3 py-3 text-left text-gray-700 text-sm font-semibold border-b-2 border-gray-300 w-16">
                      節
                    </th>
                  )}
                  <th className="px-3 py-3 text-left text-gray-700 text-sm font-semibold border-b-2 border-gray-300 w-16">
                    #
                  </th>
                  {Array.from({ length: courtCount }, (_, i) => (
                    <th
                      key={i}
                      className="px-3 py-3 text-center text-sm font-bold border-b-2 border-gray-300"
                      style={{ color: COURT_COLORS[i % COURT_COLORS.length].border }}
                    >
                      コート {i + 1}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {schedule.map((slot, slotIdx) => (
                  <tr key={slotIdx} className="hover:bg-gray-50 transition-colors">
                    {mode === "league" && slot.round && (
                      <td className="px-3 py-2.5 text-blue-600 font-semibold text-sm border-b border-gray-200">
                        {slot.round}
                      </td>
                    )}
                    <td className="px-3 py-2.5 text-gray-600 font-mono text-sm border-b border-gray-200">
                      {slotIdx + 1}
                    </td>
                    {slot.matches.map((match, courtIdx) => (
                      <td
                        key={courtIdx}
                        className="px-2 py-2.5 text-center border-b border-gray-200"
                      >
                        {match ? (
                          <span
                            className="inline-block px-3 py-1.5 rounded text-sm font-mono font-medium"
                            style={{
                              backgroundColor:
                                COURT_COLORS[courtIdx % COURT_COLORS.length].light + "18",
                              color: COURT_COLORS[courtIdx % COURT_COLORS.length].border,
                              border: `1px solid ${COURT_COLORS[courtIdx % COURT_COLORS.length].border}30`,
                            }}
                          >
                            {match[0]} vs {match[1]}
                          </span>
                        ) : (
                          <span className="text-gray-300 text-sm">—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
