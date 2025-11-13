'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MatchTemplate } from '@/lib/types';
import { calculateTournamentSchedule, TournamentSchedule, ScheduleSettings, ScheduleMatch } from '@/lib/schedule-calculator';
import { Calendar, Clock, MapPin, AlertTriangle, CheckCircle, RefreshCw, Edit3 } from 'lucide-react';

interface SchedulePreviewProps {
  formatId: number | null;
  settings: ScheduleSettings;
  tournamentId?: number; // 編集モード用
  editMode?: boolean;    // 編集モードフラグ
  onScheduleChange?: (customMatches: Array<{
    match_id: number;
    start_time: string;
    court_number: number;
  }>) => void; // カスタムスケジュール変更コールバック
}

export default function SchedulePreview({ formatId, settings, tournamentId, editMode = false, onScheduleChange }: SchedulePreviewProps) {
  const [templates, setTemplates] = useState<MatchTemplate[]>([]);
  // const [sportCode, setSportCode] = useState<string | null>(null); // Removed: no longer needed for period-based duration
  const [schedule, setSchedule] = useState<TournamentSchedule | null>(null);
  const [customSchedule, setCustomSchedule] = useState<TournamentSchedule | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingMatch, setEditingMatch] = useState<string | null>(null); // "dayIndex-matchIndex"
  const [hasManualEdits, setHasManualEdits] = useState(false); // 手動編集フラグ
  const [previousSettings, setPreviousSettings] = useState<ScheduleSettings | null>(null); // 前回のsettings
  const [editingBlockCourt, setEditingBlockCourt] = useState<string | null>(null); // ブロックコート編集中のブロック名
  const [blockCourtAssignments, setBlockCourtAssignments] = useState<Record<string, number>>({}); // ブロック→コート割り当て
  const [editingMatchCourt, setEditingMatchCourt] = useState<string | null>(null); // 個別試合コート編集中の試合キー
  const [matchCourtAssignments, setMatchCourtAssignments] = useState<Record<number, number>>({}); // 試合番号→コート割り当て
  const [initialSchedule, setInitialSchedule] = useState<TournamentSchedule | null>(null); // 初期スケジュール保存用（リセット用）
  
  // コンポーネントマウント/アンマウント時のログ
  useEffect(() => {
    // console.log('SchedulePreview mounted:', { formatId, tournamentId, editMode });
    return () => {
      // console.log('SchedulePreview will unmount:', { formatId, tournamentId, editMode });
    };
  }, [formatId, tournamentId, editMode]);
  
  // tournamentIdが変更された際の状態初期化（一度だけ実行）
  useEffect(() => {
    if (editMode && tournamentId) {
      // console.log('Resetting state for tournament:', tournamentId);
      // console.log('Before reset - customSchedule exists:', !!customSchedule);
      setCustomSchedule(null);
      setActualMatches([]);
      setSchedule(null); // scheduleもリセットして確実に初期化
      setInitialSchedule(null); // 初期スケジュールもリセット
      setFetchingMatches(false);
      setHasManualEdits(false);
      setPreviousSettings(null);
      setBlockCourtAssignments({});
      setMatchCourtAssignments({});
    }
  }, [tournamentId]); // eslint-disable-line react-hooks/exhaustive-deps

  // settings変更検出とcustomScheduleリセット（新規作成モードのみ）
  useEffect(() => {
    if (editMode) return; // 編集モードでは無効

    if (previousSettings && templates.length > 0) {
      // settingsの変更を検出
      const settingsChanged = 
        previousSettings.courtCount !== settings.courtCount ||
        previousSettings.matchDurationMinutes !== settings.matchDurationMinutes ||
        previousSettings.breakDurationMinutes !== settings.breakDurationMinutes ||
        previousSettings.startTime !== settings.startTime ||
        JSON.stringify(previousSettings.tournamentDates) !== JSON.stringify(settings.tournamentDates);

      if (settingsChanged && !hasManualEdits) {
        // 手動編集がない場合のみcustomScheduleをリセット
        setCustomSchedule(null);
      }
    }

    setPreviousSettings(settings);
  }, [settings, templates.length, editMode, hasManualEdits]); // eslint-disable-line react-hooks/exhaustive-deps
  const [actualMatches, setActualMatches] = useState<Array<{
    match_id: number;
    tournament_date: string;
    match_number: number;
    match_code: string;
    team1_display_name: string;
    team2_display_name: string;
    team1_name?: string; // APIから返される実チーム名
    team2_name?: string; // APIから返される実チーム名
    scheduled_time?: string | null; // APIから返される予定時刻
    court_number: number | null;
    start_time: string | null;
    phase: string;
    display_round_name: string;
    block_name: string | null;
    match_type: string;
    team1_id: string | null;
    team2_id: string | null;
  }>>([]); // 編集モード用の実際の試合データ
  
  // データ取得中フラグ（競合状態を防ぐため）
  const [fetchingMatches, setFetchingMatches] = useState(false);

  // 試合データの取得（編集モード）
  useEffect(() => {
    if (!editMode || !tournamentId) return;
    if (fetchingMatches) {
      // Skipping fetch - already in progress
      return;
    }

    const fetchActualMatches = async () => {
      // すでに取得中の場合はスキップ
      if (fetchingMatches) return;
      
      setFetchingMatches(true);
      setLoading(true);
      setError(null);
      try {
        // console.log(`Edit mode: fetching matches for tournament ${tournamentId}`);
        const response = await fetch(`/api/tournaments/${tournamentId}/matches`, {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache'
          }
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        
        if (result.success) {
          // Received matches from API for edit mode
          // Match data loaded successfully
          setActualMatches(result.data);
        } else {
          setError(result.error || '試合データの取得に失敗しました');
        }
      } catch (err) {
        console.error('試合データ取得エラー:', err);
        setError(`試合データの取得に失敗しました: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setLoading(false);
        setFetchingMatches(false);
      }
    };

    fetchActualMatches();
  }, [editMode, tournamentId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 試合テンプレートの取得
  useEffect(() => {
    if (!formatId) {
      setTemplates([]);
      setSchedule(null);
      return;
    }

    const fetchTemplates = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/tournaments/formats/${formatId}/templates`);
        const result = await response.json();
        
        if (result.success) {
          setTemplates(result.data.templates);
          // setSportCode(result.data.sportCode || null); // Removed: no longer needed for period-based duration
        } else {
          setError(result.error || 'テンプレートの取得に失敗しました');
        }
      } catch (err) {
        setError('ネットワークエラーが発生しました');
        console.error('テンプレート取得エラー:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchTemplates();
  }, [formatId]);

  // スケジュール計算（新規作成モード） 
  useEffect(() => {
    // 編集モードでもtournamentIdがない場合（新規作成時）はスケジュール計算を行う
    if (editMode && tournamentId) {
      // Skipping schedule calculation in edit mode with tournamentId
      return;
    }
    
    // テンプレートがない場合はスケジュールをリセット
    if (templates.length === 0) {
      setSchedule(null);
      setCustomSchedule(null);
      return;
    }

    try {
      const calculatedSchedule = calculateTournamentSchedule(templates, settings);
      setSchedule(calculatedSchedule);
      
      // カスタムスケジュールが未設定なら、計算されたスケジュールを初期値とする
      // ただし、既にカスタムスケジュールがある場合は保持する
      setCustomSchedule(prev => {
        if (!prev) {
          // Initializing custom schedule with calculated data
          return calculatedSchedule;
        }
        // Preserving existing custom schedule
        return prev;
      });
    } catch (err) {
      setError('スケジュール計算エラー');
      console.error('スケジュール計算エラー:', err);
    }
  }, [templates, settings, editMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // 編集モードでの実際の試合データからスケジュール表示を生成
  useEffect(() => {
    if (!editMode || actualMatches.length === 0) return;

    try {
      // Processing actual matches for schedule display
      // Actual matches loaded for display
      
      // 実際の試合データを日付別にグループ化してスケジュール形式に変換
      const dateGroups = actualMatches.reduce((acc, match) => {
        const date = match.tournament_date;
        if (!acc[date]) {
          acc[date] = [];
        }
        acc[date].push(match);
        return acc;
      }, {} as Record<string, typeof actualMatches>);

      const days = Object.entries(dateGroups)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, matches], dayIndex) => {
          const sortedMatches = matches.sort((a, b) => a.match_number - b.match_number);
          
          const scheduleMatches = sortedMatches.map(match => {
            const startTime = match.scheduled_time || '--:--';
            const endTime = match.scheduled_time ? 
              minutesToTime(timeToMinutes(match.scheduled_time) + settings.matchDurationMinutes) : 
              '--:--';
            
            // Processing match schedule data
            
            return {
              template: {
                template_id: match.match_number,
                format_id: formatId || 0,
                match_number: match.match_number,
                match_code: match.match_code,
                match_type: match.match_type,
                phase: match.phase,
                round_name: match.display_round_name,
                block_name: match.block_name || undefined,
                team1_source: match.team1_id || undefined,
                team2_source: match.team2_id || undefined,
                team1_display_name: match.team1_name || match.team1_display_name,
                team2_display_name: match.team2_name || match.team2_display_name,
                day_number: dayIndex + 1,
                execution_priority: match.match_number,
                created_at: ''
              },
              date: date,
              startTime: startTime,
              endTime: endTime,
              courtNumber: match.court_number || 1,
              timeSlot: match.match_number
            };
          });

          // その日の総所要時間を計算
          const dayStartTime = scheduleMatches.length > 0 
            ? Math.min(...scheduleMatches.map(m => timeToMinutes(m.startTime)))
            : timeToMinutes(settings.startTime);
          const dayEndTime = scheduleMatches.length > 0 
            ? Math.max(...scheduleMatches.map(m => timeToMinutes(m.endTime)))
            : timeToMinutes(settings.startTime);
          const dayDuration = minutesToTime(dayEndTime - dayStartTime);

          return {
            date: date,
            dayNumber: dayIndex + 1,
            matches: scheduleMatches,
            totalDuration: dayDuration,
            requiredCourts: Math.max(...scheduleMatches.map(m => m.courtNumber)),
            timeSlots: scheduleMatches.length
          };
        });

      // 全体の総所要時間を計算（すべての日の最早開始時刻から最遅終了時刻まで）
      let overallStartTime = Infinity;
      let overallEndTime = 0;
      
      for (const day of days) {
        if (day.matches.length > 0) {
          const dayStart = Math.min(...day.matches.map(m => timeToMinutes(m.startTime)));
          const dayEnd = Math.max(...day.matches.map(m => timeToMinutes(m.endTime)));
          overallStartTime = Math.min(overallStartTime, dayStart);
          overallEndTime = Math.max(overallEndTime, dayEnd);
        }
      }
      
      const totalDurationMinutes = overallEndTime - overallStartTime;
      const overallTotalDuration = totalDurationMinutes > 0 ? minutesToTime(totalDurationMinutes) : '0:00';

      const editSchedule = {
        days: days,
        totalMatches: actualMatches.length,
        totalDuration: overallTotalDuration,
        warnings: [],
        feasible: true,
        timeConflicts: []
      };

      setSchedule(editSchedule);
      
      // 初期スケジュールを保存（リセット用）- 深いコピーで保存
      if (!initialSchedule) {
        const deepCopySchedule = JSON.parse(JSON.stringify(editSchedule));
        setInitialSchedule(deepCopySchedule);
      }
      
      // カスタムスケジュールが未設定の場合のみ、実際の試合データで初期化
      // 既にカスタムスケジュールがある場合は保持する
      setCustomSchedule(prev => {
        if (!prev) {
          // Initializing custom schedule with actual match data
          // First match loaded for edit schedule
          return editSchedule;
        }
        // Preserving existing custom schedule in edit mode
        // Using existing custom schedule data
        return prev;
      });
      
      // ここではonScheduleChangeを呼び出さない（別のuseEffectで処理）
    } catch (err) {
      setError('試合データの処理エラー');
      console.error('試合データ処理エラー:', err);
    }
  }, [actualMatches, editMode, formatId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 初期データ通知用のuseEffect（無限ループ対策）
  useEffect(() => {
    if (!onScheduleChange) return;
    if (fetchingMatches) {
      // Skipping notification - fetch in progress
      return;
    }

    if (editMode && actualMatches.length > 0) {
      // 既存大会の編集モード: 初回のみ実際のマッチデータを送信
      const initialMatches = actualMatches
        .map(match => ({
          match_id: match.match_id,
          start_time: match.scheduled_time || match.start_time || null,
          court_number: match.court_number || 1
        }))
        .filter(match => match.start_time !== null)
        .map(match => ({
          match_id: match.match_id,
          start_time: match.start_time as string, // null除外済みなのでstring型にキャスト
          court_number: match.court_number
        }));
      // Sending initial matches to parent component
      // Initial match times loaded for edit mode
      onScheduleChange(initialMatches);
    } else if (!editMode && schedule && schedule.days.length > 0) {
      // 新規作成モード: 初回のみ計算されたスケジュールを送信
      const initialMatches = schedule.days.flatMap(day => 
        day.matches.map(match => ({
          match_id: match.template.match_number,
          start_time: match.startTime,
          court_number: match.courtNumber
        }))
      );
      onScheduleChange(initialMatches);
    }
  }, [editMode, actualMatches.length, schedule?.days?.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // フォーマット変更時の状態リセット
  useEffect(() => {
    // 編集モードで実際の試合データがある場合はリセットしない
    if (editMode && actualMatches.length > 0) {
      return;
    }
    // 新規作成モードでフォーマットが未選択またはフォーマットが変更された場合はリセット
    setCustomSchedule(null);
    setHasManualEdits(false);
    setPreviousSettings(null);
  }, [formatId, editMode, actualMatches.length]);

  // デバッグ: 表示スケジュールの状態をログ出力
  useEffect(() => {
    if (editMode && (customSchedule || schedule)) {
      // 現在の表示スケジュールを取得
      // Display schedule updated in edit mode
    }
  }, [customSchedule, schedule, editMode]);

  // 時刻変更ハンドラー（個別試合のみ変更） 
  const handleTimeChange = (dayIndex: number, matchIndex: number, newStartTime: string) => {
    // Processing time change for match
    
    // customScheduleが未設定の場合、現在のスケジュールで初期化
    const currentSchedule = customSchedule || schedule;
    if (!currentSchedule) {
      // No schedule available for time change
      return;
    }

    const newSchedule = { ...currentSchedule };
    const targetDay = newSchedule.days[dayIndex];
    const targetMatch = targetDay.matches[matchIndex];
    
    // 新しい開始時刻を設定（対象試合のみ変更、他の試合は連動しない）
    const newStartMinutes = timeToMinutes(newStartTime);
    const matchDurationMinutes = timeToMinutes(targetMatch.endTime) - timeToMinutes(targetMatch.startTime);
    
    targetMatch.startTime = newStartTime;
    targetMatch.endTime = minutesToTime(newStartMinutes + matchDurationMinutes);
    
    // 他の試合への連動は行わない（個別修正を優先）
    
    // その日の総所要時間を再計算
    const dayEndTime = targetDay.matches.length > 0 
      ? Math.max(...targetDay.matches.map(m => timeToMinutes(m.endTime)))
      : timeToMinutes(settings.startTime);
    const dayStartTime = Math.min(...targetDay.matches.map(m => timeToMinutes(m.startTime)));
    targetDay.totalDuration = minutesToTime(dayEndTime - dayStartTime);
    
    // 全体の総所要時間を再計算
    let overallStartTime = Infinity;
    let overallEndTime = 0;
    
    for (const day of newSchedule.days) {
      if (day.matches.length > 0) {
        const dayStart = Math.min(...day.matches.map(m => timeToMinutes(m.startTime)));
        const dayEnd = Math.max(...day.matches.map(m => timeToMinutes(m.endTime)));
        overallStartTime = Math.min(overallStartTime, dayStart);
        overallEndTime = Math.max(overallEndTime, dayEnd);
      }
    }
    
    const totalDurationMinutes = overallEndTime - overallStartTime;
    newSchedule.totalDuration = totalDurationMinutes > 0 ? minutesToTime(totalDurationMinutes) : '0:00';
    
    // 時間重複チェックは削除（登録時のみ実施）
    // リアルタイムチェックを無効化してユーザビリティを向上
    
    setCustomSchedule(newSchedule);
    setEditingMatch(null);
    setHasManualEdits(true); // 手動編集フラグを設定
    
    // カスタムスケジュールが変更された場合、親コンポーネントに通知
    if (onScheduleChange) {
      if (editMode && actualMatches.length > 0) {
        // 既存大会の編集モード: match_idを使用
        const customMatches = newSchedule.days.flatMap(day => 
          day.matches.map(match => {
            const actualMatch = actualMatches.find(am => am.match_number === match.template.match_number);
            return actualMatch ? {
              match_id: actualMatch.match_id,
              start_time: match.startTime,
              court_number: match.courtNumber
            } : null;
          }).filter(Boolean)
        ) as Array<{ match_id: number; start_time: string; court_number: number; }>;
        
        // Notifying parent of time change in edit mode
        onScheduleChange(customMatches);
      } else {
        // 新規作成モード: match_numberを使用（match_idフィールドにmatch_numberを格納）
        const customMatches = newSchedule.days.flatMap(day => 
          day.matches.map(match => ({
            match_id: match.template.match_number, // 新規作成時はmatch_numberを使用
            start_time: match.startTime,
            court_number: match.courtNumber
          }))
        );
        
        // Schedule updated, notifying parent component
        onScheduleChange(customMatches);
      }
    }
  };

  // ブロック単位のコート変更ハンドラー
  const handleBlockCourtChange = (blockDisplayName: string, newCourtNumber: number) => {
    if (!displaySchedule) return;

    // ブロック表示名から実際のブロック名を抽出 (例: "予選Aブロック" → "A")
    const actualBlockName = blockDisplayName.includes('予選') 
      ? blockDisplayName.replace('予選', '').replace('ブロック', '')
      : blockDisplayName;

    // 利用可能コートのチェック
    const availableCourts = settings.availableCourts?.length 
      ? settings.availableCourts 
      : Array.from({length: settings.courtCount}, (_, i) => i + 1);

    if (!availableCourts.includes(newCourtNumber)) {
      alert(`コート${newCourtNumber}は利用可能コートに含まれていません`);
      return;
    }

    // 他のブロックとの重複チェック
    const otherBlockAssignments = Object.entries(blockCourtAssignments)
      .filter(([block]) => block !== actualBlockName);
    
    const conflictBlock = otherBlockAssignments.find(([, court]) => court === newCourtNumber);
    if (conflictBlock) {
      if (!confirm(`コート${newCourtNumber}は既に予選${conflictBlock[0]}ブロックで使用されています。変更を続行しますか？`)) {
        return;
      }
    }

    // ブロック割り当てを更新
    const newBlockAssignments = {
      ...blockCourtAssignments,
      [actualBlockName]: newCourtNumber
    };
    setBlockCourtAssignments(newBlockAssignments);

    // スケジュールを再計算（カスタムコート割り当て付き）
    if (templates.length > 0) {
      const customAssignment = {
        blockAssignments: newBlockAssignments,
        matchAssignments: matchCourtAssignments // 既存の個別試合割り当ても保持
      };

      const recalculatedSchedule = calculateTournamentSchedule(templates, settings, customAssignment);
      setCustomSchedule(recalculatedSchedule);
      setHasManualEdits(true);

      // 親コンポーネントに通知
      if (onScheduleChange) {
        const customMatches = recalculatedSchedule.days.flatMap(day => 
          day.matches.map(match => ({
            match_id: match.template.match_number,
            start_time: match.startTime,
            court_number: match.courtNumber
          }))
        );
        onScheduleChange(customMatches);
      }
    }
  };

  // 個別試合のコート変更ハンドラー
  const handleMatchCourtChange = (matchNumber: number, newCourtNumber: number) => {
    if (!displaySchedule) return;

    // 利用可能コートのチェック
    const availableCourts = settings.availableCourts?.length 
      ? settings.availableCourts 
      : Array.from({length: settings.courtCount}, (_, i) => i + 1);

    if (!availableCourts.includes(newCourtNumber)) {
      alert(`コート${newCourtNumber}は利用可能コートに含まれていません`);
      return;
    }

    // 試合別割り当てを更新
    const newMatchAssignments = {
      ...matchCourtAssignments,
      [matchNumber]: newCourtNumber
    };
    setMatchCourtAssignments(newMatchAssignments);

    // スケジュールを再計算（カスタムコート割り当て付き）
    if (templates.length > 0) {
      const customAssignment = {
        blockAssignments: blockCourtAssignments,
        matchAssignments: newMatchAssignments
      };

      const recalculatedSchedule = calculateTournamentSchedule(templates, settings, customAssignment);
      setCustomSchedule(recalculatedSchedule);
      setHasManualEdits(true);

      // 親コンポーネントに通知
      if (onScheduleChange) {
        const customMatches = recalculatedSchedule.days.flatMap(day => 
          day.matches.map(match => ({
            match_id: match.template.match_number,
            start_time: match.startTime,
            court_number: match.courtNumber
          }))
        );
        onScheduleChange(customMatches);
      }
    }
  };

  // スケジュールリセット関数
  const handleScheduleReset = () => {
    if (!initialSchedule) return;

    // 編集状態をリセット
    setHasManualEdits(false);
    setEditingMatch(null);
    setEditingBlockCourt(null);
    setEditingMatchCourt(null);
    setBlockCourtAssignments({});
    setMatchCourtAssignments({});

    // カスタムスケジュールを初期状態にリセット（深いコピー）
    const resetSchedule = JSON.parse(JSON.stringify(initialSchedule));
    setCustomSchedule(resetSchedule);

    // 親コンポーネントにリセット済みスケジュールを通知
    if (onScheduleChange) {
      const resetMatches = initialSchedule.days.flatMap(day => 
        day.matches.map(match => ({
          match_id: editMode && actualMatches.length > 0
            ? actualMatches.find(am => am.match_number === match.template.match_number)?.match_id || match.template.match_number
            : match.template.match_number,
          start_time: match.startTime,
          court_number: match.courtNumber
        }))
      );
      onScheduleChange(resetMatches);
    }
  };

  // ユーティリティ関数
  const timeToMinutes = (timeStr: string): number => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  };

  const minutesToTime = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  };

  // ブロック分類関数
  const getBlockKey = (template: MatchTemplate): string => {
    if (template.phase === 'preliminary') {
      // block_nameを直接使用（A, B, C, D等）
      if (template.block_name) {
        return `予選${template.block_name}ブロック`;
      }
      // フォールバック: match_codeから推測
      const match = template.match_code.match(/([ABCD])\d+/);
      if (match) {
        return `予選${match[1]}ブロック`;
      }
      return '予選リーグ';
    } else if (template.phase === 'final') {
      // round_nameを優先的に使用（1位リーグ、2位リーグなど）
      if (template.round_name) {
        return template.round_name;
      }
      // フォールバック: block_nameを使用
      if (template.block_name) {
        return template.block_name;
      }
      // 最終フォールバック
      return '決勝トーナメント';
    } else {
      return template.phase || 'その他';
    }
  };

  const getBlockDisplayName = (blockKey: string): string => {
    return blockKey;
  };

  const getBlockColor = (blockKey: string): string => {
    // 予選ブロックの色分け
    if (blockKey.includes('予選A')) return 'bg-blue-100 text-blue-800';
    if (blockKey.includes('予選B')) return 'bg-green-100 text-green-800';
    if (blockKey.includes('予選C')) return 'bg-yellow-100 text-yellow-800';
    if (blockKey.includes('予選D')) return 'bg-purple-100 text-purple-800';
    if (blockKey.includes('予選E')) return 'bg-pink-100 text-pink-800';
    if (blockKey.includes('予選F')) return 'bg-indigo-100 text-indigo-800';
    if (blockKey.includes('予選')) return 'bg-muted text-muted-foreground';

    // 決勝リーグの色分け
    if (blockKey.includes('1位リーグ') || blockKey.includes('1位ブロック')) return 'bg-amber-100 text-amber-800';
    if (blockKey.includes('2位リーグ') || blockKey.includes('2位ブロック')) return 'bg-cyan-100 text-cyan-800';
    if (blockKey.includes('3位リーグ') || blockKey.includes('3位ブロック')) return 'bg-lime-100 text-lime-800';

    // 決勝トーナメントのデフォルト
    if (blockKey.includes('決勝')) return 'bg-red-100 text-red-800';
    return 'bg-muted text-muted-foreground';
  };


  if (!formatId) {
    return (
      <Card>
        <CardContent className="text-center py-8">
          <Calendar className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">フォーマットを選択するとスケジュールプレビューが表示されます</p>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="text-center py-8">
          <RefreshCw className="w-8 h-8 mx-auto animate-spin text-blue-600 mb-4" />
          <p className="text-muted-foreground">スケジュールを計算中...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-red-200">
        <CardContent className="text-center py-8">
          <AlertTriangle className="w-8 h-8 mx-auto text-red-600 mb-4" />
          <p className="text-red-600">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (!schedule) {
    return (
      <Card>
        <CardContent className="text-center py-8">
          <p className="text-muted-foreground">スケジュールデータがありません</p>
        </CardContent>
      </Card>
    );
  }

  // 表示用スケジュール（カスタムがあればカスタム、なければ計算済み）
  const displaySchedule = customSchedule || schedule;

  return (
    <div className="space-y-6">
      {/* 概要情報 */}
      <Card className={displaySchedule.feasible ? 'border-green-200' : 'border-red-200'}>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center">
              {displaySchedule.feasible ? (
                <CheckCircle className="w-5 h-5 mr-2 text-green-600" />
              ) : (
                <AlertTriangle className="w-5 h-5 mr-2 text-red-600" />
              )}
              スケジュール概要
            </div>
            {hasManualEdits && initialSchedule && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleScheduleReset}
                title="編集前の状態に戻します"
              >
                <RefreshCw className="w-4 h-4 mr-1" />
                リセット
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{displaySchedule.totalMatches}</div>
              <div className="text-sm text-muted-foreground">総試合数</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{displaySchedule.days.length}</div>
              <div className="text-sm text-muted-foreground">開催日数</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                {Math.max(...displaySchedule.days.map(d => d.requiredCourts), 0)}
              </div>
              <div className="text-sm text-muted-foreground">最大必要コート数</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">{displaySchedule.totalDuration}</div>
              <div className="text-sm text-muted-foreground">総所要時間</div>
            </div>
          </div>

          {/* カスタム編集中表示 */}
          {customSchedule && hasManualEdits && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
              <p className="text-sm text-blue-800 font-medium flex items-center">
                <Edit3 className="w-4 h-4 mr-1" />
                時刻をカスタマイズ中 - 時刻をクリックして編集できます
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ブロック別スケジュール */}
      {displaySchedule.days.map((day, dayIndex) => {
        // ブロック別にマッチを分類
        const matchesByBlock = day.matches.reduce((acc, match) => {
          const blockKey = getBlockKey(match.template);
          if (!acc[blockKey]) {
            acc[blockKey] = [];
          }
          acc[blockKey].push(match);
          return acc;
        }, {} as Record<string, ScheduleMatch[]>);

        return (
          <div key={dayIndex} className="space-y-4">
            {/* 開催日ヘッダー */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center">
                    <Calendar className="w-5 h-5 mr-2" />
                    開催日 {day.dayNumber}: {new Date(day.date).toLocaleDateString('ja-JP', { 
                      month: 'short', 
                      day: 'numeric',
                      weekday: 'short'
                    })}
                  </div>
                  <div className="flex items-center text-sm text-muted-foreground">
                    <Clock className="w-4 h-4 mr-1" />
                    所要時間: {day.totalDuration}
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {/* 日程統計 */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div className="bg-muted rounded p-2 text-center">
                    <div className="font-medium">{day.matches.length}</div>
                    <div className="text-muted-foreground">試合数</div>
                  </div>
                  <div className="bg-muted rounded p-2 text-center">
                    <div className="font-medium">{day.requiredCourts}</div>
                    <div className="text-muted-foreground">必要コート数</div>
                  </div>
                  <div className="bg-muted rounded p-2 text-center">
                    <div className="font-medium">{day.timeSlots}</div>
                    <div className="text-muted-foreground">タイムスロット</div>
                  </div>
                  <div className="bg-muted rounded p-2 text-center">
                    <div className="font-medium">{Object.keys(matchesByBlock).length}</div>
                    <div className="text-muted-foreground">ブロック数</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* ブロック別試合表示 */}
            {Object.keys(matchesByBlock).length === 0 ? (
              <Card>
                <CardContent className="text-center py-8">
                  <p className="text-muted-foreground">この日は試合がありません</p>
                </CardContent>
              </Card>
            ) : (
              Object.entries(matchesByBlock)
                .sort(([blockKeyA], [blockKeyB]) => {
                  // フェーズ別の優先順位を設定（予選 → 決勝）
                  const phaseOrderA = blockKeyA.includes('予選') ? 0 : 1;
                  const phaseOrderB = blockKeyB.includes('予選') ? 0 : 1;
                  
                  if (phaseOrderA !== phaseOrderB) {
                    return phaseOrderA - phaseOrderB;
                  }
                  
                  // 同じフェーズ内でblock_nameの昇順でソート
                  // 予選の場合: "予選Aブロック" → "A"を抽出してソート
                  // 決勝の場合: "1位リーグ", "2位リーグ", "決勝トーナメント" などを比較
                  if (blockKeyA.includes('予選') && blockKeyB.includes('予選')) {
                    const blockA = blockKeyA.replace('予選', '').replace('ブロック', '');
                    const blockB = blockKeyB.replace('予選', '').replace('ブロック', '');
                    return blockA.localeCompare(blockB);
                  }

                  // 決勝同士の場合はそのまま比較（round_name順）
                  return blockKeyA.localeCompare(blockKeyB);
                })
                .map(([blockKey, blockMatches]) => (
                <Card key={blockKey}>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <div className="flex items-center">
                        <span className={`px-3 py-1 rounded-full text-sm font-medium mr-3 ${getBlockColor(blockKey)}`}>
                          {getBlockDisplayName(blockKey)}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {blockMatches.length}試合
                        </span>
                      </div>
                      
                      {/* ブロック単位コート変更UI（リーグ戦のみ・まとめて変更用） */}
                      {blockKey.includes('予選') && (
                        <div className="flex items-center space-x-2">
                          <span className="text-xs text-muted-foreground">ブロック一括設定:</span>
                          {editingBlockCourt === blockKey ? (
                            <div className="flex items-center space-x-1">
                              <span className="text-xs">コート</span>
                              <select
                                value={(() => {
                                  const actualBlockName = blockKey.includes('予選') 
                                    ? blockKey.replace('予選', '').replace('ブロック', '')
                                    : blockKey;
                                  return blockCourtAssignments[actualBlockName] ?? blockMatches[0]?.courtNumber ?? 1;
                                })()}
                                onChange={(e) => {
                                  const newCourt = parseInt(e.target.value);
                                  handleBlockCourtChange(blockKey, newCourt);
                                  setEditingBlockCourt(null);
                                }}
                                onBlur={() => setEditingBlockCourt(null)}
                                className="text-xs border rounded px-1 py-0.5 w-12"
                                autoFocus
                              >
                                {(settings.availableCourts?.length 
                                  ? settings.availableCourts 
                                  : Array.from({length: settings.courtCount}, (_, i) => i + 1)
                                ).map(courtNum => (
                                  <option key={courtNum} value={courtNum}>{courtNum}</option>
                                ))}
                              </select>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setEditingBlockCourt(null)}
                                className="h-5 w-5 p-0"
                              >
                                ✕
                              </Button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setEditingBlockCourt(blockKey)}
                              className="flex items-center space-x-1 text-xs text-orange-600 hover:text-orange-800 transition-colors"
                              title="このブロックの全試合を同じコートに一括設定"
                            >
                              <span>コート{(() => {
                                const actualBlockName = blockKey.includes('予選') 
                                  ? blockKey.replace('予選', '').replace('ブロック', '')
                                  : blockKey;
                                return blockCourtAssignments[actualBlockName] ?? blockMatches[0]?.courtNumber ?? 1;
                              })()}</span>
                              <Edit3 className="w-3 h-3" />
                            </button>
                          )}
                          <span className="text-xs text-gray-400">（個別設定が優先）</span>
                        </div>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2 px-3 font-medium">時間</th>
                            <th className="text-left py-2 px-3 font-medium">試合</th>
                            <th className="text-left py-2 px-3 font-medium">対戦</th>
                            <th className="text-left py-2 px-3 font-medium">コート</th>
                          </tr>
                        </thead>
                        <tbody>
                          {blockMatches
                            .map((match) => {
                              const originalMatchIndex = day.matches.findIndex(m => m === match);
                              const editKey = `${dayIndex}-${originalMatchIndex}`;
                              const isEditing = editingMatch === editKey;
                              
                              return (
                                <tr key={originalMatchIndex} className="border-b hover:bg-muted">
                                  <td className="py-2 px-3 text-sm">
                                    {!isEditing ? (
                                      <div className="flex items-center space-x-1">
                                        <button
                                          onClick={() => {
                                            // カスタムスケジュールを初期化（未設定の場合）
                                            if (!customSchedule) {
                                              // Initializing custom schedule for editing
                                              setCustomSchedule(displaySchedule);
                                            }
                                            setEditingMatch(editKey);
                                          }}
                                          className="flex items-center space-x-1 hover:text-blue-600 transition-colors"
                                          title="時刻を編集"
                                        >
                                          <span title={`Rendered: ${match.startTime}, Display: ${displaySchedule?.days?.[dayIndex]?.matches?.[originalMatchIndex]?.startTime || 'undefined'}`}>
                                            {match.startTime}
                                          </span>
                                          <Edit3 className="w-3 h-3" />
                                        </button>
                                        <span>-</span>
                                        <span>{match.endTime}</span>
                                      </div>
                                    ) : (
                                      <div className="flex items-center space-x-1">
                                        <Input
                                          type="time"
                                          defaultValue={displaySchedule?.days?.[dayIndex]?.matches?.[originalMatchIndex]?.startTime || match.startTime}
                                          className="w-20 h-7 text-xs"
                                          onBlur={(e) => {
                                            // フォーカスが外れた時に親に通知
                                            handleTimeChange(dayIndex, originalMatchIndex, e.target.value);
                                            setEditingMatch(null);
                                          }}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                              const target = e.target as HTMLInputElement;
                                              handleTimeChange(dayIndex, originalMatchIndex, target.value);
                                              setEditingMatch(null);
                                            } else if (e.key === 'Escape') {
                                              setEditingMatch(null);
                                            }
                                          }}
                                          autoFocus
                                        />
                                        <span>-</span>
                                        <span>{match.endTime}</span>
                                      </div>
                                    )}
                                  </td>
                                  <td className="py-2 px-3">
                                    <div className="font-medium">{match.template.match_code}</div>
                                    <div className="text-xs text-muted-foreground">{match.template.match_type}</div>
                                  </td>
                                  <td className="py-2 px-3 text-sm">
                                    {match.template.team1_display_name} vs {match.template.team2_display_name}
                                  </td>
                                  <td className="py-2 px-3">
                                    {/* 個別試合コート変更UI（全試合対応） */}
                                    <div className="flex items-center text-sm">
                                      <MapPin className="w-3 h-3 mr-1" />
                                      {editingMatchCourt === editKey ? (
                                        <div className="flex items-center space-x-1">
                                          <span>コート</span>
                                          <select
                                            value={matchCourtAssignments[match.template.match_number] ?? match.courtNumber}
                                            onChange={(e) => {
                                              const newCourt = parseInt(e.target.value);
                                              handleMatchCourtChange(match.template.match_number, newCourt);
                                              setEditingMatchCourt(null);
                                            }}
                                            onBlur={() => setEditingMatchCourt(null)}
                                            className="text-xs border rounded px-1 py-0.5 w-12"
                                            autoFocus
                                          >
                                            {(settings.availableCourts?.length 
                                              ? settings.availableCourts 
                                              : Array.from({length: settings.courtCount}, (_, i) => i + 1)
                                            ).map(courtNum => (
                                              <option key={courtNum} value={courtNum}>{courtNum}</option>
                                            ))}
                                          </select>
                                        </div>
                                      ) : (
                                        <button
                                          onClick={() => setEditingMatchCourt(editKey)}
                                          className="flex items-center space-x-1 text-blue-600 hover:text-blue-800 transition-colors"
                                          title="コート番号を変更（個別設定）"
                                        >
                                          <span>コート {matchCourtAssignments[match.template.match_number] ?? match.courtNumber}</span>
                                          <Edit3 className="w-3 h-3" />
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        );
      })}

    </div>
  );
}