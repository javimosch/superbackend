# Adding UI Components via Plugins

This guide explains how to create plugins that add UI components to the SuperBackend UI Components system.

## Overview

The UI Components system allows you to create reusable HTML/CSS/JS widgets that can be delivered to external websites via the browser SDK. Plugins provide a powerful way to package and distribute UI components programmatically.

## Plugin Structure

A UI Components plugin follows the standard plugin structure:

```javascript
// plugins/my-ui-components/index.js
module.exports = {
  meta: {
    id: 'my-ui-components',
    name: 'My UI Components',
    version: '1.0.0',
    description: 'Custom UI components for my application',
    tags: ['ui', 'components', 'custom'],
  },
  hooks: {
    async install(ctx) {
      const service = ctx?.services?.uiComponents || null;
      if (!service) {
        console.log('[my-ui-components] uiComponents service not found');
        return;
      }

      // Component definitions here
    },
  },
};
```

## Component Definition

Each UI component requires the following fields:

```javascript
const component = {
  code: 'my_component',           // Unique identifier
  name: 'My Component',          // Display name
  html: '<div>...</div>',        // HTML template
  css: '.my-component { ... }',  // CSS styles
  js: 'window.myComponent = ...', // JavaScript logic
  usageMarkdown: '# Usage\n...', // Documentation
  api: 'method1(), method2()',   // API summary
  version: '1.0.0',             // Component version
  isActive: true,                // Enable component
};
```

## Using the UI Components Service

The UI Components service is available via `ctx.services.uiComponents` in your plugin's install hook.

### Key Methods

#### upsertComponent(component)
Creates or updates a component. If the component code already exists, it will be updated with the new definition.

```javascript
await service.upsertComponent({
  code: 'my_button',
  name: 'My Button',
  html: '<button class="my-button">Click me</button>',
  css: '.my-button { padding: 8px 16px; border: none; border-radius: 4px; }',
  js: 'window.myButton = { init: () => console.log("Button ready") };',
  usageMarkdown: '# My Button\n\nA simple button component.',
  api: 'init()',
  version: '1.0.0',
  isActive: true,
});
```

## Best Practices

### 1. Component Design

#### HTML Structure
- Use semantic HTML elements
- Include `data-*` attributes for JavaScript hooks
- Keep structure simple and accessible

```html
<div class="my-component" data-my-component>
  <div class="my-component-header" data-my-component-header>
    <h3 data-my-component-title></h3>
    <button data-my-component-close aria-label="Close">&times;</button>
  </div>
  <div class="my-component-body" data-my-component-body></div>
</div>
```

#### CSS Styling
- Use component-specific class prefixes to avoid conflicts
- Include responsive design considerations
- Add smooth transitions and animations
- Consider CSS isolation needs

```css
.my-component {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  padding: 16px;
  max-width: 400px;
}

.my-component-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

/* Responsive design */
@media (max-width: 640px) {
  .my-component {
    margin: 8px;
    max-width: calc(100vw - 16px);
  }
}
```

#### JavaScript Logic
- Wrap in IIFE to avoid global scope pollution
- Use `data-*` attributes for element selection
- Provide clean API for developers
- Handle edge cases and cleanup

```javascript
(function() {
  let instances = new Map();

  function MyComponent(element, options = {}) {
    this.element = element;
    this.options = options;
    this.init();
  }

  MyComponent.prototype.init = function() {
    // Initialize component
    this.bindEvents();
  };

  MyComponent.prototype.bindEvents = function() {
    const closeBtn = this.element.querySelector('[data-my-component-close]');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.destroy());
    }
  };

  MyComponent.prototype.destroy = function() {
    // Cleanup logic
    instances.delete(this.element);
  };

  // Static method for creating instances
  window.myComponent = {
    create: (element, options) => {
      const instance = new MyComponent(element, options);
      instances.set(element, instance);
      return instance;
    },
    destroy: (element) => {
      const instance = instances.get(element);
      if (instance) instance.destroy();
    }
  };
})();
```

### 2. Plugin Organization

#### Single Plugin, Multiple Components
Group related components in a single plugin:

```javascript
// plugins/form-components/index.js
module.exports = {
  meta: {
    id: 'form-components',
    name: 'Form Components',
    version: '1.0.0',
    description: 'Reusable form components',
  },
  hooks: {
    async install(ctx) {
      const service = ctx.services.uiComponents;
      
      // Install multiple related components
      await service.upsertComponent(textInputComponent);
      await service.upsertComponent(selectComponent);
      await service.upsertComponent(checkboxComponent);
    },
  },
};
```

