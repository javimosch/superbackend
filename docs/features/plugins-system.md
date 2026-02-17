# Plugins System

The SuperBackend Plugins System provides a powerful runtime for loading and managing CommonJS plugins from your local filesystem. It enables modular architecture with hot-loading capabilities, service exposure, and lifecycle management.

## Overview

The plugins system automatically discovers plugins from the `plugins/` directory in your project root and provides a web interface for management. Each plugin can expose services, helpers, and lifecycle hooks that integrate with the SuperBackend runtime.

## Key Features

- **Auto-discovery**: Automatically scans `plugins/` directory for CommonJS modules
- **Lifecycle Management**: Bootstrap and install hooks for plugin initialization
- **Service Exposure**: Plugins can expose services and helpers to the global runtime
- **State Persistence**: Plugin enabled/disabled state persists across server restarts
- **Admin Interface**: Web UI for managing plugins (enable/disable/install)
- **Registry Integration**: Automatic registration with the Open Registry system
- **Permissive Contracts**: Supports both structured and simple plugin formats

## Plugin Structure

### Basic Plugin Format

```javascript
// plugins/my-plugin/index.js
module.exports = {
  meta: {
    id: 'my-plugin',
    name: 'My Plugin',
    version: '1.0.0',
    description: 'Example plugin that demonstrates the plugin system',
    tags: ['example', 'demo']
  },
  hooks: {
    bootstrap(ctx) {
      console.log('[my-plugin] Bootstrap called');
      console.log('Available services:', Object.keys(ctx.services || {}));
    },
    install(ctx) {
      console.log('[my-plugin] Install called - one-time setup');
    }
  }
};
```

### Permissive Contract (Simplified)

```javascript
// plugins/simple-plugin/index.js
module.exports = {
  id: 'simple-plugin',
  name: 'Simple Plugin',
  bootstrap(ctx) {
    console.log('Simple plugin bootstrap');
  },
  install(ctx) {
    console.log('Simple plugin install');
  }
};
```

### Plugin with Services and Helpers

```javascript
// plugins/tools-plugin/index.js
module.exports = {
  meta: { 
    id: 'tools-plugin', 
    name: 'Tools Plugin',
    version: '1.0.0',
    description: 'Provides utility services and helpers'
  },
  services: {
    formatDate(date) {
      return new Date(date).toISOString().split('T')[0];
    },
    generateId() {
      return Math.random().toString(36).substr(2, 9);
    }
  },
  helpers: {
    capitalize(str) {
      return String(str || '').charAt(0).toUpperCase() + str.slice(1);
    },
    slugify(text) {
      return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    }
  },
  hooks: {
    bootstrap(ctx) {
      console.log('[tools-plugin] Services and helpers available');
    }
  }
};
```

## Plugin Lifecycle

### Discovery Phase
- System scans `plugins/` directory on startup
- Each subdirectory with `index.js` is considered a plugin
- Plugins are normalized and validated
- Registry entries are automatically created

### Bootstrap Phase
- Runs when plugin is enabled or on server startup for already-enabled plugins
- Plugin services and helpers are exposed to global runtime
- Hook receives context with access to SuperBackend services

### Install Phase
- Runs when plugin is first enabled via admin interface
- Intended for one-time setup operations
- Can be manually triggered via "Run install" button

## Plugin Context

Plugin hooks receive a context object with the following properties:

```javascript
{
  plugin: {},        // Plugin metadata and configuration
  services: {},      // SuperBackend services (models, controllers, etc.)
  helpers: {},       // SuperBackend helper functions
  logger: console,   // Logger instance
  cwd: '/path/to/project', // Current working directory
  request: {}        // Express request object (for admin operations)
}
```

## Runtime Access

Once enabled, plugin services and helpers are available globally:

```javascript
// Access plugin services
const result = superbackend.services.pluginsRuntime.formatDate(new Date());

// Access plugin helpers  
const slug = superbackend.helpers.pluginsRuntime.slugify('My Title');
```

## Admin Interface

The plugins system includes a comprehensive admin interface accessible at `/admin/plugins-system` with features:

- **Plugin Discovery**: View all discovered plugins with metadata
- **Enable/Disable**: Toggle plugin state with persistence
- **Install Hook**: Manually trigger install hooks
- **Status Indicators**: Visual feedback for plugin states
- **Live Examples**: Collapsible documentation blocks with code examples

### Admin Features

- **Refresh Button**: Reload plugin discovery
- **Plugin Cards**: Display name, version, hooks, and enabled status
- **Action Buttons**: Enable, disable, and run install operations
- **Error Handling**: Clear error messages for failed operations
- **Real-time Updates**: Immediate UI updates after state changes

## API Endpoints

