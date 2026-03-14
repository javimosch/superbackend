#!/usr/bin/env node

/**
 * Non-interactive CLI to interact with a SuperBackend instance via HTTP API
 *
 * Usage:
 *   npx @intranefr/superbackend api <endpoint> [options]
 *   node src/cli/api.js <endpoint> [options]
 *
 * Examples:
 *   # List agents
 *   node src/cli/api.js /api/admin/agents --admin-basic
 *
 *   # Create a setting
 *   node src/cli/api.js /api/admin/settings/MY_KEY -X POST -d '{"value":"test"}' --admin-basic
 *
 *   # Get user info (with JWT)
 *   node src/cli/api.js /api/auth/me --token YOUR_JWT_TOKEN
 */

require('dotenv').config(process.env.MODE ? { path: `.env.${process.env.MODE}` } : {});

const axios = require('axios');
const path = require('path');

// Default configuration
const DEFAULT_BASE_URL = process.env.SUPERBACKEND_URL || 'http://localhost:3000';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';

// Colors for terminal output
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

function printHelp() {
  console.log(`
${colorize('bold', 'SuperBackend API CLI')}

${colorize('bold', 'Usage:')}
  node src/cli/api.js <endpoint> [options]

${colorize('bold', 'Arguments:')}
  endpoint              API endpoint path (e.g., /api/admin/agents)

${colorize('bold', 'Options:')}
  -X, --method METHOD   HTTP method (GET, POST, PUT, DELETE, PATCH). Default: GET
  -d, --data DATA       Request body (JSON string or file path with @prefix)
  -H, --header HEADER   Custom header (format: "Key: Value")
  -q, --query KEY=VAL   Query parameter (can be repeated)
  --base-url URL        Base URL of SuperBackend instance. Default: ${DEFAULT_BASE_URL}
  --token TOKEN         JWT token for authentication
  --admin-basic         Use admin basic auth (from env or defaults)
  --admin-session       Use admin session auth (requires --cookie)
  --cookie COOKIE       Session cookie for authentication
  --output FORMAT       Output format: json, text, table. Default: json
  --silent              Only output response data (no status/colors)
  --verbose             Show request details
  --timeout MS          Request timeout in ms. Default: 30000
  -h, --help            Show this help message

${colorize('bold', 'Examples:')}
  ${colorize('gray', '# List agents with admin auth')}
  node src/cli/api.js /api/admin/agents --admin-basic

  ${colorize('gray', '# Create a global setting')}
  node src/cli/api.js /api/admin/settings/MY_KEY -X POST \\
    -d '{"value":"my-value","description":"My setting"}' --admin-basic

  ${colorize('gray', '# Get user info with JWT token')}
  node src/cli/api.js /api/auth/me --token YOUR_JWT_TOKEN

  ${colorize('gray', '# List blog posts with query params')}
  node src/cli/api.js /api/blog/posts -q status=published -q limit=10

  ${colorize('gray', '# Upload JSON data from file')}
  node src/cli/api.js /api/data -X POST -d @data.json --token TOKEN

${colorize('bold', 'Environment Variables:')}
  SUPERBACKEND_URL      Base URL (default: http://localhost:3000)
  ADMIN_USERNAME        Admin username for basic auth (default: admin)
  ADMIN_PASSWORD        Admin password for basic auth (default: admin)
`);
}

function parseArgs(args) {
  const options = {
    endpoint: null,
    method: 'GET',
    data: null,
    headers: {},
    query: {},
    baseUrl: DEFAULT_BASE_URL,
    token: null,
    adminBasic: false,
    adminSession: false,
    cookie: null,
    output: 'json',
    silent: false,
    verbose: false,
    timeout: 30000,
    help: false,
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (!arg.startsWith('-') && !options.endpoint) {
      options.endpoint = arg;
      i++;
      continue;
    }

    switch (arg) {
      case '-X':
      case '--method':
        options.method = args[++i].toUpperCase();
        break;
      case '-d':
      case '--data':
        options.data = args[++i];
        break;
      case '-H':
      case '--header':
        const headerParts = args[++i].split(':');
        if (headerParts.length >= 2) {
          const key = headerParts[0].trim();
          const value = headerParts.slice(1).join(':').trim();
          options.headers[key] = value;
        }
        break;
      case '-q':
      case '--query':
        const queryParts = args[++i].split('=');
        if (queryParts.length === 2) {
          options.query[queryParts[0]] = queryParts[1];
        }
        break;
      case '--base-url':
        options.baseUrl = args[++i].replace(/\/$/, '');
        break;
      case '--token':
        options.token = args[++i];
        break;
      case '--admin-basic':
        options.adminBasic = true;
        break;
      case '--admin-session':
        options.adminSession = true;
        break;
      case '--cookie':
        options.cookie = args[++i];
        break;
      case '--output':
        options.output = args[++i].toLowerCase();
        break;
      case '--silent':
        options.silent = true;
        break;
      case '--verbose':
        options.verbose = true;
        break;
      case '--timeout':
        options.timeout = parseInt(args[++i], 10);
        break;
      case '-h':
      case '--help':
        options.help = true;
        break;
      default:
        if (arg.startsWith('-')) {
          console.error(colorize('red', `Unknown option: ${arg}`));
          process.exit(1);
        }
    }
    i++;
  }

  return options;
}

