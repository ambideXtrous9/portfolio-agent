"""Main API Router aggregating all domain endpoints."""

from fastapi import APIRouter
from backend.app.api.endpoints import (
    portfolio,
    tour,
    harry,
    stock,
    vision,
    cluster,
    health,
)

api_router = APIRouter()

api_router.include_router(portfolio.router)
api_router.include_router(tour.router)
api_router.include_router(harry.router)
api_router.include_router(stock.router)
api_router.include_router(vision.router)
api_router.include_router(cluster.router)
api_router.include_router(health.router)
