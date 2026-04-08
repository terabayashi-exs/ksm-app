"use client";

import { AlertCircle, ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatTeamSourceDisplay } from "@/lib/team-source-display";

type SourceCategory = "block" | "best" | "match_result" | "team_direct";

interface TournamentTeam {
  tournament_team_id: number;
  team_name: string;
  team_omission: string;
}

interface BulkMatchOverrideDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tournamentId: number;
  leagueSources: string[];
  tournamentSources: string[];
  blockTeamCounts?: { block_name: string; expected_team_count: number }[];
  tournamentTeams?: TournamentTeam[];
  onSave: () => void;
}

interface AffectedMatch {
  match_code: string;
  round_name: string;
  team1_source: string | null;
  team2_source: string | null;
  team1_display_name: string;
  team2_display_name: string;
}

function buildBestSources(
  blockTeamCounts: { block_name: string; expected_team_count: number }[],
): string[] {
  if (blockTeamCounts.length === 0) return [];
  const maxTeams = Math.max(...blockTeamCounts.map((b) => b.expected_team_count));
  const blockCount = blockTeamCounts.length;
  const sources: string[] = [];
  for (let pos = 1; pos <= maxTeams; pos++) {
    for (let rank = 1; rank <= blockCount; rank++) {
      sources.push(`BEST_${pos}_${rank}`);
    }
  }
  return sources;
}

