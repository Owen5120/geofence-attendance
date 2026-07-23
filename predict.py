import sys
import json
import warnings
import numpy as np
import pandas as pd
import pickle

# Suppress sklearn feature name warnings in stdout
warnings.filterwarnings("ignore", category=UserWarning)

# Haversine distance formula (meters)
def haversine_distance(lat1, lon1, lat2, lon2):
    R = 6371000  # Radius of Earth in meters
    phi1, phi2 = np.radians(lat1), np.radians(lat2)
    dphi = np.radians(lat2 - lat1)
    dlambda = np.radians(lon2 - lon1)
    
    a = np.sin(dphi / 2)**2 + np.cos(phi1) * np.cos(phi2) * np.sin(dlambda / 2)**2
    return R * 2 * np.arctan2(np.sqrt(a), np.sqrt(1 - a))

def predict():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Missing input JSON argument"}))
        sys.exit(1)

    try:
        # Load input arguments passed from server.js
        input_data = json.loads(sys.argv[1])
        
        # Student Telemetry
        s_lat = float(input_data['studentLat'])
        s_lng = float(input_data['studentLng'])
        s_noise = float(input_data['studentNoise'])
        s_temp = float(input_data['studentTemp'])
        
        # Lecturer/Session Baseline Parameters
        b_lat = float(input_data['baseLat'])
        b_lng = float(input_data['baseLng'])
        b_noise = float(input_data['baseNoise'])
        b_temp = float(input_data['baseTemp'])
        
        # Compute 3D Delta Vector: x = [geo_delta, noise_delta, temp_delta]
        geo_delta = haversine_distance(s_lat, s_lng, b_lat, b_lng)
        noise_delta = abs(s_noise - b_noise)
        temp_delta = abs(s_temp - b_temp)
        
        # Load Model and Scaler
        with open('attendance_model.pkl', 'rb') as f:
            saved_artifacts = pickle.load(f)
            
        model = saved_artifacts['model']
        scaler = saved_artifacts['scaler']
        
        # Prepare feature vector as DataFrame to maintain feature names
        features_df = pd.DataFrame([[geo_delta, noise_delta, temp_delta]], 
                                   columns=['geo_delta', 'noise_delta', 'temp_delta'])
        features_scaled = scaler.transform(features_df)
        
        # Model Inference
        predicted_state = int(model.predict(features_scaled)[0])
        probabilities = model.predict_proba(features_scaled)[0]
        confidence = float(probabilities[predicted_state])
        
        # Output JSON result back to server.js
        output = {
            "predicted_state": predicted_state,
            "confidence": confidence,
            "geo_delta": round(geo_delta, 2),
            "noise_delta": round(noise_delta, 2),
            "temp_delta": round(temp_delta, 2)
        }
        
        print(json.dumps(output))

    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)

if __name__ == '__main__':
    predict()