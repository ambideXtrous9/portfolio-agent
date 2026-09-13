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


def points_in_circum(r, n=100):
    return [
        (
            math.cos(2 * math.pi / n * x) * r + np.random.normal(-30, 30),
            math.sin(2 * math.pi / n * x) * r + np.random.normal(-30, 30),
        )
        for x in range(1, n + 1)
    ]


def generate_cluster_dataset() -> pd.DataFrame:
    """Exact dataGen from Clustering/clusterapp.py: 3 concentric circles + 300 uniform noise points."""
    np.random.seed(42)
    df1 = pd.DataFrame(points_in_circum(500, 1000))
    df2 = pd.DataFrame(points_in_circum(300, 700))
    df3 = pd.DataFrame(points_in_circum(100, 300))
    df_noise = pd.DataFrame([(np.random.randint(-600, 600), np.random.randint(-600, 600)) for _ in range(300)])

    df = pd.concat([df1, df2, df3, df_noise], ignore_index=True)
    df.columns = ["x", "y"]
    return df


# Cache dataset (2,300 benchmark points matching Streamlit app)
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

