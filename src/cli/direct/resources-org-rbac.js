#!/usr/bin/env node

/**
 * Organization & RBAC handlers: orgs, rbac-roles, rbac-groups, invites, org-members
 */

const mongoose = require("mongoose");

const orgs = {
  async execute(options) {
    const Organization = mongoose.model("Organization");
    switch (options.command) {
      case "list": {
        const orgs = await Organization.find().lean();
        return { items: orgs, count: orgs.length };
      }
      case "get": {
        if (!options.id) throw new Error("Org ID is required");
        const org = await Organization.findById(options.id).lean();
        if (!org) throw new Error("Org not found");
        return org;
      }
      case "create": {
        if (!options.name) throw new Error("--name is required");
        const org = await Organization.create({
          name: options.name,
          description: options.description || "",
        });
        return org;
      }
      case "update": {
        if (!options.id) throw new Error("Org ID is required");
        const updateData = {};
        if (options.name) updateData.name = options.name;
        if (options.description) updateData.description = options.description;
        const org = await Org.findByIdAndUpdate(options.id, updateData, {
          new: true,
        });
        if (!org) throw new Error("Org not found");
        return org;
      }
      case "delete": {
        if (!options.id) throw new Error("Org ID is required");
        const org = await Org.findByIdAndDelete(options.id);
        if (!org) throw new Error("Org not found");
        return { success: true, id: options.id };
      }
      default:
        throw new Error(`Unknown orgs command: ${options.command}`);
    }
  },
};

const rbacRoles = {
  async execute(options) {
    const RbacRole = mongoose.model("RbacRole");
    switch (options.command) {
      case "list": {
        const roles = await RbacRole.find().lean();
        return { items: roles, count: roles.length };
      }
      case "get": {
        if (!options.id) throw new Error("Role ID is required");
        const role = await RbacRole.findById(options.id).lean();
        if (!role) throw new Error("Role not found");
        return role;
      }
      case "create": {
        if (!options.name) throw new Error("--name is required");
        const role = await RbacRole.create({
          name: options.name,
          description: options.description || "",
        });
        return role;
      }
      case "delete": {
        if (!options.id) throw new Error("Role ID is required");
        const role = await RbacRole.findByIdAndDelete(options.id);
        if (!role) throw new Error("Role not found");
        return { success: true, id: options.id };
      }
      default:
        throw new Error(`Unknown rbac-roles command: ${options.command}`);
    }
  },
};

const rbacGroups = {
  async execute(options) {
    const RbacGroup = mongoose.model("RbacGroup");
    switch (options.command) {
      case "list": {
        const groups = await RbacGroup.find().lean();
        return { items: groups, count: groups.length };
      }
      case "get": {
        if (!options.id) throw new Error("Group ID is required");
        const group = await RbacGroup.findById(options.id).lean();
        if (!group) throw new Error("Group not found");
        return group;
      }
      case "create": {
        if (!options.name) throw new Error("--name is required");
        const group = await RbacGroup.create({
          name: options.name,
          description: options.description || "",
        });
        return group;
      }
      case "delete": {
        if (!options.id) throw new Error("Group ID is required");
        const group = await RbacGroup.findByIdAndDelete(options.id);
        if (!group) throw new Error("Group not found");
        return { success: true, id: options.id };
      }
      default:
        throw new Error(`Unknown rbac-groups command: ${options.command}`);
    }
  },
};

const invites = {
  async execute(options) {
    const Invite = mongoose.model("Invite");
    switch (options.command) {
      case "list": {
        const limit = parseInt(options.value) || 50;
        const invites = await Invite.find()
          .sort({ createdAt: -1 })
          .limit(limit)
          .lean();
        return { items: invites, count: invites.length };
      }
      case "get": {
        if (!options.id) throw new Error("Invite ID is required");
        const invite = await Invite.findById(options.id).lean();
        if (!invite) throw new Error("Invite not found");
        return invite;
      }
      case "create": {
        if (!options.email) throw new Error("--email is required");
        const invite = await Invite.create({
          email: options.email,
          role: options.role || "user",
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        });
        return invite;
      }
      case "delete": {
        if (!options.id) throw new Error("Invite ID is required");
        const invite = await Invite.findByIdAndDelete(options.id);
        if (!invite) throw new Error("Invite not found");
        return { success: true, id: options.id };
      }
      case "clear": {
        await Invite.deleteMany({ used: true });
        return { success: true, message: "Cleared used invites" };
      }
      default:
        throw new Error(`Unknown invites command: ${options.command}`);
    }
  },
};

const orgMembers = {
  async execute(options) {
    const OrganizationMember = mongoose.model("OrganizationMember");
    switch (options.command) {
      case "list": {
        const members = await OrganizationMember.find()
          .populate("userId")
          .lean();
        return { items: members, count: members.length };
      }
      case "delete": {
        if (!options.id) throw new Error("Member ID is required");
        const member = await OrganizationMember.findByIdAndDelete(options.id);
        if (!member) throw new Error("Member not found");
        return { success: true, id: options.id };
      }
      default:
        throw new Error(`Unknown org-members command: ${options.command}`);
    }
  },
};

module.exports = { orgs, rbacRoles, rbacGroups, invites, orgMembers };
