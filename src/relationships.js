// Read the model graph, including dependencies with no physical street route.
export function relationshipNeighbors(roads, id) {
  const neighbors = new Map();
  for (const edge of roads) {
    if (edge.a !== id && edge.b !== id) continue;
    const other = edge.a === id ? edge.b : edge.a;
    if (other === id) continue;
    const entry = neighbors.get(other) || {incoming: 0, outgoing: 0};
    if (edge.b === id) entry.incoming += edge.weight;
    if (edge.a === id) entry.outgoing += edge.weight;
    neighbors.set(other, entry);
  }
  return neighbors;
}

export function relationshipRole(entry) {
  return entry.incoming && entry.outgoing ? 'both' : entry.incoming ? 'incoming' : 'outgoing';
}
