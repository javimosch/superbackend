const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Simple getSetting using process.env
const getSetting = (key, defaultValue) => process.env[key] || defaultValue;

const ALLOWED_TYPES = {
  image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  video: ['video/mp4', 'video/webm', 'video/quicktime']
};

/**
 * Ensure upload directory exists
 */
function ensureUploadDir(subdir = '') {
  const uploadDir = getSetting('UPLOAD_DIR', 'uploads');
  const fullPath = path.join(process.cwd(), uploadDir, subdir);
  
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
  }
  
  return fullPath;
}

/**
 * Generate unique filename
 */
function generateFilename(originalName, prefix = '') {
  const ext = path.extname(originalName).toLowerCase();
  const hash = crypto.randomBytes(8).toString('hex');
  const timestamp = Date.now();
  return `${prefix}${timestamp}-${hash}${ext}`;
}

/**
 * Validate file type
 */
function validateFileType(mimetype, allowedCategory = 'image') {
  const allowed = ALLOWED_TYPES[allowedCategory] || ALLOWED_TYPES.image;
  return allowed.includes(mimetype);
}

/**
 * Validate file size
 */
function validateFileSize(size) {
  const maxSize = parseInt(getSetting('MAX_FILE_SIZE', '10485760')); // 10MB default
  return size <= maxSize;
}

/**
 * Save uploaded file from base64 data
 */
async function saveBase64File(base64Data, options = {}) {
  const { subdir = 'images', prefix = '', allowedCategory = 'image' } = options;
  
  // Extract mime type and data
  const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) {
    throw new Error('Invalid base64 data');
  }
  
  const mimetype = matches[1];
  const data = matches[2];
  const buffer = Buffer.from(data, 'base64');
  
  // Validate
  if (!validateFileType(mimetype, allowedCategory)) {
    throw new Error('Invalid file type');
  }
  
  if (!validateFileSize(buffer.length)) {
    throw new Error('File too large');
  }
  
  // Get extension from mimetype
  const ext = mimetype.split('/')[1].replace('jpeg', 'jpg');
  const filename = generateFilename(`.${ext}`, prefix);
  
  // Save file
  const dir = ensureUploadDir(subdir);
  const filepath = path.join(dir, filename);
  
  fs.writeFileSync(filepath, buffer);
  
  // Return relative URL
  const uploadDir = getSetting('UPLOAD_DIR', 'uploads');
  return `/${uploadDir}/${subdir}/${filename}`;
}

/**
 * Save multipart file
 */
async function saveMultipartFile(file, options = {}) {
  const { subdir = 'images', prefix = '', allowedCategory = 'image' } = options;
  
  // Validate
  if (!validateFileType(file.mimetype, allowedCategory)) {
    throw new Error('Invalid file type');
  }
  
  if (!validateFileSize(file.size)) {
    throw new Error('File too large');
  }
  
  const filename = generateFilename(file.originalname || file.name, prefix);
  const dir = ensureUploadDir(subdir);
  const filepath = path.join(dir, filename);
  
  // Move or copy file
  if (file.mv) {
    await file.mv(filepath);
  } else if (file.path) {
    fs.copyFileSync(file.path, filepath);
    fs.unlinkSync(file.path);
  } else if (file.buffer) {
    fs.writeFileSync(filepath, file.buffer);
  } else {
    throw new Error('Unable to save file');
  }
  
  const uploadDir = getSetting('UPLOAD_DIR', 'uploads');
  return `/${uploadDir}/${subdir}/${filename}`;
}

/**
 * Delete file
 */
function deleteFile(fileUrl) {
  if (!fileUrl) return;
  
  // Convert URL to filepath
  const filepath = path.join(process.cwd(), fileUrl);
  
  if (fs.existsSync(filepath)) {
    fs.unlinkSync(filepath);
  }
}

module.exports = {
  ensureUploadDir,
  generateFilename,
  validateFileType,
  validateFileSize,
  saveBase64File,
  saveMultipartFile,
  deleteFile
};
