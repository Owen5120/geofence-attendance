import pandas as pd
import numpy as np

# Target: 5,000 artificial records
n_samples = 5000

# Fixed Reference Classroom Core Coordinates
CLASSROOM_LAT = 6.2441
CLASSROOM_LNG = 5.6322
CLASSROOM_BASE_NOISE = 65.0  # Decibel baseline during a crowded lecture
CLASSROOM_BASE_TEMP = 26.0   # Target room temperature (Celsius)

# 500 meters is approximately 0.0045 decimal degrees
GEOFENCE_LIMIT = 0.0045 

data = []

for _ in range(n_samples):
    # 50% chance the student is actually in class, 50% chance they are spoofing
    is_present = np.random.choice([1, 0])
    
    if is_present == 1:
        # Authentic check-in: Anywhere within 500 meters (0.0045 degrees)
        # Using a uniform circular distribution to evenly map the 500m radius
        angle = np.random.uniform(0, 2 * np.pi)
        radius = np.random.uniform(0, GEOFENCE_LIMIT)
        
        lat = CLASSROOM_LAT + (radius * np.cos(angle))
        lng = CLASSROOM_LNG + (radius * np.sin(angle))
        noise = CLASSROOM_BASE_NOISE + np.random.normal(0, 4.0)
        temp = CLASSROOM_BASE_TEMP + np.random.normal(0, 0.5)
    else:
        # Fraudulent check-in attempt variations
        spoof_type = np.random.choice(['wrong_gps', 'wrong_noise', 'wrong_both'])
        
        if spoof_type == 'wrong_gps':
            # Remote location (strictly OUTSIDE the 500m geofence: from 550m up to 5km away)
            angle = np.random.uniform(0, 2 * np.pi)
            radius = np.random.uniform(GEOFENCE_LIMIT + 0.0005, 0.045)
            
            lat = CLASSROOM_LAT + (radius * np.cos(angle))
            lng = CLASSROOM_LNG + (radius * np.sin(angle))
            noise = CLASSROOM_BASE_NOISE + np.random.normal(0, 4.0)
            temp = CLASSROOM_BASE_TEMP + np.random.normal(0, 0.5)
            
        elif spoof_type == 'wrong_noise':
            # Right location (inside 500m), but telemetry shows they are somewhere else (e.g. quiet room at home)
            angle = np.random.uniform(0, 2 * np.pi)
            radius = np.random.uniform(0, GEOFENCE_LIMIT)
            
            lat = CLASSROOM_LAT + (radius * np.cos(angle))
            lng = CLASSROOM_LNG + (radius * np.sin(angle))
            noise = 32.0 + np.random.normal(0, 3.0) 
            temp = CLASSROOM_BASE_TEMP + np.random.normal(0, 0.5)
            
        else:
            # Entirely wrong parameters (trying to check in from a distance normally)
            lat = CLASSROOM_LAT + np.random.uniform(0.01, 0.05)
            lng = CLASSROOM_LNG + np.random.uniform(0.01, 0.05)
            noise = 35.0 + np.random.normal(0, 4.0)
            temp = 31.0 + np.random.normal(0, 1.5)

    data.append([lat, lng, noise, temp, is_present])

# Package and build the dataset
df = pd.DataFrame(data, columns=['latitude', 'longitude', 'noise_level', 'temperature', 'is_verified'])
df.to_csv('artificial_attendance_data.csv', index=False)
print("Artificial database file successfully populated with 5,000 entries (500m Geofence optimized)!")