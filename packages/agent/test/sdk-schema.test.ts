import { describe, expect, it } from 'vitest';
import { ASSESSMENT_JSON_SCHEMA, AssessmentProposalSchema } from '@beforeyou/contracts';
import { sdkSchema } from '../src/sdk-schema.js';
describe('canonical-to-SDK schema boundary', () => {
  it('exposes proposal fields and preserves nullable limited output', () => {
    const schema = sdkSchema(ASSESSMENT_JSON_SCHEMA);
    const proposal = { verdict: null, impacts: [], finding: null, nextAction: null, checkedScope: [], limitations: [], changeSummary: null };
    expect(schema.parse(proposal)).toEqual(AssessmentProposalSchema.parse(proposal));
    expect(schema.safeParse({ verdict: 'safe' }).success).toBe(false);
    expect(schema.safeParse({ ...proposal, ownerId: 'model-controlled' }).success).toBe(false);
  });
  it('refuses remote schemas instead of fetching model-provided references', () => { expect(() => sdkSchema({ $ref: 'https://evil.test/schema.json' })).toThrow(); });
});
