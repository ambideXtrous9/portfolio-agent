"""Interactive Clustering Sandbox API endpoints (K-Means & DBSCAN)."""

import math
import numpy as np
import pandas as pd
from typing import List
from fastapi import APIRouter
from sklearn.cluster import KMeans, DBSCAN
from sklearn.metrics import silhouette_score

from backend.app.schemas.cluster import ClusterRequest, ClusterResponse, Point

router = APIRouter(prefix="/cluster", tags=["Clustering Sandbox"])


def generate_cluster_dataset(sample_size: int = 800) -> pd.DataFrame:
    """Generates a concentric circle dataset with randomized background noise."""
    np.random.seed(42)

    def points_in_circum(r, n):
        return [
            (
                math.cos(2 * math.pi / n * x) * r + np.random.normal(-25, 25),
                math.sin(2 * math.pi / n * x) * r + np.random.normal(-25, 25),
            )
            for x in range(1, n + 1)
        ]

    c1 = pd.DataFrame(points_in_circum(450, int(sample_size * 0.45)))
    c2 = pd.DataFrame(points_in_circum(260, int(sample_size * 0.30)))
    c3 = pd.DataFrame(points_in_circum(100, int(sample_size * 0.15)))
    noise = pd.DataFrame(
        [(np.random.randint(-550, 550), np.random.randint(-550, 550)) for _ in range(int(sample_size * 0.10))]
    )

    df = pd.concat([c1, c2, c3, noise], ignore_index=True)
    df.columns = ["x", "y"]
    return df


# Cache dataset
_cached_df = generate_cluster_dataset()


@router.get("/dataset")
async def get_raw_dataset():
    """Returns the unclustered concentric circle dataset points."""
    pts = [Point(x=round(float(row["x"]), 2), y=round(float(row["y"]), 2), cluster=0) for _, row in _cached_df.iterrows()]
    return {
        "total_points": len(pts),
        "points": pts
    }


@router.post("/run", response_model=ClusterResponse)
async def run_clustering(request: ClusterRequest):
    """Executes K-Means or DBSCAN clustering on the 2D benchmark dataset."""
    X = _cached_df[["x", "y"]].values

    if request.algorithm.lower() == "kmeans":
        model = KMeans(n_clusters=request.n_clusters, random_state=42, n_init=10)
        labels = model.fit_predict(X)
        num_clusters = request.n_clusters
        num_noise = 0
    else:
        # DBSCAN
        model = DBSCAN(eps=request.eps, min_samples=request.min_samples)
        labels = model.fit_predict(X)
        unique_labels = set(labels)
        num_clusters = len(unique_labels - {-1})
        num_noise = int(np.sum(labels == -1))

    # Calculate silhouette score if >1 clusters exist
    sil_score = None
    if num_clusters > 1:
        try:
            valid_mask = labels != -1 if num_noise > 0 else np.ones(len(labels), dtype=bool)
            if np.sum(valid_mask) > num_clusters:
                sil_score = round(float(silhouette_score(X[valid_mask], labels[valid_mask])), 3)
        except Exception:
            pass

    points_result = [
        Point(x=round(float(X[i][0]), 2), y=round(float(X[i][1]), 2), cluster=int(labels[i]))
        for i in range(len(X))
    ]

    return ClusterResponse(
        algorithm=request.algorithm.upper(),
        num_clusters=num_clusters,
        num_noise=num_noise,
        points=points_result,
        silhouette_score=sil_score
    )


@router.get("/kdist")
async def get_kdist_graph():
    """Computes sorted 2nd nearest neighbor distances for DBSCAN epsilon tuning."""
    from sklearn.neighbors import NearestNeighbors

    X = _cached_df[["x", "y"]].values
    neigh = NearestNeighbors(n_neighbors=5)
    nbrs = neigh.fit(X)
    distances, _ = nbrs.kneighbors(X)

    distances = np.sort(distances, axis=0)
    distances = distances[:, 1]  # 2nd nearest neighbor distance

    return {
        "x": list(range(len(distances))),
        "y": [round(float(d), 2) for d in distances]
    }

