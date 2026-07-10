from fastapi import APIRouter
from app.routes import users, items

api_router = APIRouter()

api_router.include_router(users.router)
api_router.include_router(items.router)
