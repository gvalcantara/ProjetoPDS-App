import json

import pytest
from fastapi.testclient import TestClient
from app.main import app


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv('HATTRICK_STORAGE', str(tmp_path))
    return TestClient(app)


def field_data():
    return {'width': 100, 'height': 80, 'frame_time_seconds': 1.25, 'marks': {
        'top': [[0, 0], [99, 0]], 'bottom': [[0, 79], [99, 79]],
        'left': [[0, 0], [0, 79]], 'right': [[99, 0], [99, 79]]}}


def test_upload_field_and_video(client, tmp_path):
    response = client.post('/api/submissions', data={'calibration_type': 'field', 'field_data': json.dumps(field_data())}, files={'video': ('match.mp4', b'video-data', 'video/mp4')})
    assert response.status_code == 201
    folder = tmp_path / response.json()['id']
    assert (folder / 'video.mp4').read_bytes() == b'video-data'
    metadata = json.loads((folder / 'submission.json').read_text())
    assert metadata['field_data'] == field_data()
    assert metadata['status'] == 'received'


def test_upload_camera(client, tmp_path):
    response = client.post('/api/submissions', data={'calibration_type': 'camera'}, files={'video': ('match.mov', b'video', 'video/quicktime'), 'camera': ('camera.yml', b'camera_model: radial', 'application/yaml')})
    assert response.status_code == 201
    assert (tmp_path / response.json()['id'] / 'camera.yaml').read_bytes() == b'camera_model: radial'


def test_rejects_out_of_bounds_and_empty_video(client, tmp_path):
    field = field_data()
    field['marks']['top'][1][0] = 100
    response = client.post('/api/submissions', data={'calibration_type': 'field', 'field_data': json.dumps(field)}, files={'video': ('match.mp4', b'video')})
    assert response.status_code == 422
    response = client.post('/api/submissions', data={'calibration_type': 'field', 'field_data': json.dumps(field_data())}, files={'video': ('match.mp4', b'')})
    assert response.status_code == 422
    assert list(tmp_path.iterdir()) == []


def test_rejects_missing_or_conflicting_calibration(client):
    assert client.post('/api/submissions', data={'calibration_type': 'camera'}, files={'video': ('match.mp4', b'video')}).status_code == 422
    assert client.post('/api/submissions', data={'calibration_type': 'camera', 'field_data': '{}'}, files={'video': ('match.mp4', b'video'), 'camera': ('camera.yaml', b'x')}).status_code == 422
