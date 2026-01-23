const cron = require('node-cron');
const parser = require('cron-parser');
const { startRun } = require('./scriptsRunner.service');
const CronJob = require('../models/CronJob');
const CronExecution = require('../models/CronExecution');
const ScriptDefinition = require('../models/ScriptDefinition');
const ScriptRun = require('../models/ScriptRun');

class CronScheduler {
  constructor() {
    this.scheduledJobs = new Map(); // Map<jobId, cron.ScheduledTask>
    this.isRunning = false;
  }

  async start() {
    if (this.isRunning) return;
    this.isRunning = true;

    // Load all enabled jobs from database
    const enabledJobs = await CronJob.find({ enabled: true }).lean();
    
    for (const job of enabledJobs) {
      try {
        await this.scheduleJob(job);
      } catch (err) {
        console.error(`Failed to schedule cron job ${job.name}:`, err);
      }
    }

    console.log(`Cron scheduler started with ${enabledJobs.length} jobs`);
  }

  async stop() {
    // Unschedule all jobs
    for (const [jobId, task] of this.scheduledJobs) {
      task.stop();
    }
    this.scheduledJobs.clear();
    this.isRunning = false;
    console.log('Cron scheduler stopped');
  }

  async scheduleJob(cronJob) {
    const jobId = String(cronJob._id);

    // Unschedule if already scheduled
    if (this.scheduledJobs.has(jobId)) {
      this.unscheduleJob(jobId);
    }

    // Validate cron expression
    if (!cron.validate(cronJob.cronExpression)) {
      throw new Error(`Invalid cron expression: ${cronJob.cronExpression}`);
    }

    // Create the scheduled task
    const task = cron.schedule(cronJob.cronExpression, async () => {
      await this.executeJob(cronJob);
    }, {
      scheduled: false, // Don't start immediately
      timezone: cronJob.timezone || 'UTC',
    });

    // Start the task
    task.start();
    this.scheduledJobs.set(jobId, task);

    // Update next run time
    const nextRunAt = this.calculateNextRun(cronJob.cronExpression, cronJob.timezone);
    await CronJob.updateOne(
      { _id: jobId },
      { $set: { nextRunAt } }
    );

    console.log(`Scheduled cron job: ${cronJob.name} (${cronJob.cronExpression})`);
  }

  async unscheduleJob(jobId) {
    const task = this.scheduledJobs.get(String(jobId));
    if (task) {
      task.stop();
      this.scheduledJobs.delete(String(jobId));
      
      // Clear next run time
      await CronJob.updateOne(
        { _id: jobId },
        { $set: { nextRunAt: null } }
      );
      
      console.log(`Unscheduled cron job: ${jobId}`);
    }
  }

  async executeJob(cronJob) {
    const execution = await CronExecution.create({
      cronJobId: cronJob._id,
      status: 'running',
      startedAt: new Date(),
      triggeredAt: new Date(),
      actualRunAt: new Date(),
    });

    console.log(`Executing cron job: ${cronJob.name} (execution: ${execution._id})`);

    try {
      if (cronJob.taskType === 'script') {
        await this.executeScriptJob(cronJob, execution);
      } else if (cronJob.taskType === 'http') {
        await this.executeHttpJob(cronJob, execution);
      } else {
        throw new Error(`Unknown task type: ${cronJob.taskType}`);
      }

      // Update execution as succeeded
      await CronExecution.updateOne(
        { _id: execution._id },
        {
          $set: {
            status: 'succeeded',
            finishedAt: new Date(),
          },
        }
      );
    } catch (err) {
      // Update execution as failed
      await CronExecution.updateOne(
        { _id: execution._id },
        {
          $set: {
            status: 'failed',
            finishedAt: new Date(),
            error: err.message,
          },
        }
      );
      console.error(`Cron job failed: ${cronJob.name}`, err);
    }

    // Update next run time for the job
    if (cronJob.enabled) {
      const nextRunAt = this.calculateNextRun(cronJob.cronExpression, cronJob.timezone);
      await CronJob.updateOne(
        { _id: cronJob._id },
        { $set: { nextRunAt } }
      );
    }

    return execution;
  }

  async executeScriptJob(cronJob, execution) {
    console.log(`[CronScheduler] Executing script job: ${cronJob.name} (scriptId: ${cronJob.scriptId})`);
    
    // Get the script definition
    const scriptDef = await ScriptDefinition.findById(cronJob.scriptId);
    if (!scriptDef) {
      throw new Error(`Script not found: ${cronJob.scriptId}`);
    }

    if (!scriptDef.enabled) {
      throw new Error(`Script is disabled: ${scriptDef.name}`);
    }

    // Merge environment variables
    const env = [...scriptDef.env];
    if (cronJob.scriptEnv && cronJob.scriptEnv.length > 0) {
      // Override with cron-specific env vars
      for (const cronEnv of cronJob.scriptEnv) {
        const existingIndex = env.findIndex(e => e.key === cronEnv.key);
        if (existingIndex >= 0) {
          env[existingIndex] = cronEnv;
        } else {
          env.push(cronEnv);
        }
      }
    }

    // Create a modified script definition for execution
    const modifiedScript = {
      ...scriptDef.toObject(),
      env,
      timeoutMs: cronJob.timeoutMs || scriptDef.timeoutMs,
    };

    console.log(`[CronScheduler] Starting script execution for: ${scriptDef.name}`);
    // Start the script execution
    const run = await startRun(modifiedScript, {
      trigger: 'schedule',
      meta: { cronJobId: cronJob._id, cronExecutionId: execution._id },
    });

    console.log(`[CronScheduler] Script run created with ID: ${run._id}`);
    // Wait for completion and capture output
    const output = await this.waitForScriptCompletion(run._id);

    console.log(`[CronScheduler] Script execution completed for: ${scriptDef.name}`);
    // Update execution with output
    await CronExecution.updateOne(
      { _id: execution._id },
      { $set: { output } }
    );
  }