### List Plugins
```http
GET /api/admin/plugins
```

Returns array of plugin objects with metadata and state.

### Enable Plugin
```http
POST /api/admin/plugins/{pluginId}/enable
```

Enables plugin, runs install and bootstrap hooks.

### Disable Plugin
```http
POST /api/admin/plugins/{pluginId}/disable
```

Disables plugin (removes from runtime but keeps configuration).

### Install Plugin
```http
POST /api/admin/plugins/{pluginId}/install
```

Manually runs the install hook.

## State Management

Plugin state is persisted using the JsonConfig system:

```javascript
{
  "version": 1,
  "plugins": {
    "my-plugin": {
      "enabled": true,
      "installedAt": "2026-01-15T10:30:00.000Z",
      "updatedAt": "2026-01-15T10:30:00.000Z"
    }
  }
}
```

## Registry Integration

Plugins are automatically registered with the Open Registry system:

- **Registry ID**: `plugins`
- **Category**: `plugins`
- **Source**: `local-folder`
- **Metadata**: Includes plugin version, hooks availability, and local path

This enables plugins to be discovered and used by other systems that integrate with the registry.

## Best Practices

### Plugin Development

1. **Use descriptive metadata**: Include clear names, descriptions, and tags
2. **Handle errors gracefully**: Wrap operations in try-catch blocks
3. **Log appropriately**: Use the provided logger for debugging
4. **Version consistently**: Update version numbers when making changes
5. **Test hooks**: Verify both bootstrap and install functionality

### Service Design

1. **Keep services focused**: Single responsibility per service method
2. **Validate inputs**: Ensure parameters are valid before processing
3. **Document APIs**: Include JSDoc comments for public methods
4. **Handle async**: Use async/await for asynchronous operations

### State Management

1. **Use external storage**: Don't rely on in-memory state for persistence
2. **Clean up resources**: Remove temporary files and connections
3. **Handle reboots**: Design plugins to work correctly after server restart

## Troubleshooting

### Common Issues

**Plugin not discovered**
- Verify `plugins/` directory exists in project root
- Check that plugin folder contains `index.js`
- Ensure `index.js` exports a valid object

**Plugin fails to enable**
- Check console logs for error messages
- Verify plugin syntax is valid JavaScript
- Ensure required dependencies are available

**Services not available**
- Confirm plugin is enabled (check admin interface)
- Verify services are exported in plugin object
- Check for naming conflicts with other plugins

**Install hook not running**
- Plugin must be disabled before first enable
- Use "Run install" button in admin interface
- Check for errors in install hook implementation

### Debugging

1. **Console logs**: Plugin hooks log to console with plugin ID prefix
2. **Admin interface**: Check for error messages in plugin cards
3. **Registry entries**: Verify plugin appears in Open Registry
4. **State persistence**: Check JsonConfig for plugin state

## Security Considerations

- **Plugin isolation**: Plugins run in the same process as SuperBackend
- **File system access**: Plugins have access to the entire file system
- **Service exposure**: Exposed services are globally available
- **Network access**: Plugins can make external network requests

Only install plugins from trusted sources and review code before enabling.

## Examples

### UI Component Plugin

```javascript
// plugins/ui-components/index.js
module.exports = {
  meta: {
    id: 'ui-components',
    name: 'UI Components Plugin',
    version: '1.0.0',
    description: 'Provides reusable UI components'
  },
  services: {
    async upsertComponent(name, html, css, js) {
      // Implementation for upserting UI components
      return { success: true, id: name };
    }
  },
  hooks: {
    async bootstrap(ctx) {
      console.log('[ui-components] Plugin ready');
      // Register default components
      await ctx.services.pluginsRuntime.upsertComponent('alert', '<div>Alert</div>', '', '');
    }
  }
};
```

### Data Processing Plugin

```javascript
// plugins/data-processor/index.js
module.exports = {
  meta: {
    id: 'data-processor',
    name: 'Data Processor',
    version: '1.0.0',
    description: 'Processes and transforms data'
  },
  helpers: {
    transformData(data, rules) {
      // Data transformation logic
      return data.map(item => applyRules(item, rules));
    }
  },
  hooks: {
    bootstrap(ctx) {
      console.log('[data-processor] Processing helpers available');
    }
  }
};
```

## Migration from Legacy Systems

If you're migrating from a legacy plugin system:

1. **Update structure**: Follow the new plugin format with `meta` and `hooks`
2. **Move services**: Convert legacy service registrations to plugin services
3. **Update lifecycle**: Migrate initialization code to bootstrap/install hooks
4. **Test compatibility**: Verify plugins work with the new runtime

The plugins system is designed to be backward compatible where possible while providing enhanced functionality and better integration with SuperBackend.
