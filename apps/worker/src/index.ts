import { DemoStore, processDemoJobs } from '@beforeyou/fixtures';
const mode = process.env.APP_MODE ?? 'demo';
if (!['demo', 'live'].includes(mode))
    throw new Error('APP_MODE must be demo or live.');
if (mode === 'demo') {
    if (process.env.NODE_ENV === 'production')
        throw new Error('Production rejects simulated workers.');
    const store = new DemoStore();
    let stopping = false;
    for (const signal of ['SIGINT', 'SIGTERM'] as const)
        process.on(signal, () => { stopping = true; });
    console.info('Antelens worker · Demo data — persistent simulated job processing');
    while (!stopping) {
        try {
            await store.transaction(s => processDemoJobs(s));
        }
        catch (error) {
            console.error('Demo worker iteration failed:', error instanceof Error ? error.name : 'Unknown error');
        }
        await new Promise(resolve => setTimeout(resolve, 500));
    }
}
else {
    const { startLiveWorker } = await import('./live.js');
    await startLiveWorker();
}
