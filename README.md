# ResQAI — AI Disaster Alert & Rescue System

A dark-theme hackathon prototype built with Flask, scikit-learn, SQLite, and Leaflet.

## Features
- Random Forest demo flood-risk classifier trained on generated synthetic data
- Adjustable rainfall, river gauge level, and soil saturation inputs
- Interactive illustrative map with clearly labeled sample markers
- Rescue request form and local SQLite persistence
- Admin-style request queue with status updates
- Responsive dashboard

## Important safety / data note
This is a demonstration only. The model is trained on synthetic data and has **not** been validated for real-world flood forecasting. Its test accuracy measures performance only on a held-out split of synthetic data, not real disasters. Map markers are illustrative. No real-time weather or official alert service is connected. Do not use this application to make emergency decisions or submit real personal information. For actual emergencies, contact local emergency services and follow official government warnings.

## Requirements
- Python 3.10 or newer recommended
- Internet connection for Google Fonts, OpenStreetMap map tiles, and JavaScript/CSS CDN libraries

## Run on Windows (PowerShell or Command Prompt)
1. Extract the ZIP and open a terminal in the `resqai` folder.
2. Create a virtual environment:
   ```powershell
   py -m venv .venv
   ```
3. Activate it in PowerShell:
   ```powershell
   .\.venv\Scripts\Activate.ps1
   ```
   If using Command Prompt instead:
   ```bat
   .venv\Scripts\activate.bat
   ```
4. Install dependencies:
   ```powershell
   python -m pip install --upgrade pip
   pip install -r requirements.txt
   ```
5. Start the app:
   ```powershell
   python app.py
   ```
6. Open **http://127.0.0.1:5000** in your browser.
7. Stop the server with `Ctrl+C`.

## Run on macOS / Linux
```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
python app.py
```
Then visit http://127.0.0.1:5000.

## Project structure
```text
resqai/
├── app.py
├── requirements.txt
├── README.md
├── templates/
│   └── index.html
├── static/
│   ├── style.css
│   └── app.js
└── resqai.db       # created automatically on first run
```

## API routes
- `GET /api/health` — local prototype status
- `GET /api/summary` — request summary counts
- `POST /api/predict` — estimate risk from `rainfall`, `river_level`, and `soil_saturation`
- `GET /api/requests` — list demo requests
- `POST /api/requests` — submit a demo request
- `PATCH /api/requests/<id>` — update request status to `NEW`, `IN PROGRESS`, or `RESOLVED`

Example prediction request JSON:
```json
{"rainfall": 120, "river_level": 6.5, "soil_saturation": 75}
```
