"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Settings, Clock, Target, AlertTriangle, RotateCcw, Save } from "lucide-react";
import { TournamentRule, SportRuleConfig, PeriodConfig, parseActivePeriods, stringifyActivePeriods } from "@/lib/tournament-rules";

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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // データ取得
  useEffect(() => {
    const fetchRules = async () => {
      try {
        const response = await fetch(`/api/tournaments/${tournamentId}/rules`);
        const result = await response.json();
        
        if (result.success) {
          setTournament(result.tournament);
          setSportConfig(result.sport_config);
          
          // ルールデータをフォーム用に変換
          const preliminaryRule = result.rules.find((r: TournamentRule) => r.phase === 'preliminary');
          const finalRule = result.rules.find((r: TournamentRule) => r.phase === 'final');
          
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
        } else {
          console.error('ルール取得エラー:', result.error);
        }
      } catch (error) {
        console.error('ルール取得エラー:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchRules();
  }, [tournamentId]);

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
        body: JSON.stringify({ rules: rulesData })
      });
      
      const result = await response.json();
      
      if (result.success) {
        alert('大会ルールを更新しました');
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
    </div>
  );
}