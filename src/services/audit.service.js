const AuditEvent = require('../models/AuditEvent');
const webhookService = require('./webhook.service');

async function createAuditEvent({
  actorType,
  actorId,
  action,
  entityType,
  entityId,
  before,
  after,
  meta,
}) {
  try {
    await AuditEvent.create({
      actorType,
      actorId,
      action,
      entityType,
      entityId,
      before,
      after,
      meta,
    });

    // Trigger Webhooks for critical events or all audit events
    // Assuming organizationId is available in meta or can be inferred
    const organizationId = meta?.organizationId || meta?.orgId;
    if (organizationId) {
      webhookService.emit('audit.event', {
        action,
        entityType,
        entityId,
        actorType,
        actorId,
        timestamp: new Date().toISOString()
      }, organizationId);
    }
  } catch (error) {
    console.error('Error creating audit event:', error);
  }
}

function getBasicAuthActor(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return { actorType: 'admin', actorId: null };
  }

  try {
    const credentials = Buffer.from(authHeader.substring(6), 'base64').toString('utf-8');
    const [username] = credentials.split(':');
    return { actorType: 'admin', actorId: username || null };
  } catch (e) {
    return { actorType: 'admin', actorId: null };
  }
}

module.exports = {
  createAuditEvent,
  getBasicAuthActor,
};
