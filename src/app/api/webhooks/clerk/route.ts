// src/app/api/webhooks/clerk/route.ts
import { Webhook } from 'svix';
import { headers } from 'next/headers';
import { WebhookEvent, UserJSON } from '@clerk/nextjs/server';
import { db } from '@/db'; // Assuming your Drizzle client is exported from @/db
import { users } from '@/db/schema'; // Assuming your users schema and enums are here
import { eq } from 'drizzle-orm';

// Ensure your webhook secret is set in environment variables
const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

if (!WEBHOOK_SECRET) {
    throw new Error('Please add CLERK_WEBHOOK_SECRET from Clerk Dashboard to .env or .env.local');
}

export async function POST(req: Request) {
    console.log('Clerk webhook received...');

    // Get the headers
    const headerPayload = await headers();
    const svix_id = headerPayload.get("svix-id");
    const svix_timestamp = headerPayload.get("svix-timestamp");
    const svix_signature = headerPayload.get("svix-signature");

    // If there are no headers, error out
    if (!svix_id || !svix_timestamp || !svix_signature) {
        console.error('Error: Missing Svix headers');
        return new Response('Error occurred -- no svix headers', {
            status: 400,
        });
    }

    // Get the body
    const payload = await req.json();
    const body = JSON.stringify(payload);

    // Create a new Svix instance with your secret.
    const wh = new Webhook(WEBHOOK_SECRET!);

    let evt: WebhookEvent;

    // Verify the payload with the headers
    try {
        evt = wh.verify(body, {
            "svix-id": svix_id,
            "svix-timestamp": svix_timestamp,
            "svix-signature": svix_signature,
        }) as WebhookEvent;
        console.log('Webhook verified successfully');
    } catch (err) {
        console.error('Error verifying webhook:', err);
        return new Response('Error occurred -- webhook verification failed', {
            status: 400,
        });
    }

    // Get the ID and type from the event data. The 'id' here is the Clerk User ID.
    const eventType = evt.type;

    console.log(`Webhook type: ${eventType}`);
    if (evt.data && 'id' in evt.data) {
        console.log(`Webhook for Clerk User ID: ${evt.data.id}`);
    }


    // Handle the event
    try {
        switch (eventType) {
            case 'user.created':
                console.log('User created event received:', evt.data);
                const createdUserData = evt.data as UserJSON; // Clerk's UserJSON type

                // Extract primary email
                const primaryEmailCreated = createdUserData.email_addresses.find(
                    (email) => email.id === createdUserData.primary_email_address_id
                )?.email_address;

                if (!primaryEmailCreated) {
                    console.error(`User ${createdUserData.id} created event: Primary email not found.`);
                    // Decide if you want to error out or proceed with a placeholder
                    // For now, we'll skip creating the user if no primary email is found
                    return new Response('Primary email not found for created user', { status: 400 });
                }

                await db.insert(users).values({
                    clerkUserId: createdUserData.id, // Maps to clerk_user_id in your schema
                    email: primaryEmailCreated,
                    subscriptionStatus: 'free', // Default to 'free' on creation, or pull from custom metadata if available
                    onboardingCompleted: false, // Schema default is false, explicit for clarity
                    // createdAt and updatedAt will be handled by defaultNow() in the schema on insert
                }).onConflictDoNothing(); // In case of duplicate webhook delivery
                console.log(`User ${createdUserData.id} created in local DB.`);
                break;

            case 'user.updated':
                console.log('User updated event received:', evt.data);
                const updatedUserData = evt.data as UserJSON; // Clerk's UserJSON type

                // Extract primary email
                const primaryEmailUpdated = updatedUserData.email_addresses.find(
                    (email) => email.id === updatedUserData.primary_email_address_id
                )?.email_address;

                if (!primaryEmailUpdated) {
                    console.error(`User ${updatedUserData.id} updated event: Primary email not found.`);
                    // Decide how to handle this, e.g., skip update or log error
                    // For now, we'll log and potentially skip updating email if not found
                }

                // Prepare update payload
                const updatePayload: Partial<typeof users.$inferInsert> = {
                    updatedAt: new Date(), // Explicitly set updatedAt
                };

                if (primaryEmailUpdated) {
                    updatePayload.email = primaryEmailUpdated;
                }

                // Note: subscriptionStatus and onboardingCompleted are typically updated
                // through application logic, not directly from generic Clerk user.updated events
                // unless you are using Clerk's custom metadata and parsing it here.
                // For example, if you store subscription_status in Clerk's public_metadata:
                // if (updatedUserData.public_metadata?.subscription_status) {
                //   updatePayload.subscriptionStatus = updatedUserData.public_metadata.subscription_status as typeof subscriptionStatusEnum.enumValues[number];
                // }

                await db.update(users)
                    .set(updatePayload)
                    .where(eq(users.clerkUserId, updatedUserData.id));
                console.log(`User ${updatedUserData.id} updated in local DB.`);
                break;

            case 'user.deleted':
                console.log('User deleted event received:', evt.data);
                // Clerk sends a more minimal payload for deletions, often just { id, object, deleted }
                // The 'id' here is the Clerk User ID.
                const deletedUserData = evt.data as { id?: string, deleted?: boolean };
                if (deletedUserData.id) {
                    await db.delete(users).where(eq(users.clerkUserId, deletedUserData.id));
                    console.log(`User ${deletedUserData.id} deleted from local DB.`);
                } else {
                    console.warn('User deleted event received without an ID.');
                }
                break;

            default:
                console.log(`Unhandled event type: ${eventType}`);
        }

        return new Response('Webhook processed successfully', { status: 200 });

    } catch (error) {
        console.error('Error processing webhook event:', error);
        // It's good practice to still return a 2xx response to Clerk to acknowledge receipt,
        // even if an internal error occurs, to prevent Clerk from retrying indefinitely.
        // However, for critical errors, you might choose a 500.
        return new Response('Error occurred while processing webhook', {
            status: 500, // Or 200 if you want to prevent retries for all internal errors
        });
    }
}