async function loadData(dataArg) {
  if (!dataArg) return null;

  if (dataArg.startsWith('@')) {
    const filePath = dataArg.slice(1);
    const fs = require('fs');
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);

    if (!fs.existsSync(absolutePath)) {
      throw new Error(`File not found: ${absolutePath}`);
    }

    const content = fs.readFileSync(absolutePath, 'utf-8');
    try {
      return JSON.parse(content);
    } catch (e) {
      return content;
    }
  }

  try {
    return JSON.parse(dataArg);
  } catch (e) {
    return dataArg;
  }
}

function formatOutput(data, format, silent) {
  if (format === 'text') {
    if (typeof data === 'string') return data;
    return JSON.stringify(data, null, 2);
  }

  if (format === 'table') {
    if (Array.isArray(data) && data.length > 0) {
      const keys = Object.keys(data[0]);
      const header = keys.join(' | ');
      const rows = data.map(row =>
        keys.map(k => {
          const val = row[k];
          return typeof val === 'object' ? JSON.stringify(val) : String(val);
        }).join(' | ')
      );
      return [header, ...rows].join('\n');
    }
    return JSON.stringify(data, null, 2);
  }

  return JSON.stringify(data, null, 2);
}

async function makeRequest(options) {
  const {
    endpoint,
    method,
    data,
    headers,
    query,
    baseUrl,
    token,
    adminBasic,
    adminSession,
    cookie,
    output,
    silent,
    verbose,
    timeout,
  } = options;

  if (!endpoint) {
    console.error(colorize('red', 'Error: Endpoint is required'));
    printHelp();
    process.exit(1);
  }

  // Build URL
  const url = new URL(endpoint, baseUrl);
  Object.entries(query).forEach(([key, value]) => {
    url.searchParams.append(key, value);
  });

  // Prepare headers
  const requestHeaders = { ...headers };

  if (token) {
    requestHeaders['Authorization'] = `Bearer ${token}`;
  } else if (adminBasic) {
    const credentials = Buffer.from(`${ADMIN_USERNAME}:${ADMIN_PASSWORD}`).toString('base64');
    requestHeaders['Authorization'] = `Basic ${credentials}`;
  } else if (adminSession && cookie) {
    requestHeaders['Cookie'] = cookie;
  }

  // Load data if provided
  let requestData = null;
  if (data) {
    requestData = await loadData(data);
    if (typeof requestData === 'object') {
      requestHeaders['Content-Type'] = 'application/json';
    }
  }

  if (verbose && !silent) {
    console.log(colorize('cyan', '\n--- Request ---'));
    console.log(`${colorize('bold', 'URL:')} ${method} ${url.toString()}`);
    console.log(`${colorize('bold', 'Headers:')} ${JSON.stringify(requestHeaders, null, 2)}`);
    if (requestData) {
      console.log(`${colorize('bold', 'Body:')} ${JSON.stringify(requestData, null, 2)}`);
    }
    console.log();
  }

  // Make request
  const startTime = Date.now();

  try {
    const response = await axios({
      method,
      url: url.toString(),
      headers: requestHeaders,
      data: requestData,
      timeout,
      validateStatus: () => true, // Don't throw on error status codes
    });

    const duration = Date.now() - startTime;

    if (verbose && !silent) {
      console.log(colorize('cyan', '\n--- Response ---'));
      console.log(`${colorize('bold', 'Status:')} ${response.status} ${response.statusText}`);
      console.log(`${colorize('bold', 'Duration:')} ${duration}ms`);
      console.log(`${colorize('bold', 'Headers:')} ${JSON.stringify(response.headers, null, 2)}`);
      console.log();
    }

    // Output result
    let outputData = response.data;
    if (typeof outputData === 'string') {
      try {
        outputData = JSON.parse(outputData);
      } catch (e) {
        // Keep as string if not JSON
      }
    }

    if (silent) {
      console.log(formatOutput(outputData, output, silent));
    } else {
      const statusColor = response.status >= 200 && response.status < 300 ? 'green' :
                          response.status >= 400 ? 'red' : 'yellow';
      console.log(colorize(statusColor, `\n✓ ${method} ${endpoint}`));
      console.log(colorize('gray', `Status: ${response.status} ${response.statusText} (${duration}ms)`));
      console.log();
      console.log(formatOutput(outputData, output, silent));
    }

    // Exit with error code for failed requests
    if (response.status >= 400) {
      process.exit(1);
    }

  } catch (error) {
    if (!silent) {
      console.error(colorize('red', '\n✗ Request failed'));
      console.error(colorize('gray', `Error: ${error.message}`));
      if (error.response) {
        console.error(colorize('gray', `Status: ${error.response.status}`));
        console.error(colorize('gray', `Data: ${JSON.stringify(error.response.data)}`));
      }
    } else {
      console.error(colorize('red', `Error: ${error.message}`));
    }
    process.exit(1);
  }
}

// Main execution
const args = process.argv.slice(2);
const options = parseArgs(args);

if (options.help) {
  printHelp();
  process.exit(0);
}

makeRequest(options);
