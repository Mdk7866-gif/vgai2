from fastapi import APIRouter
from app.routes import users
from app.routes.characters import crud as characters_crud
from app.routes.characters import generatecharacter as characters_generate
from app.routes.styletemplates import crud as styletemplates_crud
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
from app.routes.project import animationgeneration

api_router = APIRouter()

api_router.include_router(users.router)
api_router.include_router(characters_crud.router)
api_router.include_router(characters_generate.router)
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
api_router.include_router(animationgeneration.router)
# app.routes.project.voiceovertts (voiceover generation) is still a placeholder,
# not registered yet — deferred per CLAUDE.md's project-folder scope notes.
