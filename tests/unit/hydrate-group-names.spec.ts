import { hydrateEmptyGroupNames } from '../../src/groups/hydrate-group-names';

describe('hydrateEmptyGroupNames', () => {
  it('fills empty group names from get-by-id and leaves named items alone', async () => {
    const loadRaw = jest.fn(async (id: string) =>
      id === '120363111111111111@g.us' ? { id, subject: 'Hydrated' } : { id, subject: 'Skip' },
    );
    const items = await hydrateEmptyGroupNames(
      [
        { id: '120363111111111111@g.us', name: '' },
        { id: '120363222222222222@g.us', name: 'Already' },
        { id: '37499111222@c.us', name: '' },
      ],
      loadRaw,
    );
    expect(items[0]?.name).toBe('Hydrated');
    expect(items[1]?.name).toBe('Already');
    expect(items[2]?.name).toBe('');
    expect(loadRaw).toHaveBeenCalledTimes(1);
    expect(loadRaw).toHaveBeenCalledWith('120363111111111111@g.us');
  });

  it('keeps an empty name when get-by-id fails', async () => {
    const items = await hydrateEmptyGroupNames(
      [{ id: '120363111111111111@g.us', name: '' }],
      async () => {
        throw new Error('missing');
      },
    );
    expect(items[0]?.name).toBe('');
  });
});
