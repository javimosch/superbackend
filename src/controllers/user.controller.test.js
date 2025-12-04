const {
  updateProfile
} = require('../controllers/user.controller');
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');

// Mock dependencies
jest.mock('../models/User');
jest.mock('../models/ActivityLog');

describe('User Controller - updateProfile', () => {
  let mockReq;
  let mockRes;
  let next; // To mock the next middleware function

  beforeEach(() => {
    mockReq = {
      user: {
        _id: 'user123'
      },
      body: {},
      ip: '127.0.0.1',
      connection: {
        remoteAddress: '127.0.0.1'
      },
      get: jest.fn().mockReturnValue('test-agent'),
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    next = jest.fn(); // Mock next for error handling
    jest.clearAllMocks();

    // Mock User.findByIdAndUpdate to return a modifiable user object
    User.findByIdAndUpdate.mockImplementation((id, updates, options) => {
      if (id === 'user123') {
        return Promise.resolve({
          _id: id,
          name: 'Existing Name',
          email: 'existing@example.com',
          ...updates, // Apply updates to the returned object
        });
      }
      return Promise.resolve(null);
    });

    // Mock User.findOne
    User.findOne.mockResolvedValue(null);
    // Mock ActivityLog.create
    ActivityLog.create.mockResolvedValue({});
  });

  // Test case 1: Update user name and email successfully
  test('should update user name and email successfully', async () => {
    mockReq.body = {
      name: 'Updated Name',
      email: 'updated@example.com'
    };

    await updateProfile(mockReq, mockRes, next); // Pass next

    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
      'user123', {
        name: 'Updated Name',
        email: 'updated@example.com'
      }, {
        new: true,
        runValidators: true
      }
    );
    expect(User.findOne).toHaveBeenCalledWith({
      email: 'updated@example.com',
      _id: {
        $ne: 'user123'
      }
    });
    expect(ActivityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user123',
        action: 'update_profile',
        category: 'settings',
        description: 'Updated profile: name, email',
        metadata: {
          updatedFields: ['name', 'email']
        },
      })
    );
    expect(mockRes.json).toHaveBeenCalledWith({
      message: 'Profile updated successfully',
      user: expect.objectContaining({
        name: 'Updated Name',
        email: 'updated@example.com'
      }),
    });
    expect(mockRes.status).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled(); // Ensure next is not called on success
  });

  // Test case 2: Update only user name successfully
  test('should update only user name successfully', async () => {
    mockReq.body = {
      name: 'Updated Name Only'
    };

    await updateProfile(mockReq, mockRes, next);

    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
      'user123', {
        name: 'Updated Name Only'
      }, {
        new: true,
        runValidators: true
      }
    );
    expect(User.findOne).not.toHaveBeenCalled(); // No email update, so no email check
    expect(ActivityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user123',
        action: 'update_profile',
        category: 'settings',
        description: 'Updated profile: name',
        metadata: {
          updatedFields: ['name']
        },
      })
    );
    expect(mockRes.json).toHaveBeenCalledWith({
      message: 'Profile updated successfully',
      user: expect.objectContaining({
        name: 'Updated Name Only',
        email: 'existing@example.com' // Email remains unchanged
      }),
    });
    expect(mockRes.status).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  // Test case 3: Update only user email successfully
  test('should update only user email successfully', async () => {
    mockReq.body = {
      email: 'newemail@example.com'
    };
    User.findOne.mockResolvedValue(null); // No existing user with the new email

    await updateProfile(mockReq, mockRes, next);

    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
      'user123', {
        email: 'newemail@example.com'
      }, {
        new: true,
        runValidators: true
      }
    );
    expect(User.findOne).toHaveBeenCalledWith({
      email: 'newemail@example.com',
      _id: {
        $ne: 'user123'
      }
    });
    expect(ActivityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user123',
        action: 'update_profile',
        category: 'settings',
        description: 'Updated profile: email',
        metadata: {
          updatedFields: ['email']
        },
      })
    );
    expect(mockRes.json).toHaveBeenCalledWith({
      message: 'Profile updated successfully',
      user: expect.objectContaining({
        name: 'Existing Name', // Name remains unchanged
        email: 'newemail@example.com'
      }),
    });
    expect(mockRes.status).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });


  // Test case 4: Email already in use
  test('should return 400 if email is already in use by another user', async () => {
    mockReq.body = {
      email: 'taken@example.com'
    };
    User.findOne.mockResolvedValue({
      _id: 'anotherUser'
    }); // Another user exists with this email

    await updateProfile(mockReq, mockRes, next);

    expect(User.findOne).toHaveBeenCalledWith({
      email: 'taken@example.com',
      _id: {
        $ne: 'user123'
      }
    });
    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: 'Email already in use'
    });
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled(); // Should not attempt to update
    expect(ActivityLog.create).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  // Test case 5: User not found
  test('should return 404 if user is not found', async () => {
    mockReq.body = {
      name: 'Non Existent User'
    };
    User.findByIdAndUpdate.mockResolvedValue(null); // Simulate user not found

    await updateProfile(mockReq, mockRes, next);

    expect(User.findByIdAndUpdate).toHaveBeenCalled();
    expect(mockRes.status).toHaveBeenCalledWith(404);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: 'User not found'
    });
    expect(ActivityLog.create).not.toHaveBeenCalled(); // No activity logged if user not found
    expect(next).not.toHaveBeenCalled();
  });

  // Test case 6: Error handling
  test('should return 500 if an unexpected error occurs', async () => {
    mockReq.body = {
      name: 'Error Trigger'
    };
    const errorMessage = 'Database connection lost';
    User.findByIdAndUpdate.mockRejectedValue(new Error(errorMessage)); // Simulate a DB error

    await updateProfile(mockReq, mockRes, next);

    expect(User.findByIdAndUpdate).toHaveBeenCalled();
    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: 'Failed to update profile'
    });
    expect(ActivityLog.create).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled(); // Controller handles error, so `next` not called for this
  });

  // Test case 7: No updates provided
  test('should return success message even if no updates are provided', async () => {
    mockReq.body = {}; // Empty body
    User.findByIdAndUpdate.mockResolvedValue({
      _id: 'user123',
      name: 'Existing Name',
      email: 'existing@example.com'
    }); // Return existing user

    await updateProfile(mockReq, mockRes, next);

    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
      'user123', {}, // No updates passed
      {
        new: true,
        runValidators: true
      }
    );
    expect(User.findOne).not.toHaveBeenCalled();
    expect(ActivityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user123',
        action: 'update_profile',
        category: 'settings',
        description: 'Updated profile: ', // Description should be empty if no fields changed
        metadata: {
          updatedFields: []
        },
      })
    );
    expect(mockRes.json).toHaveBeenCalledWith({
      message: 'Profile updated successfully',
      user: expect.objectContaining({
        name: 'Existing Name',
        email: 'existing@example.com'
      }),
    });
    expect(mockRes.status).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });
});