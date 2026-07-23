import pandas as pd
import numpy as np
from sklearn.neural_network import MLPClassifier
from sklearn.preprocessing import StandardScaler
import pickle

print("Loading dataset with feature deltas...")
df = pd.read_csv('artificial_attendance_data.csv')

# Features (x = [geo_delta, noise_delta, temp_delta])
X = df[['geo_delta', 'noise_delta', 'temp_delta']]
y = df['state_label']

# Scale features for neural network convergence
scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)

print("Training 3-State Deep Neural Network (DNN) Classifier (64 -> 32 -> 16)...")
dnn_model = MLPClassifier(
    hidden_layer_sizes=(64, 32, 16),
    activation='relu',
    solver='adam',
    max_iter=500,
    random_state=42
)

dnn_model.fit(X_scaled, y)

# Evaluate training accuracy
accuracy = dnn_model.score(X_scaled, y) * 100

print(f"\n===== MODEL TRAINING COMPLETE =====")
print(f"DNN Classification Accuracy: {accuracy:.2f}%")
print("====================================")

# Save both the trained model AND the feature scaler
with open('attendance_model.pkl', 'wb') as f:
    pickle.dump({'model': dnn_model, 'scaler': scaler}, f)

print("Model & Scaler saved successfully into 'attendance_model.pkl'!")