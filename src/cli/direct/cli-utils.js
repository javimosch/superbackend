#!/usr/bin/env node

/**
 * CLI utilities for the direct CLI
 * - Color helpers
 * - Argument parsing
 * - Output formatting
 */

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  bold: '\x1b[1m',
};

function colorize(color, text) {
  return `${colors[color]}${text}${colors.reset}`;
}

function parseArgs(args) {
  const options = {
    resource: null,
    command: null,
    id: null,
    name: null,
    model: null,
    key: null,
    value: null,
    description: null,
    email: null,
    password: null,
    role: null,
    alias: null,
    json: null,
    output: 'json',
    quiet: false,
    verbose: false,
    yes: false,
    help: false,
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (!arg.startsWith('-')) {
      if (!options.resource) {
        options.resource = arg;
      } else if (!options.command) {
        options.command = arg;
      } else {
        options.id = arg;
      }
      i++;
      continue;
    }

    switch (arg) {
      case '--name': options.name = args[++i]; break;
      case '--model': options.model = args[++i]; break;
      case '--key': options.key = args[++i]; break;
      case '--value': options.value = args[++i]; break;
      case '--description': options.description = args[++i]; break;
      case '--email': options.email = args[++i]; break;
      case '--password': options.password = args[++i]; break;
      case '--role': options.role = args[++i]; break;
      case '--alias': options.alias = args[++i]; break;
      case '--json': options.json = args[++i]; break;
      case '--output': options.output = args[++i].toLowerCase(); break;
      case '--quiet': options.quiet = true; break;
      case '--verbose': options.verbose = true; break;
      case '--yes':
      case '-y': options.yes = true; break;
      case '-h':
      case '--help': options.help = true; break;
      default:
        if (arg.startsWith('-') && !options.id) options.id = arg;
    }
    i++;
  }

  return options;
}

function formatOutput(data, format) {
  if (format === 'text') {
    return typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  }

  if (format === 'table' && Array.isArray(data) && data.length > 0) {
    const keys = Object.keys(data[0]);
    const header = keys.map(k => k.toUpperCase()).join(' | ');
    const rows = data.map(row =>
      keys.map(k => {
        const val = row[k];
        if (val === null || val === undefined) return '';
        return typeof val === 'object' ? JSON.stringify(val).slice(0, 50) : String(val);
      }).join(' | ')
    );
    return [header, ...rows].join('\n');
  }

  return JSON.stringify(data, null, 2);
}

module.exports = { colors, colorize, parseArgs, formatOutput };
