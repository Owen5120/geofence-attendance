import pandas as pd
import numpy as np

# Target: 5,000 artificial records
n_samples = 5000

# Fixed Baseline Parameters
CLASSROOM_BASE_NOISE = 65.0  # Decibel baseline during a crowded lecture
CLASSROOM_BASE_TEMP = 26.0   # Target room temperature (Celsius)

# Haversine distance calculation in meters
def haversine_distance(lat1, lon1, lat2, lon2):
    R = 6371000  # Radius of Earth in meters
    phi1, phi2 = np.radians(lat1), np.radians(lat2)
    dphi = np.radians(lat2 - lat1)
    dlambda = np.radians(lon2 - lon1)
    
    a = np.sin(dphi / 2)**2 + np.cos(phi1) * np.cos(phi2) * np.sin(dlambda / 2)**2
    return R * 2 * np.arctan2(np.sqrt(a), np.sqrt(1 - a))

data = []

for _ in range(n_samples):
    # Equal class distribution across 3 occupancy states (0: Empty, 1: Partially Full, 2: Full)
    state = np.random.choice([0, 1, 2])
    
    # 80% chance of valid spatial proximity (within 25m threshold)
    is_within_geofence = np.random.choice([True, False], p=[0.8, 0.2])
    
    if is_within_geofence:
        # Distance between 0m and 25m
        geo_delta = np.random.uniform(0.0, 25.0)
    else:
        # Distance outside 25m (26m up to 150m)
        geo_delta = np.random.uniform(26.0, 150.0)
        
    # Feature deltas based on state characteristics
    if state == 0:  # Empty Classroom
        noise_delta = np.abs(np.random.normal(25.0, 5.0))  # Significant noise variance drop
        temp_delta = np.abs(np.random.normal(3.0, 1.0))   # Temperature variance
    elif state == 1:  # Partially Full
        noise_delta = np.abs(np.random.normal(10.0, 3.0))
        temp_delta = np.abs(np.random.normal(1.5, 0.5))
    else:  # Full Classroom
        noise_delta = np.abs(np.random.normal(2.0, 1.5))   # Minimal deviation from baseline
        temp_delta = np.abs(np.random.normal(0.4, 0.2))

    data.append([geo_delta, noise_delta, temp_delta, state])

# Build dataset using exact feature delta vectors
df = pd.DataFrame(data, columns=['geo_delta', 'noise_delta', 'temp_delta', 'state_label'])
df.to_csv('artificial_attendance_data.csv', index=False)
print("Updated dataset generated: 5,000 samples with 25m spatial boundaries and feature delta vectors!")