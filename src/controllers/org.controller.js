const Organization = require('../models/Organization');
const OrganizationMember = require('../models/OrganizationMember');
const User = require('../models/User');
const emailService = require('../services/email.service');
const { isValidOrgRole, getAllowedOrgRoles, getDefaultOrgRole } = require('../utils/orgRoles');

const generateSlug = (name) => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50) + '-' + Date.now().toString(36);
};

exports.listOrgs = async (req, res) => {
  try {
    const memberships = await OrganizationMember.find({
      userId: req.user._id,
      status: 'active'
    }).populate('orgId');

    const orgs = memberships
      .filter(m => m.orgId && m.orgId.status === 'active')
      .map(m => ({
        ...m.orgId.toJSON(),
        myRole: m.role
      }));

    res.json({ orgs });
  } catch (error) {
    console.error('Error listing orgs:', error);
    res.status(500).json({ error: 'Failed to list organizations' });
  }
};

exports.listPublicOrgs = async (req, res) => {
  try {
    const orgs = await Organization.find({ status: 'active' })
      .select('name slug description allowPublicJoin createdAt')
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      orgs: orgs.map((o) => ({
        _id: o._id,
        name: o.name,
        slug: o.slug,
        description: o.description,
        allowPublicJoin: o.allowPublicJoin,
        createdAt: o.createdAt
      }))
    });
  } catch (error) {
    console.error('Error listing public orgs:', error);
    res.status(500).json({ error: 'Failed to list organizations' });
  }
};

exports.createOrg = async (req, res) => {
  try {
    const { name, description, slug: customSlug, allowPublicJoin } = req.body;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const slug = customSlug || generateSlug(name);

    const existingOrg = await Organization.findOne({ slug });
    if (existingOrg) {
      return res.status(409).json({ error: 'An organization with this slug already exists' });
    }

    const org = await Organization.create({
      name: name.trim(),
      slug,
      description: description?.trim(),
      ownerUserId: req.user._id,
      allowPublicJoin: allowPublicJoin || false
    });

    await OrganizationMember.create({
      orgId: org._id,
      userId: req.user._id,
      role: 'owner',
      addedByUserId: req.user._id
    });

    res.status(201).json({
      message: 'Organization created successfully',
      org: { ...org.toJSON(), myRole: 'owner' }
    });
  } catch (error) {
    console.error('Error creating org:', error);
    res.status(500).json({ error: 'Failed to create organization' });
  }
};

exports.getOrg = async (req, res) => {
  try {
    res.json({ org: { ...req.org.toJSON(), myRole: req.orgMember?.role } });
  } catch (error) {
    console.error('Error getting org:', error);
    res.status(500).json({ error: 'Failed to get organization' });
  }
};

exports.updateOrg = async (req, res) => {
  try {
    const { name, description, allowPublicJoin } = req.body;
    const updates = {};

    if (name !== undefined) updates.name = name.trim();
    if (description !== undefined) updates.description = description?.trim();
    if (allowPublicJoin !== undefined) updates.allowPublicJoin = allowPublicJoin;

    const org = await Organization.findByIdAndUpdate(
      req.org._id,
      updates,
      { new: true, runValidators: true }
    );

    res.json({
      message: 'Organization updated successfully',
      org: { ...org.toJSON(), myRole: req.orgMember.role }
    });
  } catch (error) {
    console.error('Error updating org:', error);
    res.status(500).json({ error: 'Failed to update organization' });
  }
};

exports.deleteOrg = async (req, res) => {
  try {
    await Organization.findByIdAndUpdate(req.org._id, { status: 'disabled' });
    res.json({ message: 'Organization disabled successfully' });
  } catch (error) {
    console.error('Error deleting org:', error);
    res.status(500).json({ error: 'Failed to disable organization' });
  }
};

exports.listMembers = async (req, res) => {
  try {
    const members = await OrganizationMember.find({
      orgId: req.org._id,
      status: 'active'
    }).populate('userId', 'email name');

    res.json({
      members: members.map(m => ({
        _id: m._id,
        userId: m.userId._id,
        email: m.userId.email,
        name: m.userId.name,
        role: m.role,
        createdAt: m.createdAt
      }))
    });
  } catch (error) {
    console.error('Error listing members:', error);
    res.status(500).json({ error: 'Failed to list members' });
  }
};

