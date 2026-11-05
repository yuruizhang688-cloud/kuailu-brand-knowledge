// Source preference is applied only after textual relevance. Other editions
// retain their previous ordering when the preference is disabled.
export function rankKnowledgeResults(entries, query, preferMedia = false) {
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const matches = entries.filter((entry) => terms.every((term) =>
    `${entry.title} ${entry.relativePath} ${entry.text}`.toLocaleLowerCase().includes(term)));
  if (preferMedia) {
    const relevance = (entry) => terms.reduce((total, term) => total +
      (entry.title.toLocaleLowerCase().includes(term) ? 4 :
        entry.relativePath.toLocaleLowerCase().includes(term) ? 2 : 1), 0);
    matches.sort((a, b) => relevance(b) - relevance(a) ||
      Number(Boolean(b.mediaEvidence?.recognized)) - Number(Boolean(a.mediaEvidence?.recognized)));
  }
  return matches.slice(0, 60);
}
