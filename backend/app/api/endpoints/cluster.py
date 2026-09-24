"""Interactive Clustering Sandbox API endpoints (K-Means & DBSCAN)."""

import math
import numpy as np
import pandas as pd
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from backend.app.api.deps import get_optional_user
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


def generate_synthetic_points(type_name: str, n_samples: int = 100, noise: float = 0.05) -> List[Point]:
    """Generates synthetic 2D datasets: blobs, moons, circles, aniso."""
    np.random.seed(42)
    type_name = type_name.lower()
    pts = []

    if type_name == "blobs":
        centers = [(2.0, 2.0), (-2.0, -2.0), (2.0, -2.0), (-2.0, 2.0)]
        for i in range(n_samples):
            c = centers[i % len(centers)]
            x = c[0] + np.random.normal(0, max(0.1, noise * 5))
            y = c[1] + np.random.normal(0, max(0.1, noise * 5))
            pts.append(Point(x=round(float(x), 2), y=round(float(y), 2), cluster=i % len(centers)))

    elif type_name == "moons":
        n_half = n_samples // 2
        for i in range(n_half):
            theta = math.pi * (i / max(1, n_half - 1))
            x = math.cos(theta) + np.random.normal(0, noise)
            y = math.sin(theta) + np.random.normal(0, noise)
            pts.append(Point(x=round(float(x), 2), y=round(float(y), 2), cluster=0))
        for i in range(n_samples - n_half):
            theta = math.pi * (i / max(1, n_samples - n_half - 1))
            x = 1.0 - math.cos(theta) + np.random.normal(0, noise)
            y = 1.0 - math.sin(theta) - 0.5 + np.random.normal(0, noise)
            pts.append(Point(x=round(float(x), 2), y=round(float(y), 2), cluster=1))

    elif type_name == "circles":
        n_half = n_samples // 2
        for i in range(n_half):
            theta = 2 * math.pi * (i / max(1, n_half))
            r = 0.4 + np.random.normal(0, noise * 0.5)
            pts.append(Point(x=round(float(r * math.cos(theta)), 2), y=round(float(r * math.sin(theta)), 2), cluster=0))
        for i in range(n_samples - n_half):
            theta = 2 * math.pi * (i / max(1, n_samples - n_half))
            r = 0.8 + np.random.normal(0, noise * 0.5)
            pts.append(Point(x=round(float(r * math.cos(theta)), 2), y=round(float(r * math.sin(theta)), 2), cluster=1))

    elif type_name == "aniso":
        centers = [(0.0, 0.0), (3.0, 3.0), (-3.0, 3.0)]
        for i in range(n_samples):
            c = centers[i % len(centers)]
            raw_x = np.random.normal(0, 1.0)
            raw_y = np.random.normal(0, 0.2)
            # Apply shear rotation
            x = c[0] + raw_x * 0.8 - raw_y * 0.6
            y = c[1] + raw_x * 0.3 + raw_y * 0.9
            pts.append(Point(x=round(float(x), 2), y=round(float(y), 2), cluster=i % len(centers)))

    else:
        # Fallback to random uniform
        for i in range(n_samples):
            pts.append(Point(
                x=round(float(np.random.uniform(-5, 5)), 2),
                y=round(float(np.random.uniform(-5, 5)), 2),
                cluster=0
            ))

    return pts


@router.get("/dataset")
async def get_raw_dataset(
    type: Optional[str] = Query(None, description="Dataset type: 'blobs', 'moons', 'circles', 'aniso'"),
    n_samples: Optional[int] = Query(None, ge=10, le=1000),
    noise: Optional[float] = Query(None, ge=0.0, le=1.0),
    current_user: Optional[UserResponse] = Depends(get_optional_user),
):
    """Returns unclustered dataset points (either concentric circles benchmark or synthetic generator)."""
    if type:
        pts = generate_synthetic_points(
            type_name=type,
            n_samples=n_samples or 100,
            noise=noise if noise is not None else 0.05
        )
        return {
            "total_points": len(pts),
            "points": pts
        }

    pts = [Point(x=round(float(row["x"]), 2), y=round(float(row["y"]), 2), cluster=0) for _, row in _cached_df.iterrows()]
    return {
        "total_points": len(pts),
        "points": pts
    }


