/**
 * Small in-process serial queue used for background project generation jobs.
 * Runs one job at a time so repo creation and git push stay ordered.
 */
export function createSerialJobQueue(worker) {
  if (typeof worker !== 'function') {
    throw new Error('createSerialJobQueue requires a worker function.')
  }

  const pending = []
  let activePromise = Promise.resolve()
  let isRunning = false

  async function run() {
    if (isRunning) return activePromise

    isRunning = true
    activePromise = (async () => {
      while (pending.length > 0) {
        const job = pending.shift()
        try {
          await worker(job)
        } catch (err) {
          console.error('[ProjectGeneratorQueue] job failed:', err?.message || err)
        }
      }
      isRunning = false
    })()

    return activePromise
  }

  return {
    enqueue(job) {
      pending.push(job)
      void run()
    },
    onIdle() {
      return activePromise
    },
    size() {
      return pending.length + (isRunning ? 1 : 0)
    },
  }
}
