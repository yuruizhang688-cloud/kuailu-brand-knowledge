import assert from 'node:assert/strict';
import test from 'node:test';
import { rankKnowledgeResults } from '../src/knowledge-search.js';

const item = (id, title, text, recognized = false) => ({
  id, title, text, relativePath: `产品/${title}.md`, mediaEvidence: { recognized }
});

test('media preference breaks equal relevance without admitting unrelated articles', () => {
  const rows = [item('plain', '自动化', '周期任务'), item('media', '自动化', '周期任务', true), item('wrong', '会议', '私有化', true)];
  assert.deepEqual(rankKnowledgeResults(rows, '自动化', true).map(x => x.id), ['media', 'plain']);
  assert.deepEqual(rankKnowledgeResults(rows, '自动化', false).map(x => x.id), ['plain', 'media']);
});

test('a directly relevant title precedes a media-backed incidental mention', () => {
  const rows = [item('incidental', '企业办公', '自动化', true), item('direct', '自动化', '周期任务')];
  assert.equal(rankKnowledgeResults(rows, '自动化', true)[0].id, 'direct');
});

test('preference is applied before the result cap and all query terms must match', () => {
  const rows = Array.from({ length: 65 }, (_, i) => item(String(i), 'KuWork 自动化', '周期任务', i === 64));
  assert.equal(rankKnowledgeResults(rows, 'kuwork 自动化', true)[0].id, '64');
  assert.equal(rankKnowledgeResults(rows, 'kuwork 自动化', true).length, 60);
  assert.deepEqual(rankKnowledgeResults(rows, 'kuwork 私有化', true), []);
  assert.deepEqual(rankKnowledgeResults(rows, ' ', true), []);
});
