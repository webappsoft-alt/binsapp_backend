import EventEmitter from "events";

class JobQueue extends EventEmitter {
  constructor() {
    super();
    this.queue = [];
  }

  addJob(job) {
    this.queue.push(job);
    this.emit("newJob", job);
  }

  processJobs(processor) {
    this.on("newJob", async (job) => {
      await processor(job);
    });
  }
}

export default new JobQueue();
