"""Clustering Sandbox Pydantic Schemas."""

from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class Point(BaseModel):
    x: float
    y: float
    cluster: int


class ClusterRequest(BaseModel):
    algorithm: Optional[str] = Field(default="kmeans", description="'kmeans' or 'dbscan'")
    n_clusters: Optional[int] = Field(default=3, ge=1, le=20)
    eps: Optional[float] = Field(default=25.0, ge=0.01, le=500.0)
    min_samples: Optional[int] = Field(default=5, ge=1, le=100)
    points: Optional[List[List[float]]] = None
    k: Optional[int] = None


class ClusterResponse(BaseModel):
    algorithm: str
    num_clusters: int
    num_noise: int
    points: List[Point]
    silhouette_score: Optional[float] = None
    centroids: Optional[List[List[float]]] = None
    labels: Optional[List[int]] = None
    inertia: Optional[float] = None
