// lib/utils.ts
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(date));
}

export function formatTime(time: string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(`2000-01-01T${time}`));
}

export function generateTeamId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2);
  return `team_${timestamp}_${random}`;
}

export function generateMatchCode(blockName: string, matchNumber: number): string {
  const blockCode = blockName.substring(0, 3).toUpperCase();
  return `${blockCode}${matchNumber.toString().padStart(3, '0')}`;
}

export function calculateWinRate(wins: number, draws: number, losses: number): number {
  const totalMatches = wins + draws + losses;
  if (totalMatches === 0) return 0;
  return Math.round(((wins + draws * 0.5) / totalMatches) * 1000) / 10; // 小数点第1位まで
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}