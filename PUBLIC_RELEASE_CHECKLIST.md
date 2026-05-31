# Public Release Checklist

- [x] `npm run lint` passed
- [x] `npm run build` passed
- [x] Missing API keys tested
- [x] Fallback labels visible
- [x] Fan-made disclaimer visible
- [x] No secrets committed
- [x] Mobile checked
- [x] Result/share card checked
- [x] Direct signing bypass removed
- [x] Known limitations listed

## Notes

- Runtime/local JSON store is MVP/demo persistence. It is not durable production storage.
- Production should move to a persistent database such as Supabase/Postgres later.
- Manual fallback data is curated reference data, not live API data.
- Simulator estimates are app-generated and not official market values.

