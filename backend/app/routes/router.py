from fastapi import APIRouter
from app.routes import users
from app.routes.characters import crud as characters_crud
from app.routes.characters import defaults as characters_defaults
from app.routes.characters import generatecharacter as characters_generate
from app.routes.styletemplates import crud as styletemplates_crud
from app.routes.styletemplates import defaults as styletemplates_defaults
from app.routes.styletemplates import generatetemplate as styletemplates_generate
from app.routes.scriptgenerationtemplate import crud as scripttemplates_crud
from app.routes.scriptgenerationtemplate import viralscripttopicresearch as scripttemplates_generate
from app.routes.payments import crud as payments_crud
from app.routes.profile import usagehistory as profile_usagehistory
from app.routes.project import projectcrud
from app.routes.project import paidscripttoscenesplitter
from app.routes.project import freescripttoscenesplitter
from app.routes.project import generatedscenecard
from app.routes.project import imagegeneration
from app.routes.project import imageregeneration
from app.routes.project import animationgeneration

api_router = APIRouter()

api_router.include_router(users.router)
# defaults before crud: same literal-path-first discipline the styletemplates
# routers below follow. crud.py has no dynamic /{character_id} route today so
# /defaults can't be shadowed, but registering it first keeps that true if one
# is ever added.
api_router.include_router(characters_defaults.router)
api_router.include_router(characters_crud.router)
api_router.include_router(characters_generate.router)
# All three share the /styletemplates prefix. defaults first: crud.py has no
# dynamic /{id} route today so its literal /defaults paths can't be shadowed,
# but registering literal-path routers ahead of CRUD matches the discipline
# documented on the scripttemplates routers below and keeps it that way if a
# /{styletemplate_id} GET is ever added.
api_router.include_router(styletemplates_defaults.router)
api_router.include_router(styletemplates_crud.router)
api_router.include_router(styletemplates_generate.router)
api_router.include_router(scripttemplates_generate.router)
api_router.include_router(scripttemplates_crud.router)
api_router.include_router(payments_crud.router)
# app.routes.payments.webhook is a placeholder, not registered yet — see that
# file's docstring for why and how to activate it.

# /profile's two tabs are split by the table they read rather than by the page
# they feed: usage history (project_expence_tracker + users.miscellaneous_credit_spent)
# lives here, payment history (credit_topups) in payments_crud above.
api_router.include_router(profile_usagehistory.router)

# projectcrud first — paidscripttoscenesplitter/freescripttoscenesplitter/
# generatedscenecard/imagegeneration/animationgeneration all import its
# _get_owned_project helper (credit reservation lives in app/credits.py).
# generatedscenecard's literal /projects/scenes/cancel_generation must not be
# shadowed, and paidscripttoscenesplitter/freescripttoscenesplitter are
# registered before it even though neither actually has a colliding literal
# path today, matching the same shadowing-avoidance discipline documented on
# the scripttemplates routers above.
api_router.include_router(projectcrud.router)
api_router.include_router(paidscripttoscenesplitter.router)
api_router.include_router(freescripttoscenesplitter.router)
api_router.include_router(generatedscenecard.router)
api_router.include_router(imagegeneration.router)
# imageregeneration imports helpers straight from imagegeneration (reuses its
# _generate_image_bytes/_quality_and_cost/_image_size_for), so it's registered
# right after it; its two paths (/sync_animation_prompt, /regenerate_and_save)
# are literal and distinct from imagegeneration's own, so order doesn't matter
# for routing, only for readability of the import relationship.
api_router.include_router(imageregeneration.router)
api_router.include_router(animationgeneration.router)
# app.routes.project.voiceovertts (voiceover generation) is still a placeholder,
# not registered yet — deferred per CLAUDE.md's project-folder scope notes.
