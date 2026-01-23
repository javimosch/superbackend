const mongoose = require('mongoose');

const Organization = require('../models/Organization');
const OrganizationMember = require('../models/OrganizationMember');
const Invite = require('../models/Invite');
const User = require('../models/User');
const Asset = require('../models/Asset');
const Notification = require('../models/Notification');
const emailService = require('../services/email.service');
const { isValidOrgRole, getAllowedOrgRoles, getDefaultOrgRole } = require('../utils/orgRoles');

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;
const DEFAULT_INVITE_EXPIRY_DAYS = 7;

function parseLimit(value) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, parsed));
}

function parseOffset(value) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, parsed);
}

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildInviteLink(token) {
  const base = process.env.PUBLIC_URL || 'http://localhost:3000';
  return `${base}/accept-invite?token=${encodeURIComponent(token)}`;
}

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

exports.listMembers = async (req, res) => {
  try {
    const { orgId } = req.params;
    const { role, status, email, limit, offset } = req.query;

    if (!orgId || !mongoose.Types.ObjectId.isValid(String(orgId))) {
      return res.status(400).json({ error: 'Invalid organization ID' });
    }

    const parsedLimit = parseLimit(limit);
    const parsedOffset = parseOffset(offset);

    const match = {
      orgId: new mongoose.Types.ObjectId(String(orgId)),
    };
    if (role) match.role = String(role);
    if (status) match.status = String(status);

    const emailFilter = email ? String(email).trim().toLowerCase() : '';

    const basePipeline = [
      { $match: match },
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'user',
        },
      },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: false } },
    ];

    const filterPipeline = emailFilter
      ? [...basePipeline, { $match: { 'user.email': emailFilter } }]
      : basePipeline;

    const itemsPipeline = [
      ...filterPipeline,
      { $sort: { createdAt: -1 } },
      { $skip: parsedOffset },
      { $limit: parsedLimit },
      {
        $project: {
          _id: 1,
          orgId: 1,
          userId: 1,
          role: 1,
          status: 1,
          addedByUserId: 1,
          createdAt: 1,
          updatedAt: 1,
          user: {
            _id: '$user._id',
            email: '$user.email',
            name: '$user.name',
          },
        },
      },
    ];

    const totalPipeline = [...filterPipeline, { $count: 'total' }];

    const [members, totalAgg] = await Promise.all([
      OrganizationMember.aggregate(itemsPipeline),
      OrganizationMember.aggregate(totalPipeline),
    ]);

    const total = totalAgg?.[0]?.total || 0;

    return res.json({
      members,
      pagination: {
        total,
        limit: parsedLimit,
        offset: parsedOffset,
      },
    });
  } catch (error) {
    console.error('Admin org members list error:', error);
    return res.status(500).json({ error: 'Failed to list organization members' });
  }
};

exports.updateMember = async (req, res) => {
  try {
    const { orgId, memberId } = req.params;
    const { role, status } = req.body;

    if (!orgId || !mongoose.Types.ObjectId.isValid(String(orgId))) {
      return res.status(400).json({ error: 'Invalid organization ID' });
    }
    if (!memberId || !mongoose.Types.ObjectId.isValid(String(memberId))) {
      return res.status(400).json({ error: 'Invalid member ID' });
    }

    const member = await OrganizationMember.findOne({ _id: memberId, orgId });
    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    if (role !== undefined) {
      const nextRole = String(role);
      if (!(await isValidOrgRole(nextRole))) {
        const allowed = await getAllowedOrgRoles();
        return res.status(400).json({ error: 'Invalid role', allowedRoles: allowed });
      }
      if (member.role === 'owner' && nextRole !== 'owner') {
        return res.status(403).json({ error: 'Cannot change owner role' });
      }
      member.role = nextRole;
    }

    if (status !== undefined) {
      if (!['active', 'removed'].includes(String(status))) {
        return res.status(400).json({ error: 'Invalid status' });
      }
      member.status = String(status);
    }

    await member.save();

    return res.json({ member: member.toObject() });
  } catch (error) {
    console.error('Admin org member update error:', error);
    return res.status(500).json({ error: 'Failed to update member' });
  }
};

