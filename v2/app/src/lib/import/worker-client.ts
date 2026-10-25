/**
 * Runs one job in a fresh import worker and ends the worker afterwards — a worker per import
 * gives every byte of a big picture back to the tablet at once, which matters more than the
 * few ms a worker takes to start.
 */
import { ImportError } from './errors.ts';
import type { ImportStep } from './prepare.ts';
import type { WorkerReply, WorkerRequest } from './worker-protocol.ts';

/** A job without its id (the client numbers them). */
export type WorkerJob = WorkerRequest extends infer R ? (R extends { id: number } ? Omit<R, 'id'> : never) : never;

let nextId = 1;

/**
 * Runs `job` in a new worker.
 *
 * @param job - what to do
 * @param onStep - called when a step starts
 * @returns the job's result
 * @throws ImportError with the worker's code, or `internal` when the worker can't start or dies
 */
export function runInWorker<T>(job: WorkerJob, onStep: (step: ImportStep) => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module', name: 'import' });
    } catch (e) {
      reject(new ImportError('internal', "This browser can't run the map import (no Web Workers).", String(e)));
      return;
    }
    const id = nextId++;
    const finish = () => worker.terminate();
    worker.onmessage = (e: MessageEvent<WorkerReply>) => {
      const msg = e.data;
      if (msg.id !== id) return;
      if (msg.type === 'step') {
        onStep(msg.step);
      } else if (msg.type === 'done') {
        finish();
        resolve(msg.result as T);
      } else {
        finish();
        reject(new ImportError(msg.error.code, msg.error.message, msg.error.detail));
      }
    };
    worker.onerror = (e) => {
      finish();
      reject(new ImportError('internal', 'The map import stopped unexpectedly (out of memory?). Try a smaller file.', e.message || 'worker error'));
    };
    const transfer = job.op === 'pdfPage' ? [job.bitmap] : [];
    worker.postMessage({ ...job, id } as WorkerRequest, transfer);
  });
}
