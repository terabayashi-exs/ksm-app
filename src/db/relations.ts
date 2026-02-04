import { relations } from "drizzle-orm/relations";
import { mTeams, tMatchesFinal, tMatchBlocks, tTournaments, tMatchStatus, tTournamentNotifications, mTournamentFormats, mMatchTemplates, tTournamentFiles, mSubscriptionPlans, mAdministrators, mVenues, tTournamentGroups, mPlayers, tTournamentPlayers, tTournamentTeams, tTournamentCourts, tTournamentMatchOverrides, tTournamentRules, tEmailSendHistory, tPasswordResetTokens, tAdministratorSubscriptions, tSubscriptionUsage, tPaymentHistory, tAnnouncements, tSponsorBanners } from "./schema";

export const tMatchesFinalRelations = relations(tMatchesFinal, ({one}) => ({
	mTeam_winnerTeamId: one(mTeams, {
		fields: [tMatchesFinal.winnerTeamId],
		references: [mTeams.teamId],
		relationName: "tMatchesFinal_winnerTeamId_mTeams_teamId"
	}),
	mTeam_team2Id: one(mTeams, {
		fields: [tMatchesFinal.team2Id],
		references: [mTeams.teamId],
		relationName: "tMatchesFinal_team2Id_mTeams_teamId"
	}),
	mTeam_team1Id: one(mTeams, {
		fields: [tMatchesFinal.team1Id],
		references: [mTeams.teamId],
		relationName: "tMatchesFinal_team1Id_mTeams_teamId"
	}),
	tMatchBlock: one(tMatchBlocks, {
		fields: [tMatchesFinal.matchBlockId],
		references: [tMatchBlocks.matchBlockId]
	}),
}));

export const mTeamsRelations = relations(mTeams, ({many}) => ({
	tMatchesFinals_winnerTeamId: many(tMatchesFinal, {
		relationName: "tMatchesFinal_winnerTeamId_mTeams_teamId"
	}),
	tMatchesFinals_team2Id: many(tMatchesFinal, {
		relationName: "tMatchesFinal_team2Id_mTeams_teamId"
	}),
	tMatchesFinals_team1Id: many(tMatchesFinal, {
		relationName: "tMatchesFinal_team1Id_mTeams_teamId"
	}),
	tTournamentPlayers: many(tTournamentPlayers),
	tTournamentTeams: many(tTournamentTeams),
	mPlayers: many(mPlayers),
	tPasswordResetTokens: many(tPasswordResetTokens),
}));

export const tMatchBlocksRelations = relations(tMatchBlocks, ({one, many}) => ({
	tMatchesFinals: many(tMatchesFinal),
	tTournament: one(tTournaments, {
		fields: [tMatchBlocks.tournamentId],
		references: [tTournaments.tournamentId]
	}),
	tMatchStatuses: many(tMatchStatus),
}));

export const tTournamentsRelations = relations(tTournaments, ({one, many}) => ({
	tMatchBlocks: many(tMatchBlocks),
	tTournamentNotifications: many(tTournamentNotifications),
	tTournamentFiles: many(tTournamentFiles),
	tTournamentGroup: one(tTournamentGroups, {
		fields: [tTournaments.groupId],
		references: [tTournamentGroups.groupId]
	}),
	mVenue: one(mVenues, {
		fields: [tTournaments.venueId],
		references: [mVenues.venueId]
	}),
	mTournamentFormat: one(mTournamentFormats, {
		fields: [tTournaments.formatId],
		references: [mTournamentFormats.formatId]
	}),
	tTournamentPlayers: many(tTournamentPlayers),
	tTournamentTeams: many(tTournamentTeams),
	tTournamentCourts: many(tTournamentCourts),
	tTournamentMatchOverrides: many(tTournamentMatchOverrides),
	tTournamentRules: many(tTournamentRules),
	tEmailSendHistories: many(tEmailSendHistory),
	tSponsorBanners: many(tSponsorBanners),
}));

export const tMatchStatusRelations = relations(tMatchStatus, ({one}) => ({
	tMatchBlock: one(tMatchBlocks, {
		fields: [tMatchStatus.matchBlockId],
		references: [tMatchBlocks.matchBlockId]
	}),
}));

export const tTournamentNotificationsRelations = relations(tTournamentNotifications, ({one}) => ({
	tTournament: one(tTournaments, {
		fields: [tTournamentNotifications.tournamentId],
		references: [tTournaments.tournamentId]
	}),
}));

export const mMatchTemplatesRelations = relations(mMatchTemplates, ({one}) => ({
	mTournamentFormat: one(mTournamentFormats, {
		fields: [mMatchTemplates.formatId],
		references: [mTournamentFormats.formatId]
	}),
}));

export const mTournamentFormatsRelations = relations(mTournamentFormats, ({many}) => ({
	mMatchTemplates: many(mMatchTemplates),
	tTournaments: many(tTournaments),
}));

export const tTournamentFilesRelations = relations(tTournamentFiles, ({one}) => ({
	tTournament: one(tTournaments, {
		fields: [tTournamentFiles.tournamentId],
		references: [tTournaments.tournamentId]
	}),
}));

export const mAdministratorsRelations = relations(mAdministrators, ({one, many}) => ({
	mSubscriptionPlan: one(mSubscriptionPlans, {
		fields: [mAdministrators.currentPlanId],
		references: [mSubscriptionPlans.planId]
	}),
	tTournamentGroups: many(tTournamentGroups),
	tAdministratorSubscriptions: many(tAdministratorSubscriptions),
	tSubscriptionUsages: many(tSubscriptionUsage),
	tPaymentHistories: many(tPaymentHistory),
	tAnnouncements: many(tAnnouncements),
}));

