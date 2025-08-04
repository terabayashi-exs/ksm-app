// lib/constants.ts

export const TOURNAMENT_STATUS = {
  PLANNING: 'planning',
  ONGOING: 'ongoing',
  COMPLETED: 'completed'
} as const;

export const MATCH_STATUS = {
  SCHEDULED: 'scheduled',
  ONGOING: 'ongoing',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
} as const;

export const RESULT_STATUS = {
  NONE: 'none',
  PENDING: 'pending',
  CONFIRMED: 'confirmed'
} as const;

export const BLOCK_TYPE = {
  PRELIMINARY: 'preliminary',
  FINAL: 'final'
} as const;

export const ADMIN_ROLE = {
  SUPER_ADMIN: 'super_admin',
  TOURNAMENT_ADMIN: 'tournament_admin'
} as const;

export const DEFAULT_TEAM_COUNT = {
  MIN: 4,
  MAX: 32
} as const;

export const DEFAULT_COURT_COUNT = 4;

export const MATCH_DURATION_MINUTES = 15;

export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100
} as const;