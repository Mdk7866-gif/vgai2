from fastapi import APIRouter
from app.routes import users
from app.routes.characters import crud as characters_crud
from app.routes.characters import generatecharacter as characters_generate
from app.routes.styletemplates import crud as styletemplates_crud
from app.routes.styletemplates import generatetemplate as styletemplates_generate
from app.routes.payments import crud as payments_crud

api_router = APIRouter()

api_router.include_router(users.router)
api_router.include_router(characters_crud.router)
api_router.include_router(characters_generate.router)
api_router.include_router(styletemplates_crud.router)
api_router.include_router(styletemplates_generate.router)
api_router.include_router(payments_crud.router)
# app.routes.payments.webhook is a placeholder, not registered yet — see that
# file's docstring for why and how to activate it.
