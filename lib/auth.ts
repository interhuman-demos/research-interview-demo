import NextAuth, { type Session } from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";

import { prisma } from "@/lib/db";

export const isAuthBypassed = process.env.DEMO_NO_AUTH === "1";

const DEMO_USER_EMAIL = "demo@research-interview.local";
const DEMO_USER_NAME = "Demo Researcher";

const nextAuth = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "database" },
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
  ],
  pages: {
    signIn: "/",
  },
  callbacks: {
    async session({ session, user }) {
      if (session.user && user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
});

export const { handlers } = nextAuth;

let cachedDemoUserId: string | null = null;
async function getDemoUserId(): Promise<string> {
  if (cachedDemoUserId) return cachedDemoUserId;
  const user = await prisma.user.upsert({
    where: { email: DEMO_USER_EMAIL },
    update: {},
    create: { email: DEMO_USER_EMAIL, name: DEMO_USER_NAME },
  });
  cachedDemoUserId = user.id;
  return user.id;
}

export async function auth(): Promise<Session | null> {
  if (isAuthBypassed) {
    const id = await getDemoUserId();
    return {
      user: { id, email: DEMO_USER_EMAIL, name: DEMO_USER_NAME },
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    } as Session;
  }
  return nextAuth.auth();
}

export async function signIn(
  ...args: Parameters<typeof nextAuth.signIn>
): ReturnType<typeof nextAuth.signIn> {
  if (isAuthBypassed) {
    // No-op in bypass mode; UI should redirect straight to /dashboard.
    return undefined as unknown as ReturnType<typeof nextAuth.signIn>;
  }
  return nextAuth.signIn(...args);
}

export async function signOut(
  ...args: Parameters<typeof nextAuth.signOut>
): ReturnType<typeof nextAuth.signOut> {
  if (isAuthBypassed) {
    return undefined as unknown as ReturnType<typeof nextAuth.signOut>;
  }
  return nextAuth.signOut(...args);
}
