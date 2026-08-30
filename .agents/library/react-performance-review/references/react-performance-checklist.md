# React performance checklist

- **Signal and baseline:** reproducible symptom, affected users/path, current measurements, and acceptable target.
- **Request sequencing:** independent work serialized, late promise starts, duplicated requests, and blocking dependencies.
- **Data fetching:** ownership, cache behavior, invalidation, repeated loading, payload size, and approved library use.
- **Server rendering:** slow server work, blocking I/O, repeated computation, and version-appropriate streaming boundaries.
- **Client boundaries:** client code required for interaction only; avoid moving server-capable trees to the client.
- **Serialization:** minimize repeated or excessive server-to-client data while preserving contracts.
- **Bundle size:** heavy dependencies, broad imports, third-party client code, and opportunities proven by build analysis.
- **Rerenders:** subscription scope, derived state, unstable ownership, repeated expensive work, and profiler evidence.
- **Large lists:** bounded data, pagination/virtualization when justified, and incremental rendering.
- **Interaction cost:** main-thread work, synchronous handlers, hydration, and critical-path computation.
- **Third-party code:** necessity, loading phase, client impact, and failure isolation.
- **Measurement:** compare the same route, state, device, and build before and after; label source-only inference.

Apply version-specific techniques only after detecting the actual React/Next.js version and confirming support.
