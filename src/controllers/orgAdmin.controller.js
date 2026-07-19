const mongoose = require('mongoose');

const Organization = require('../models/Organization');
const OrganizationMember = require('../models/OrganizationMember');
const Invite = require('../models/Invite');
const User = require('../models/User');
const Asset = require('../models/Asset');
const Notification = require('../models/Notification');

exports.listOrgs = async (req, res) => {
  try {
    const { status, ownerUserId, slug, q, limit, offset } = req.query;

    const parsedLimit = parseLimit(limit);
    const parsedOffset = parseOffset(offset);

    const query = {};
    if (status) query.status = String(status);
    if (slug) query.slug = String(slug).toLowerCase().trim();

    if (ownerUserId && mongoose.Types.ObjectId.isValid(String(ownerUserId))) {
      query.ownerUserId = new mongoose.Types.ObjectId(String(ownerUserId));
    }

    if (q) {
      const pattern = escapeRegex(String(q).trim());
      query.$or = [
        { name: { $regex: pattern, $options: 'i' } },
        { slug: { $regex: pattern, $options: 'i' } },
      ];
    }

    const orgs = await Organization.find(query)
      .sort({ createdAt: -1 })
      .limit(parsedLimit)
      .skip(parsedOffset)
      .lean();

    const total = await Organization.countDocuments(query);

    return res.json({
      orgs,
      pagination: {
        total,
        limit: parsedLimit,
        offset: parsedOffset,
      },
    });
  } catch (error) {
    console.error('Admin org list error:', error);
    return res.status(500).json({ error: 'Failed to list organizations' });
  }
};

exports.getOrg = async (req, res) => {
  try {
    const { orgId } = req.params;
    if (!orgId || !mongoose.Types.ObjectId.isValid(String(orgId))) {
      return res.status(400).json({ error: 'Invalid organization ID' });
    }

    const org = await Organization.findById(orgId).lean();
    if (!org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const [memberCount, invitePendingCount, inviteCount] = await Promise.all([
      OrganizationMember.countDocuments({ orgId: org._id, status: 'active' }),
      Invite.countDocuments({ orgId: org._id, status: 'pending' }),
      Invite.countDocuments({ orgId: org._id }),
    ]);

    return res.json({
      org,
      counts: {
        membersActive: memberCount,
        invitesPending: invitePendingCount,
        invitesTotal: inviteCount,
      },
    });
  } catch (error) {
    console.error('Admin org get error:', error);
    return res.status(500).json({ error: 'Failed to load organization' });
  }
};

exports.createOrganization = async (req, res) => {
  try {
    const { name, description, ownerUserId } = req.body;
    
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return res.status(400).json({ error: 'Name must be at least 2 characters long' });
    }
    
    if (name.trim().length > 100) {
      return res.status(400).json({ error: 'Name must be less than 100 characters' });
    }
    
    if (description && description.trim().length > 500) {
      return res.status(400).json({ error: 'Description must be less than 500 characters' });
    }
    
    let ownerId = null;
    if (ownerUserId) {
      if (!mongoose.Types.ObjectId.isValid(String(ownerUserId))) {
        return res.status(400).json({ error: 'Invalid owner user ID' });
      }
      
      const owner = await User.findById(ownerUserId);
      if (!owner) {
        return res.status(400).json({ error: 'Owner user not found' });
      }
      ownerId = owner._id;
    } else {
      const defaultOwner = await User.findOne({ role: 'admin' });
      if (!defaultOwner) {
        return res.status(400).json({ error: 'No admin user available to assign as owner' });
      }
      ownerId = defaultOwner._id;
    }
    
    let baseSlug = name.trim()
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    
    if (!baseSlug || baseSlug.length < 2) {
      return res.status(400).json({ error: 'Name must contain valid characters for slug generation' });
    }
    
    let slug = baseSlug;
    let counter = 1;
    
    while (await Organization.findOne({ slug })) {
      slug = `${baseSlug}-${counter}`;
      counter++;
      if (counter > 1000) {
        return res.status(500).json({ error: 'Unable to generate unique slug' });
      }
    }
    
    const org = await Organization.create({
      name: name.trim(),
      slug,
      description: description ? description.trim() : '',
      ownerUserId: ownerId,
      status: 'active',
      settings: {}
    });
    
    res.status(201).json({ 
      message: 'Organization created successfully',
      org: org.toObject() 
    });
  } catch (error) {
    console.error('Create organization error:', error);
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Organization with this name or slug already exists' });
    }
    return res.status(500).json({ error: 'Failed to create organization' });
  }
};

