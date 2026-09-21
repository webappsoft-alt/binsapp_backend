import { startAbandonmentWorker } from "./abandonmentWorker.js";

/**
 * Initializes all AI Sales Agent background workers and cron jobs
 */
export function initSalesAgentJobs() {
  startAbandonmentWorker();
}

export {
  startAbandonmentWorker,
  runAbandonmentSweep,
} from "./abandonmentWorker.js";

export default initSalesAgentJobs;
