@AGENTS.md

# Inquira — project rules

- AI patient assistant for medical-tourism clinics. Stack: Next.js 16 (App Router, `src/proxy.ts` not middleware), Tailwind 4, Supabase (optional, in-memory fallback), Anthropic SDK.
- `Conversation.apiHistory` is append-only. Never edit or drop earlier entries; append assistant `response.content` unchanged.
- The assistant may only state facts from `src/lib/clinic-config.ts`. No diagnosis, no guaranteed results, prices as ranges.
- Secrets live in `.env.local` (never committed). `SUPABASE_SERVICE_ROLE_KEY` is server-only.
- Before committing: `npm run typecheck && npm run lint && npm test && npm run build`.
