// src/app/api/webhooks/clerk/route.ts
import { verifyWebhook } from '@clerk/nextjs/webhooks';
import { NextRequest, NextResponse } from 'next/server';
import { UserJSON, DeletedObjectJSON, WebhookEvent } from "@clerk/nextjs/server";
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(req: NextRequest) {
    let evt: WebhookEvent;

    try {
        evt = await verifyWebhook(req);
    } catch (err) { // err is initially of type unknown
        let errorMessage = 'Webhook verification failed.';
        if (err instanceof Error) {
            errorMessage = err.message;
        } else if (typeof err === 'string') {
            errorMessage = err;
        } else if (typeof err === 'object' && err !== null && 'message' in err && typeof err.message === 'string') {
            errorMessage = err.message;
        }
        console.error('Webhook verification failed:', errorMessage, err); // Log the original error too
        return NextResponse.json({ error: 'Webhook verification failed', details: errorMessage }, { status: 400 });
    }

    const eventType = evt.type;
    const eventData = evt.data;

    console.log(`Received webhook type: ${eventType}`);
    if ('id' in eventData && eventData.id) {
        console.log(`Associated Clerk User ID: ${eventData.id}`);
    }

    try {
        switch (eventType) {
            case 'user.created':
                const createdUserData = eventData as UserJSON;
                console.log('Processing user.created for Clerk ID:', createdUserData.id);

                const primaryEmailCreated = createdUserData.email_addresses?.find(
                    (email) => email.id === createdUserData.primary_email_address_id
                )?.email_address;

                if (!primaryEmailCreated) {
                    console.error(`User ${createdUserData.id} (created): Primary email not found. Skipping DB insert.`);
                    return NextResponse.json({ message: 'Primary email not found, user not created in local DB.' }, { status: 200 });
                }

                await db.insert(users).values({
                    clerkUserId: createdUserData.id,
                    email: primaryEmailCreated,
                    subscriptionStatus: 'free',
                    onboardingCompleted: false,
                }).onConflictDoNothing();
                console.log(`User ${createdUserData.id} inserted/handled in local DB.`);
                break;

            case 'user.updated':
                const updatedUserData = eventData as UserJSON;
                console.log('Processing user.updated for Clerk ID:', updatedUserData.id);

                const primaryEmailUpdated = updatedUserData.email_addresses?.find(
                    (email) => email.id === updatedUserData.primary_email_address_id
                )?.email_address;

                const updatePayload: Partial<typeof users.$inferInsert> = {
                    updatedAt: new Date(),
                };

                if (primaryEmailUpdated) {
                    updatePayload.email = primaryEmailUpdated;
                } else {
                    console.warn(`User ${updatedUserData.id} (updated): Primary email not found. Email will not be updated.`);
                }

                const result = await db.update(users)
                    .set(updatePayload)
                    .where(eq(users.clerkUserId, updatedUserData.id))
                    .returning({ updatedId: users.clerkUserId });

                if (result.length > 0) {
                    console.log(`User ${updatedUserData.id} updated in local DB.`);
                } else {
                    console.warn(`User ${updatedUserData.id} not found in local DB for update, or no changes made.`);
                }
                break;

            case 'user.deleted':
                const deletedUserData = eventData as DeletedObjectJSON;
                console.log('Processing user.deleted for Clerk ID:', deletedUserData.id || 'ID not present in payload');

                if (deletedUserData.id) {
                    await db.delete(users).where(eq(users.clerkUserId, deletedUserData.id));
                    console.log(`User ${deletedUserData.id} deleted from local DB.`);
                } else {
                    console.warn('User deleted event received but Clerk User ID was missing in the payload.');
                }
                break;

            default:
                console.log(`Unhandled event type: ${eventType}. Acknowledging receipt.`);
                return NextResponse.json({ message: `Unhandled event type: ${eventType}` }, { status: 200 });
        }

        return NextResponse.json({ message: 'Webhook processed successfully' }, { status: 200 });

    } catch (error) { // error is initially of type unknown
        let errorMessage = 'Internal server error while processing webhook.';
        if (error instanceof Error) {
            errorMessage = error.message;
        } else if (typeof error === 'string') {
            errorMessage = error;
        } else if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
            errorMessage = error.message;
        }
        console.error('Error processing webhook event (after verification):', errorMessage, error); // Log original error
        return NextResponse.json({ error: 'Internal server error while processing webhook', details: errorMessage }, { status: 200 });
    }
}
