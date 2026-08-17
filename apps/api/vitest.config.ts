import { defineConfig } from 'vitest/config';

/**
 * The API suite runs on the worker_threads pool, not the default fork pool.
 *
 * Vitest 2 defaults `pool` to `'forks'`. On this suite that pool intermittently
 * ends a run with `Error: Worker exited unexpectedly` from tinypool — a child
 * process dying rather than a test failing. The symptom is nasty precisely
 * because nothing looks broken: every file that reported did pass, the summary
 * just says `40 passed (41)` and the run exits non-zero. A red build that turns
 * green on re-run teaches people to re-run instead of to read, which is how a
 * real failure eventually gets waved through.
 *
 * Measured on this repo: the fork pool failed roughly a quarter of runs with
 * that worker-exit error, and it reproduces on the commit before any recent
 * feature work, so it is a property of the harness rather than of any feature.
 * The threads pool removes that failure mode entirely.
 *
 * It does NOT make the suite perfectly reliable, and the comment here should
 * not pretend otherwise. A rarer, different failure remains on this machine:
 * the process dies with the Windows status 0xC0000409
 * (STATUS_STACK_BUFFER_OVERRUN) in roughly one run in eight. What is known
 * about it, measured rather than assumed:
 *
 *   - it is not one test — observed dying after 4 files and after 42;
 *   - it is not concurrency — `--no-file-parallelism` still failed 1 in 10,
 *     at three times the wall-clock, so serialising buys nothing;
 *   - it is not the data-directory clash that used to exist in
 *     memoryExtraction.test.ts, which was a real bug and is fixed, but fixing
 *     it did not change the rate.
 *
 * That points below the test runner — Node 24 on Windows — rather than at
 * anything this repo can express. Left documented instead of papered over with
 * a process-level retry, because a retry that swallows an abort would also
 * swallow a genuine crash. Next things worth trying: a Node LTS line, and
 * running the gate on Linux CI where this class of abort is rare.
 *
 * The thread cap below is separate and does help: it bounds peak resource use.
 *
 * The thread cap is separate and deliberate: the pool otherwise sizes itself to
 * the core count, so on a 24-core machine it starts 24 workers for 41 files,
 * each booting its own API instance. Six keeps peak resource use sane without
 * measurably changing wall-clock, because the suite is dominated by a handful
 * of slow integration files rather than by breadth. On a 2–4 core CI runner the
 * cap is a no-op.
 */
export default defineConfig({
  test: {
    pool: 'threads',
    poolOptions: {
      threads: {
        minThreads: 1,
        maxThreads: 6,
      },
    },
    /**
     * Coverage thresholds are a ratchet, not a target.
     *
     * They sit a couple of points under the measured figure at the time they
     * were set (statements 80.6%, branches 77.9%, functions 86.4%) so that
     * `npm run test:coverage` fails when a change removes coverage, while
     * ordinary work that happens to shave a fraction off does not turn the
     * build red for no reason. Raise them when the real number moves up; the
     * one thing not to do is lower them to make a red build green.
     *
     * Enabled only on the coverage script, so the default `npm test` stays
     * fast — v8 instrumentation roughly doubles this suite's wall-clock.
     */
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      // Seeds and fixtures are data, and the entrypoint is boot wiring that
      // only executes in a real process; counting them measures nothing.
      exclude: [
        'src/__tests__/**',
        'src/data/seeds/**',
        'src/index.ts',
        '**/*.d.ts',
        'dist/**',
      ],
      thresholds: {
        statements: 78,
        branches: 75,
        functions: 84,
        lines: 78,
      },
    },
  },
});
