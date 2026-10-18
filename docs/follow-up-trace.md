# Follow-up investigation timing trace

Verified on 2026-10-18 at 01:13 UTC using the running local API and independent demo worker. All source data and investigation results in this trace are **synthetic / simulated**. No provider calls were made.

The five-second browser-test failure was a synchronization problem. The source was ingested, correlated with the rental case, investigated, and published correctly. The configured visible simulation stages finish near the test's five-second polling deadline. Its last default poll can occur just before publication. SSE delivery adds its own bounded polling interval.

## Observed run

- API: `http://127.0.0.1:4000`
- Persisted state: `/Users/dsteven/Desktop/BeforeYou/.local/demo-state.json`
- Trace started: `2026-10-18T01:13:43.338Z`
- Case: `d42e7abf-8d5a-46b1-b448-f387862968e6`
- New source: `15461ab1-c9a1-477f-9e1e-51fc584b7f91`
- Run: `3a19d00f-5dce-4ea7-aba3-10e85ca08fef`
- Starting durable cursor: `54`; publication cursor: `63`
- Assessment: version 1 → version 2, same case, `confirm_first` preserved.

| Persisted event | UTC timestamp | Time since trace start | SSE received |
| --- | --- | ---: | ---: |
| Source received | 01:13:43.372 | 34 ms | — |
| Source triaged | 01:13:44.201 | 863 ms | — |
| Investigation queued | 01:13:44.203 | 865 ms | 1,612 ms |
| Investigation started | 01:13:45.210 | 1,872 ms | 2,415 ms |
| Evidence step completed | 01:13:46.726 | 3,388 ms | 4,017 ms |
| Assessment published | 01:13:48.242 | 4,904 ms | 5,619 ms |

The API-created source ID and all run events appeared in the same file read directly during the trace. The worker heartbeat was 90 ms old when queued, 108 ms old when checking, and 41 ms old when publication was observed. There were no remaining jobs afterward. The process inspection found a live development launcher, API child, and worker child; the worker had been running continuously since 21:05:06 local time. `scripts/dev.ts` supplies the same absolute `DEMO_DATA_PATH` to both children.

The captured JSON is [follow-up-trace.json](./follow-up-trace.json). It includes persisted timestamps, stage observations, heartbeat ages, due times, and SSE receipt times.

## Why the old assertion was unreliable

The simulator intentionally queues source triage after 800 ms, starts the investigation after a further 900 ms, then shows two 1,200 ms stages. The persistent worker checks every 500 ms. Once scheduling is quantized by that loop, normal publication is approximately 4.8–5.3 seconds plus filesystem/processing overhead. In the measured run it took 4.904 seconds.

The old Playwright assertion polled only the final assessment count with its default five-second deadline and increasingly spaced polls. A check at approximately 4.85 seconds can see version 1; the publication at 4.904 seconds arrives before the deadline but after that last scheduled check. The test can fail despite successful processing. Waiting for the visible UI can also require the next 800 ms SSE poll.

The browser workflow should synchronize with each persisted phase: accepted source → completed triage/case association → checking run → captured evidence step → new assessment version. A short bounded poll for each phase, with 100 ms intervals, identifies a stalled phase and avoids hiding a worker failure behind a large overall timeout. Simulation delays were not shortened to satisfy the test.

## Regression checks and corrections

- Added a clock-controlled regression that exercises actual due times, serializes state between worker iterations, observes queued/checking stages, and verifies ordered publication without `immediate` mode.
- Existing tests verify repeated delivery, immutable assessment history, old-run rejection, distinct viewed state, and completion across separate API/worker store instances.
- Confirmed both demo and live SSE handlers end open streams in Fastify `preClose`. Added an actual local HTTP test verifying cursor replay and shutdown in under one second with an open SSE connection.
- Fixed a separate credentialed-CORS issue: the hijacked SSE response must explicitly include `Access-Control-Allow-Credentials: true`, because it writes raw response headers. Added the header to both streams and verified it in the HTTP regression. Normal API CORS also allows credentials for configured origins only.
- Aligned the API's default web origin with `http://127.0.0.1:3000` so local OAuth browser-binding cookies use the same host as the API.

Verification performed: fixtures 6/6 tests passed; API 5/5 tests passed; API and fixture TypeScript checks passed. The timing evidence is local simulation only; live integration gates remain separate.
