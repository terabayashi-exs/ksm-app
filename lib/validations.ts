// lib/validations.ts
import { z } from 'zod';

// 大会開催日の型
export const tournamentDateSchema = z.object({
  dayNumber: z.number()
    .min(1, '開催日番号は1以上で入力してください')
    .max(10, '開催日番号は10以下で入力してください'),
  date: z.string()
    .min(1, '日付は必須です')
    .regex(/^\d{4}-\d{2}-\d{2}$/, '日付は YYYY-MM-DD 形式で入力してください')
});

// 大会作成フォームのスキーマ
export const tournamentCreateSchema = z.object({
  // 基本情報
  tournament_name: z.string()
    .min(1, '大会名は必須です')
    .max(100, '大会名は100文字以内で入力してください'),
  
  format_id: z.number()
    .min(1, '大会フォーマットを選択してください'),
  
  venue_id: z.number()
    .min(1, '会場を選択してください'),
  
  team_count: z.number()
    .min(2, 'チーム数は2以上で入力してください')
    .max(128, 'チーム数は128以下で入力してください'),

  // 運営設定
  court_count: z.number()
    .min(1, 'コート数は1以上で入力してください')
    .max(20, 'コート数は20以下で入力してください'),
  
  available_courts: z.string()
    .optional()
    .refine((val) => {
      if (!val || val.trim() === '') return true; // 空文字は許可
      const courts = val.split(',').map(s => s.trim());
      return courts.every(court => /^\d+$/.test(court) && parseInt(court) >= 1 && parseInt(court) <= 99);
    }, '使用コート番号は1-99の数字をカンマ区切りで入力してください（例: 1,3,4,7）'),
  
  match_duration_minutes: z.number()
    .min(5, '試合時間は5分以上で入力してください')
    .max(120, '試合時間は120分以下で入力してください'),
  
  break_duration_minutes: z.number()
    .min(0, '休憩時間は0分以上で入力してください')
    .max(60, '休憩時間は60分以下で入力してください'),

  // 開催日程（複数日対応）
  tournament_dates: z.array(tournamentDateSchema)
    .min(1, '最低1つの開催日を指定してください')
    .max(7, '開催日は最大7日まで指定可能です'),

  // 公開設定
  is_public: z.boolean().optional().default(false),
  show_players_public: z.boolean().optional().default(false),

  // 公開・募集日程
  public_start_date: z.string()
    .min(1, '公開開始日は必須です')
    .regex(/^\d{4}-\d{2}-\d{2}$/, '公開開始日は YYYY-MM-DD 形式で入力してください'),
  
  recruitment_start_date: z.string()
    .min(1, '募集開始日は必須です')
    .regex(/^\d{4}-\d{2}-\d{2}$/, '募集開始日は YYYY-MM-DD 形式で入力してください'),
  
  recruitment_end_date: z.string()
    .min(1, '募集終了日は必須です')
    .regex(/^\d{4}-\d{2}-\d{2}$/, '募集終了日は YYYY-MM-DD 形式で入力してください')
}).refine((data) => {
  // 開催日番号の重複チェック
  const dayNumbers = data.tournament_dates.map(d => d.dayNumber);
  const uniqueDayNumbers = new Set(dayNumbers);
  return dayNumbers.length === uniqueDayNumbers.size;
}, {
  message: '同じ開催日番号は使用できません',
  path: ['tournament_dates']
}).refine((data) => {
  // 開催日の重複チェック
  const dates = data.tournament_dates.map(d => d.date);
  const uniqueDates = new Set(dates);
  return dates.length === uniqueDates.size;
}, {
  message: '同じ日付は複数回指定できません',
  path: ['tournament_dates']
}).refine((data) => {
  // 使用コート番号とコート数の整合性チェック
  if (!data.available_courts || data.available_courts.trim() === '') {
    return true; // 未指定の場合はOK
  }
  const courts = data.available_courts.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
  const uniqueCourts = new Set(courts);
  return courts.length === uniqueCourts.size && uniqueCourts.size >= data.court_count;
}, {
  message: 'コート番号に重複があるか、使用コート数より指定されたコート番号が少ないです',
  path: ['available_courts']
}).refine((data) => {
  // 募集開始日 >= 公開開始日のチェック
  return new Date(data.recruitment_start_date) >= new Date(data.public_start_date);
}, {
  message: '募集開始日は公開開始日以降で設定してください',
  path: ['recruitment_start_date']
}).refine((data) => {
  // 募集終了日 >= 募集開始日のチェック
  return new Date(data.recruitment_end_date) >= new Date(data.recruitment_start_date);
}, {
  message: '募集終了日は募集開始日以降で設定してください',
  path: ['recruitment_end_date']
});

