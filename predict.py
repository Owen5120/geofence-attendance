# predict.py
import sys, json, pickle
import numpy as np

def main():
    # vals format: [student_lat, student_lng, student_noise, student_temp, session_lat, session_lng, session_noise, session_temp]
    vals = [float(x) for x in sys.argv[1:]]
    
    # Calculate Deltas (Differences)
    lat_diff = abs(vals[0] - vals[4])
    lng_diff = abs(vals[1] - vals[5])
    noise_diff = abs(vals[2] - vals[6])
    temp_diff = abs(vals[3] - vals[7])
    
    # Debug print so you can see exactly what the Python script receives
    print(f"[Python Debug] Calculated Deltas -> Lat Diff: {lat_diff:.6f}, Lng Diff: {lng_diff:.6f}, Noise Diff: {noise_diff:.2f}dB, Temp Diff: {temp_diff:.2f}°C", file=sys.stderr)
    
    with open('attendance_model.pkl', 'rb') as f:
        model = pickle.load(f)
        
    # Predict based on differences
    features = np.array([[lat_diff, lng_diff, noise_diff, temp_diff]])
    prediction = int(model.predict(features)[0])
    score = float(model.predict_proba(features)[0].max())
    
    # Send JSON back to Node.js via stdout
    print(json.dumps({"success": True, "prediction": prediction, "score": score}))

if __name__ == "__main__":
    main()