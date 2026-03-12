"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Check, Crown, Zap, AlertCircle, CheckCircle, AlertTriangle } from "lucide-react";

interface Plan {
  plan_id: number;
  plan_name: string;
  plan_code: string;
  plan_description: string;
  monthly_price: number;
  yearly_price: number;
  max_tournaments: number;
  max_divisions_per_tournament: number;
}

interface CurrentSubscriptionInfo {
  plan: Plan;
  usage: {
    current_tournament_groups_count: number;
    current_tournaments_count: number;
  };
}

export default function PlanComparisonCards() {
  const router = useRouter();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [currentSubscription, setCurrentSubscription] = useState<CurrentSubscriptionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [changingPlanId, setChangingPlanId] = useState<number | null>(null);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [freeTrialEndDate, setFreeTrialEndDate] = useState<string | null>(null);
  const [blockersDialogOpen, setBlockersDialogOpen] = useState(false);
  const [planChangeBlockers, setPlanChangeBlockers] = useState<{
    activeGroups: number;
    activeDivisions: number;
    maxGroupsInNewPlan: number;
    maxDivisionsPerTournamentInNewPlan: number;
    excessGroups: number;
    excessDivisions: Array<{ group_id: number; group_name: string; division_count: number }>;
  } | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [plansRes, currentRes] = await Promise.all([
        fetch("/api/admin/subscription/plans"),
        fetch("/api/admin/subscription/current"),
      ]);

      if (plansRes.ok) {
        const plansData = await plansRes.json();
        setPlans(plansData.data);
      }

      if (currentRes.ok) {
        const currentData = await currentRes.json();
        setCurrentSubscription(currentData);
        setFreeTrialEndDate(currentData.freeTrialEndDate);
      }
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handlePlanChange = (plan: Plan) => {
    setSelectedPlan(plan);
    setConfirmDialogOpen(true);
  };

  const confirmPlanChange = async () => {
    if (!selectedPlan) return;

    setChangingPlanId(selectedPlan.plan_id);
    setConfirmDialogOpen(false);

    try {
      const res = await fetch("/api/admin/subscription/change-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPlanId: selectedPlan.plan_id }),
      });

      const data = await res.json();

      if (res.ok) {
        setSuccessMessage(data.message);
        setErrorMessage(null);
        // ページをリロードして最新情報を表示
        router.refresh();
        fetchData();
      } else {
        // ブロッカーがある場合はダイアログを表示
        if (data.blockers) {
          setPlanChangeBlockers(data.blockers);
          setBlockersDialogOpen(true);
          setErrorMessage(null);
        } else {
          setErrorMessage(data.error);
          setSuccessMessage(null);
        }
      }
    } catch (error) {
      console.error("Plan change error:", error);
      setErrorMessage("プラン変更中にエラーが発生しました");
      setSuccessMessage(null);
    } finally {
      setChangingPlanId(null);
      setSelectedPlan(null);
    }
  };

  const getPlanIcon = (planCode: string) => {
    if (planCode === "premium" || planCode === "pro") {
      return <Crown className="h-5 w-5" />;
    }
    if (planCode === "standard") {
      return <Zap className="h-5 w-5" />;
    }
    return null;
  };

  const isCurrentPlan = (planId: number) => {
    return currentSubscription?.plan.plan_id === planId;
  };

  const isDowngrade = (plan: Plan) => {
    if (!currentSubscription) return false;
    const current = currentSubscription.plan;

    // 無制限 → 制限あり
    if (current.max_tournaments === -1 && plan.max_tournaments !== -1) return true;
    if (current.max_divisions_per_tournament === -1 && plan.max_divisions_per_tournament !== -1) return true;

    // 上限が減る場合
    if (
      current.max_tournaments !== -1 &&
      plan.max_tournaments !== -1 &&
      plan.max_tournaments < current.max_tournaments
    )
      return true;

    return false;
  };

  const getDowngradeWarning = (plan: Plan) => {
    if (!currentSubscription || !isDowngrade(plan)) return null;

    const { usage } = currentSubscription;
    const warnings = [];

    if (plan.max_tournaments !== -1 && usage.current_tournament_groups_count > plan.max_tournaments) {
      warnings.push(
        `現在${usage.current_tournament_groups_count}大会作成中ですが、このプランでは${plan.max_tournaments}大会までです。`
      );
    }

    if (warnings.length === 0) return null;

    return (
      <Alert variant="destructive" className="mt-4">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          <div className="space-y-1">
            {warnings.map((warning, idx) => (
              <p key={idx} className="text-sm">
                {warning}
              </p>
            ))}
            <p className="text-sm font-semibold mt-2">
              ダウングレード後、超過分の大会は閲覧のみ可能となり、編集できなくなります。
            </p>
          </div>
        </AlertDescription>
      </Alert>
    );
  };

  if (loading) {
    return <div className="text-center py-8">読み込み中...</div>;
  }

  return (
    <>
      {/* 料金調整中の注意書き */}
      <Alert className="mb-6 border-primary bg-primary/5 dark:bg-primary/10">
        <AlertCircle className="h-4 w-4 text-primary" />
        <AlertDescription className="text-primary dark:text-primary/80">
          <strong>お知らせ:</strong> 料金体系は現在調整中です。正式な料金は今後決定いたします。
        </AlertDescription>
      </Alert>

      {/* 成功メッセージ */}
      {successMessage && (
        <Alert className="mb-6 border-green-500 bg-green-50 dark:bg-green-950/20">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800 dark:text-green-200">
            {successMessage}
          </AlertDescription>
        </Alert>
      )}

      {/* エラーメッセージ */}
      {errorMessage && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {plans.map((plan) => {
          const isCurrent = isCurrentPlan(plan.plan_id);

          return (
            <Card
              key={plan.plan_id}
              className={`relative ${isCurrent ? "border-primary border-2 shadow-lg" : ""}`}
            >
              {isCurrent && (
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                  <Badge className="bg-primary text-primary-foreground">現在のプラン</Badge>
                </div>
              )}

              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    {getPlanIcon(plan.plan_code)}
                    {plan.plan_name}
                  </CardTitle>
                </div>
                <CardDescription>{plan.plan_description}</CardDescription>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* 料金表示 */}
                <div className="space-y-1">
                  {plan.monthly_price === 0 ? (
                    <>
                      <div className="text-3xl font-bold">無料</div>
                      {plan.plan_code === "free" && freeTrialEndDate && isCurrent && (
                        <div className="text-sm text-muted-foreground mt-2">
                          有効期限: {new Date(freeTrialEndDate).toLocaleDateString("ja-JP", {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          })}
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="text-3xl font-bold">¥{plan.monthly_price.toLocaleString()}</div>
                      <div className="text-sm text-muted-foreground">/月</div>
                      {plan.yearly_price > 0 && (
                        <div className="text-sm text-muted-foreground">
                          年払い: ¥{plan.yearly_price.toLocaleString()}/年
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* 機能一覧 */}
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span className="text-sm">
                      大会数: {plan.max_tournaments === -1 ? "無制限" : `${plan.max_tournaments}大会`}
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span className="text-sm">
                      1大会あたりの部門数:{" "}
                      {plan.max_divisions_per_tournament === -1
                        ? "無制限"
                        : `${plan.max_divisions_per_tournament}部門`}
                    </span>
                  </div>
                </div>

                {/* ダウングレード警告 */}
                {getDowngradeWarning(plan)}
              </CardContent>

              <CardFooter>
                <Button
                  className="w-full"
                  variant={isCurrent ? "outline" : "outline"}
                  disabled={isCurrent || changingPlanId === plan.plan_id}
                  onClick={() => handlePlanChange(plan)}
                >
                  {isCurrent
                    ? "利用中"
                    : changingPlanId === plan.plan_id
                    ? "変更中..."
                    : "プラン変更"}
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>

      {/* 確認ダイアログ */}
      <AlertDialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <AlertDialogContent className="bg-white dark:bg-gray-900">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-gray-900 dark:text-gray-100">
              プラン変更の確認
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-700 dark:text-gray-300">
              {selectedPlan && (
                <>
                  <strong>{selectedPlan.plan_name}</strong>に変更しますか？
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {selectedPlan && isDowngrade(selectedPlan) && (
            <div className="pb-2">
              <div className="border border-destructive/20 dark:border-red-800 bg-destructive/5 dark:bg-red-950/20 rounded-md p-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-destructive dark:text-red-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="font-semibold text-destructive dark:text-red-200 text-sm">
                      ダウングレードに関する注意
                    </div>
                    <div className="text-sm text-destructive dark:text-red-300 mt-1">
                      プラン上限を超える既存の大会は、閲覧のみ可能となり編集できなくなります。
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
          <div className="pb-2">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              ※現時点では課金機能は実装されていないため、プラン変更は即座に反映されます。
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction onClick={confirmPlanChange}>変更する</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ブロッカーダイアログ */}
      <AlertDialog open={blockersDialogOpen} onOpenChange={setBlockersDialogOpen}>
        <AlertDialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto bg-white dark:bg-gray-900">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive dark:text-red-400">
              <AlertTriangle className="w-6 h-6" />
              プラン変更できません
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-600 dark:text-gray-300">
              アクティブな大会・部門数が新プランの上限を超えています。
            </AlertDialogDescription>
          </AlertDialogHeader>

          {planChangeBlockers && (
            <div className="space-y-4 py-4">
              {/* 大会数超過の場合 */}
              {planChangeBlockers.excessGroups > 0 && (
                <div className="p-4 bg-yellow-50 border-2 border-yellow-300 rounded-lg dark:bg-yellow-900/30 dark:border-yellow-600">
                  <p className="font-semibold text-yellow-900 dark:text-yellow-100 mb-2">
                    大会数が上限を超えています
                  </p>
                  <div className="text-sm text-yellow-800 dark:text-yellow-200 space-y-1">
                    <p>現在のアクティブ大会数: <strong>{planChangeBlockers.activeGroups}</strong></p>
                    <p>新プランの上限: <strong>{planChangeBlockers.maxGroupsInNewPlan}</strong></p>
                    <p>超過数: <strong className="text-destructive dark:text-red-300">{planChangeBlockers.excessGroups}大会</strong></p>
                  </div>
                </div>
              )}

              {/* 部門数超過の場合 */}
              {planChangeBlockers.excessDivisions && planChangeBlockers.excessDivisions.length > 0 && (
                <div className="p-4 bg-yellow-50 border-2 border-yellow-300 rounded-lg dark:bg-yellow-900/30 dark:border-yellow-600">
                  <p className="font-semibold text-yellow-900 dark:text-yellow-100 mb-3">
                    以下の大会で部門数が上限を超えています
                  </p>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {planChangeBlockers.excessDivisions.map((item) => (
                      <div
                        key={item.group_id}
                        className="flex items-center justify-between p-2 bg-white rounded border-2 border-yellow-400 dark:bg-gray-800 dark:border-yellow-500"
                      >
                        <span className="text-sm text-gray-900 dark:text-gray-100">{item.group_name}</span>
                        <span className="text-sm font-semibold text-destructive dark:text-red-300">
                          {item.division_count}部門 (上限: {planChangeBlockers.maxDivisionsPerTournamentInNewPlan})
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 対応方法の案内 */}
              <div className="p-4 bg-primary/5 border-2 border-primary/30 rounded-lg dark:bg-primary/10 dark:border-primary/30">
                <p className="font-semibold text-primary dark:text-primary/90 mb-2">
                  📋 対応方法
                </p>
                <ol className="text-sm text-primary dark:text-primary/80 space-y-2 list-decimal list-inside">
                  <li>完了済みの大会を<strong>アーカイブ化</strong>してください</li>
                  <li>アーカイブ化した大会は制限のカウントから除外されます</li>
                  <li>必要に応じて不要な大会を削除してください</li>
                  <li>プラン上限内に収まったら、再度プラン変更を試してください</li>
                </ol>
              </div>
            </div>
          )}

          <AlertDialogFooter>
            <Button asChild variant="default" onClick={() => setBlockersDialogOpen(false)}>
              <a href="/admin">大会を整理する</a>
            </Button>
            <AlertDialogCancel>閉じる</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
