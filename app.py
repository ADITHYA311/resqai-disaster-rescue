from flask import Flask, render_template, request, jsonify
from pathlib import Path
import sqlite3
from datetime import datetime, timezone
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / 'resqai.db'
app = Flask(__name__)

# DEMO MODEL ONLY: synthetic data for a hackathon prototype, not a validated forecast.
def build_demo_model():
    rng = np.random.default_rng(42)
    n = 2500
    rainfall = rng.uniform(0, 250, n)       # mm / 24 hours
    river = rng.uniform(0, 10, n)           # normalized local gauge level, demo scale
    soil = rng.uniform(0, 100, n)           # percent saturation
    # Synthetic label rule adds some noise so a model can learn a pattern.
    score = (rainfall / 250) * 0.48 + (river / 10) * 0.36 + (soil / 100) * 0.16
    noisy_score = score + rng.normal(0, 0.07, n)
    labels = np.where(noisy_score >= 0.68, 2, np.where(noisy_score >= 0.43, 1, 0))
    X = np.column_stack([rainfall, river, soil])
    X_train, X_test, y_train, y_test = train_test_split(X, labels, test_size=0.2, random_state=42, stratify=labels)
    model = RandomForestClassifier(n_estimators=120, max_depth=8, random_state=42, class_weight='balanced')
    model.fit(X_train, y_train)
    accuracy = accuracy_score(y_test, model.predict(X_test))
    return model, accuracy

MODEL, DEMO_ACCURACY = build_demo_model()
LEVELS = ['LOW', 'MODERATE', 'HIGH']


def connect_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with connect_db() as conn:
        conn.execute('''CREATE TABLE IF NOT EXISTS rescue_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            phone TEXT NOT NULL,
            location TEXT NOT NULL,
            emergency_type TEXT NOT NULL,
            people INTEGER NOT NULL DEFAULT 1,
            details TEXT DEFAULT '',
            status TEXT NOT NULL DEFAULT 'NEW',
            created_at TEXT NOT NULL
        )''')


def risk_for(rainfall, river, soil):
    X = np.array([[rainfall, river, soil]], dtype=float)
    probabilities = MODEL.predict_proba(X)[0]
    predicted = int(MODEL.predict(X)[0])
    # A confidence score is shown as model confidence, not forecast certainty.
    return {
        'level': LEVELS[predicted],
        'risk_score': round(float(probabilities[1] * 50 + probabilities[2] * 100)),
        'model_confidence': round(float(max(probabilities)) * 100),
        'probabilities': {LEVELS[int(cls)]: round(float(probabilities[i]) * 100, 1) for i, cls in enumerate(MODEL.classes_)},
        'demo_model_accuracy': round(DEMO_ACCURACY * 100, 1),
        'data_mode': 'SIMULATED DEMO MODEL'
    }


@app.route('/')
def index():
    return render_template('index.html')


@app.get('/api/summary')
def summary():
    with connect_db() as conn:
        rows = conn.execute('SELECT status, COUNT(*) AS total FROM rescue_requests GROUP BY status').fetchall()
        recent = conn.execute('SELECT * FROM rescue_requests ORDER BY id DESC LIMIT 5').fetchall()
        total = conn.execute('SELECT COUNT(*) FROM rescue_requests').fetchone()[0]
    counts = {row['status']: row['total'] for row in rows}
    return jsonify({
        'total_requests': total,
        'new_requests': counts.get('NEW', 0),
        'in_progress': counts.get('IN PROGRESS', 0),
        'resolved': counts.get('RESOLVED', 0),
        'recent_requests': [dict(r) for r in recent],
        'data_mode': 'DEMO / LOCAL DATABASE'
    })


@app.post('/api/predict')
def predict():
    payload = request.get_json(silent=True) or {}
    try:
        rainfall = float(payload.get('rainfall', 75))
        river = float(payload.get('river_level', 4))
        soil = float(payload.get('soil_saturation', 55))
    except (TypeError, ValueError):
        return jsonify({'error': 'Please enter valid numeric values.'}), 400
    if not (0 <= rainfall <= 300 and 0 <= river <= 10 and 0 <= soil <= 100):
        return jsonify({'error': 'Rainfall must be 0–300 mm, river level 0–10, and soil saturation 0–100%.'}), 400
    return jsonify(risk_for(rainfall, river, soil))


@app.get('/api/requests')
def list_requests():
    with connect_db() as conn:
        rows = conn.execute('SELECT * FROM rescue_requests ORDER BY id DESC LIMIT 100').fetchall()
    return jsonify([dict(r) for r in rows])


@app.post('/api/requests')
def create_request():
    payload = request.get_json(silent=True) or {}
    fields = ['name', 'phone', 'location', 'emergency_type']
    values = {key: str(payload.get(key, '')).strip() for key in fields}
    if any(not values[key] for key in fields):
        return jsonify({'error': 'Please fill in name, phone, location, and emergency type.'}), 400
    try:
        people = int(payload.get('people', 1))
    except (TypeError, ValueError):
        return jsonify({'error': 'People count must be a number.'}), 400
    if people < 1 or people > 1000:
        return jsonify({'error': 'People count must be between 1 and 1000.'}), 400
    created_at = datetime.now(timezone.utc).isoformat(timespec='seconds')
    with connect_db() as conn:
        cur = conn.execute('''INSERT INTO rescue_requests
            (name, phone, location, emergency_type, people, details, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 'NEW', ?)''',
            (values['name'][:100], values['phone'][:40], values['location'][:200], values['emergency_type'][:80], people, str(payload.get('details', '')).strip()[:1000], created_at))
        request_id = cur.lastrowid
    return jsonify({'message': 'Demo rescue request submitted.', 'id': request_id}), 201


@app.patch('/api/requests/<int:request_id>')
def update_request(request_id):
    payload = request.get_json(silent=True) or {}
    status = str(payload.get('status', '')).upper().strip()
    if status not in ['NEW', 'IN PROGRESS', 'RESOLVED']:
        return jsonify({'error': 'Status must be NEW, IN PROGRESS, or RESOLVED.'}), 400
    with connect_db() as conn:
        cur = conn.execute('UPDATE rescue_requests SET status=? WHERE id=?', (status, request_id))
        if cur.rowcount == 0:
            return jsonify({'error': 'Request not found.'}), 404
    return jsonify({'message': 'Status updated.', 'id': request_id, 'status': status})


@app.get('/api/health')
def health():
    return jsonify({'status': 'ok', 'mode': 'prototype', 'model': 'synthetic-data RandomForest; not validated for real emergencies'})


init_db()

if __name__ == '__main__':
    app.run(debug=True, host='127.0.0.1', port=5000)
