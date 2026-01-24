jest.mock('./jsonConfigs.service', () => ({
  getJsonConfigValueBySlug: jest.fn(),
}));

const pagesService = require('./pages.service');

describe('pages.service validateBlocks', () => {
  test('accepts valid blocks with id/type/props', () => {
    const schema = pagesService.getDefaultBlocksSchema();
    expect(() => pagesService.validateBlocks([
      { id: 'b1', type: 'hero', props: { title: 'Hi', subtitle: 'There', ctaText: 'Go', ctaUrl: '/go' } },
      { id: 'b2', type: 'text', props: { title: 'T', content: '<p>x</p>' } },
    ], schema)).not.toThrow();
  });

  test('rejects when blocks is not an array', () => {
    const schema = pagesService.getDefaultBlocksSchema();
    expect(() => pagesService.validateBlocks('nope', schema)).toThrow('blocks must be an array');
  });

  test('rejects block missing id', () => {
    const schema = pagesService.getDefaultBlocksSchema();
    expect(() => pagesService.validateBlocks([
      { type: 'hero', props: {} },
    ], schema)).toThrow('Each block must have an id');
  });

  test('rejects unknown block type', () => {
    const schema = pagesService.getDefaultBlocksSchema();
    expect(() => pagesService.validateBlocks([
      { id: 'b1', type: 'unknown', props: {} },
    ], schema)).toThrow('Unknown block type');
  });

  test('rejects invalid props type', () => {
    const schema = pagesService.getDefaultBlocksSchema();
    expect(() => pagesService.validateBlocks([
      { id: 'b1', type: 'hero', props: 'nope' },
    ], schema)).toThrow('Block props must be an object');
  });

  test('validates basic field types (boolean/select)', () => {
    const schema = pagesService.getDefaultBlocksSchema();

    expect(() => pagesService.validateBlocks([
      { id: 'b1', type: 'image', props: { fullWidth: true, align: 'center' } },
    ], schema)).not.toThrow();

    expect(() => pagesService.validateBlocks([
      { id: 'b1', type: 'image', props: { fullWidth: 'true' } },
    ], schema)).toThrow('must be a boolean');

    expect(() => pagesService.validateBlocks([
      { id: 'b1', type: 'image', props: { align: 'bogus' } },
    ], schema)).toThrow('must be one of');
  });
});
