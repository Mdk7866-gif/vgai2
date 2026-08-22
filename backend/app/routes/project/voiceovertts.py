"""Voiceover text-to-speech generation via ElevenLabs.

**Status: Stub — not yet wired up. See CLAUDE.md under Current State for deferral rationale.**

This module will provide endpoints for generating audio voiceovers from a project's script:

1. POST /projects/voiceover/generate — chunks the project script (ElevenLabs max ~5,000 chars
   per request), calls ElevenLabs TTS API for each chunk in parallel or sequentially, and
   stores results as project_voiceovers rows ordered by voiceover_number. Cost is per-project
   spend (charges miscellaneous_credit_spent or project_expence_tracker's voiceover_credit_spent
   per README §2), using the project's configured vo_* settings (voice_id, model_id, stability,
   similarity, style, speaker_boost, speed — all stored on projects.* fields, settable via
   /projects/voiceoversettings endpoint already wired in projectcrud.py).

2. GET /projects/{project_id}/voiceovers — returns all project_voiceovers rows for preview.

3. POST /projects/voiceover/stitch — uses FFmpeg to merge all project_voiceovers chunks
   into a single master audio file and return/upload it.

The flow integrates with the project UI (VoiceOverControllerPopUp.tsx, currently settings-only)
and will be visible on the project-folder page as a disabled "Generate Voiceover" button until
this module is implemented.

The endpoints follow the reserve-before-call credit model (app/credits.py):
- /generate reserves the full cost upfront for all chunks
- On provider failure, credits are refunded via refund_project_credits()
- Cancelling before completion does not refund (provider has already started)

ElevenLabs API integration will live in app/elevenlabs_client.py (not yet written) to mirror
app/openai_client.py and app/openrouter_client.py.
"""

# TODO: Implement voiceover generation
