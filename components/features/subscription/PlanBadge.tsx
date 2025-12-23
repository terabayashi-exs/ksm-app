"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { AlertCircle, Crown, Zap } from "lucide-react";

interface CurrentSubscriptionInfo {
  plan: {
    plan_id: number;
    plan_name: string;
    plan_code: string;
    max_tournaments: number;
    max_divisions_per_tournament: number;
  };
  usage: {
    current_tournament_groups_count: number;
    current_tournaments_count: number;
  };
  freeTrialEndDate: string | null;
  isTrialExpired: boolean;
  canCreateTournament: boolean;
  remainingDays: number | null;
}

export default function PlanBadge() {
  const router = useRouter();
  const [subscriptionInfo, setSubscriptionInfo] = useState<CurrentSubscriptionInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSubscriptionInfo();
  }, []);

  const fetchSubscriptionInfo = async () => {
    try {
      const res = await fetch("/api/admin/subscription/current");
      if (res.ok) {
        const data = await res.json();
        setSubscriptionInfo(data);
      }
    } catch (error) {
      console.error("Failed to fetch subscription info:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !subscriptionInfo) {
    return null;
  }

  const { plan, usage, isTrialExpired, remainingDays, canCreateTournament } = subscriptionInfo;
  const isFree = plan.plan_code === "free";

  // プランアイコン
  const getPlanIcon = () => {
    if (plan.plan_code === "premium" || plan.plan_code === "pro") {
      return <Crown className="h-3 w-3" />;
    }
    if (plan.plan_code === "standard") {
      return <Zap className="h-3 w-3" />;
    }
    return null;
  };

  // プランバッジの色
  const getBadgeVariant = () => {
    if (isTrialExpired) return "destructive";
    if (plan.plan_code === "premium") return "default";
    if (plan.plan_code === "pro") return "secondary";
    if (plan.plan_code === "standard") return "outline";
    if (plan.plan_code === "basic") return "outline";
    return "secondary";
  };

  // 使用率の計算
  const tournamentUsagePercent =
    plan.max_tournaments === -1
      ? 0
      : Math.round((usage.current_tournament_groups_count / plan.max_tournaments) * 100);

  const showWarning = isTrialExpired || !canCreateTournament || (remainingDays !== null && remainingDays <= 7);

  return (
    <div className="flex items-center gap-3 flex-nowrap">
      {/* 期限切れ・警告アラート */}
      {showWarning && (
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-md border whitespace-nowrap ${
          isTrialExpired
            ? "bg-destructive/10 border-destructive/30 text-destructive"
            : "bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200"
        }`}>
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span className="text-xs font-medium">
            {isTrialExpired
              ? "無料期間が終了しました"
              : !canCreateTournament
              ? "大会数が上限に達しています"
              : `無料期間残り${remainingDays}日`}
          </span>
        </div>
      )}

      {/* プラン情報 */}
      <div className="flex items-center gap-2 flex-nowrap">
        <Badge variant={getBadgeVariant()} className="flex items-center gap-1 text-sm px-3 py-1.5 whitespace-nowrap">
          {getPlanIcon()}
          {plan.plan_name}
        </Badge>

        {isFree && remainingDays !== null && remainingDays > 0 && !isTrialExpired && (
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            残り{remainingDays}日
          </span>
        )}

        {!isFree && plan.max_tournaments !== -1 && (
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            大会: {usage.current_tournament_groups_count}/{plan.max_tournaments}
            {tournamentUsagePercent >= 80 && (
              <span className="text-orange-600 dark:text-orange-400 font-semibold ml-1">
                ({tournamentUsagePercent}%)
              </span>
            )}
          </span>
        )}
      </div>

      {/* プラン変更ボタン */}
      <Button variant="outline" size="sm" className="whitespace-nowrap" onClick={() => router.push("/admin/subscription/plans")}>
        プラン変更
      </Button>
    </div>
  );
}