exports.removeMember = async (req, res) => {
  try {
    const { orgId, memberId } = req.params;

    if (!orgId || !mongoose.Types.ObjectId.isValid(String(orgId))) {
      return res.status(400).json({ error: 'Invalid organization ID' });
    }
    if (!memberId || !mongoose.Types.ObjectId.isValid(String(memberId))) {
      return res.status(400).json({ error: 'Invalid member ID' });
    }

    const member = await OrganizationMember.findOne({ _id: memberId, orgId, status: 'active' });
    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    if (member.role === 'owner') {
      return res.status(403).json({ error: 'Cannot remove owner' });
    }

    member.status = 'removed';
    await member.save();

    return res.json({ message: 'Member removed successfully' });
  } catch (error) {
    console.error('Admin org member remove error:', error);
    return res.status(500).json({ error: 'Failed to remove member' });
  }
};

exports.listInvites = async (req, res) => {
  try {
    const { orgId } = req.params;
    const { status, email, limit, offset } = req.query;

    if (!orgId || !mongoose.Types.ObjectId.isValid(String(orgId))) {
      return res.status(400).json({ error: 'Invalid organization ID' });
    }

    const parsedLimit = parseLimit(limit);
    const parsedOffset = parseOffset(offset);

    const query = { orgId: new mongoose.Types.ObjectId(String(orgId)) };
    if (status) query.status = String(status);
    if (email) query.email = String(email).trim().toLowerCase();

    const invites = await Invite.find(query)
      .sort({ createdAt: -1 })
      .limit(parsedLimit)
      .skip(parsedOffset)
      .select('-tokenHash')
      .lean();

    const total = await Invite.countDocuments(query);

    return res.json({
      invites,
      pagination: {
        total,
        limit: parsedLimit,
        offset: parsedOffset,
      },
    });
  } catch (error) {
    console.error('Admin org invites list error:', error);
    return res.status(500).json({ error: 'Failed to list invites' });
  }
};

