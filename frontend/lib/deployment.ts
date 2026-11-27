// Keep the public Vercel build independent of the private Studio backend.
export const publicOnly = process.env.CEDAR_PUBLIC_ONLY === '1' || process.env.VERCEL === '1';