  async executeHttpJob(cronJob, execution) {
    const { httpMethod, httpUrl, httpHeaders, httpBody, httpBodyType, httpAuth } = cronJob;

    // Prepare headers
    const headers = {};
    if (httpHeaders) {
      for (const header of httpHeaders) {
        headers[header.key] = header.value;
      }
    }

    // Add authentication
    if (httpAuth && httpAuth.type === 'bearer' && httpAuth.token) {
      headers['Authorization'] = `Bearer ${httpAuth.token}`;
    } else if (httpAuth && httpAuth.type === 'basic' && httpAuth.username && httpAuth.password) {
      const encoded = Buffer.from(`${httpAuth.username}:${httpAuth.password}`).toString('base64');
      headers['Authorization'] = `Basic ${encoded}`;
    }

    // Prepare body
    let body = null;
    if (httpBody && ['POST', 'PUT', 'PATCH'].includes(httpMethod)) {
      if (httpBodyType === 'json') {
        headers['Content-Type'] = 'application/json';
        body = httpBody;
      } else if (httpBodyType === 'form') {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
        body = httpBody;
      } else {
        headers['Content-Type'] = 'text/plain';
        body = httpBody;
      }
    }

    // Make the HTTP request
    const response = await fetch(httpUrl, {
      method: httpMethod,
      headers,
      body,
      timeout: cronJob.timeoutMs || 300000,
    });

    // Get response text
    const output = await response.text();

    // Update execution with HTTP response details
    await CronExecution.updateOne(
      { _id: execution._id },
      {
        $set: {
          output,
          httpStatusCode: response.status,
          httpResponseHeaders: Object.fromEntries(response.headers.entries()),
        },
      }
    );

    // Throw error if response is not successful
    if (!response.ok) {
      throw new Error(`HTTP request failed: ${response.status} ${response.statusText}`);
    }
  }

  async waitForScriptCompletion(runId, timeout = 300000) {
    console.log(`[CronScheduler] Waiting for script completion: ${runId}`);
    return new Promise((resolve, reject) => {
      let output = '';
      const startTime = Date.now();
      const timeoutId = setTimeout(() => {
        console.log(`[CronScheduler] Script execution timeout: ${runId}`);
        reject(new Error('Script execution timeout'));
      }, timeout);

      // Check for completion periodically
      const checkInterval = setInterval(async () => {
        try {
          const run = await ScriptRun.findById(runId);
          if (!run) {
            console.log(`[CronScheduler] Script run not found: ${runId}`);
            clearInterval(checkInterval);
            clearTimeout(timeoutId);
            reject(new Error('Script run not found'));
            return;
          }

          // Wait for the script to start running (it starts as 'queued')
          if (run.status === 'queued') {
            // Still waiting to start
            return;
          }

          console.log(`[CronScheduler] Script status: ${run.status} for run: ${runId}`);
          
          if (run.status === 'succeeded') {
            clearInterval(checkInterval);
            clearTimeout(timeoutId);
            resolve(run.outputTail || '');
          } else if (run.status === 'failed' || run.status === 'timed_out') {
            clearInterval(checkInterval);
            clearTimeout(timeoutId);
            const errorMsg = run.error || 'Script execution failed';
            reject(new Error(errorMsg));
          } else if (run.status === 'running') {
            // Still running, continue waiting
            return;
          } else {
            clearInterval(checkInterval);
            clearTimeout(timeoutId);
            reject(new Error(`Unexpected script status: ${run.status}`));
          }
        } catch (err) {
          console.log(`[CronScheduler] Error checking script status: ${err.message}`);
          clearInterval(checkInterval);
          clearTimeout(timeoutId);
          reject(err);
        }
      }, 1000);
    });
  }

  calculateNextRun(cronExpression, timezone = 'UTC') {
    try {
      const interval = parser.parseExpression(cronExpression, {
        tz: timezone,
      });
      return interval.next().toDate();
    } catch (err) {
      console.error('Failed to calculate next run:', err);
      return null;
    }
  }

  getScheduledJobs() {
    return Array.from(this.scheduledJobs.keys());
  }

  isJobScheduled(jobId) {
    return this.scheduledJobs.has(String(jobId));
  }
}

// Create singleton instance
const cronScheduler = new CronScheduler();

module.exports = cronScheduler;