exports.addMember = async (req, res) => {
  try {
    const defaultRole = await getDefaultOrgRole();
    const { email, role = defaultRole, sendNotification = false } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    if (!(await isValidOrgRole(role))) {
      const allowed = await getAllowedOrgRoles();
      return res.status(400).json({ error: 'Invalid role', allowedRoles: allowed });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({ error: 'User not found. Use invite instead.' });
    }

    const existingMember = await OrganizationMember.findOne({
      orgId: req.org._id,
      userId: user._id
    });

    if (existingMember) {
      if (existingMember.status === 'active') {
        return res.status(409).json({ error: 'User is already a member' });
      }
      existingMember.status = 'active';
      existingMember.role = role;
      existingMember.addedByUserId = req.user._id;
      await existingMember.save();
    } else {
      await OrganizationMember.create({
        orgId: req.org._id,
        userId: user._id,
        role,
        addedByUserId: req.user._id
      });
    }

    if (sendNotification) {
      try {
        await emailService.sendEmail({
          to: user.email,
          subject: `You've been added to ${req.org.name}`,
          html: `<p>Hello${user.name ? ' ' + user.name : ''},</p>
            <p>You have been added to <strong>${req.org.name}</strong> as a ${role}.</p>
            <p>Log in to access the organization.</p>`
        });
      } catch (emailError) {
        console.error('Failed to send notification email:', emailError);
      }
    }

    res.status(201).json({
      message: 'Member added successfully',
      member: { userId: user._id, email: user.email, name: user.name, role }
    });
  } catch (error) {
    console.error('Error adding member:', error);
    res.status(500).json({ error: 'Failed to add member' });
  }
};

exports.updateMemberRole = async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    if (!(await isValidOrgRole(role))) {
      const allowed = await getAllowedOrgRoles();
      return res.status(400).json({ error: 'Invalid role', allowedRoles: allowed });
    }

    const member = await OrganizationMember.findOne({
      orgId: req.org._id,
      userId,
      status: 'active'
    });

    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    if (member.role === 'owner') {
      return res.status(403).json({ error: 'Cannot change owner role' });
    }

    member.role = role;
    await member.save();

    res.json({ message: 'Role updated successfully', member });
  } catch (error) {
    console.error('Error updating member role:', error);
    res.status(500).json({ error: 'Failed to update role' });
  }
};

exports.removeMember = async (req, res) => {
  try {
    const { userId } = req.params;

    const member = await OrganizationMember.findOne({
      orgId: req.org._id,
      userId,
      status: 'active'
    });

    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    if (member.role === 'owner') {
      return res.status(403).json({ error: 'Cannot remove owner' });
    }

    if (userId === req.user._id.toString()) {
      return res.status(400).json({ error: 'Cannot remove yourself' });
    }

    member.status = 'removed';
    await member.save();

    res.json({ message: 'Member removed successfully' });
  } catch (error) {
    console.error('Error removing member:', error);
    res.status(500).json({ error: 'Failed to remove member' });
  }
};

exports.joinOrg = async (req, res) => {
  try {
    if (!req.org.allowPublicJoin) {
      return res.status(403).json({ error: 'This organization does not allow public join' });
    }

    const defaultRole = await getDefaultOrgRole();

    const existingMember = await OrganizationMember.findOne({
      orgId: req.org._id,
      userId: req.user._id
    });

    if (existingMember) {
      if (existingMember.status === 'active') {
        return res.status(409).json({ error: 'You are already a member' });
      }
      existingMember.status = 'active';
      existingMember.role = defaultRole;
      await existingMember.save();
    } else {
      await OrganizationMember.create({
        orgId: req.org._id,
        userId: req.user._id,
        role: defaultRole
      });
    }

    res.status(201).json({
      message: 'Successfully joined organization',
      org: { ...req.org.toJSON(), myRole: defaultRole }
    });
  } catch (error) {
    console.error('Error joining org:', error);
    res.status(500).json({ error: 'Failed to join organization' });
  }
};

exports.getOrgPublic = async (req, res) => {
  try {
    const { orgId } = req.params;
    const org = await Organization.findOne({ _id: orgId, status: 'active' });
    
    if (!org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    res.json({
      org: {
        _id: org._id,
        name: org.name,
        slug: org.slug,
        description: org.description,
        allowPublicJoin: org.allowPublicJoin
      }
    });
  } catch (error) {
    console.error('Error getting public org:', error);
    res.status(500).json({ error: 'Failed to get organization' });
  }
};
