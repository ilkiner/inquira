@AGENTS.md

# Inquira — project rules

- AI patient assistant for medical-tourism clinics. Stack: Next.js 16 (App Router, `src/proxy.ts` not middleware), Tailwind 4, PostgreSQL via `DATABASE_URL` (in-memory fallback), any OpenAI-compatible LLM (`openai` SDK + `LLM_BASE_URL`; NVIDIA NIM by default), WhatsApp Cloud API.
- `Conversation.apiHistory` is append-only. Never edit or drop earlier entries.
- The assistant may only state facts from `src/lib/clinic-config.ts`. No diagnosis, no guaranteed results, prices as ranges.
- Secrets live in `.env.local` (never committed). `LLM_API_KEY`, `DATABASE_URL` and `WHATSAPP_*` are server-only.
- Before committing: `npm run typecheck && npm run lint && npm test && npm run build`.