def _numpy_kmeans(X, n_clusters, max_iter=25):
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

    # Compute inertia (sum of squared euclidean distances)
    min_dist_sq = np.min(np.sum((X[:, None] - centroids[None, :]) ** 2, axis=2), axis=1)
    inertia = float(np.sum(min_dist_sq))

    return labels, centroids, inertia


def _numpy_silhouette(X, labels, num_clusters):
    """Fast vectorized silhouette calculation."""
    if num_clusters <= 1 or len(X) <= num_clusters:
        return None
    # Subsample if dataset is large for ultra-fast latency (<20ms)
    n = len(X)
    if n > 400:
        idx = np.random.RandomState(42).choice(n, 400, replace=False)
        sub_X = X[idx]
        sub_labels = labels[idx]
    else:
        sub_X = X
        sub_labels = labels

    sub_n = len(sub_X)
    dists = np.linalg.norm(sub_X[:, None] - sub_X[None, :], axis=2)
    s_vals = []

    for i in range(sub_n):
        c_i = sub_labels[i]
        if c_i == -1:
            continue
        same_mask = (sub_labels == c_i)
        same_mask[i] = False
        if not np.any(same_mask):
            continue
        a_i = np.mean(dists[i, same_mask])

        b_i = float("inf")
        for other_c in range(num_clusters):
            if other_c == c_i:
                continue
            other_mask = (sub_labels == other_c)
            if np.any(other_mask):
                b_i = min(b_i, float(np.mean(dists[i, other_mask])))

        if math.isinf(b_i) or max(a_i, b_i) == 0:
            continue
        s_vals.append((b_i - a_i) / max(a_i, b_i))

    return round(float(np.mean(s_vals)), 3) if s_vals else None


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
    current_user: Optional[UserResponse] = Depends(get_optional_user),
):
    """Executes K-Means or DBSCAN clustering on benchmark or user-provided points."""
    algorithm = (request.algorithm or "kmeans").lower()
    k = request.k or request.n_clusters or 3

    if request.points is not None:
        if len(request.points) == 0:
            raise HTTPException(status_code=400, detail="Points array cannot be empty")
        if k > len(request.points):
            raise HTTPException(status_code=400, detail=f"k ({k}) cannot exceed number of points ({len(request.points)})")
        X = np.array(request.points, dtype=float)
    else:
        X = _cached_df[["x", "y"]].values

    centroids_list = None
    inertia_val = None

    if algorithm == "kmeans":
        labels, centroids, inertia_val = _numpy_kmeans(X, k)
        num_clusters = k
        num_noise = 0
        centroids_list = [[round(float(c), 4) for c in pt] for pt in centroids]
    else:
        # DBSCAN
        eps = request.eps if request.eps is not None else 25.0
        min_samp = request.min_samples if request.min_samples is not None else 5
        labels = _numpy_dbscan(X, eps, min_samp)
        unique_labels = set(labels)
        num_clusters = len(unique_labels - {-1})
        num_noise = int(np.sum(labels == -1))

    # Calculate silhouette score
    sil_score = _numpy_silhouette(X, labels, num_clusters)

    points_result = [
        Point(x=round(float(X[i][0]), 2), y=round(float(X[i][1]), 2), cluster=int(labels[i]))
        for i in range(len(X))
    ]

    return ClusterResponse(
        algorithm=algorithm.upper(),
        num_clusters=num_clusters,
        num_noise=num_noise,
        points=points_result,
        silhouette_score=sil_score,
        centroids=centroids_list,
        labels=[int(l) for l in labels],
        inertia=round(inertia_val, 2) if inertia_val is not None else None
    )


@router.get("/kdist")
async def get_kdist_graph(
    k: Optional[int] = Query(4, ge=1, le=20),
    current_user: Optional[UserResponse] = Depends(get_optional_user),
):
    """Computes sorted k-nearest neighbor distances for DBSCAN epsilon tuning."""
    X = _cached_df[["x", "y"]].values
    target_k = min(max(1, k or 4), len(X) - 1)

    dists = []
    chunk_size = 500
    for i in range(0, len(X), chunk_size):
        chunk = X[i:i+chunk_size]
        d = np.linalg.norm(chunk[:, None] - X[None, :], axis=2)
        d.sort(axis=1)
        dists.extend(d[:, target_k])
    k_dists = np.sort(dists)

    d_list = [round(float(d), 2) for d in k_dists]
    return {
        "x": list(range(len(k_dists))),
        "y": d_list,
        "distances": d_list
    }
