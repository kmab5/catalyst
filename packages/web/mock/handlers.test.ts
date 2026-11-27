import { expect, test } from 'vitest';
import { ids } from '../src/api/contract';
import { getFixture } from '../src/test/mockFetch';
import { handleMock } from './handlers';

test('directory queries and missing node IDs match real server behavior', () => {
  const f = getFixture();
  const url = '/api/projects/' + f.projects[0]!.id;
  const get = (path: string) => handleMock(f, {method: 'GET', url: url + path});
  expect(get('/tree?path=lib&depth=0').json).toMatchObject({id: ids.dir('lib')});
  expect(get('/tree?path=lib&depth=0').json).not.toHaveProperty('children');
  for (const suffix of ['', '/source', '/impact']) expect(get('/nodes/' + encodeURIComponent(ids.file('missing.ts')) + suffix).status).toBe(404);
  expect(get('/find?q=gibberish-unmatched').json).toEqual([]);
});

test('saving a provider preserves a masked key or clears it without persisting its plaintext', () => {
  const f = getFixture();
  const save = (provider: unknown) => handleMock(f, {method: 'PUT', url: '/api/settings', body: {provider}});
  const saved = f.settings.provider!.apiKeyMasked;
  expect(save({type:'openrouter'}).json).toMatchObject({provider:{apiKeyMasked:saved}});
  expect(save({type:'openrouter', apiKey:null}).json).toMatchObject({provider:null});
  const key = 'fictional-secret-for-this-unit-test';
  const response = save({type:'openai-compatible', baseUrl:'http://localhost:11434/v1', apiKey:key});
  expect(response.json).toMatchObject({provider:{apiKeyMasked:'…test'}});
  expect(JSON.stringify(f.settings)).not.toContain(key);
});
