"""Interactive Clustering Sandbox API endpoints (K-Means & DBSCAN)."""

import math
import numpy as np
import pandas as pd
from typing import List
from fastapi import APIRouter, Depends
from backend.app.api.deps import get_current_active_user
from backend.app.schemas.auth import UserResponse

try:
    from sklearn.cluster import KMeans, DBSCAN
    from sklearn.metrics import silhouette_score
except ImportError:
    KMeans = None
    DBSCAN = None
    silhouette_score = None

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
async def get_raw_dataset(
    current_user: UserResponse = Depends(get_current_active_user),
):
    """Returns the unclustered concentric circle dataset points."""
    pts = [Point(x=round(float(row["x"]), 2), y=round(float(row["y"]), 2), cluster=0) for _, row in _cached_df.iterrows()]
    return {
        "total_points": len(pts),
        "points": pts
    }


def _numpy_kmeans(X, n_clusters, max_iter=20):
    np.random.seed(42)
    indices = np.random.choice(len(X), n_clusters, replace=False)
    centroids = X[indices].copy()
    labels = np.zeros(len(X), dtype=int)
    for _ in range(max_iter):
        dist = np.linalg.norm(X[:, None] - centroids[None, :], axis=2)
        new_labels = np.argmin(dist, axis=1)
        if np.array_equal(labels, new_labels):
            break
        labels = new_labels
        for k in range(n_clusters):
            members = X[labels == k]
            if len(members) > 0:
                centroids[k] = members.mean(axis=0)
    return labels


def _numpy_dbscan(X, eps, min_samples):
    n = len(X)
    dist = np.linalg.norm(X[:, None] - X[None, :], axis=2)
    neighbors = [np.where(dist[i] <= eps)[0] for i in range(n)]
    labels = np.full(n, -1, dtype=int)
    cluster_id = 0
    visited = np.zeros(n, dtype=bool)

    for i in range(n):
        if visited[i]:
            continue
        visited[i] = True
        if len(neighbors[i]) < min_samples:
            labels[i] = -1
        else:
            labels[i] = cluster_id
            seeds = list(neighbors[i])
            if i in seeds:
                seeds.remove(i)
            while seeds:
                curr = seeds.pop(0)
                if not visited[curr]:
                    visited[curr] = True
                    curr_neighbors = neighbors[curr]
                    if len(curr_neighbors) >= min_samples:
                        for c in curr_neighbors:
                            if not visited[c] and c not in seeds:
                                seeds.append(c)
                if labels[curr] == -1:
                    labels[curr] = cluster_id
            cluster_id += 1
    return labels


@router.post("/run", response_model=ClusterResponse)
async def run_clustering(
    request: ClusterRequest,
    current_user: UserResponse = Depends(get_current_active_user),
):
    """Executes K-Means or DBSCAN clustering on the 2D benchmark dataset."""
    X = _cached_df[["x", "y"]].values

    if request.algorithm.lower() == "kmeans":
        if KMeans is not None:
            model = KMeans(n_clusters=request.n_clusters, random_state=42, n_init=10)
            labels = model.fit_predict(X)
        else:
            labels = _numpy_kmeans(X, request.n_clusters)
        num_clusters = request.n_clusters
        num_noise = 0
    else:
        # DBSCAN
        if DBSCAN is not None:
            model = DBSCAN(eps=request.eps, min_samples=request.min_samples)
            labels = model.fit_predict(X)
        else:
            labels = _numpy_dbscan(X, request.eps, request.min_samples)
        unique_labels = set(labels)
        num_clusters = len(unique_labels - {-1})
        num_noise = int(np.sum(labels == -1))

    # Calculate silhouette score if >1 clusters exist
    sil_score = None
    if num_clusters > 1 and silhouette_score is not None:
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
async def get_kdist_graph(
    current_user: UserResponse = Depends(get_current_active_user),
):
    """Computes sorted 2nd nearest neighbor distances for DBSCAN epsilon tuning."""
    X = _cached_df[["x", "y"]].values
    try:
        from sklearn.neighbors import NearestNeighbors
        neigh = NearestNeighbors(n_neighbors=5)
        nbrs = neigh.fit(X)
        distances, _ = nbrs.kneighbors(X)
        distances = np.sort(distances, axis=0)
        k_dists = distances[:, 1]
    except Exception:
        dists = []
        chunk_size = 500
        for i in range(0, len(X), chunk_size):
            chunk = X[i:i+chunk_size]
            d = np.linalg.norm(chunk[:, None] - X[None, :], axis=2)
            d.sort(axis=1)
            dists.extend(d[:, 1])
        k_dists = np.sort(dists)

    return {
        "x": list(range(len(k_dists))),
        "y": [round(float(d), 2) for d in k_dists]
    }

