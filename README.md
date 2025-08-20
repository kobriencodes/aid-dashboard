# Aid Dashboard - Gaza

## Mission Statement
The **Aid Dashboard** is an open-source humanitarian mapping tool designed to provide real-time, reliable, and accessible data to aid organizations, journalists, and civilians during crises.  
The goal is to centralize and visualize information about **health facilities, roads, checkpoints, border crossings, and eventually food, water, and shelter locations**, ensuring resources are distributed more effectively in conflict zones like Gaza.

By connecting verified data sources and enabling secure volunteer contributions, the project seeks to empower decision-making with up-to-date and actionable information.

---

## Features
- **Interactive Map** powered by Leaflet.js with clustering and filtering
- **Multi-language support** (English and Arabic)
- Filter by **type, service, urbanization, and governorate**
- Layers for **roads, checkpoints, and borders**
- Detailed facility info pop-up
- **Search functionality**
- Modularized frontend and backend for maintainability
- Ready for **secure volunteer admin tools** to update datasets
- Designed to be expandable to include food banks, water points, and shelters

---

## Installation

### 1. Clone the Repository
```bash
git clone https://github.com/yourusername/safe-aid-dashboard.git
cd safe-aid-dashboard
```

### 2. Install Dependencies
This project uses **Poetry** for Python dependency management.

```bash
poetry install
```

For frontend development, install dependencies if needed (currently pure HTML/CSS/JS, no bundler required).

### 3. Set Up Environment Variables
Create a `.env` file in the **project root** (same level as `pyproject.toml`):

```env
API_KEY=changeme
BORDER_CROSSINGS_PATH=aid_dashboard_data/borders/border_crossings.geojson
CHECKPOINTS_PATH=aid_dashboard_data/checkpoints/gaza_roads_checkpoints.geojson
HEALTH_FACILITIES_PATH=aid_dashboard_data/health_centers/opt_healthfacilities.json
```

> **Note:** Do **not** commit your `.env` file. Use `.env.example` for placeholders.

### 4. Run the Backend
```bash
poetry run flask --app backend.app run --debug
```

This starts the API at `http://127.0.0.1:5000`.

### 5. Run the Frontend
Serve the frontend with your preferred method (e.g., Live Server in VS Code, Python’s HTTP server):

```bash
cd frontend
python -m http.server 5500
```

Then open `http://127.0.0.1:5500` in your browser.

---

## Data Updates (Admin Usage)
Admins can upload **GeoJSON** or **CSV** files to update datasets.

Planned secure endpoint:
```
POST /admin/update/<dataset_type>
Headers: X-API-Key: <your_api_key>
Body: multipart/form-data with file upload
```

Example:
```bash
curl -X POST http://127.0.0.1:5000/admin/update/health_facilities   -H "X-API-Key: supersecret"   -F "file=@opt_healthfacilities.json"
```

Dataset types:
- `health_facilities`
- `borders`
- `checkpoints`
- `roads`

---

## Contributing
We welcome contributors to:
- Improve frontend usability
- Add more verified datasets
- Improve backend automation pipelines
- Translate UI and data

Please submit pull requests and document all changes.

---

## License
MIT License — free to use and adapt with attribution.
