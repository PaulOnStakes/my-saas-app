import {
    pgTable,
    serial,
    text,
    varchar,
    timestamp,
    boolean,
    integer,
    jsonb,
    uuid,
    pgEnum,
    uniqueIndex,
    index,
    bigint, // Added bigint for file_size_bytes
    // primaryKey, // Not needed here as it's used inline
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm'; // Removed sql import as defaultNow() is preferred

// --------- ENUMS ---------
export const contentTypeEnum = pgEnum('content_type_enum', [
    'image',
    'video',
    'carousel',
    'text_only',
]);
export const scheduleStatusEnum = pgEnum('schedule_status_enum', [
    'pending',
    'processing',
    'posted',
    'failed',
    'cancelled',
]);
export const subscriptionStatusEnum = pgEnum('subscription_status_enum', [
    'free',
    'premium',
    'trial',
    'cancelled',
    'past_due',
]);

// --------- USERS TABLE ---------
export const users = pgTable('users', {
    clerkUserId: text('clerk_user_id').primaryKey(),
    email: text('email').notNull().unique(),
    subscriptionStatus: subscriptionStatusEnum('subscription_status'),
    onboardingCompleted: boolean('onboarding_completed').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
    connectedAccounts: many(userConnectedAccounts),
    contentItems: many(contentItems),
    scheduledPosts: many(scheduledPosts),
}));

// --------- SOCIAL PLATFORMS TABLE (Lookup Table) ---------
export const socialPlatforms = pgTable('social_platforms', {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 50 }).unique().notNull(),
    apiBaseUrl: text('api_base_url'),
    iconUrl: text('icon_url'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const socialPlatformsRelations = relations(socialPlatforms, ({ many }) => ({
    connectedAccounts: many(userConnectedAccounts),
}));

// --------- USER CONNECTED ACCOUNTS TABLE ---------
export const userConnectedAccounts = pgTable('user_connected_accounts', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id').notNull().references(() => users.clerkUserId, { onDelete: 'cascade' }),
    platformId: integer('platform_id').notNull().references(() => socialPlatforms.id, { onDelete: 'restrict' }),
    platformUserId: text('platform_user_id').notNull(),
    usernameOnPlatform: text('username_on_platform'),
    accessToken: text('access_token').notNull(), // Encrypted
    refreshToken: text('refresh_token'), // Encrypted
    tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
    scopes: jsonb('scopes'),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => {
    return {
        userIdx: index('uca_user_id_idx').on(table.userId),
        platformIdx: index('uca_platform_id_idx').on(table.platformId),
        uniqueConnection: uniqueIndex('uca_user_platform_unique_idx').on(table.userId, table.platformId, table.platformUserId),
        scopesGinIdx: index('uca_scopes_gin_idx').using('gin', table.scopes),
    };
});

export const userConnectedAccountsRelations = relations(userConnectedAccounts, ({ one, many }) => ({
    user: one(users, {
        fields: [userConnectedAccounts.userId],
        references: [users.clerkUserId],
    }),
    platform: one(socialPlatforms, {
        fields: [userConnectedAccounts.platformId],
        references: [socialPlatforms.id],
    }),
    scheduledPosts: many(scheduledPosts),
}));

// --------- CONTENT ITEMS TABLE ---------
export const contentItems = pgTable('content_items', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id').notNull().references(() => users.clerkUserId, { onDelete: 'cascade' }),
    title: varchar('title', { length: 255 }),
    caption: text('caption'),
    contentType: contentTypeEnum('content_type').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => {
    return {
        userIdx: index('ci_user_id_idx').on(table.userId),
        contentTypeIdx: index('ci_content_type_idx').on(table.contentType),
    };
});

export const contentItemsRelations = relations(contentItems, ({ one, many }) => ({
    user: one(users, {
        fields: [contentItems.userId],
        references: [users.clerkUserId],
    }),
    mediaAssets: many(mediaAssets),
    scheduledPosts: many(scheduledPosts),
}));

// --------- MEDIA ASSETS TABLE ---------
export const mediaAssets = pgTable('media_assets', {
    id: uuid('id').defaultRandom().primaryKey(),
    contentItemId: uuid('content_item_id').notNull().references(() => contentItems.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => users.clerkUserId, { onDelete: 'cascade' }),
    storagePath: text('storage_path').notNull(),
    fileName: text('file_name'),
    mimeType: varchar('mime_type', { length: 100 }).notNull(),
    fileSizeBytes: bigint('file_size_bytes', { mode: 'number' }),
    metadata: jsonb('metadata'),
    orderInCarousel: integer('order_in_carousel').default(0).notNull(),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => {
    return {
        contentItemIdIdx: index('ma_content_item_id_idx').on(table.contentItemId),
        userIdx: index('ma_user_id_idx').on(table.userId),
    };
});

export const mediaAssetsRelations = relations(mediaAssets, ({ one }) => ({
    contentItem: one(contentItems, {
        fields: [mediaAssets.contentItemId],
        references: [contentItems.id],
    }),
    user: one(users, {
        fields: [mediaAssets.userId],
        references: [users.clerkUserId],
    }),
}));

// --------- SCHEDULED POSTS TABLE ---------
export const scheduledPosts = pgTable('scheduled_posts', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id').notNull().references(() => users.clerkUserId, { onDelete: 'cascade' }),
    contentItemId: uuid('content_item_id').notNull().references(() => contentItems.id, { onDelete: 'cascade' }),
    connectedAccountId: uuid('connected_account_id').notNull().references(() => userConnectedAccounts.id, { onDelete: 'cascade' }),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
    status: scheduleStatusEnum('status').default('pending').notNull(),
    postedAt: timestamp('posted_at', { withTimezone: true }),
    platformPostId: text('platform_post_id'),
    failureReason: text('failure_reason'),
    retryCount: integer('retry_count').default(0).notNull(),
    platformSpecificOptions: jsonb('platform_specific_options'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => {
    return {
        userIdx: index('sp_user_id_idx').on(table.userId),
        contentItemIdIdx: index('sp_content_item_id_idx').on(table.contentItemId),
        connectedAccountIdIdx: index('sp_connected_account_id_idx').on(table.connectedAccountId),
        scheduledAtStatusIdx: index('sp_scheduled_at_status_idx').on(table.scheduledAt, table.status),
        statusIdx: index('sp_status_idx').on(table.status),
    };
});

export const scheduledPostsRelations = relations(scheduledPosts, ({ one }) => ({
    user: one(users, {
        fields: [scheduledPosts.userId],
        references: [users.clerkUserId],
    }),
    contentItem: one(contentItems, {
        fields: [scheduledPosts.contentItemId],
        references: [contentItems.id],
    }),
    connectedAccount: one(userConnectedAccounts, {
        fields: [scheduledPosts.connectedAccountId],
        references: [userConnectedAccounts.id],
    }),
}));