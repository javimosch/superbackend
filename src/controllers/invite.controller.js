const Invite = require('../models/Invite');
const Organization = require('../models/Organization');
const OrganizationMember = require('../models/OrganizationMember');
const User = require('../models/User');
const emailService = require('../services/email.service');
const bcrypt = require('bcryptjs');
const { isValidOrgRole, getAllowedOrgRoles, getDefaultOrgRole } = require('../utils/orgRoles');

const INVITE_EXPIRY_DAYS = 7;

exports.createInvite = async (req, res) => {
  try {
    const defaultRole = await getDefaultOrgRole();
    const { email, role = defaultRole } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    if (!(await isValidOrgRole(role))) {
      const allowed = await getAllowedOrgRoles();
      return res.status(400).json({ error: 'Invalid role', allowedRoles: allowed });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      const existingMember = await OrganizationMember.findOne({
        orgId: req.org._id,
        userId: existingUser._id,
        status: 'active'
      });
      if (existingMember) {
        return res.status(409).json({ error: 'User is already a member' });
      }
    }

    const existingInvite = await Invite.findOne({
      email: normalizedEmail,
      orgId: req.org._id,
      status: 'pending'
    });
    if (existingInvite) {
      return res.status(409).json({ error: 'Invite already pending for this email' });
    }

    const { token, tokenHash } = Invite.generateToken();
    const expiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    const invite = await Invite.create({
      email: normalizedEmail,
      tokenHash,
      expiresAt,
      createdByUserId: req.user._id,
      orgId: req.org._id,
      role
    });

    const inviteLink = `${process.env.PUBLIC_URL || 'http://localhost:3000'}/accept-invite?token=${token}`;

    try {
      await emailService.sendEmail({
        to: normalizedEmail,
        subject: `You're invited to join ${req.org.name}`,
        html: `<p>You've been invited to join <strong>${req.org.name}</strong> as a ${role}.</p>
          <p><a href="${inviteLink}">Click here to accept the invitation</a></p>
          <p>This invite expires in ${INVITE_EXPIRY_DAYS} days.</p>
          <p>If you didn't expect this invitation, you can ignore this email.</p>`
      });
    } catch (emailError) {
      console.error('Failed to send invite email:', emailError);
    }

    res.status(201).json({
      message: 'Invite created successfully',
      invite: {
        _id: invite._id,
        email: invite.email,
        role: invite.role,
        expiresAt: invite.expiresAt,
        createdAt: invite.createdAt
      }
    });
  } catch (error) {
    console.error('Error creating invite:', error);
    res.status(500).json({ error: 'Failed to create invite' });
  }
};

exports.listInvites = async (req, res) => {
  try {
    const invites = await Invite.find({
      orgId: req.org._id,
      status: 'pending'
    }).select('-tokenHash');

    res.json({ invites });
  } catch (error) {
    console.error('Error listing invites:', error);
    res.status(500).json({ error: 'Failed to list invites' });
  }
};

exports.revokeInvite = async (req, res) => {
  try {
    const { inviteId } = req.params;

    const invite = await Invite.findOne({
      _id: inviteId,
      orgId: req.org._id,
      status: 'pending'
    });

    if (!invite) {
      return res.status(404).json({ error: 'Invite not found' });
    }

    invite.status = 'revoked';
    await invite.save();

    res.json({ message: 'Invite revoked successfully' });
  } catch (error) {
    console.error('Error revoking invite:', error);
    res.status(500).json({ error: 'Failed to revoke invite' });
  }
};

exports.acceptInvite = async (req, res) => {
  try {
    const { token, name, password } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    const tokenHash = Invite.hashToken(token);
    const invite = await Invite.findOne({ tokenHash }).populate('orgId');

    if (!invite) {
      return res.status(404).json({ error: 'Invalid invite token' });
    }

    if (invite.status !== 'pending') {
      return res.status(400).json({ error: `Invite has been ${invite.status}` });
    }

    if (invite.expiresAt < new Date()) {
      invite.status = 'expired';
      await invite.save();
      return res.status(400).json({ error: 'Invite has expired' });
    }

    let user = await User.findOne({ email: invite.email });

    if (!user) {
      if (!password || password.length < 6) {
        return res.status(400).json({ error: 'Password required (min 6 characters) for new account' });
      }

      user = await User.create({
        email: invite.email,
        passwordHash: password,
        name: name?.trim()
      });
    }

    const existingMember = await OrganizationMember.findOne({
      orgId: invite.orgId._id,
      userId: user._id
    });

    if (existingMember) {
      if (existingMember.status === 'active') {
        invite.status = 'accepted';
        await invite.save();
        return res.status(409).json({ error: 'Already a member of this organization' });
      }
      existingMember.status = 'active';
      existingMember.role = invite.role;
      await existingMember.save();
    } else {
      await OrganizationMember.create({
        orgId: invite.orgId._id,
        userId: user._id,
        role: invite.role
      });
    }

    invite.status = 'accepted';
    await invite.save();

    res.json({
      message: 'Invite accepted successfully',
      org: {
        _id: invite.orgId._id,
        name: invite.orgId.name,
        slug: invite.orgId.slug
      },
      isNewUser: !user.createdAt || (new Date() - user.createdAt) < 5000
    });
  } catch (error) {
    console.error('Error accepting invite:', error);
    res.status(500).json({ error: 'Failed to accept invite' });
  }
};

exports.getInviteInfo = async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    const tokenHash = Invite.hashToken(token);
    const invite = await Invite.findOne({ tokenHash }).populate('orgId', 'name slug');

    if (!invite) {
      return res.status(404).json({ error: 'Invalid invite token' });
    }

    if (invite.status !== 'pending') {
      return res.status(400).json({ error: `Invite has been ${invite.status}` });
    }

    if (invite.expiresAt < new Date()) {
      return res.status(400).json({ error: 'Invite has expired' });
    }

    const existingUser = await User.findOne({ email: invite.email });

    res.json({
      invite: {
        email: invite.email,
        role: invite.role,
        expiresAt: invite.expiresAt,
        org: {
          name: invite.orgId.name,
          slug: invite.orgId.slug
        }
      },
      userExists: !!existingUser
    });
  } catch (error) {
    console.error('Error getting invite info:', error);
    res.status(500).json({ error: 'Failed to get invite info' });
  }
};