export type TournamentCreateForm = z.infer<typeof tournamentCreateSchema>;
export type TournamentDate = z.infer<typeof tournamentDateSchema>;

// チーム登録フォームのスキーマ
export const teamRegisterSchema = z.object({
  team_id: z.string()
    .min(3, 'チームIDは3文字以上で入力してください')
    .max(20, 'チームIDは20文字以内で入力してください')
    .regex(/^[a-zA-Z0-9_-]+$/, 'チームIDは英数字、ハイフン、アンダースコアのみ使用可能です'),
  
  team_name: z.string()
    .min(1, 'チーム名は必須です')
    .max(50, 'チーム名は50文字以内で入力してください'),
  
  team_omission: z.string()
    .max(5, 'チーム略称は5文字以内で入力してください')
    .optional(),
  
  contact_person: z.string()
    .min(1, '連絡担当者名は必須です')
    .max(50, '連絡担当者名は50文字以内で入力してください'),
  
  contact_email: z.string()
    .email('正しいメールアドレスを入力してください')
    .max(100, 'メールアドレスは100文字以内で入力してください'),
  
  contact_phone: z.string()
    .regex(/^[0-9-+()[\]\s]*$/, '電話番号の形式が正しくありません')
    .max(20, '電話番号は20文字以内で入力してください')
    .optional(),
  
  password: z.string()
    .min(6, 'パスワードは6文字以上で入力してください')
    .max(100, 'パスワードは100文字以内で入力してください'),
  
  password_confirmation: z.string()
    .min(6, 'パスワード確認は6文字以上で入力してください')
}).refine((data) => {
  return data.password === data.password_confirmation;
}, {
  message: 'パスワードが一致しません',
  path: ['password_confirmation']
});

export type TeamRegisterForm = z.infer<typeof teamRegisterSchema>;

// 選手登録用のスキーマ
export const playerRegisterSchema = z.object({
  player_name: z.string()
    .min(1, '選手名は必須です')
    .max(50, '選手名は50文字以内で入力してください'),
  
  player_number: z.number()
    .int('背番号は整数で入力してください')
    .min(1, '背番号は1以上で入力してください')
    .max(99, '背番号は99以下で入力してください')
    .optional()
    .or(z.undefined())
});

export type PlayerRegisterForm = z.infer<typeof playerRegisterSchema>;

// チーム登録時に選手も含むスキーマ
export const teamWithPlayersRegisterSchema = teamRegisterSchema.extend({
  players: z.array(playerRegisterSchema)
    .min(0, '選手は0人以上で登録してください')
    .max(20, '選手は最大20人まで登録可能です')
    .refine((players) => {
      // 背番号の重複チェック
      const numbers = players.filter(p => p.player_number !== undefined).map(p => p.player_number);
      const uniqueNumbers = new Set(numbers);
      return numbers.length === uniqueNumbers.size;
    }, {
      message: '背番号が重複しています'
    })
});

export type TeamWithPlayersRegisterForm = z.infer<typeof teamWithPlayersRegisterSchema>;

// デフォルト値
export const tournamentCreateDefaults: Partial<TournamentCreateForm> = {
  court_count: 4,
  match_duration_minutes: 15,
  break_duration_minutes: 5,
  is_public: false,
  public_start_date: new Date().toISOString().split('T')[0], // 今日
  recruitment_start_date: new Date().toISOString().split('T')[0], // 今日
  recruitment_end_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 2週間後
  tournament_dates: [
    {
      dayNumber: 1,
      date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // 1週間後
    }
  ]
};