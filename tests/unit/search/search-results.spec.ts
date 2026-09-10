// tests/unit/search/search-results.spec.ts
//
// The command palette can search RECORDS for the first time. What it
// SAYS about the search is as important as what it finds: the palette
// has to distinguish "there is no such work order" from "you cannot see
// work orders", because those send an operator to two different people.
//
// Pure, because jest here has no jsdom.

import {
  MIN_SEARCH_LENGTH,
  groupSearchResults,
  isSearchable,
  searchFootnote,
  type SearchResult,
} from '../../../frontend/modules/search/utils/search-results';

const result = (kind: SearchResult['kind'], id: string, title: string): SearchResult => ({
  kind,
  id,
  title,
  href: `/${kind}/${id}`,
});

describe('groupSearchResults', () => {
  it('groups by record type and drops empty groups', () => {
    const groups = groupSearchResults([
      result('vehicle', 'v1', 'AFU0078'),
      result('trip', 't1', 'Trip · AFU0078'),
      result('vehicle', 'v2', 'AFU0079'),
    ]);

    expect(groups.map((g) => g.group)).toEqual(['Vehicles', 'Trips']);
    expect(groups[0].items).toHaveLength(2);
  });

  it('puts the most identifying types first', () => {
    // Typing a plate matches the vehicle, its trips, its work orders and
    // its expenses. The vehicle is almost always the one wanted, and
    // ordering by KIND is honest about there being no relevance score.
    const groups = groupSearchResults([
      result('expense', 'e1', 'Tollgate'),
      result('trip', 't1', 'Trip'),
      result('vehicle', 'v1', 'AFU0078'),
      result('work-order', 'w1', 'Mirror'),
    ]);

    expect(groups.map((g) => g.kind)).toEqual(['vehicle', 'work-order', 'trip', 'expense']);
  });

  it('returns nothing for nothing', () => {
    expect(groupSearchResults([])).toEqual([]);
  });
});

describe('searchFootnote', () => {
  it('says nothing when there is nothing to say', () => {
    // A footnote on every search is noise, and noise is how the one that
    // matters gets ignored.
    expect(searchFootnote({ skipped: [], failed: [], truncated: false })).toBeNull();
  });

  it('names the sources the user cannot read', () => {
    const note = searchFootnote({ skipped: ['work-order'], failed: [], truncated: false })!;
    expect(note).toContain('work orders');
    expect(note).toMatch(/can't view/i);
  });

  it('lists several skipped sources readably', () => {
    const note = searchFootnote({
      skipped: ['work-order', 'expense', 'trip'],
      failed: [],
      truncated: false,
    })!;
    expect(note).toContain('work orders, expenses and trips');
  });

  it('says a FAILED source differently from a skipped one', () => {
    // Skipped means "you may not see these". Failed means "the absence
    // of a result proves nothing". Conflating them would send an
    // operator to ask for access they already have.
    const failed = searchFootnote({ skipped: [], failed: ['vehicle'], truncated: false })!;
    expect(failed).toMatch(/couldn't search/i);
    expect(failed).toMatch(/incomplete/i);
    expect(failed).not.toMatch(/can't view/i);
  });

  it('reports truncation, so a shortlist is never read as the whole list', () => {
    const note = searchFootnote({ skipped: [], failed: [], truncated: true })!;
    expect(note).toMatch(/more matches/i);
  });

  it('combines all three without losing any', () => {
    const note = searchFootnote({
      skipped: ['expense'],
      failed: ['vehicle'],
      truncated: true,
    })!;
    expect(note).toMatch(/couldn't search/i);
    expect(note).toMatch(/more matches/i);
    expect(note).toMatch(/can't view/i);
  });
});

describe('isSearchable', () => {
  it('refuses a query shorter than the API will act on', () => {
    // Mirrored client-side so the palette does not fire a request the
    // server will refuse, and so "keep typing" is not a round trip.
    expect(MIN_SEARCH_LENGTH).toBe(2);
    expect(isSearchable('')).toBe(false);
    expect(isSearchable(' ')).toBe(false);
    expect(isSearchable('a')).toBe(false);
    expect(isSearchable(' a ')).toBe(false);
  });

  it('accepts a real query', () => {
    expect(isSearchable('AF')).toBe(true);
    expect(isSearchable('AFU0078')).toBe(true);
  });
});
