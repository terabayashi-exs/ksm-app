import { promises as fs } from 'fs';
import path from 'path';

/**
 * PDFファイルの存在をチェックする関数
 */
export async function checkPdfExists(filePath: string): Promise<boolean> {
  try {
    const fullPath = path.join(process.cwd(), 'public', filePath);
    await fs.access(fullPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * トーナメント表PDFの存在をチェック
 */
export async function checkTournamentBracketPdfExists(tournamentId: number): Promise<boolean> {
  const filePath = `tournament-brackets/tournament-${tournamentId}-bracket.pdf`;
  return checkPdfExists(filePath);
}

/**
 * 結果表PDFの存在をチェック
 */
export async function checkTournamentResultsPdfExists(tournamentId: number): Promise<boolean> {
  const filePath = `tournament-results/tournament-${tournamentId}-results.pdf`;
  return checkPdfExists(filePath);
}

/**
 * 複数のPDFファイルの存在を一括チェック
 */
export async function checkTournamentPdfFiles(tournamentId: number): Promise<{
  bracketPdfExists: boolean;
  resultsPdfExists: boolean;
}> {
  const [bracketPdfExists, resultsPdfExists] = await Promise.all([
    checkTournamentBracketPdfExists(tournamentId),
    checkTournamentResultsPdfExists(tournamentId)
  ]);

  return {
    bracketPdfExists,
    resultsPdfExists
  };
}