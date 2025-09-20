"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Settings, Clock, Target, AlertTriangle, RotateCcw, Save, Trophy, Plus, Trash2, Move, Award } from "lucide-react";
import { TournamentRule, SportRuleConfig, PeriodConfig, parseActivePeriods, stringifyActivePeriods } from "@/lib/tournament-rules";
import { 
  TieBreakingRule, 
  TieBreakingRuleType,
  getAvailableTieBreakingRules,
  getDefaultTieBreakingRules,
  validateTieBreakingRules
} from "@/lib/tie-breaking-rules";

interface TournamentInfo {
  tournament_id: number;
  tournament_name: string;
  sport_type_id: number;
  sport_name: string;
  sport_code: string;
}

interface TournamentRulesFormProps {
  tournamentId: number;
}

interface FormRule {
  phase: 'preliminary' | 'final';
  active_periods: number[];
  win_condition: 'score' | 'time' | 'points';
  notes: string;
}

interface PointSystem {
  win: number;
  draw: number;
  loss: number;
}

interface WalkoverSettings {
  winner_goals: number;
  loser_goals: number;
}

export default function TournamentRulesForm({ tournamentId }: TournamentRulesFormProps) {
  const [tournament, setTournament] = useState<TournamentInfo | null>(null);
  const [sportConfig, setSportConfig] = useState<SportRuleConfig | null>(null);
  const [rules, setRules] = useState<{ preliminary: FormRule; final: FormRule }>({
    preliminary: {
      phase: 'preliminary',
      active_periods: [1],
      win_condition: 'score',
      notes: ''
    },
    final: {
      phase: 'final',
      active_periods: [1],
      win_condition: 'score',
      notes: ''
    }
  });
  
  // 順位決定ルール関連の状態
  const [availableRuleTypes, setAvailableRuleTypes] = useState<TieBreakingRuleType[]>([]);
  const [tieBreakingRules, setTieBreakingRules] = useState<TieBreakingRule[]>([]);
  const [tieBreakingEnabled, setTieBreakingEnabled] = useState(false);
  
  // 勝点システム関連の状態
  const [pointSystem, setPointSystem] = useState<PointSystem>({
    win: 3,
    draw: 1,
    loss: 0
  });
  
  // 不戦勝設定関連の状態
  const [walkoverSettings, setWalkoverSettings] = useState<WalkoverSettings>({
    winner_goals: 3,
    loser_goals: 0
  });
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // 競技種別別の表示制御ロジック
  const sportCode = tournament?.sport_code || 'pk_championship';
  const supportsPointSystem = ['soccer', 'pk_championship', 'futsal'].includes(sportCode);
  const supportsDraws = ['soccer', 'pk_championship', 'futsal', 'handball'].includes(sportCode);
  const rankingMethod = sportCode === 'baseball' ? 'win_rate' : 'points';

  // データ取得
  useEffect(() => {
    const fetchRules = async () => {
      try {
        // 通常のルール取得
        const rulesResponse = await fetch(`/api/tournaments/${tournamentId}/rules`);
        const rulesResult = await rulesResponse.json();
        
        // 順位決定ルール取得
        const tieRulesResponse = await fetch(`/api/tournaments/${tournamentId}/tie-breaking-rules`);
        const tieRulesResult = await tieRulesResponse.json();
        
        if (rulesResult.success) {
          setTournament(rulesResult.tournament);
          setSportConfig(rulesResult.sport_config);
          
          // ルールデータをフォーム用に変換
          const preliminaryRule = rulesResult.rules.find((r: TournamentRule) => r.phase === 'preliminary');
          const finalRule = rulesResult.rules.find((r: TournamentRule) => r.phase === 'final');
          
          setRules({
            preliminary: {
              phase: 'preliminary',
              active_periods: preliminaryRule ? parseActivePeriods(preliminaryRule.active_periods) : [1],
              win_condition: preliminaryRule?.win_condition || 'score',
              notes: preliminaryRule?.notes || ''
            },
            final: {
              phase: 'final',
              active_periods: finalRule ? parseActivePeriods(finalRule.active_periods) : [1],
              win_condition: finalRule?.win_condition || 'score',
              notes: finalRule?.notes || ''
            }
          });
          
          // 勝点システムデータを読み込み
          if (preliminaryRule?.point_system) {
            try {
              const savedPointSystem = JSON.parse(preliminaryRule.point_system);
              setPointSystem({
                win: savedPointSystem.win || 3,
                draw: savedPointSystem.draw || 1,
                loss: savedPointSystem.loss || 0
              });
            } catch (error) {
              console.error('勝点システム解析エラー:', error);
            }
          }
          
          // 不戦勝設定データを読み込み
          if (preliminaryRule?.walkover_settings) {
            try {
              const savedWalkoverSettings = JSON.parse(preliminaryRule.walkover_settings);
              setWalkoverSettings({
                winner_goals: savedWalkoverSettings.winner_goals || 3,
                loser_goals: savedWalkoverSettings.loser_goals || 0
              });
            } catch (error) {
              console.error('不戦勝設定解析エラー:', error);
            }
          }
        } else {
          console.error('ルール取得エラー:', rulesResult.error);
        }

        if (tieRulesResult.success) {
          const sportCode = String(tieRulesResult.tournament?.sport_code || 'pk_championship');
          setAvailableRuleTypes(tieRulesResult.available_rule_types || getAvailableTieBreakingRules(sportCode));
          
          // 統一ルール（予選を基準）
          const preliminaryTieRules = tieRulesResult.phase_rules?.preliminary;
          if (preliminaryTieRules) {
            setTieBreakingEnabled(preliminaryTieRules.enabled || false);
            setTieBreakingRules(preliminaryTieRules.rules || getDefaultTieBreakingRules(sportCode));
          } else {
            setTieBreakingRules(getDefaultTieBreakingRules(sportCode));
          }
        } else {
          console.error('順位決定ルール取得エラー:', tieRulesResult.error);
        }
      } catch (error) {
        console.error('ルール取得エラー:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchRules();
  }, [tournamentId]);

  // 順位決定ルール操作関数
  const addTieBreakingRule = (ruleType: string) => {
    if (tieBreakingRules.length >= 5) return;
    if (tieBreakingRules.some(rule => rule.type === ruleType)) return;

    const newRules = [...tieBreakingRules, { type: ruleType, order: tieBreakingRules.length + 1 }];
    setTieBreakingRules(newRules);
  };

  const removeTieBreakingRule = (index: number) => {
    const newRules = tieBreakingRules.filter((_, i) => i !== index);
    const reorderedRules = newRules.map((rule, i) => ({ ...rule, order: i + 1 }));
    setTieBreakingRules(reorderedRules);
  };

  const moveTieBreakingRule = (fromIndex: number, toIndex: number) => {
    const newRules = [...tieBreakingRules];
    const [movedRule] = newRules.splice(fromIndex, 1);
    newRules.splice(toIndex, 0, movedRule);
    const reorderedRules = newRules.map((rule, i) => ({ ...rule, order: i + 1 }));
    setTieBreakingRules(reorderedRules);
  };

  const getRuleTypeLabel = (ruleType: string): string => {
    const rule = availableRuleTypes.find(r => r.type === ruleType);
    return rule?.label || ruleType;
  };

  const getRuleTypeDescription = (ruleType: string): string => {
    const rule = availableRuleTypes.find(r => r.type === ruleType);
    return rule?.description || '';
  };

  // ピリオドの切り替え
  const togglePeriod = (phase: 'preliminary' | 'final', periodNumber: number) => {
    setRules(prev => {
      const currentPeriods = prev[phase].active_periods;
      const newPeriods = currentPeriods.includes(periodNumber)
        ? currentPeriods.filter(p => p !== periodNumber)
        : [...currentPeriods, periodNumber].sort((a, b) => a - b);
      
      return {
        ...prev,
        [phase]: {
          ...prev[phase],
          active_periods: newPeriods
        }
      };
    });
  };

  // デフォルト設定の復元
  const restoreDefaults = async () => {
    if (!confirm('デフォルト設定に戻しますか？\n現在の設定内容は失われます。')) {
      return;
    }

    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/rules`, {
        method: 'POST'
      });
      
      const result = await response.json();
      
      if (result.success) {
        // データを再取得
        window.location.reload();
      } else {
        alert(`デフォルト設定の復元に失敗しました: ${result.error}`);
      }
    } catch (error) {
      alert('デフォルト設定の復元中にエラーが発生しました');
      console.error(error);
    }
  };

  // 保存
  const handleSave = async () => {
    setSaving(true);
    
    try {
      // 通常のルール保存
      const rulesData = [
        {
          phase: 'preliminary',
          use_extra_time: false,
          use_penalty: false,
          active_periods: stringifyActivePeriods(rules.preliminary.active_periods),
          win_condition: rules.preliminary.win_condition,
          notes: rules.preliminary.notes
        },
        {
          phase: 'final',
          use_extra_time: false,
          use_penalty: false,
          active_periods: stringifyActivePeriods(rules.final.active_periods),
          win_condition: rules.final.win_condition,
          notes: rules.final.notes
        }
      ];

      const response = await fetch(`/api/tournaments/${tournamentId}/rules`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          rules: rulesData,
          point_system: supportsPointSystem ? pointSystem : null,
          walkover_settings: walkoverSettings
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        // 順位決定ルールも保存（統一ルール：両フェーズに同じ設定）
        if (tieBreakingEnabled && Array.isArray(tieBreakingRules)) {
          const validation = validateTieBreakingRules(tieBreakingRules, tournament?.sport_code || 'pk_championship');
          if (validation.isValid) {
            // 予選フェーズに保存（統一ルールとして）
            await fetch(`/api/tournaments/${tournamentId}/tie-breaking-rules`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                phase: 'preliminary',
                rules: tieBreakingRules,
                enabled: tieBreakingEnabled
              })
            });
            
            // 決勝フェーズにも同じ設定を適用
            await fetch(`/api/tournaments/${tournamentId}/tie-breaking-rules`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                phase: 'final',
                rules: tieBreakingRules,
                enabled: tieBreakingEnabled
              })
            });
          }
        } else if (!tieBreakingEnabled) {
          // 無効化の場合
          await fetch(`/api/tournaments/${tournamentId}/tie-breaking-rules`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              phase: 'preliminary',
              rules: [],
              enabled: false
            })
          });
          
          await fetch(`/api/tournaments/${tournamentId}/tie-breaking-rules`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              phase: 'final',
              rules: [],
              enabled: false
            })
          });
        }
        
        alert('大会ルール（順位決定ルールを含む）を更新しました');
      } else {
        alert(`更新に失敗しました: ${result.error}`);
      }
    } catch (error) {
      alert('更新中にエラーが発生しました');
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
          <p className="text-sm text-gray-600">ルール設定を読み込み中...</p>
        </div>
      </div>
    );
  }

  if (!tournament || !sportConfig) {
    return (
      <div className="text-center py-12">
        <AlertTriangle className="h-8 w-8 text-red-500 mx-auto mb-2" />
        <p className="text-red-600">大会またはルール設定の読み込みに失敗しました</p>
      </div>
    );
  }

  const renderPhaseRules = (phase: 'preliminary' | 'final', title: string) => {
    const phaseRule = rules[phase];
    
    return (
      <Card key={phase}>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            {phase === 'preliminary' ? (
              <Target className="h-5 w-5 text-green-600" />
            ) : (
              <Clock className="h-5 w-5 text-red-600" />
            )}
            <span>{title}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* ピリオド設定 */}
          <div className="space-y-3">
            <Label className="text-base font-medium">使用するピリオド</Label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {sportConfig.default_periods.map((period: PeriodConfig) => {
                const isActive = phaseRule.active_periods.includes(period.period_number);
                const isRequired = period.is_required;
                
                return (
                  <div
                    key={period.period_number}
                    className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                      isActive 
                        ? 'border-blue-500 bg-blue-50' 
                        : 'border-gray-200 hover:border-gray-300'
                    } ${isRequired ? 'border-green-500 bg-green-50' : ''}`}
                    onClick={() => !isRequired && togglePeriod(phase, period.period_number)}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{period.period_name}</span>
                      {isActive && <Badge variant="default" className="text-xs">使用</Badge>}
                      {isRequired && <Badge variant="secondary" className="text-xs">必須</Badge>}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-sm text-gray-600">
              ※ 緑色のピリオドは必須項目です。クリックで使用するピリオドを選択できます。
            </p>
          </div>


          {/* 勝利条件 */}
          <div className="space-y-2">
            <Label>勝利条件</Label>
            <Select
              value={phaseRule.win_condition}
              onValueChange={(value) => 
                setRules(prev => ({
                  ...prev,
                  [phase]: { ...prev[phase], win_condition: value as 'score' | 'time' | 'points' }
                }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="score">スコア</SelectItem>
                <SelectItem value="time">タイム</SelectItem>
                <SelectItem value="points">ポイント</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 備考 */}
          <div className="space-y-2">
            <Label htmlFor={`${phase}-notes`}>備考</Label>
            <Textarea
              id={`${phase}-notes`}
              value={phaseRule.notes}
              onChange={(e) => 
                setRules(prev => ({
                  ...prev,
                  [phase]: { ...prev[phase], notes: e.target.value }
                }))
              }
              placeholder="特別なルールや注意事項があれば記載してください"
              rows={3}
            />
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center space-x-2">
            <Settings className="h-6 w-6 text-blue-600" />
            <span>大会ルール設定</span>
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            {tournament.tournament_name} - {tournament.sport_name}
          </p>
        </div>
        
        <div className="space-x-2">
          <Button variant="outline" onClick={restoreDefaults}>
            <RotateCcw className="h-4 w-4 mr-2" />
            デフォルトに戻す
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? "保存中..." : "設定を保存"}
          </Button>
        </div>
      </div>

      {/* ルール設定フォーム */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {renderPhaseRules('preliminary', '予選リーグ')}
        {renderPhaseRules('final', '決勝トーナメント')}
      </div>

      {/* 順位決定ルール設定 */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Trophy className="h-5 w-5 text-yellow-600" />
            <span>順位決定ルール設定</span>
          </CardTitle>
          <p className="text-sm text-gray-600">
            同じ勝点のチームがいる場合の順位決定方法を設定します
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 有効/無効切り替え */}
          <div className="mb-4">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={tieBreakingEnabled}
                onChange={(e) => setTieBreakingEnabled(e.target.checked)}
                className="mr-2"
              />
              カスタム順位決定ルールを使用する
            </label>
            {!tieBreakingEnabled && (
              <p className="text-sm text-gray-500 mt-1">
                デフォルトの順位決定ロジック（勝点 → 得失点差 → 総得点 → チーム名順）を使用します
              </p>
            )}
          </div>

          {tieBreakingEnabled && (
            <div className="space-y-4">
              {/* 現在のルール一覧 */}
              <div className="space-y-2">
                {tieBreakingRules.map((rule, index) => (
                  <div
                    key={`${rule.type}-${index}`}
                    className="flex items-center gap-3 p-3 border rounded-lg bg-white hover:bg-gray-50"
                  >
                    <div className="flex items-center gap-2">
                      {/* 順序変更ボタン */}
                      <div className="flex flex-col gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => moveTieBreakingRule(index, Math.max(0, index - 1))}
                          disabled={index === 0}
                          className="h-4 w-6 p-0"
                        >
                          <Move className="h-3 w-3 rotate-180" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => moveTieBreakingRule(index, Math.min(tieBreakingRules.length - 1, index + 1))}
                          disabled={index === tieBreakingRules.length - 1}
                          className="h-4 w-6 p-0"
                        >
                          <Move className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm bg-blue-100 text-blue-800 px-2 py-1 rounded">
                          {index + 1}
                        </span>
                        <span className="font-medium">
                          {getRuleTypeLabel(rule.type)}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">
                        {getRuleTypeDescription(rule.type)}
                      </p>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {rule.type === 'lottery' && (
                        <Badge variant="outline" className="text-yellow-600 border-yellow-300">
                          手動設定必要
                        </Badge>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeTieBreakingRule(index)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              
              {/* ルール追加セクション */}
              {tieBreakingRules.length < 5 && (
                <div className="border-t pt-4">
                  <h4 className="font-medium text-sm text-gray-700 mb-3">
                    利用可能なルールを追加:
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {availableRuleTypes
                      .filter(ruleType => !tieBreakingRules.some(rule => rule.type === ruleType.type))
                      .map(ruleType => (
                        <Button
                          key={ruleType.type}
                          variant="outline"
                          size="sm"
                          onClick={() => addTieBreakingRule(ruleType.type)}
                          className="justify-start text-left h-auto p-2"
                        >
                          <Plus className="h-4 w-4 mr-2 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm">{ruleType.label}</div>
                            <div className="text-xs text-gray-500 truncate">
                              {ruleType.description}
                            </div>
                          </div>
                        </Button>
                      ))}
                  </div>
                </div>
              )}
              
              {tieBreakingRules.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <p className="mb-4">順位決定ルールが設定されていません</p>
                  <p className="text-sm">上記から利用可能なルールを選択して追加してください</p>
                </div>
              )}

              {tieBreakingRules.length >= 5 && (
                <div className="text-center py-2">
                  <Badge variant="outline" className="text-orange-600 border-orange-300">
                    最大5つまでのルールが設定されています
                  </Badge>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 勝点設定（サッカー系競技のみ） */}
      {supportsPointSystem && (
        <Card className="mt-8">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Award className="h-5 w-5 text-green-600" />
              <span>勝点設定</span>
            </CardTitle>
            <p className="text-sm text-gray-600">
              試合結果に応じて与えられる勝点を設定します
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="win-points" className="flex items-center gap-2">
                  <span className="font-medium">勝利時の勝点</span>
                  <Badge variant="secondary" className="text-green-700 bg-green-100">
                    勝利
                  </Badge>
                </Label>
                <input
                  id="win-points"
                  type="number"
                  min="0"
                  max="10"
                  value={pointSystem.win}
                  onChange={(e) => setPointSystem({...pointSystem, win: parseInt(e.target.value) || 0})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500">通常は3点</p>
              </div>

              {supportsDraws && (
                <div className="space-y-2">
                  <Label htmlFor="draw-points" className="flex items-center gap-2">
                    <span className="font-medium">引分時の勝点</span>
                    <Badge variant="secondary" className="text-yellow-700 bg-yellow-100">
                      引分
                    </Badge>
                  </Label>
                  <input
                    id="draw-points"
                    type="number"
                    min="0"
                    max="10"
                    value={pointSystem.draw}
                    onChange={(e) => setPointSystem({...pointSystem, draw: parseInt(e.target.value) || 0})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500">通常は1点</p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="loss-points" className="flex items-center gap-2">
                  <span className="font-medium">敗北時の勝点</span>
                  <Badge variant="secondary" className="text-red-700 bg-red-100">
                    敗北
                  </Badge>
                </Label>
                <input
                  id="loss-points"
                  type="number"
                  min="0"
                  max="10"
                  value={pointSystem.loss}
                  onChange={(e) => setPointSystem({...pointSystem, loss: parseInt(e.target.value) || 0})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500">通常は0点</p>
              </div>
            </div>

            {/* プリセット設定ボタン */}
            <div className="mt-6 pt-4 border-t">
              <h4 className="font-medium text-sm text-gray-700 mb-3">
                プリセット設定:
              </h4>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPointSystem({win: 3, draw: 1, loss: 0})}
                  className="text-sm"
                >
                  FIFA標準 (3-1-0)
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPointSystem({win: 2, draw: 1, loss: 0})}
                  className="text-sm"
                >
                  クラシック (2-1-0)
                </Button>
                {supportsDraws && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPointSystem({win: 5, draw: 2, loss: 0})}
                    className="text-sm"
                  >
                    ハイスコア (5-2-0)
                  </Button>
                )}
              </div>
            </div>

            {/* 競技種別に応じた説明 */}
            <div className="mt-4 p-3 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>{tournament?.sport_name || 'この競技'}</strong>では勝点システムを使用します。
                設定した勝点に基づいて順位表が計算されます。
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 不戦勝設定 */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <AlertTriangle className="h-5 w-5 text-orange-600" />
            <span>不戦勝設定</span>
          </CardTitle>
          <p className="text-sm text-gray-600">
            チームが試合に参加できない場合（不戦勝・不戦敗）の得点を設定します
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="walkover-winner-goals" className="flex items-center gap-2">
                <span className="font-medium">不戦勝チームの得点</span>
                <Badge variant="secondary" className="text-green-700 bg-green-100">
                  勝者
                </Badge>
              </Label>
              <input
                id="walkover-winner-goals"
                type="number"
                min="0"
                max="99"
                value={walkoverSettings.winner_goals}
                onChange={(e) => setWalkoverSettings({
                  ...walkoverSettings, 
                  winner_goals: parseInt(e.target.value) || 0
                })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500">相手チームが不参加の場合の勝者得点</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="walkover-loser-goals" className="flex items-center gap-2">
                <span className="font-medium">不戦敗チームの得点</span>
                <Badge variant="secondary" className="text-red-700 bg-red-100">
                  敗者
                </Badge>
              </Label>
              <input
                id="walkover-loser-goals"
                type="number"
                min="0"
                max="99"
                value={walkoverSettings.loser_goals}
                onChange={(e) => setWalkoverSettings({
                  ...walkoverSettings, 
                  loser_goals: parseInt(e.target.value) || 0
                })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500">試合に参加できないチームの得点</p>
            </div>
          </div>

          {/* プリセット設定ボタン */}
          <div className="mt-6 pt-4 border-t">
            <h4 className="font-medium text-sm text-gray-700 mb-3">
              プリセット設定:
            </h4>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setWalkoverSettings({winner_goals: 3, loser_goals: 0})}
                className="text-sm"
              >
                標準設定 (3-0)
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setWalkoverSettings({winner_goals: 5, loser_goals: 0})}
                className="text-sm"
              >
                大差設定 (5-0)
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setWalkoverSettings({winner_goals: 1, loser_goals: 0})}
                className="text-sm"
              >
                最小設定 (1-0)
              </Button>
            </div>
          </div>

          {/* 説明 */}
          <div className="mt-4 p-3 bg-orange-50 rounded-lg">
            <p className="text-sm text-orange-800">
              <strong>不戦勝・不戦敗とは:</strong> チームが怪我、交通事情、人数不足などの理由で試合に参加できない場合の処理です。
              不戦勝チームには設定した得点が与えられ、不戦敗チームには敗戦が記録されます。
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 競技種別別の説明（勝点システム非対応の場合） */}
      {!supportsPointSystem && (
        <Card className="mt-8">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Award className="h-5 w-5 text-gray-400" />
              <span>順位決定方式</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-700">
                <strong>{tournament?.sport_name || 'この競技'}</strong>では{rankingMethod === 'win_rate' ? '勝率' : '記録'}による順位決定を使用します。
                勝点システムは適用されません。
              </p>
              {rankingMethod === 'win_rate' && (
                <p className="text-xs text-gray-600 mt-2">
                  順位は勝率（勝利数 ÷ 試合数）で決定されます。
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}