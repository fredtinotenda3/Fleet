// modules/ai/types/ai-evidence.types.ts
//
// PHASE 6 -- one shape for "how sure are we, and on what basis?".
//
// ---------------------------------------------------------------------
// WHAT THE AUDIT SAID, AND WHAT IS ACTUALLY TRUE NOW
// ---------------------------------------------------------------------
// The audit recorded that `AIPrediction` used a confidence ENUM while
// `AIResult` used a number, and that the two were incompatible.
//
// THAT IS NO LONGER THE CASE. `AIConfidence` in ai.types.ts is already
// `type AIConfidence = number` (0-1), and `AIResult.confidence` is
// already `number`. They agree. Whoever unified them did so before this
// phase, and Phase 6 has nothing to fix there -- recorded here rather
// than "fixed" with a no-op change, because a phase that claims to have
// unified something already unified is a phase whose report cannot be
// trusted on the things it did do.
//
// WHAT IS GENUINELY MISSING is the second half of the audit's finding:
// there is no shared EVIDENCE model. Every AI service produces a
// confidence number and none of them records what the number rests on.
//
// ---------------------------------------------------------------------
// WHY EVIDENCE MATTERS MORE THAN THE NUMBER
// ---------------------------------------------------------------------
// A bare `confidence: 0.83` is unfalsifiable. An operator cannot check
// it, a reviewer cannot audit it, and a bug in the scorer is
// indistinguishable from a genuine finding until someone acts on it and
// discovers otherwise.
//
// This matters here specifically because Phase 6 connects intelligence
// to ACTIONS. Once an attention item can raise a work order or start an
// approval chain, "why did the platform do this?" stops being a
// debugging nicety and becomes the first question asked after any
// disputed spend.
//
// The value ledger already understood this: `ValueLedgerEntry` requires
// a non-empty `evidenceRefs`, and its own comment says an entry with no
// evidence is a claim rather than a record. This generalises that rule
// to the predictions upstream of it.
//
// ---------------------------------------------------------------------
// EVIDENCE POINTS AT STORED DATA, NOT AT PROSE
// ---------------------------------------------------------------------
// `reference` is an identifier a reader can go and look at -- a reading
// id, an expense id, a rollup day. Not a sentence describing what was
// seen. A sentence cannot be re-checked after the fact, and the whole
// point is that somebody disputing a finding can pull the same rows the
// model did.
//
// `explanation` exists for the human sentence, separately and
// optionally, so the two never get conflated.

/**
 * One thing the platform actually looked at.
 */
export interface AIEvidence {
  /**
   * Where it came from -- a collection name or a named computation.
   * e.g. 'tbltelematics', 'tblexpenses', 'telemetry-rollup'.
   */
  source: string;
  /**
   * An identifier that can be resolved back to the stored record.
   * NOT a description: a reader must be able to fetch this.
   */
  reference: string;
  /** When the referenced fact was true, where that differs from now. */
  observedAt?: Date;
  /** The value that mattered, when a single number is what drove the finding. */
  value?: number;
}

/**
 * The shared confidence/evidence envelope.
 *
 * Attached to AI outputs so every consumer reads the same shape without
 * branching on which service produced it.
 */
export interface AIConfidenceEnvelope {
  /** 0-1. Already the platform-wide representation; see the header. */
  confidence: number;
  /**
   * What the confidence rests on.
   *
   * MUST be non-empty for a generated prediction. `assertEvidence`
   * enforces that at the boundary rather than trusting each service to
   * remember.
   */
  evidence: AIEvidence[];
  /** A human sentence. Never a substitute for `evidence`. */
  explanation?: string;
}

export class MissingEvidenceError extends Error {
  constructor(what: string) {
    super(
      `${what} was generated with no evidence. A confidence score with nothing behind it ` +
        'cannot be checked, audited, or disputed — and Phase 6 lets these drive real actions.'
    );
    this.name = 'MissingEvidenceError';
  }
}

/**
 * Guards the invariant at the point of construction.
 *
 * THROWS rather than returning a flag. A prediction with no evidence is
 * not a degraded prediction to be handled downstream -- it is one that
 * should never have been emitted, and letting it through means the
 * absence is discovered by whoever is arguing about the work order it
 * caused.
 *
 * Deliberately NOT applied to a confidence of 0 or to an absent
 * confidence: "we are not confident" is a legitimate, useful output.
 * "We are confident, for reasons we did not record" is not.
 */
export function assertEvidence(
  envelope: Pick<AIConfidenceEnvelope, 'evidence'>,
  what: string
): void {
  if (!Array.isArray(envelope.evidence) || envelope.evidence.length === 0) {
    throw new MissingEvidenceError(what);
  }
}

/**
 * Builds an envelope, validating as it goes.
 *
 * Clamps confidence into 0-1 rather than rejecting out-of-range values:
 * a scorer emitting 1.02 through a rounding artefact should not fail a
 * whole batch, and the clamped value is honest about what the scale can
 * express. A NaN is a different matter -- it means the computation
 * failed, so it is refused.
 */
export function buildConfidence(params: {
  confidence: number;
  evidence: AIEvidence[];
  explanation?: string;
  what: string;
}): AIConfidenceEnvelope {
  if (!Number.isFinite(params.confidence)) {
    throw new MissingEvidenceError(
      `${params.what} produced a non-finite confidence (${params.confidence})`
    );
  }

  assertEvidence({ evidence: params.evidence }, params.what);

  return {
    confidence: Math.min(1, Math.max(0, params.confidence)),
    evidence: params.evidence,
    ...(params.explanation ? { explanation: params.explanation } : {}),
  };
}
