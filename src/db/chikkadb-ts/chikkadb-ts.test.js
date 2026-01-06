const path = require('path');
const fs = require('fs');
const { ChikkaDB, Schema } = require('./index');

describe('ChikkaDB SQLite Integration', () => {
  let chikkadb;
  const testDbPath = path.join(__dirname, '../../data/test.db');

  beforeAll(async () => {
    // Clean up test db
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    // Initialize ChikkaDB
    chikkadb = await ChikkaDB.init({
      dbPath: testDbPath,
      dataDir: path.join(__dirname, '../../data')
    });
  });

  afterAll(async () => {
    await chikkadb.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  test('should create and query documents', async () => {
    const userSchema = new Schema({
      email: { type: String, required: true, unique: true },
      name: { type: String },
      age: { type: Number }
    }, { timestamps: true });

    const User = chikkadb.model('User', userSchema);

    // Create
    const user = await User.create({
      email: 'test@example.com',
      name: 'Test User',
      age: 30
    });

    expect(user).toBeDefined();
    expect(user.email).toBe('test@example.com');
    expect(user.createdAt).toBeDefined();
  });

  test('should find documents', async () => {
    const userSchema = new Schema({
      email: { type: String, required: true },
      status: { type: String, default: 'active' }
    });

    const User = chikkadb.model('Person', userSchema);

    await User.create({ email: 'person1@example.com' });
    await User.create({ email: 'person2@example.com' });

    const all = await User.find();
    expect(all.length).toBeGreaterThan(0);

    const one = await User.findOne({ email: 'person1@example.com' });
    expect(one).toBeDefined();
    expect(one.email).toBe('person1@example.com');
  });

  test('should update documents', async () => {
    const postSchema = new Schema({
      title: { type: String },
      published: { type: Boolean, default: false }
    });

    const Post = chikkadb.model('Post', postSchema);

    const post = await Post.create({ title: 'Test Post' });
    const postId = post.id;

    await Post.updateOne({ id: postId }, { published: true });

    const updated = await Post.findById(postId);
    expect(updated.published).toBe(true);
  });

  test('should delete documents', async () => {
    const articleSchema = new Schema({
      title: { type: String },
      content: { type: String }
    });

    const Article = chikkadb.model('Article', articleSchema);

    const article = await Article.create({
      title: 'Test Article',
      content: 'Content here'
    });

    const count1 = await Article.countDocuments();
    await Article.deleteOne({ id: article.id });
    const count2 = await Article.countDocuments();

    expect(count2).toBeLessThan(count1);
  });

  test.skip('should handle schema methods', async () => {
    const userSchema = new Schema({
      email: { type: String },
      role: { type: String, default: 'user' }
    });

    userSchema.methods('isAdmin', function() {
      return this.role === 'admin';
    });

    const User = chikkadb.model('Admin', userSchema);

    const admin = await User.create({
      email: 'admin@example.com',
      role: 'admin'
    });

    expect(admin.isAdmin()).toBe(true);
  });
});