#### Naming Conventions
- Use consistent prefixes for component codes: `sui_alert`, `sui_toast`
- Use descriptive names: `SUI Alert`, `SUI Toast`
- Include version in component definitions

### 3. Documentation

#### Usage Markdown
Provide clear documentation for each component:

```markdown
# Component Name

Brief description of what the component does.

## Usage

```javascript
// Basic usage
window.componentName.show('message');

// With options
window.componentName.show('message', {
  type: 'success',
  duration: 3000
});
```

## Options

- `option1` (type): Description
- `option2` (type): Description with default

## Methods

- `method1()`: Description
- `method2()`: Description

## Examples

Include practical examples of common use cases.
```

#### API Summary
Keep the `api` field concise but informative:

```javascript
api: 'show(message, options), hide(), destroy()'
```

## Example: Simple Modal Component

Here's a complete example of a modal component plugin:

```javascript
// plugins/simple-modal/index.js
module.exports = {
  meta: {
    id: 'simple-modal',
    name: 'Simple Modal',
    version: '1.0.0',
    description: 'A basic modal dialog component',
    tags: ['modal', 'dialog', 'ui'],
  },
  hooks: {
    async install(ctx) {
      const service = ctx.services.uiComponents;
      
      const modalComponent = {
        code: 'simple_modal',
        name: 'Simple Modal',
        html: `<div class="simple-modal-overlay" data-simple-modal-overlay>
  <div class="simple-modal" data-simple-modal>
    <div class="simple-modal-header">
      <h3 data-simple-modal-title></h3>
      <button data-simple-modal-close aria-label="Close">&times;</button>
    </div>
    <div class="simple-modal-body" data-simple-modal-body></div>
  </div>
</div>`,
        css: `.simple-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.simple-modal {
  background: white;
  border-radius: 8px;
  padding: 20px;
  max-width: 500px;
  width: 90%;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
}`,
        js: `(function() {
  function showModal(title, content) {
    const overlay = document.createElement('div');
    overlay.innerHTML = window.uiComponents.simple_modal.html;
    
    const modal = overlay.querySelector('[data-simple-modal]');
    const titleEl = overlay.querySelector('[data-simple-modal-title]');
    const bodyEl = overlay.querySelector('[data-simple-modal-body]');
    const closeEl = overlay.querySelector('[data-simple-modal-close]');
    
    titleEl.textContent = title;
    bodyEl.innerHTML = content;
    
    function close() {
      document.body.removeChild(overlay);
    }
    
    closeEl.addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
    
    document.body.appendChild(overlay);
    return close;
  }
  
  window.simpleModal = { show: showModal };
})();`,
        usageMarkdown: `# Simple Modal

A basic modal dialog component.

## Usage

\`\`\`javascript
const close = window.simpleModal.show('Title', '<p>Modal content</p>');
// Call close() to dismiss the modal
\`\`\``,
        api: 'show(title, content)',
        version: '1.0.0',
        isActive: true,
      };
      
      await service.upsertComponent(modalComponent);
      console.log('[simple-modal] Component installed');
    },
  },
};
```

## Testing Your Plugin

1. **Enable the Plugin**: Use the admin UI at `/admin/plugins-system` to enable your plugin
2. **Verify Installation**: Check that components appear in the UI Components admin interface
3. **Test Functionality**: Use the browser SDK to load and test your components
4. **Check Project Assignment**: Ensure components can be assigned to projects

## Deployment Considerations

- **Version Management**: Increment component versions when making breaking changes
- **Backward Compatibility**: Consider existing implementations when updating components
- **Performance**: Keep components lightweight and efficient
- **Browser Support**: Test across target browsers

## Troubleshooting

### Component Not Appearing
- Check that the plugin is enabled
- Verify the UI Components service is available
- Check browser console for JavaScript errors
- Ensure `isActive: true` is set

### Styling Issues
- Check for CSS conflicts with existing styles
- Verify CSS isolation settings
- Test in different browsers

### JavaScript Errors
- Ensure proper IIFE wrapping
- Check for undefined dependencies
- Verify element selection with `data-*` attributes

## Related Documentation

- [UI Components Feature Overview](../features/ui-components.md)
- [Plugin System Guide](../features/plugins-system.md)
- [Browser SDK Documentation](../features/browser-sdk.md)
