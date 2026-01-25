const controller = require('./forms.controller');
const formsService = require('../services/forms.service');
const FormSubmission = require('../models/FormSubmission');
const User = require('../models/User');
const GlobalSetting = require('../models/GlobalSetting');
const mongoose = require('mongoose');

jest.mock('../services/forms.service');
jest.mock('../models/FormSubmission');
jest.mock('../models/User');
jest.mock('../models/GlobalSetting');
jest.mock('../utils/jwt', () => ({
  verifyAccessToken: jest.fn(() => ({ userId: 'user123' }))
}));

// Mock GlobalSetting.findOne to prevent Mongoose buffering timeouts in email.service.js init
GlobalSetting.findOne.mockReturnValue({
  lean: jest.fn().mockResolvedValue(null)
});

describe('forms.controller', () => {
  let mockReq, mockRes;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReq = {
      user: { _id: new mongoose.Types.ObjectId() },
      body: {},
      query: {},
      params: {},
      headers: {},
      get: jest.fn(),
      socket: { remoteAddress: '127.0.0.1' }
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      cookie: jest.fn(),
      redirect: jest.fn()
    };
  });

  describe('getForms', () => {
    test('returns all form definitions', async () => {
      const mockForms = [{ id: 'contact', title: 'Contact' }];
      formsService.getForms.mockResolvedValue(mockForms);

      await controller.getForms(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(mockForms);
    });
  });

  describe('submit', () => {
    test('submits a form successfully', async () => {
      mockReq.params.formId = 'contact';
      mockReq.body = { email: 'test@test.com', message: 'hello world' };
      
      const mockDoc = { _id: 'sub1' };
      formsService.submitForm.mockResolvedValue(mockDoc);
      formsService.getFormById.mockResolvedValue({ id: 'contact' });

      await controller.submit(mockReq, mockRes);

      expect(formsService.submitForm).toHaveBeenCalledWith(
        'contact',
        expect.objectContaining({ email: 'test@test.com' }),
        expect.any(Object)
      );
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({ ok: true, id: 'sub1' });
    });

    test('redirects on success if successUrl is configured', async () => {
      mockReq.params.formId = 'lead';
      mockReq.body = { name: 'John' };
      
      formsService.submitForm.mockResolvedValue({ _id: 'sub2' });
      formsService.getFormById.mockResolvedValue({ id: 'lead', successUrl: '/thanks' });

      await controller.submit(mockReq, mockRes);

      expect(mockRes.redirect).toHaveBeenCalledWith('/thanks');
    });

    test('returns 400 if formKey missing', async () => {
      mockReq.params.formId = '';
      mockReq.body = {};
      await controller.submit(mockReq, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('adminList', () => {
    test('returns submissions with pagination', async () => {
      mockReq.query = { formKey: 'contact' };
      const mockSubmissions = [{ _id: 's1', formKey: 'contact' }];
      
      FormSubmission.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockSubmissions),
      });
      FormSubmission.countDocuments.mockResolvedValue(1);

      await controller.adminList(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        submissions: mockSubmissions,
        pagination: { total: 1, limit: 50, offset: 0 }
      });
    });
  });
});