exports.updateOrganization = async (req, res) => {
  try {
    const { orgId } = req.params;
    const { name, description, ownerUserId, status } = req.body;
    
    if (!orgId || !mongoose.Types.ObjectId.isValid(String(orgId))) {
      return res.status(400).json({ error: 'Invalid organization ID' });
    }
    
    const org = await Organization.findById(orgId);
    if (!org) {
      return res.status(404).json({ error: 'Organization not found' });
    }
    
    if (name !== undefined) {
      if (!name || typeof name !== 'string' || name.trim().length < 2) {
        return res.status(400).json({ error: 'Name must be at least 2 characters long' });
      }
      if (name.trim().length > 100) {
        return res.status(400).json({ error: 'Name must be less than 100 characters' });
      }
      org.name = name.trim();
    }
    
    if (description !== undefined) {
      if (description && description.trim().length > 500) {
        return res.status(400).json({ error: 'Description must be less than 500 characters' });
      }
      org.description = description ? description.trim() : '';
    }
    
    if (ownerUserId !== undefined) {
      if (ownerUserId) {
        if (!mongoose.Types.ObjectId.isValid(String(ownerUserId))) {
          return res.status(400).json({ error: 'Invalid owner user ID' });
        }
        const owner = await User.findById(ownerUserId);
        if (!owner) {
          return res.status(400).json({ error: 'Owner user not found' });
        }
        org.ownerUserId = owner._id;
      } else {
        return res.status(400).json({ error: 'Owner cannot be empty' });
      }
    }
    
    if (status !== undefined) {
      if (!['active', 'disabled'].includes(status)) {
        return res.status(400).json({ error: 'Status must be either "active" or "disabled"' });
      }
      org.status = status;
    }
    
    await org.save();
    
    res.json({ 
      message: 'Organization updated successfully',
      org: org.toObject() 
    });
  } catch (error) {
    console.error('Update organization error:', error);
    return res.status(500).json({ error: 'Failed to update organization' });
  }
};

exports.disableOrganization = async (req, res) => {
  try {
    const { orgId } = req.params;
    
    if (!orgId || !mongoose.Types.ObjectId.isValid(String(orgId))) {
      return res.status(400).json({ error: 'Invalid organization ID' });
    }
    
    const org = await Organization.findById(orgId);
    if (!org) {
      return res.status(404).json({ error: 'Organization not found' });
    }
    
    if (org.status === 'disabled') {
      return res.status(400).json({ error: 'Organization is already disabled' });
    }
    
    org.status = 'disabled';
    await org.save();
    
    res.json({ 
      message: 'Organization disabled successfully',
      org: org.toObject() 
    });
  } catch (error) {
    console.error('Disable organization error:', error);
    return res.status(500).json({ error: 'Failed to disable organization' });
  }
};

exports.enableOrganization = async (req, res) => {
  try {
    const { orgId } = req.params;
    
    if (!orgId || !mongoose.Types.ObjectId.isValid(String(orgId))) {
      return res.status(400).json({ error: 'Invalid organization ID' });
    }
    
    const org = await Organization.findById(orgId);
    if (!org) {
      return res.status(404).json({ error: 'Organization not found' });
    }
    
    if (org.status === 'active') {
      return res.status(400).json({ error: 'Organization is already active' });
    }
    
    org.status = 'active';
    await org.save();
    
    res.json({ 
      message: 'Organization enabled successfully',
      org: org.toObject() 
    });
  } catch (error) {
    console.error('Enable organization error:', error);
    return res.status(500).json({ error: 'Failed to enable organization' });
  }
};

exports.deleteOrganization = async (req, res) => {
  try {
    const { orgId } = req.params;
    
    if (!orgId || !mongoose.Types.ObjectId.isValid(String(orgId))) {
      return res.status(400).json({ error: 'Invalid organization ID' });
    }
    
    const org = await Organization.findById(orgId);
    if (!org) {
      return res.status(404).json({ error: 'Organization not found' });
    }
    
    await cleanupOrganizationData(orgId);
    await Organization.findByIdAndDelete(orgId);
    
    res.json({ message: 'Organization deleted successfully' });
  } catch (error) {
    console.error('Delete organization error:', error);
    return res.status(500).json({ error: 'Failed to delete organization' });
  }
};

async function cleanupOrganizationData(orgId) {
  try {
    await OrganizationMember.deleteMany({ orgId });
    await Invite.deleteMany({ orgId });
    await Asset.deleteMany({ ownerUserId: { $in: await getOrganizationUserIds(orgId) } });
    await Notification.deleteMany({ userId: { $in: await getOrganizationUserIds(orgId) } });
    
  } catch (error) {
    console.error('Error during organization cleanup:', error);
    throw error;
  }
}

async function getOrganizationUserIds(orgId) {
  const members = await OrganizationMember.find({ orgId }).distinct('userId');
  return members;
}

function parseLimit(value) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 50;
  return Math.min(500, Math.max(1, parsed));
}

function parseOffset(value) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, parsed);
}

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const membersController = require('./orgAdminMembers.controller');
Object.assign(exports, membersController);