function SourceCategorySelector({
  label,
  value,
  onChange,
  leagueSources,
  tournamentSources,
  bestSources,
  tournamentTeams,
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
  leagueSources: string[];
  tournamentSources: string[];
  bestSources: string[];
  tournamentTeams: TournamentTeam[];
}) {
  const [category, setCategory] = useState<SourceCategory | "">("");

  // 値が変わったらカテゴリを自動検出
  useEffect(() => {
    if (!value) {
      setCategory("");
      return;
    }
    if (value.match(/^TEAM:\d+$/)) setCategory("team_direct");
    else if (value.match(/^BEST_\d+_\d+$/)) setCategory("best");
    else if (value.match(/^[A-Z]_\d+$/)) setCategory("block");
    else if (value.match(/_(winner|loser)$/)) setCategory("match_result");
  }, [value]);

  const handleCategoryChange = (cat: string) => {
    setCategory(cat as SourceCategory);
    onChange("");
  };

  const categories: { value: string; label: string }[] = [];
  if (leagueSources.length > 0) {
    categories.push({ value: "block", label: "単一ブロックから選択" });
  }
  if (bestSources.length > 0) {
    categories.push({ value: "best", label: "複数ブロックのM位中N位" });
  }
  if (tournamentSources.length > 0) {
    categories.push({ value: "match_result", label: "試合の勝者/敗者" });
  }
  if (tournamentTeams.length > 0) {
    categories.push({ value: "team_direct", label: "チーム直接指定" });
  }

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={category} onValueChange={handleCategoryChange}>
        <SelectTrigger className="bg-white">
          <SelectValue placeholder="選択方法を選んでください" />
        </SelectTrigger>
        <SelectContent position="popper" sideOffset={5}>
          {categories.map((c) => (
            <SelectItem key={c.value} value={c.value}>
              {c.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {category === "block" && (
        <Select value={value && value.match(/^[A-Z]_\d+$/) ? value : ""} onValueChange={onChange}>
          <SelectTrigger className="bg-white">
            <SelectValue placeholder="ブロック・順位を選択" />
          </SelectTrigger>
          <SelectContent className="max-h-60" position="popper" sideOffset={5}>
            {leagueSources
              .filter((s) => s.match(/^[A-Z]_\d+$/))
              .map((source) => (
                <SelectItem key={source} value={source}>
                  {formatTeamSourceDisplay(source)}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      )}

      {category === "best" && (
        <Select
          value={value && value.match(/^BEST_\d+_\d+$/) ? value : ""}
          onValueChange={onChange}
        >
          <SelectTrigger className="bg-white">
            <SelectValue placeholder="M位中N位を選択" />
          </SelectTrigger>
          <SelectContent className="max-h-60" position="popper" sideOffset={5}>
            {bestSources.map((source) => (
              <SelectItem key={source} value={source}>
                {formatTeamSourceDisplay(source)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {category === "match_result" && (
        <Select
          value={value && value.match(/_(winner|loser)$/) ? value : ""}
          onValueChange={onChange}
        >
          <SelectTrigger className="bg-white">
            <SelectValue placeholder="試合の勝者/敗者を選択" />
          </SelectTrigger>
          <SelectContent className="max-h-60" position="popper" sideOffset={5}>
            {tournamentSources.map((source) => (
              <SelectItem key={source} value={source}>
                {formatTeamSourceDisplay(source)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {category === "team_direct" && (
        <Select value={value && value.match(/^TEAM:\d+$/) ? value : ""} onValueChange={onChange}>
          <SelectTrigger className="bg-white">
            <SelectValue placeholder="チームを選択" />
          </SelectTrigger>
          <SelectContent className="max-h-60" position="popper" sideOffset={5}>
            {tournamentTeams.map((team) => (
              <SelectItem
                key={`TEAM:${team.tournament_team_id}`}
                value={`TEAM:${team.tournament_team_id}`}
              >
                {team.team_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {value && (
        <p className="text-sm text-primary font-medium">選択中: {formatTeamSourceDisplay(value)}</p>
      )}
    </div>
  );
}

export function BulkMatchOverrideDialog({
  open,
  onOpenChange,
  tournamentId,
  leagueSources,
  tournamentSources,
  blockTeamCounts = [],
  tournamentTeams = [],
  onSave,
}: BulkMatchOverrideDialogProps) {
  const [fromSource, setFromSource] = useState<string>("");
  const [toSource, setToSource] = useState<string>("");
  const [reason, setReason] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [affectedMatches, setAffectedMatches] = useState<AffectedMatch[]>([]);

  const bestSources = buildBestSources(blockTeamCounts);

  useEffect(() => {
    const fetchAffectedMatches = async () => {
      if (!fromSource || !open) {
        setAffectedMatches([]);
        return;
      }
      try {
        const response = await fetch(
          `/api/tournaments/${tournamentId}/match-overrides/affected?source=${fromSource}`,
        );
        const data = await response.json();
        if (data.success) {
          setAffectedMatches(data.data);
        }
      } catch (error) {
        console.error("影響を受ける試合の取得エラー:", error);
      }
    };
    fetchAffectedMatches();
  }, [fromSource, open, tournamentId]);

  useEffect(() => {
    if (open) {
      setFromSource("");
      setToSource("");
      setReason("");
      setAffectedMatches([]);
    }
  }, [open]);

  const handleBulkUpdate = async () => {
    if (!fromSource || !toSource) {
      alert("変更元と変更先を選択してください");
      return;
    }
    if (affectedMatches.length === 0) {
      alert("影響を受ける試合がありません");
      return;
    }
    if (!confirm(`${affectedMatches.length}件の試合の進出条件を一括変更しますか？`)) {
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/match-overrides/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from_source: fromSource,
          to_source: toSource,
          override_reason:
            reason ||
            `${formatTeamSourceDisplay(fromSource)}を${formatTeamSourceDisplay(toSource)}に一括変更`,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "一括変更に失敗しました");
      }

      alert(`${affectedMatches.length}件の試合の進出条件を変更しました`);
      onSave();
      onOpenChange(false);
    } catch (error) {
      console.error("一括変更エラー:", error);
      alert(error instanceof Error ? error.message : "エラーが発生しました");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>進出条件の一括変更</DialogTitle>
          <DialogDescription>特定の進出条件を別の条件に一括で変更できます。</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="p-3 bg-gray-50 rounded-lg">
            <SourceCategorySelector
              label="変更元の進出条件"
              value={fromSource}
              onChange={(v) => {
                setFromSource(v);
                setToSource("");
              }}
              leagueSources={leagueSources}
              tournamentSources={tournamentSources}
              bestSources={bestSources}
              tournamentTeams={tournamentTeams}
            />
          </div>

          <div className="p-3 bg-gray-50 rounded-lg">
            <SourceCategorySelector
              label="変更先の進出条件"
              value={toSource}
              onChange={setToSource}
              leagueSources={leagueSources}
              tournamentSources={tournamentSources}
              bestSources={bestSources}
              tournamentTeams={tournamentTeams}
            />
          </div>

          {fromSource && toSource && (
            <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded">
              <span className="font-semibold text-blue-800">
                {formatTeamSourceDisplay(fromSource)}
              </span>
              <ArrowRight className="h-5 w-5 text-blue-600" />
              <span className="font-semibold text-blue-800">
                {formatTeamSourceDisplay(toSource)}
              </span>
            </div>
          )}

          {affectedMatches.length > 0 && (
            <div className="space-y-2">
              <Label>影響を受ける試合（{affectedMatches.length}件）</Label>
              <div className="max-h-48 overflow-y-auto border rounded p-3 space-y-2">
                {affectedMatches.map((match) => (
                  <div key={match.match_code} className="text-sm p-2 bg-white rounded border">
                    <div className="font-semibold">
                      {match.match_code} - {match.round_name}
                    </div>
                    <div className="text-gray-500 text-xs mt-1">
                      {match.team1_source ? formatTeamSourceDisplay(match.team1_source) : "未設定"}{" "}
                      vs{" "}
                      {match.team2_source ? formatTeamSourceDisplay(match.team2_source) : "未設定"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {fromSource && affectedMatches.length === 0 && (
            <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded">
              <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
              <div className="text-sm text-yellow-800">
                <p className="font-semibold">該当する試合がありません</p>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>変更理由（任意）</Label>
            <Textarea
              placeholder="例: チーム辞退により進出条件を変更"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            キャンセル
          </Button>
          <Button
            type="button"
            onClick={handleBulkUpdate}
            disabled={isLoading || !fromSource || !toSource || affectedMatches.length === 0}
          >
            {isLoading ? "変更中..." : `${affectedMatches.length}件を一括変更`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
