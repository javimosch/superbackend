const UiComponent = require('../models/UiComponent');

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
}

module.exports = new UiComponentsService();
