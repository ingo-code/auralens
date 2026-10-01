/**
 * @supabase/ssr derives its default auth cookie name from the Supabase URL's
 * hostname (`sb-<hostname-part>-auth-token`). The server-side client may use
 * a different URL than the browser client (e.g. `host.docker.internal` vs.
 * `127.0.0.1` in Docker), which would derive a different cookie name and
 * make the server unable to find a session the browser already set. Pinning
 * an explicit, URL-independent name here keeps all three clients in sync.
 */
export const SUPABASE_AUTH_COOKIE_NAME = "sb-auralens-auth-token";