export const mSubscriptionPlansRelations = relations(mSubscriptionPlans, ({many}) => ({
	mAdministrators: many(mAdministrators),
	tAdministratorSubscriptions: many(tAdministratorSubscriptions),
	tPaymentHistories: many(tPaymentHistory),
}));

export const tTournamentGroupsRelations = relations(tTournamentGroups, ({one, many}) => ({
	mVenue: one(mVenues, {
		fields: [tTournamentGroups.venueId],
		references: [mVenues.venueId]
	}),
	mAdministrator: one(mAdministrators, {
		fields: [tTournamentGroups.adminLoginId],
		references: [mAdministrators.adminLoginId]
	}),
	tTournaments: many(tTournaments),
}));

export const mVenuesRelations = relations(mVenues, ({many}) => ({
	tTournamentGroups: many(tTournamentGroups),
	tTournaments: many(tTournaments),
}));

export const tTournamentPlayersRelations = relations(tTournamentPlayers, ({one}) => ({
	mPlayer: one(mPlayers, {
		fields: [tTournamentPlayers.playerId],
		references: [mPlayers.playerId]
	}),
	mTeam: one(mTeams, {
		fields: [tTournamentPlayers.teamId],
		references: [mTeams.teamId]
	}),
	tTournament: one(tTournaments, {
		fields: [tTournamentPlayers.tournamentId],
		references: [tTournaments.tournamentId]
	}),
}));

export const mPlayersRelations = relations(mPlayers, ({one, many}) => ({
	tTournamentPlayers: many(tTournamentPlayers),
	mTeam: one(mTeams, {
		fields: [mPlayers.currentTeamId],
		references: [mTeams.teamId]
	}),
}));

export const tTournamentTeamsRelations = relations(tTournamentTeams, ({one, many}) => ({
	mTeam: one(mTeams, {
		fields: [tTournamentTeams.teamId],
		references: [mTeams.teamId]
	}),
	tTournament: one(tTournaments, {
		fields: [tTournamentTeams.tournamentId],
		references: [tTournaments.tournamentId]
	}),
	tEmailSendHistories: many(tEmailSendHistory),
}));

export const tTournamentCourtsRelations = relations(tTournamentCourts, ({one}) => ({
	tTournament: one(tTournaments, {
		fields: [tTournamentCourts.tournamentId],
		references: [tTournaments.tournamentId]
	}),
}));

export const tTournamentMatchOverridesRelations = relations(tTournamentMatchOverrides, ({one}) => ({
	tTournament: one(tTournaments, {
		fields: [tTournamentMatchOverrides.tournamentId],
		references: [tTournaments.tournamentId]
	}),
}));

export const tTournamentRulesRelations = relations(tTournamentRules, ({one}) => ({
	tTournament: one(tTournaments, {
		fields: [tTournamentRules.tournamentId],
		references: [tTournaments.tournamentId]
	}),
}));

export const tEmailSendHistoryRelations = relations(tEmailSendHistory, ({one}) => ({
	tTournamentTeam: one(tTournamentTeams, {
		fields: [tEmailSendHistory.tournamentTeamId],
		references: [tTournamentTeams.tournamentTeamId]
	}),
	tTournament: one(tTournaments, {
		fields: [tEmailSendHistory.tournamentId],
		references: [tTournaments.tournamentId]
	}),
}));

export const tPasswordResetTokensRelations = relations(tPasswordResetTokens, ({one}) => ({
	mTeam: one(mTeams, {
		fields: [tPasswordResetTokens.teamId],
		references: [mTeams.teamId]
	}),
}));

export const tAdministratorSubscriptionsRelations = relations(tAdministratorSubscriptions, ({one}) => ({
	mSubscriptionPlan: one(mSubscriptionPlans, {
		fields: [tAdministratorSubscriptions.planId],
		references: [mSubscriptionPlans.planId]
	}),
	mAdministrator: one(mAdministrators, {
		fields: [tAdministratorSubscriptions.adminLoginId],
		references: [mAdministrators.adminLoginId]
	}),
}));

export const tSubscriptionUsageRelations = relations(tSubscriptionUsage, ({one}) => ({
	mAdministrator: one(mAdministrators, {
		fields: [tSubscriptionUsage.adminLoginId],
		references: [mAdministrators.adminLoginId]
	}),
}));

export const tPaymentHistoryRelations = relations(tPaymentHistory, ({one}) => ({
	mSubscriptionPlan: one(mSubscriptionPlans, {
		fields: [tPaymentHistory.planId],
		references: [mSubscriptionPlans.planId]
	}),
	mAdministrator: one(mAdministrators, {
		fields: [tPaymentHistory.adminLoginId],
		references: [mAdministrators.adminLoginId]
	}),
}));

export const tAnnouncementsRelations = relations(tAnnouncements, ({one}) => ({
	mAdministrator: one(mAdministrators, {
		fields: [tAnnouncements.createdBy],
		references: [mAdministrators.adminLoginId]
	}),
}));

export const tSponsorBannersRelations = relations(tSponsorBanners, ({one}) => ({
	tTournament: one(tTournaments, {
		fields: [tSponsorBanners.tournamentId],
		references: [tTournaments.tournamentId]
	}),
}));