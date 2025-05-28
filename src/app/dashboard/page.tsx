import { UserButton } from '@clerk/nextjs';
import { redirect } from 'next/navigation';
import {auth} from "@clerk/nextjs/server";

export default async function DashboardPage() {
    const { userId } = await auth();
    if (!userId) {
        redirect('/sign-in');
    }

    // Fetch user-specific data using userId
    // const userData = await db.query.users.findFirst({ where: (users, { eq }) => eq(users.clerkId, userId) });


    return (
        <div>
            <header style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem' }}>
                <h1>Dashboard</h1>
                <UserButton />
            </header>
            <main style={{ padding: '1rem' }}>
                <p>Welcome to your dashboard! Your User ID is: {userId}</p>
                {/* Display user data here */}
            </main>
        </div>
    );
}