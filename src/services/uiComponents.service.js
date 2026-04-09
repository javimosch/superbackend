const UiComponent = require('../models/UiComponent');
const UiComponentVersion = require('../models/UiComponentVersion');

const MAX_VERSIONS_PER_COMPONENT = 20;

/**
 * UI Components Service
 * Provides service layer for UI Components operations
 */

class UiComponentsService {
  /**
   * Upsert a UI component (create or update)
   * @param {Object} componentData - Component data
   * @param {string} componentData.code - Unique component code
   * @param {string} componentData.name - Component display name
   * @param {string} componentData.html - HTML template
   * @param {string} componentData.css - CSS styles
   * @param {string} componentData.js - JavaScript code
   * @param {string} componentData.usageMarkdown - Usage documentation
   * @param {string} componentData.api - API summary
   * @param {number} componentData.version - Component version
   * @param {boolean} componentData.isActive - Whether component is active
   * @returns {Promise<Object>} The created/updated component
   */
  async upsertComponent(componentData) {
    try {
      const {
        code,
        name,
        html = '',
        css = '',
        js = '',
        usageMarkdown = '',
        api = null,
        version = 1,
        isActive = true,
        previewExample = null,
      } = componentData;

      // Validate required fields
      if (!code || typeof code !== 'string') {
        throw new Error('code is required and must be a string');
      }
      if (!name || typeof name !== 'string') {
        throw new Error('name is required and must be a string');
      }

      // Normalize code to lowercase
      const normalizedCode = String(code).trim().toLowerCase();

      // Check if component exists
      const existing = await UiComponent.findOne({ code: normalizedCode });

      if (existing) {
        // Snapshot current state before update
        try {
          await UiComponentVersion.create({
            componentCode: normalizedCode,
            version: existing.version || 1,
            name: existing.name,
            html: existing.html || '',
            js: existing.js || '',
            css: existing.css || '',
            api: existing.api,
            usageMarkdown: existing.usageMarkdown || '',
            previewExample: existing.previewExample || null,
            savedAt: existing.updatedAt || new Date(),
          });

          // Prune old versions beyond the max
          const count = await UiComponentVersion.countDocuments({ componentCode: normalizedCode });
          if (count > MAX_VERSIONS_PER_COMPONENT) {
            const oldest = await UiComponentVersion.find({ componentCode: normalizedCode })
              .sort({ savedAt: 1 })
              .limit(count - MAX_VERSIONS_PER_COMPONENT)
              .select('_id');
            const idsToRemove = oldest.map((d) => d._id);
            await UiComponentVersion.deleteMany({ _id: { $in: idsToRemove } });
          }
        } catch (versionErr) {
          console.error(`[uiComponents] Failed to snapshot version for ${normalizedCode}:`, versionErr);
        }

        // Update existing component
        const updateData = {
          name: String(name).trim(),
          html: String(html),
          css: String(css),
          js: String(js),
          usageMarkdown: String(usageMarkdown),
          api,
          version: Number(version) || 1,
          isActive: Boolean(isActive),
          updatedAt: new Date(),
          previewExample,
        };

        const updated = await UiComponent.findOneAndUpdate(
          { code: normalizedCode },
          updateData,
          { new: true, runValidators: true }
        );

        console.log(`[uiComponents] Updated component: ${normalizedCode}`);
        return updated.toObject();
      } else {
        // Create new component
        const createData = {
          code: normalizedCode,
          name: String(name).trim(),
          html: String(html),
          css: String(css),
          js: String(js),
          usageMarkdown: String(usageMarkdown),
          api,
          version: Number(version) || 1,
          isActive: Boolean(isActive),
          previewExample,
        };

        const created = await UiComponent.create(createData);
        console.log(`[uiComponents] Created component: ${normalizedCode}`);
        return created.toObject();
      }
    } catch (error) {
      console.error(`[uiComponents] Failed to upsert component ${componentData.code}:`, error);
      throw error;
    }
  }

  /**
   * Get a component by code
   * @param {string} code - Component code
   * @returns {Promise<Object|null>} Component data or null if not found
   */
  async getComponent(code) {
    try {
      const component = await UiComponent.findOne({ 
        code: String(code).trim().toLowerCase() 
      }).lean();
      return component;
    } catch (error) {
      console.error(`[uiComponents] Failed to get component ${code}:`, error);
      throw error;
    }
  }

