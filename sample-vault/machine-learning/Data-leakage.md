---
sample: true
created: 2026-03-11
tags: [machine-learning, evaluation]
---
# Data leakage

Leakage happens when training or model selection gets information that would not be available at prediction time. A random split can leak near-duplicate records; a preprocessing step can leak statistics from the held-out set. A clean [[Train-validation-test split]] is necessary, but the split must also match how the model will be used.

Related: [[A reliable baseline]], [[Evaluation data]]
