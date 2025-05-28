import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

const isPublicRoute = createRouteMatcher([
    '/sign-in(.*)',      // Matches /sign-in and /sign-in/*
    '/sign-up(.*)',      // Matches /sign-up and /sign-up/*
    '/api/webhooks(.*)'  // Matches /api/webhooks and /api/webhooks/*
]);
export default clerkMiddleware(async (auth, req) => {
    const { pathname } = req.nextUrl;
    const isReqPublic = isPublicRoute(req);

    console.log(`[Middleware] Path: ${pathname}, isPublicRoute evaluated: ${isReqPublic}`);

    if (!isReqPublic) {
        console.log(`[Middleware] Protecting route: ${pathname}`);
        await auth.protect(); // auth().protect() typically handles the response/redirect itself.
    } else {
        console.log(`[Middleware] Route is public, not protecting: ${pathname}`);
    }
    // If the route is public, the middleware implicitly allows the request to proceed
    // to the route handler without further action here.
})

export const config = {
    matcher: [
        // Skip Next.js internals and all static files, unless found in search params
        '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
        // Always run for API routes
        '/(api|trpc)(.*)',
    ],
};