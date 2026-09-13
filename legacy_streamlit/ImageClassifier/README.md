# ImageClassifier Model Checkpoints

Model checkpoint weights (`*.ckpt`) have been consolidated into `backend/models/` to prevent repository binary duplication and streamline Docker container mounts.

To load or run these models, refer to:
- `backend/models/` (contains `EfficientNet.ckpt`, `InceptionV3.ckpt`, `MobileNetV2.ckpt`, `Xception.ckpt`, and `LogoYolobest.pt`)
