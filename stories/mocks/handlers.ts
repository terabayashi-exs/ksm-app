/**
 * MSW (Mock Service Worker) ハンドラー
 * Storybook で API をモックするために使用
 */

import { http, HttpResponse } from "msw";
import { getMockDataByTournamentId } from "../mock-data/bracket-data";

export const handlers = [
  // トーナメントブラケット API
  http.get("/api/tournaments/:id/bracket", ({ params }) => {
    const tournamentId = Number(params.id);
    const response = getMockDataByTournamentId(tournamentId);
    return HttpResponse.json(response);
  }),

  // 404 を返すケース（トーナメントが存在しない）
  http.get("/api/tournaments/999/bracket", () => {
    return new HttpResponse(null, { status: 404 });
  }),

  // エラーを返すケース
  http.get("/api/tournaments/0/bracket", () => {
    return HttpResponse.json(
      { success: false, error: "トーナメントが見つかりません" },
      { status: 500 }
    );
  }),
];