exports.createInvite = async (req, res) => {
  try {
    const { orgId } = req.params;
    const defaultRole = await getDefaultOrgRole();
    const { email, role = defaultRole, expiresInDays } = req.body;

    if (!orgId || !mongoose.Types.ObjectId.isValid(String(orgId))) {
      return res.status(400).json({ error: 'Invalid organization ID' });
    }
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const nextRole = String(role);
    if (!(await isValidOrgRole(nextRole))) {
      const allowed = await getAllowedOrgRoles();
      return res.status(400).json({ error: 'Invalid role', allowedRoles: allowed });
    }

    const org = await Organization.findById(orgId).lean();
    if (!org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const normalizedEmail = String(email).toLowerCase().trim();

    const existingPending = await Invite.findOne({
      orgId: org._id,
      email: normalizedEmail,
      status: 'pending',
    }).lean();
    if (existingPending) {
      return res.status(409).json({ error: 'Invite already pending for this email' });
    }

    const expiresDaysParsed = Math.max(
      1,
      Math.min(365, parseInt(expiresInDays, 10) || DEFAULT_INVITE_EXPIRY_DAYS),
    );

    const { token, tokenHash } = Invite.generateToken();
    const expiresAt = new Date(Date.now() + expiresDaysParsed * 24 * 60 * 60 * 1000);

    const invite = await Invite.create({
      email: normalizedEmail,
      tokenHash,
      expiresAt,
      status: 'pending',
      createdByUserId: org.ownerUserId,
      orgId: org._id,
      role: nextRole,
    });

    const inviteLink = buildInviteLink(token);

    try {
      await emailService.sendEmail({
        to: normalizedEmail,
        subject: `You're invited to join ${org.name}`,
        html: `<p>You've been invited to join <strong>${org.name}</strong> as a ${nextRole}.</p>
          <p><a href="${inviteLink}">Click here to accept the invitation</a></p>
          <p>This invite expires in ${expiresDaysParsed} days.</p>
          <p>If you didn't expect this invitation, you can ignore this email.</p>`,
        type: 'invite',
      });
    } catch (emailError) {
      console.error('Failed to send invite email (admin):', emailError);
    }

    return res.status(201).json({
      message: 'Invite created successfully',
      invite: {
        _id: invite._id,
        email: invite.email,
        role: invite.role,
        status: invite.status,
        expiresAt: invite.expiresAt,
        createdAt: invite.createdAt,
      },
    });
  } catch (error) {
    console.error('Admin org invite create error:', error);
    return res.status(500).json({ error: 'Failed to create invite' });
  }
};

exports.revokeInvite = async (req, res) => {
  try {
    const { orgId, inviteId } = req.params;

    if (!orgId || !mongoose.Types.ObjectId.isValid(String(orgId))) {
      return res.status(400).json({ error: 'Invalid organization ID' });
    }
    if (!inviteId || !mongoose.Types.ObjectId.isValid(String(inviteId))) {
      return res.status(400).json({ error: 'Invalid invite ID' });
    }

    const invite = await Invite.findOne({ _id: inviteId, orgId, status: 'pending' });
    if (!invite) {
      return res.status(404).json({ error: 'Invite not found' });
    }

    invite.status = 'revoked';
    await invite.save();

    return res.json({ message: 'Invite revoked successfully' });
  } catch (error) {
    console.error('Admin org invite revoke error:', error);
    return res.status(500).json({ error: 'Failed to revoke invite' });
  }
};

exports.resendInvite = async (req, res) => {
  try {
    const { orgId, inviteId } = req.params;
    const { expiresInDays } = req.body || {};

    if (!orgId || !mongoose.Types.ObjectId.isValid(String(orgId))) {
      return res.status(400).json({ error: 'Invalid organization ID' });
    }
    if (!inviteId || !mongoose.Types.ObjectId.isValid(String(inviteId))) {
      return res.status(400).json({ error: 'Invalid invite ID' });
    }

    const org = await Organization.findById(orgId).lean();
    if (!org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const invite = await Invite.findOne({ _id: inviteId, orgId, status: 'pending' });
    if (!invite) {
      return res.status(404).json({ error: 'Invite not found' });
    }

    if (invite.expiresAt < new Date()) {
      invite.status = 'expired';
      await invite.save();
      return res.status(400).json({ error: 'Invite has expired' });
    }

    const expiresDaysParsed = Math.max(
      1,
      Math.min(365, parseInt(expiresInDays, 10) || DEFAULT_INVITE_EXPIRY_DAYS),
    );

    const { token, tokenHash } = Invite.generateToken();
    invite.tokenHash = tokenHash;
    invite.expiresAt = new Date(Date.now() + expiresDaysParsed * 24 * 60 * 60 * 1000);
    await invite.save();

    const inviteLink = buildInviteLink(token);

    try {
      await emailService.sendEmail({
        to: invite.email,
        subject: `You're invited to join ${org.name}`,
        html: `<p>You've been invited to join <strong>${org.name}</strong> as a ${invite.role}.</p>
          <p><a href="${inviteLink}">Click here to accept the invitation</a></p>
          <p>This invite expires in ${expiresDaysParsed} days.</p>
          <p>If you didn't expect this invitation, you can ignore this email.</p>`,
        type: 'invite',
      });
    } catch (emailError) {
      console.error('Failed to resend invite email (admin):', emailError);
    }

    return res.json({
      message: 'Invite resent successfully',
      invite: {
        _id: invite._id,
        email: invite.email,
        role: invite.role,
        status: invite.status,
        expiresAt: invite.expiresAt,
        createdAt: invite.createdAt,
        updatedAt: invite.updatedAt,
      },
    });
  } catch (error) {
    console.error('Admin org invite resend error:', error);
    return res.status(500).json({ error: 'Failed to resend invite' });
  }
};

// Create organization (admin only)
exports.createOrganization = async (req, res) => {
  try {
    const { name, description, ownerUserId } = req.body;
    
    // Validation
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return res.status(400).json({ error: 'Name must be at least 2 characters long' });
    }
    
    if (name.trim().length > 100) {
      return res.status(400).json({ error: 'Name must be less than 100 characters' });
    }
    
    if (description && description.trim().length > 500) {
      return res.status(400).json({ error: 'Description must be less than 500 characters' });
    }
    
    // Validate owner if specified
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
      // Default to first admin user if no owner specified
      const defaultOwner = await User.findOne({ role: 'admin' });
      if (!defaultOwner) {
        return res.status(400).json({ error: 'No admin user available to assign as owner' });
      }
      ownerId = defaultOwner._id;
    }
    
    // Generate unique slug
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
    
    // Create organization
    const org = await Organization.create({
      name: name.trim(),
      slug,
      description: description ? description.trim() : '',
      ownerUserId: ownerId,
      status: 'active',
      settings: {}
    });
    
    console.log(`Admin created organization: ${org.name} (${org._id}) with owner: ${ownerId}`);
    
    res.status(201).json({ 
      message: 'Organization created successfully',
      org: org.toObject() 
    });
  } catch (error) {
    console.error('Create organization error:', error);
    if (error.code === 11000) {
      // Duplicate key error
      return res.status(400).json({ error: 'Organization with this name or slug already exists' });
    }
    return res.status(500).json({ error: 'Failed to create organization' });
  }
};

