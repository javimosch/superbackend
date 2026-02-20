const User = require('../models/User');
const Organization = require('../models/Organization');
const AuditEvent = require('../models/AuditEvent');
const ErrorAggregate = require('../models/ErrorAggregate');
const Asset = require('../models/Asset');
const FormSubmission = require('../models/FormSubmission');
const waitingListService = require('../services/waitingListJson.service');
const EmailLog = require('../models/EmailLog');
const VirtualEjsFile = require('../models/VirtualEjsFile');
const JsonConfig = require('../models/JsonConfig');
const StripeCatalogItem = require('../models/StripeCatalogItem');
const Workflow = require('../models/Workflow');

exports.getOverviewStats = async (req, res) => {
  try {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // 1. Data Aggregation by Category
    const [
      // User Management
      totalUsers,
      newUsersToday,
      totalOrgs,
      totalInvites,
      // Monitoring
      unresolvedErrors,
      audit24h,
      emailsSent,
      emailsFailed,
      // Content
      totalAssets,
      totalVirtualEjs,
      totalJsonConfigs,
      // SaaS & Billing
      totalForms,
      waitingListStats,
      totalPlans,
      totalWorkflows
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ createdAt: { $gte: startOfToday } }),
      Organization.countDocuments(),
      require('../models/Invite').countDocuments({ status: 'pending' }),
      ErrorAggregate.countDocuments({ resolved: { $ne: true } }),
      AuditEvent.countDocuments({ createdAt: { $gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) } }),
      EmailLog.countDocuments({ status: 'sent' }),
      EmailLog.countDocuments({ status: 'error' }),
      Asset.countDocuments(),
      VirtualEjsFile.countDocuments(),
      JsonConfig.countDocuments(),
      FormSubmission.countDocuments(),
      waitingListService.getWaitingListStats().catch(() => ({ totalSubscribers: 0 })), // Fallback to 0 if service fails
      StripeCatalogItem.countDocuments({ active: true }),
      Workflow.countDocuments()
    ]);

    // 2. Recent Activity (Last 10 Audit Events)
    const recentActivity = await AuditEvent.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    // 3. Time-Series Data (Last 7 Days)
    const timeSeries = [];
    for (let i = 6; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i, 23, 59, 59);
      
      const [dayUsers, dayActivity, dayErrors, dayEmails] = await Promise.all([
        User.countDocuments({ createdAt: { $gte: start, $lte: end } }),
        AuditEvent.countDocuments({ createdAt: { $gte: start, $lte: end } }),
        ErrorAggregate.countDocuments({ createdAt: { $gte: start, $lte: end } }),
        EmailLog.countDocuments({ createdAt: { $gte: start, $lte: end }, status: 'sent' })
      ]);

      timeSeries.push({
        date: start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        users: dayUsers,
        activity: dayActivity,
        errors: dayErrors,
        emails: dayEmails
      });
    }

    return res.json({
      categories: {
        users: {
          total: totalUsers,
          newToday: newUsersToday,
          orgs: totalOrgs,
          invites: totalInvites
        },
        monitoring: {
          errors: unresolvedErrors,
          audit24h: audit24h,
          emailsSent,
          emailsFailed,
          health: unresolvedErrors > 10 ? 'critical' : unresolvedErrors > 0 ? 'warning' : 'healthy'
        },
        content: {
          assets: totalAssets,
          virtualEjs: totalVirtualEjs,
          jsonConfigs: totalJsonConfigs
        },
        saas: {
          forms: totalForms,
          waiting: waitingListStats.totalSubscribers || 0,
          plans: totalPlans,
          workflows: totalWorkflows
        }
      },
      recentActivity,
      timeSeries
    });
  } catch (error) {
    console.error('Overview stats error:', error);
    return res.status(500).json({ error: 'Failed to fetch overview stats' });
  }
};
