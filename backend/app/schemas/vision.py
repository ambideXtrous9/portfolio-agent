"""Vision AI Pydantic Schemas."""

from typing import Optional, List, Dict, Any
from pydantic import BaseModel


class PredictionItem(BaseModel):
    label: str
    confidence: float
    percentage: str


class ClassificationResponse(BaseModel):
    model_name: str
    top_prediction: str
    confidence: float
    predictions: List[PredictionItem]
    model_used: Optional[str] = None
    image_size: Optional[List[int]] = None


class ModelEvaluationCard(BaseModel):
    model_name: str
    size_mb: float
    parameters_m: float
    predicted_class: str
    accuracy: float
    inference_time_seconds: float
    inference_time: Optional[float] = None



class MultiModelComparisonResponse(BaseModel):
    models: List[ModelEvaluationCard]
    uploaded_image_base64: Optional[str] = None
    fastest_model: Optional[str] = None


class BoundingBox(BaseModel):
    label: str
    confidence: float
    box: List[float]  # [x1, y1, x2, y2]


class YoloDetectionResponse(BaseModel):
    total_detections: int
    detections: List[BoundingBox]
    annotated_image_base64: Optional[str] = None
