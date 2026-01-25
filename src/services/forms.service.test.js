const FormSubmission = require('../models/FormSubmission');
const JsonConfig = require('../models/JsonConfig');
const auditService = require('./audit.service');
const emailService = require('./email.service');
const webhookService = require('./webhook.service');
const jsonConfigsService = require('./jsonConfigs.service');
const formsService = require('./forms.service');

jest.mock('../models/FormSubmission');
jest.mock('../models/JsonConfig');
jest.mock('./audit.service');
jest.mock('./email.service');
jest.mock('./webhook.service');
jest.mock('./jsonConfigs.service');

describe('forms.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    emailService.sendEmail.mockReturnValue(Promise.resolve({}));
  });

  describe('getForms', () => {
    test('returns empty array if no config found', async () => {
      JsonConfig.findOne.mockResolvedValue(null);
      const result = await formsService.getForms();
      expect(result).toEqual([]);
    });

    test('returns parsed forms from config', async () => {
      const mockForms = [{ id: 'f1', name: 'Form 1' }];
      JsonConfig.findOne.mockResolvedValue({ jsonRaw: JSON.stringify(mockForms) });
      const result = await formsService.getForms();
      expect(result).toEqual(mockForms);
    });
  });

  describe('saveForm', () => {
    test('updates existing form if ID exists', async () => {
      const existingForms = [{ id: 'f1', name: 'Old' }];
      const config = { _id: 'conf123', jsonRaw: JSON.stringify(existingForms) };
      JsonConfig.findOne.mockResolvedValue(config);
      
      const updateData = { id: 'f1', name: 'New' };
      await formsService.saveForm(updateData);

      expect(jsonConfigsService.updateJsonConfig).toHaveBeenCalledWith(
        'conf123',
        expect.objectContaining({
          jsonRaw: expect.stringContaining('"name":"New"')
        })
      );
    });

    test('creates new config if none exists', async () => {
      JsonConfig.findOne.mockResolvedValue(null);
      
      const newData = { name: 'New Form' };
      await formsService.saveForm(newData);

      expect(jsonConfigsService.createJsonConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          alias: 'form-definitions',
          title: 'Form Definitions'
        })
      );
    });
  });

  describe('submitForm', () => {
    test('saves submission and triggers notifications', async () => {
      const mockForm = { 
        id: 'f1', 
        name: 'Test Form', 
        organizationId: 'org123',
        notifyEmail: 'admin@test.com' 
      };
      jest.spyOn(formsService, 'getFormById').mockResolvedValue(mockForm);
      
      const mockSave = jest.fn().mockResolvedValue({ _id: 'sub123', meta: { organizationId: 'org123' } });
      FormSubmission.mockImplementation(() => ({
        save: mockSave,
        _id: 'sub123',
        actorType: 'anonymous',
        actorId: 'guest',
        meta: { organizationId: 'org123' }
      }));

      const fields = { email: 'user@test.com', message: 'hello' };
      await formsService.submitForm('f1', fields);

      expect(mockSave).toHaveBeenCalled();
      expect(webhookService.emit).toHaveBeenCalledWith('form.submitted', expect.anything(), 'org123');
      expect(auditService.createAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
        action: 'FORM_SUBMISSION'
      }));
    });

    test('throws error if form not found', async () => {
      jest.spyOn(formsService, 'getFormById').mockResolvedValue(null);
      await expect(formsService.submitForm('missing', {})).rejects.toThrow('Form not found');
    });
  });
});
