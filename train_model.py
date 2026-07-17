# train_model.py
import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier
import pickle

print("Loading artificial attendance logs...")
df = pd.read_csv('artificial_attendance_data.csv')

# Classroom Baseline Values used during generation
CLASSROOM_LAT = 6.2441
CLASSROOM_LNG = 5.6322
BASE_NOISE = 65.0
BASE_TEMP = 26.0

print("Engineering features (calculating variance deltas)...")
# We explicitly train the model on pure DELTAS (differences)
df['lat_diff'] = abs(df['latitude'] - CLASSROOM_LAT)
df['lng_diff'] = abs(df['longitude'] - CLASSROOM_LNG)
df['noise_diff'] = abs(df['noise_level'] - BASE_NOISE)
df['temp_diff'] = abs(df['temperature'] - BASE_TEMP)

# Features (X) and Target Labels (y)
X = df[['lat_diff', 'lng_diff', 'noise_diff', 'temp_diff']]
y = df['is_verified']

print("Training real Random Forest Machine Learning Model...")
# Use a slightly lower max_depth to prevent the model from memorizing the specific numbers
model = RandomForestClassifier(n_estimators=100, max_depth=8, random_state=42)
model.fit(X, y)

# Evaluate training baseline metrics
accuracy = model.score(X, y) * 100

print(f"\n===== MODEL TRAINING COMPLETE =====")
print(f"Machine Learning Verification Accuracy: {accuracy:.2f}%")
print("====================================")

# Save the genuine model weights file
with open('attendance_model.pkl', 'wb') as file:
    pickle.dump(model, file)

print("Model saved successfully as 'attendance_model.pkl'!")