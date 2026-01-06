const FormSubmission = require('../models/FormSubmission');
const JsonConfig = require('../models/JsonConfig');
const auditService = require('./audit.service');
const emailService = require('./email.service');
const webhookService = require('./webhook.service');
const jsonConfigsService = require('./jsonConfigs.service');

/**
 * Forms Service
 * Manages form definitions (stored in JsonConfigs) and submissions
 */
class FormsService {
  /**
   * Get all form definitions
   */
  async getForms() {
    const config = await JsonConfig.findOne({ slug: 'form-definitions' });
    if (!config) return [];
    try {
      return JSON.parse(config.jsonRaw || '[]');
    } catch (e) {
      console.error('[FormsService] Error parsing jsonRaw in getForms:', e);
      return [];
    }
  }

  /**
   * Get a specific form definition by ID
   */
  async getFormById(formId) {
    const forms = await this.getForms();
    return forms.find(f => f.id === formId);
  }

  /**
   * Save a form definition
   */
  async saveForm(formData) {
    console.log('[FormsService] saveForm start', formData);
    let config = await JsonConfig.findOne({ slug: 'form-definitions' });
    
    let forms = [];
    if (config) {
      try {
        forms = JSON.parse(config.jsonRaw || '[]');
      } catch (e) {
        console.error('[FormsService] Error parsing jsonRaw:', e);
      }
    }

    const index = forms.findIndex(f => f.id === formData.id);
    if (index >= 0) {
      forms[index] = { ...forms[index], ...formData, updatedAt: new Date() };
    } else {
      forms.push({ 
        ...formData, 
        id: formData.id || `form_${Date.now()}`,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }

    const jsonRaw = JSON.stringify(forms);

    if (config) {
      await jsonConfigsService.updateJsonConfig(config._id, { jsonRaw });
    } else {
      await jsonConfigsService.createJsonConfig({
        title: 'Form Definitions',
        alias: 'form-definitions',
        jsonRaw,
        publicEnabled: false
      });
      // Note: createJsonConfig generates a unique slug based on title, 
      // but we want 'form-definitions' as the lookup key (slug or alias).
      // Since createJsonConfig handles unique slug generation, we set alias to 'form-definitions'.
    }

    console.log('[FormsService] Form definition saved');
    return formData;
  }

  /**
   * Delete a form definition
   */
  async deleteForm(formId) {
    const config = await JsonConfig.findOne({ slug: 'form-definitions' });
    if (config) {
      try {
        let forms = JSON.parse(config.jsonRaw || '[]');
        forms = forms.filter(f => f.id !== formId);
        config.jsonRaw = JSON.stringify(forms);
        await config.save();
      } catch (e) {
        console.error('[FormsService] Error during deleteForm:', e);
      }
    }
  }

  /**
   * Handle form submission
   */
  async submitForm(formId, fields, meta = {}) {
    const formConfig = await this.getFormById(formId);
    if (!formConfig) {
      throw new Error('Form not found');
    }

    const submission = new FormSubmission({
      formKey: formId,
      actorType: meta.actorType || 'anonymous',
      actorId: meta.actorId || 'guest',
      userId: meta.userId || null,
      fields: fields,
      meta: {
        ip: meta.ip,
        userAgent: meta.userAgent,
        referer: meta.referer,
        organizationId: meta.organizationId || meta.orgId || formConfig.organizationId
      }
    });

    await submission.save();

    // Trigger Generic Webhooks
    const orgId = submission.meta.organizationId;
    if (orgId) {
      webhookService.emit('form.submitted', {
        submissionId: submission._id,
        formId,
        fields,
        meta: submission.meta
      }, orgId);
    }

    // Trigger Legacy per-form Webhook
    if (formConfig.webhookUrl) {
      this.triggerWebhook(formConfig.webhookUrl, submission);
    }

    // Trigger Email Notification
    if (formConfig.notifyEmail) {
      this.sendNotification(formConfig.notifyEmail, formConfig.name, fields);
    }

    // Audit Log
    await auditService.createAuditEvent({
      action: 'FORM_SUBMISSION',
      entityType: 'FormSubmission',
      entityId: submission._id,
      actorType: submission.actorType,
      actorId: submission.actorId,
      meta: { 
        formId, 
        email: fields.email,
        organizationId: orgId
      }
    });

    return submission;
  }

  /**
   * Get submissions for a form
   */
  async getSubmissions(query = {}, options = {}) {
    const { limit = 50, offset = 0 } = options;
    const filter = {};
    if (query.formId) filter.formKey = query.formId;

    const entries = await FormSubmission.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(offset);

    const total = await FormSubmission.countDocuments(filter);

    return {
      entries,
      pagination: { total, limit, offset }
    };
  }

  /**
   * Trigger external webhook (async)
   */
  triggerWebhook(url, data) {
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).catch(err => console.error(`[FormsService] Webhook failed for ${url}:`, err.message));
  }

  /**
   * Send email notification (async)
   */
  sendNotification(to, formName, data) {
    emailService.sendEmail({
      to,
      subject: `New Submission: ${formName}`,
      text: `New form submission received for ${formName}.\n\nData:\n${JSON.stringify(data, null, 2)}`
    }).catch(err => console.error(`[FormsService] Email notification failed:`, err.message));
  }

  /**
   * Delete a form submission
   */
  async deleteSubmission(submissionId) {
    await FormSubmission.findByIdAndDelete(submissionId);
  }
}

module.exports = new FormsService();
