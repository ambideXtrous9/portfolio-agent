"""Clustering Sandbox Pydantic Schemas."""

from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class Point(BaseModel):
    x: float
    y: float
    cluster: int


class ClusterRequest(BaseModel):
    algorithm: str = Field(default="kmeans", description="'kmeans' or 'dbscan'")
    n_clusters: int = Field(default=3, ge=1, le=10)
    eps: float = Field(default=25.0, ge=1.0, le=100.0)
    min_samples: int = Field(default=5, ge=1, le=50)


class ClusterResponse(BaseModel):
    algorithm: str
    num_clusters: int
    num_noise: int
    points: List[Point]
    silhouette_score: Optional[float] = None
