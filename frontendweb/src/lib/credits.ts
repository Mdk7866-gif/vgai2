/**
 * Credit costs mirrored from the backend so the UI can subtract a generation's
 * cost the moment it starts, matching the backend reserving it up front (see
 * backend/app/credits.py).
 *
 * These MUST stay numerically in sync with their backend constants — nothing
 * enforces it automatically:
 *   IMAGE_*     -> IMAGE_BASE_CREDIT_COST / IMAGE_PRO_CREDIT_COST
 *                  (app/routes/project/imagegeneration.py)
 *   ANIMATION_* -> ANIMATION_BASE_CREDIT_COST / ANIMATION_PRO_CREDIT_COST
 *                  (app/routes/project/animationgeneration.py)
 *   PROMPT_REWRITE_CREDIT_COST -> REWRITE_CREDIT_COST
 *                  (app/routes/project/imageregeneration.py)
 *
 * Drift is self-correcting rather than dangerous: every response carries the
 * authoritative `credits_remaining`, and a cancelled or failed call re-reads the
 * balance — so a wrong constant here is visible only until the call settles.
 */

const IMAGE_BASE_CREDIT_COST = 4;
const IMAGE_PRO_CREDIT_COST = 20;
const ANIMATION_BASE_CREDIT_COST = 20;
const ANIMATION_PRO_CREDIT_COST = 40;

/** Cost of one scene-image or thumbnail generation for a project's image tier. */
export const imageCreditCost = (imageModelId?: string | null) =>
  imageModelId === "pro" ? IMAGE_PRO_CREDIT_COST : IMAGE_BASE_CREDIT_COST;

/** Cost of one scene-animation generation for a project's animation tier. */
export const animationCreditCost = (animationModelId?: string | null) =>
  animationModelId === "pro" ? ANIMATION_PRO_CREDIT_COST : ANIMATION_BASE_CREDIT_COST;

/** Flat cost of either LLM prompt-rewrite step in imageregeneration.py — syncing
 * the animation prompt to a hand-edited image prompt, or rewriting both prompts
 * before a "Regenerate" (on top of which the normal image-generation cost above
 * still applies). */
export const PROMPT_REWRITE_CREDIT_COST = 1;
