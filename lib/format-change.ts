// lib/format-change.ts
/**
 * フォーマット変更に関する型定義とヘルパー関数
 */

export interface FormatChangeCheckResponse {
  success: boolean;
  data?: {
    tournament_id: number;
    tournament_name: string;
    current_format_id: number;
    current_format_name: string;
    tournament_status: string;
    can_change: boolean;
    match_status: {
      total_matches: number;
      completed_matches: number;
      confirmed_matches: number;
      has_results: boolean;
    };
    reasons: string[];
  };
  error?: string;
}

export interface FormatChangeResponse {
  success: boolean;
  message?: string;
  data?: {
    tournament_id: number;
    tournament_name: string;
    old_format_id: number;
    old_format_name: string;
    new_format_id: number;
    new_format_name: string;
    target_team_count: number;
    deleted_data: {
      matches_final: number;
      matches_live: number;
      match_blocks: number;
      match_overrides: number;
      reset_teams: number;
    };
    created_data?: {
      match_blocks: number;
      matches: number;
    };
  };
  error?: string;
  details?: {
    reason?: string;
    message?: string;
    matchCount?: number;
    completedCount?: number;
    confirmedCount?: number;
    suggestion?: string;
    current_status?: string;
  };
}

/**
 * フォーマット変更可否をチェック
 */
export async function checkFormatChangeEligibility(
  tournamentId: number
): Promise<FormatChangeCheckResponse> {
  try {
    const response = await fetch(`/api/admin/tournaments/${tournamentId}/change-format`);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Format change check error:', error);
    return {
      success: false,
      error: 'フォーマット変更可否チェックに失敗しました'
    };
  }
}

/**
 * フォーマット変更を実行
 */
export async function changeFormat(
  tournamentId: number,
  newFormatId: number,
  confirmation: boolean = true
): Promise<FormatChangeResponse> {
  try {
    const response = await fetch(`/api/admin/tournaments/${tournamentId}/change-format`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        new_format_id: newFormatId,
        confirmation: confirmation
      })
    });

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Format change error:', error);
    return {
      success: false,
      error: 'フォーマット変更に失敗しました'
    };
  }
}

