from fastapi import APIRouter
from app.routes import users
from app.routes.characters import crud as characters_crud

api_router = APIRouter()

api_router.include_router(users.router)
api_router.include_router(characters_crud.router)
