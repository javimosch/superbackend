#!/usr/bin/env node
/**
 * Patch skills.js to add new SuperCLI self-documentation commands
 */
const fs = require('fs');
const path = require('path');

const filePath = '/home/jarancibia/ai/dcli/cli/skills.js';
let content = fs.readFileSync(filePath, 'utf-8');

// 1. Update imports to include new functions
const oldImport = `const {
  listProviders,
  addProvider,
  removeProvider,
  getProvider,
  readIndex,
  syncCatalog,
  listCatalogSkills,
  searchCatalog,
  getCatalogSkill
} = require("./skills-catalog")`;

const newImport = `const {
  listProviders,
  addProvider,
  removeProvider,
  getProvider,
  readIndex,
  syncCatalog,
  listCatalogSkills,
  searchCatalog,
  getCatalogSkill,
  getCatalogInfo,
  describeProviderTypes
} = require("./skills-catalog")`;

content = content.replace(oldImport, newImport);

// 2. Add catalog info command before sync
const syncInsert = `  if (subcommand === "catalog") {
    const action = positional[2]
    if (action === "info") {
      const info = getCatalogInfo()
      if (humanMode && !flags.json) {
        console.log("\\n  ⚡ Skills Catalog Info\\n")
        console.log("  Index:")
        console.log("    Version:", info.index.version)
        console.log("    Updated:", info.index.updated_at)
        console.log("    Total Skills:", info.index.total_skills)
        console.log("\\n  Providers:")
        for (const p of info.providers) {
          console.log("    - " + p.name + " (" + p.type + "): " + p.skills_count + " skills [" + p.status + "]")
        }
        console.log("")
      } else {
        output({ catalog: info })
      }
      return true
    }
    outputError({ code: 85, type: "invalid_argument", message: "Usage: supercli skills catalog info [--json]", recoverable: false })
    return true
  }

  if (subcommand === "sync")`;

content = content.replace('  if (subcommand === "sync")', syncInsert);

// 3. Add describe to providers block
const providersEnd = `    outputError({ code: 85, type: "invalid_argument", message: "Unknown providers subcommand. Use: list, add, remove, show", recoverable: false })
    return true
  }`;

const providersWithDescribe = `    if (action === "describe") {
      const types = describeProviderTypes()
      if (humanMode && !flags.json) {
        console.log("\\n  ⚡ Skill Provider Types\\n")
        for (const t of types.provider_types) {
          console.log("  " + t.name + ":")
          console.log("    " + t.description)
          console.log("    Example:")
          console.log("      " + JSON.stringify(t.example, null, 6))
          console.log("")
        }
      } else {
        output(types)
      }
      return true
    }

    outputError({ code: 85, type: "invalid_argument", message: "Unknown providers subcommand. Use: list, add, remove, show, describe", recoverable: false })
    return true
  }`;

content = content.replace(providersEnd, providersWithDescribe);

fs.writeFileSync(filePath, content);
console.log('✓ Patched skills.js successfully');
console.log('  - Added: skills catalog info');
console.log('  - Added: skills providers describe');
