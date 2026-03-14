#!/usr/bin/env node

/**
 * CMS & Content handlers: blog-posts, pages, assets, forms, i18n, markdowns
 */

const mongoose = require('mongoose');

const blogPosts = {
  async execute(options) {
    const BlogPost = mongoose.model('BlogPost');
    switch (options.command) {
      case 'list': {
        const posts = await BlogPost.find().lean();
        return { items: posts, count: posts.length };
      }
      case 'get': {
        if (!options.id) throw new Error('Post ID is required');
        const post = await BlogPost.findById(options.id).lean();
        if (!post) throw new Error('Post not found');
        return post;
      }
      case 'create': {
        if (!options.name) throw new Error('--name (title) is required');
        const post = await BlogPost.create({
          title: options.name,
          content: options.description || '',
          status: 'draft',
        });
        return post;
      }
      case 'update': {
        if (!options.id) throw new Error('Post ID is required');
        const updateData = {};
        if (options.name) updateData.title = options.name;
        if (options.description) updateData.content = options.description;
        const post = await BlogPost.findByIdAndUpdate(options.id, updateData, { new: true });
        if (!post) throw new Error('Post not found');
        return post;
      }
      case 'delete': {
        if (!options.id) throw new Error('Post ID is required');
        const post = await BlogPost.findByIdAndDelete(options.id);
        if (!post) throw new Error('Post not found');
        return { success: true, id: options.id };
      }
      case 'publish': {
        if (!options.id) throw new Error('Post ID is required');
        const post = await BlogPost.findByIdAndUpdate(
          options.id,
          { status: 'published', publishedAt: new Date() },
          { new: true }
        );
        if (!post) throw new Error('Post not found');
        return post;
      }
      case 'unpublish': {
        if (!options.id) throw new Error('Post ID is required');
        const post = await BlogPost.findByIdAndUpdate(options.id, { status: 'draft' }, { new: true });
        if (!post) throw new Error('Post not found');
        return post;
      }
      default:
        throw new Error(`Unknown blog-posts command: ${options.command}`);
    }
  },
};

const pages = {
  async execute(options) {
    const Page = mongoose.model('Page');
    switch (options.command) {
      case 'list': {
        const pages = await Page.find().lean();
        return { items: pages, count: pages.length };
      }
      case 'get': {
        if (!options.id) throw new Error('Page ID is required');
        const page = await Page.findById(options.id).lean();
        if (!page) throw new Error('Page not found');
        return page;
      }
      case 'create': {
        if (!options.name) throw new Error('--name (slug) is required');
        const page = await Page.create({
          slug: options.name,
          title: options.description || options.name,
          content: options.value || '',
        });
        return page;
      }
      case 'update': {
        if (!options.id) throw new Error('Page ID is required');
        const updateData = {};
        if (options.name) updateData.slug = options.name;
        if (options.description) updateData.title = options.description;
        if (options.value) updateData.content = options.value;
        const page = await Page.findByIdAndUpdate(options.id, updateData, { new: true });
        if (!page) throw new Error('Page not found');
        return page;
      }
      case 'delete': {
        if (!options.id) throw new Error('Page ID is required');
        const page = await Page.findByIdAndDelete(options.id);
        if (!page) throw new Error('Page not found');
        return { success: true, id: options.id };
      }
      default:
        throw new Error(`Unknown pages command: ${options.command}`);
    }
  },
};

const assets = {
  async execute(options) {
    const Asset = mongoose.model('Asset');
    switch (options.command) {
      case 'list': {
        const limit = parseInt(options.value) || 50;
        const assets = await Asset.find().sort({ createdAt: -1 }).limit(limit).lean();
        return { items: assets, count: assets.length };
      }
      case 'get': {
        if (!options.id) throw new Error('Asset ID is required');
        const asset = await Asset.findById(options.id).lean();
        if (!asset) throw new Error('Asset not found');
        return asset;
      }
      case 'delete': {
        if (!options.id) throw new Error('Asset ID is required');
        const asset = await Asset.findByIdAndDelete(options.id);
        if (!asset) throw new Error('Asset not found');
        return { success: true, id: options.id };
      }
      case 'clear': {
        await Asset.deleteMany({});
        return { success: true, message: 'All assets cleared' };
      }
      default:
        throw new Error(`Unknown assets command: ${options.command}`);
    }
  },
};

const forms = {
  async execute(options) {
    const FormSubmission = mongoose.model('FormSubmission');
    switch (options.command) {
      case 'list': {
        const limit = parseInt(options.value) || 50;
        const submissions = await FormSubmission.find().sort({ createdAt: -1 }).limit(limit).lean();
        return { items: submissions, count: submissions.length };
      }
      case 'get': {
        if (!options.id) throw new Error('Submission ID is required');
        const submission = await FormSubmission.findById(options.id).lean();
        if (!submission) throw new Error('Submission not found');
        return submission;
      }
      case 'delete': {
        if (!options.id) throw new Error('Submission ID is required');
        const submission = await FormSubmission.findByIdAndDelete(options.id);
        if (!submission) throw new Error('Submission not found');
        return { success: true, id: options.id };
      }
      case 'clear': {
        await FormSubmission.deleteMany({});
        return { success: true, message: 'All form submissions cleared' };
      }
      default:
        throw new Error(`Unknown forms command: ${options.command}`);
    }
  },
};

const i18n = {
  async execute(options) {
    const I18nEntry = mongoose.model('I18nEntry');
    switch (options.command) {
      case 'list': {
        const limit = parseInt(options.value) || 50;
        const entries = await I18nEntry.find().sort({ createdAt: -1 }).limit(limit).lean();
        return { items: entries, count: entries.length };
      }
      case 'get': {
        if (!options.id) throw new Error('I18n entry ID is required');
        const entry = await I18nEntry.findById(options.id).lean();
        if (!entry) throw new Error('I18n entry not found');
        return entry;
      }
      case 'create': {
        if (!options.key) throw new Error('--key is required');
        if (!options.value) throw new Error('--value is required');
        const entry = await I18nEntry.create({
          key: options.key,
          values: { en: options.value },
          locale: 'en',
        });
        return entry;
      }
      case 'delete': {
        if (!options.id) throw new Error('I18n entry ID is required');
        const entry = await I18nEntry.findByIdAndDelete(options.id);
        if (!entry) throw new Error('I18n entry not found');
        return { success: true, id: options.id };
      }
      default:
        throw new Error(`Unknown i18n command: ${options.command}`);
    }
  },
};

const markdowns = {
  async execute(options) {
    const Markdown = mongoose.model('Markdown');
    switch (options.command) {
      case 'list': {
        const markdowns = await Markdown.find().lean();
        return { items: markdowns, count: markdowns.length };
      }
      case 'get': {
        if (!options.id) throw new Error('Markdown ID is required');
        const markdown = await Markdown.findById(options.id).lean();
        if (!markdown) throw new Error('Markdown not found');
        return markdown;
      }
      case 'create': {
        if (!options.name) throw new Error('--name (slug) is required');
        const markdown = await Markdown.create({
          slug: options.name,
          content: options.value || '',
        });
        return markdown;
      }
      case 'delete': {
        if (!options.id) throw new Error('Markdown ID is required');
        const markdown = await Markdown.findByIdAndDelete(options.id);
        if (!markdown) throw new Error('Markdown not found');
        return { success: true, id: options.id };
      }
      default:
        throw new Error(`Unknown markdowns command: ${options.command}`);
    }
  },
};

module.exports = { blogPosts, pages, assets, forms, i18n, markdowns };
