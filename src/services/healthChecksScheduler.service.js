const cron = require('node-cron');
const parser = require('cron-parser');

const HealthCheck = require('../models/HealthCheck');

const healthChecksService = require('./healthChecks.service');

class HealthChecksScheduler {
  constructor() {
    this.scheduledChecks = new Map(); // Map<checkId, cron.ScheduledTask>
    this.isRunning = false;
  }

  async start() {
    if (this.isRunning) return;
    this.isRunning = true;

    const enabled = await HealthCheck.find({ enabled: true }).lean();
    for (const check of enabled) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await this.scheduleCheck(check);
      } catch (err) {
        console.error(`Failed to schedule health check ${check.name}:`, err);
      }
    }

    console.log(`Health checks scheduler started with ${enabled.length} checks`);
  }

  async stop() {
    for (const [, task] of this.scheduledChecks) {
      task.stop();
    }
    this.scheduledChecks.clear();
    this.isRunning = false;
    console.log('Health checks scheduler stopped');
  }

  calculateNextRun(cronExpression, timezone = 'UTC') {
    try {
      const interval = parser.parseExpression(String(cronExpression || '').trim(), { tz: String(timezone || 'UTC') });
      return interval.next().toDate();
    } catch (err) {
      console.error('Failed to calculate next run for health check:', err);
      return null;
    }
  }

  async scheduleCheck(healthCheck) {
    const checkId = String(healthCheck._id);

    if (this.scheduledChecks.has(checkId)) {
      await this.unscheduleCheck(checkId);
    }

    if (!cron.validate(healthCheck.cronExpression)) {
      throw new Error(`Invalid cron expression: ${healthCheck.cronExpression}`);
    }

    const task = cron.schedule(
      healthCheck.cronExpression,
      async () => {
        try {
          await healthChecksService.runHealthCheckOnce(checkId, { trigger: 'schedule' });
        } catch (err) {
          console.error(`Health check run failed (${healthCheck.name}):`, err);
        }
      },
      {
        scheduled: false,
        timezone: healthCheck.timezone || 'UTC',
      },
    );

    task.start();
    this.scheduledChecks.set(checkId, task);

    const nextRunAt = this.calculateNextRun(healthCheck.cronExpression, healthCheck.timezone);
    await HealthCheck.updateOne({ _id: checkId }, { $set: { nextRunAt } });

    console.log(`Scheduled health check: ${healthCheck.name} (${healthCheck.cronExpression})`);
  }

  async unscheduleCheck(checkId) {
    const task = this.scheduledChecks.get(String(checkId));
    if (!task) return;

    task.stop();
    this.scheduledChecks.delete(String(checkId));

    await HealthCheck.updateOne({ _id: checkId }, { $set: { nextRunAt: null } });
  }

  async trigger(checkId) {
    return await healthChecksService.runHealthCheckOnce(checkId, { trigger: 'manual' });
  }

  getScheduledChecks() {
    return Array.from(this.scheduledChecks.keys());
  }
}

const scheduler = new HealthChecksScheduler();

module.exports = scheduler;
