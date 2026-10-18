import { applyCaseSnapshot, type Assessment, type CaseDetail, type CaseSummary } from '@beforeyou/contracts';

export interface CaseListState {
  filterKey: string | null;
  items: CaseSummary[];
  known: ReadonlyMap<string, CaseSummary>;
}
export function initialCaseListState(): CaseListState {
  return { filterKey: null, items: [], known: new Map() };
}
function priority(item: CaseSummary): number {
  if (!item.currentAssessment || item.freshness !== 'current') return 3;
  return { pause_here: 0, confirm_first: 1, no_issues_found: 2 }[item.currentAssessment.verdict];
}

/** Response membership belongs to its filters; record versions and stable positions belong to the client. */
export function reconcileCaseList(current: CaseListState, filterKey: string, incoming: readonly CaseSummary[], append = false): CaseListState {
  const known = new Map(current.known);
  const incomingIds = new Set<string>();
  for (const item of incoming) {
    known.set(item.id, applyCaseSnapshot(known.get(item.id), item));
    incomingIds.add(item.id);
  }
  const sameFilters = current.filterKey === filterKey;
  const retained = sameFilters ? current.items.filter(item => append || incomingIds.has(item.id)) : [];
  const retainedIds = new Set(retained.map(item => item.id));
  const additions = [...incomingIds].filter(id => !retainedIds.has(id)).map(id => known.get(id)!).sort((a, b) => priority(a) - priority(b));
  return { filterKey, known, items: [...retained.map(item => known.get(item.id)!), ...additions] };
}

function immutableUnion<T extends { id: string }>(current: readonly T[], incoming: readonly T[]): T[] {
  const records = new Map(current.map(item => [item.id, item]));
  for (const item of incoming) if (!records.has(item.id)) records.set(item.id, item);
  return [...records.values()];
}

export function reconcileCaseDetail(current: CaseDetail | null, incoming: CaseDetail): CaseDetail {
  if (!current || current.case.id !== incoming.case.id) return incoming;
  if (incoming.case.recordVersion < current.case.recordVersion) return current;
  if (incoming.case.recordVersion > current.case.recordVersion) return incoming;
  // Captured steps/evidence are immutable and can arrive without changing the case record version.
  // Union them so an equally versioned delayed response cannot remove a step already displayed.
  return {
    ...incoming,
    case: applyCaseSnapshot(current.case, incoming.case),
    currentAssessment: current.case.currentAssessment,
    journey: immutableUnion(current.journey, incoming.journey).sort((a, b) => a.index - b.index),
    evidence: immutableUnion(current.evidence, incoming.evidence),
  };
}

export function reconcileAssessmentHistory(current: readonly Assessment[], incoming: readonly Assessment[]): Assessment[] {
  return immutableUnion(current, incoming).sort((a, b) => b.version - a.version);
}