  /**
   * List all components
   * @param {Object} options - Query options
   * @param {boolean} options.activeOnly - Only return active components
   * @returns {Promise<Array>} Array of components
   */
  async listComponents(options = {}) {
    try {
      const { activeOnly = false } = options;
      const query = activeOnly ? { isActive: true } : {};
      
      const components = await UiComponent.find(query)
        .sort({ updatedAt: -1 })
        .lean();
      
      return components;
    } catch (error) {
      console.error('[uiComponents] Failed to list components:', error);
      throw error;
    }
  }

  /**
   * Delete a component by code
   * @param {string} code - Component code
   * @returns {Promise<boolean>} True if deleted, false if not found
   */
  async deleteComponent(code) {
    try {
      const result = await UiComponent.deleteOne({ 
        code: String(code).trim().toLowerCase() 
      });
      
      if (result.deletedCount > 0) {
        console.log(`[uiComponents] Deleted component: ${code}`);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error(`[uiComponents] Failed to delete component ${code}:`, error);
      throw error;
    }
  }

  /**
   * Check if component exists
   * @param {string} code - Component code
   * @returns {Promise<boolean>} True if component exists
   */
  async componentExists(code) {
    try {
      const count = await UiComponent.countDocuments({ 
        code: String(code).trim().toLowerCase() 
      });
      return count > 0;
    } catch (error) {
      console.error(`[uiComponents] Failed to check component existence ${code}:`, error);
      throw error;
    }
  }

  /**
   * Get version history for a component
   * @param {string} code - Component code
   * @param {number} limit - Max versions to return
   * @returns {Promise<Array>} Array of version snapshots
   */
  async getVersionHistory(code, limit = 20) {
    const normalizedCode = String(code).trim().toLowerCase();
    const versions = await UiComponentVersion.find({ componentCode: normalizedCode })
      .sort({ savedAt: -1 })
      .limit(limit)
      .lean();
    return versions;
  }

  /**
   * Restore a component to a previous version
   * @param {string} code - Component code
   * @param {string} versionId - Version document ID to restore
   * @returns {Promise<Object>} Updated component
   */
  async restoreVersion(code, versionId) {
    const normalizedCode = String(code).trim().toLowerCase();
    const versionDoc = await UiComponentVersion.findById(versionId).lean();
    if (!versionDoc) throw Object.assign(new Error('Version not found'), { code: 'NOT_FOUND' });
    if (versionDoc.componentCode !== normalizedCode) {
      throw Object.assign(new Error('Version does not belong to this component'), { code: 'VALIDATION' });
    }

    // Use upsert to restore (which also snapshots current state)
    return this.upsertComponent({
      code: normalizedCode,
      name: versionDoc.name,
      html: versionDoc.html,
      css: versionDoc.css,
      js: versionDoc.js,
      usageMarkdown: versionDoc.usageMarkdown,
      api: versionDoc.api,
      version: versionDoc.version,
      previewExample: versionDoc.previewExample,
    });
  }

  /**
   * Export all (or active-only) components as a JSON-serializable array
   * @param {Object} options
   * @param {boolean} options.activeOnly - Only export active components
   * @returns {Promise<Array>} Array of component data
   */
  async exportComponents({ activeOnly = false } = {}) {
    const filter = activeOnly ? { isActive: true } : {};
    const docs = await UiComponent.find(filter).sort({ code: 1 }).lean();
    return docs.map((d) => ({
      code: d.code,
      name: d.name,
      html: d.html || '',
      css: d.css || '',
      js: d.js || '',
      usageMarkdown: d.usageMarkdown || '',
      api: d.api || null,
      version: d.version || 1,
      isActive: d.isActive !== false,
      previewExample: d.previewExample || null,
    }));
  }

  /**
   * Import components from a JSON array (upsert each)
   * @param {Array} components - Array of component data objects
   * @returns {Promise<Object>} Summary of import results
   */
  async importComponents(components) {
    if (!Array.isArray(components)) {
      throw Object.assign(new Error('components must be an array'), { code: 'VALIDATION' });
    }

    const results = { created: 0, updated: 0, errors: [] };

    for (const comp of components) {
      try {
        if (!comp || !comp.code || !comp.name) {
          results.errors.push({ code: comp?.code || 'unknown', error: 'Missing code or name' });
          continue;
        }
        const existing = await UiComponent.findOne({ code: String(comp.code).trim().toLowerCase() });
        await this.upsertComponent(comp);
        if (existing) {
          results.updated += 1;
        } else {
          results.created += 1;
        }
      } catch (err) {
        results.errors.push({ code: comp?.code || 'unknown', error: err.message });
      }
    }

    return results;
  }
}

module.exports = new UiComponentsService();
