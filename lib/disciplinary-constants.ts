// lib/disciplinary-constants.ts
// 懲罰機能の定数定義（サッカー/PK選手権用）

export const CARD_TYPES = {
  YELLOW: "yellow",
  RED: "red",
  SECOND_YELLOW: "second_yellow",
} as const;

export type CardType = (typeof CARD_TYPES)[keyof typeof CARD_TYPES];

export const CARD_TYPE_LABELS: Record<CardType, string> = {
  yellow: "イエローカード",
  red: "レッドカード",
  second_yellow: "2枚目イエロー（退場）",
};

export const REASON_PRESETS: { code: number; label: string }[] = [
  { code: 1, label: "反則行為" },
  { code: 2, label: "危険な行為" },
  { code: 3, label: "主審・副審の判定に対する非難、抗議等" },
  { code: 4, label: "反スポーツ的な行為(シミュレーションを含む)" },
  { code: 5, label: "策略的な行為(時間稼ぎ、露骨なハンド等を含む)" },
  { code: 6, label: "主審に無断で一時的にフィールドを離れる行為" },
  {
    code: 7,
    label:
      "その他スポーツマンらしくない行為(観客への無礼な仕草、差別発言その他の差別的行為等を含む)",
  },
];

export function getReasonLabel(code: number): string {
  return REASON_PRESETS.find((r) => r.code === code)?.label || "不明";
}

/** 懲罰ポイント（順位表フェアプレー用） */
export const PENALTY_POINTS: Record<CardType, number> = {
  yellow: 1,
  red: 3,
  second_yellow: 3,
};

/** 懲罰機能対応の競技コード */
export const DISCIPLINARY_SPORT_CODES = ["soccer", "pk_championship"] as const;

export function isDisciplinarySport(sportCode: string): boolean {
  return (DISCIPLINARY_SPORT_CODES as readonly string[]).includes(sportCode);
}