// Update organization (admin only)
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
    
    // Update name (but not slug - per requirements)
    if (name !== undefined) {
      if (!name || typeof name !== 'string' || name.trim().length < 2) {
        return res.status(400).json({ error: 'Name must be at least 2 characters long' });
      }
      if (name.trim().length > 100) {
        return res.status(400).json({ error: 'Name must be less than 100 characters' });
      }
      org.name = name.trim();
    }
    
    // Update description
    if (description !== undefined) {
      if (description && description.trim().length > 500) {
        return res.status(400).json({ error: 'Description must be less than 500 characters' });
      }
      org.description = description ? description.trim() : '';
    }
    
    // Update owner
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
    
    // Update status
    if (status !== undefined) {
      if (!['active', 'disabled'].includes(status)) {
        return res.status(400).json({ error: 'Status must be either "active" or "disabled"' });
      }
      org.status = status;
    }
    
    await org.save();
    
    console.log(`Admin updated organization: ${org.name} (${org._id})`);
    
    res.json({ 
      message: 'Organization updated successfully',
      org: org.toObject() 
    });
  } catch (error) {
    console.error('Update organization error:', error);
    return res.status(500).json({ error: 'Failed to update organization' });
  }
};

// Disable organization (admin only)
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
    
    console.log(`Admin disabled organization: ${org.name} (${org._id})`);
    
    res.json({ 
      message: 'Organization disabled successfully',
      org: org.toObject() 
    });
  } catch (error) {
    console.error('Disable organization error:', error);
    return res.status(500).json({ error: 'Failed to disable organization' });
  }
};

// Enable organization (admin only)
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
    
    console.log(`Admin enabled organization: ${org.name} (${org._id})`);
    
    res.json({ 
      message: 'Organization enabled successfully',
      org: org.toObject() 
    });
  } catch (error) {
    console.error('Enable organization error:', error);
    return res.status(500).json({ error: 'Failed to enable organization' });
  }
};

// Delete organization (admin only)
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
    
    // Cascade cleanup
    await cleanupOrganizationData(orgId);
    
    // Delete organization
    await Organization.findByIdAndDelete(orgId);
    
    console.log(`Admin deleted organization: ${org.name} (${org._id})`);
    
    res.json({ message: 'Organization deleted successfully' });
  } catch (error) {
    console.error('Delete organization error:', error);
    return res.status(500).json({ error: 'Failed to delete organization' });
  }
};

// Helper function to clean up organization data
async function cleanupOrganizationData(orgId) {
  try {
    // Delete organization members
    await OrganizationMember.deleteMany({ orgId });
    
    // Delete organization invites
    await Invite.deleteMany({ orgId });
    
    // Delete organization assets
    await Asset.deleteMany({ ownerUserId: { $in: await getOrganizationUserIds(orgId) } });
    
    // Delete organization notifications
    await Notification.deleteMany({ userId: { $in: await getOrganizationUserIds(orgId) } });
    
    console.log(`Completed cleanup for organization ${orgId}`);
  } catch (error) {
    console.error('Error during organization cleanup:', error);
    throw error;
  }
}

// Helper function to get all user IDs in an organization
async function getOrganizationUserIds(orgId) {
  const members = await OrganizationMember.find({ orgId }).distinct('userId');
  return members;
}
