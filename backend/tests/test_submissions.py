import json

import pytest
from fastapi.testclient import TestClient
from app.main import app
from app import main
from hattrick_ai import Posicao, Trajetoria
from types import SimpleNamespace

real_process_submission = main.process_submission


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv('HATTRICK_STORAGE', str(tmp_path))
    monkeypatch.setattr(main, 'process_submission', lambda folder: None)
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


@pytest.mark.parametrize('kind', ['field', 'camera'])
def test_processes_submission_and_exposes_trajectories(client, tmp_path, monkeypatch, kind):
    monkeypatch.setattr(main, 'process_submission', real_process_submission)
    class Video:
        def __init__(self, path): pass
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def metadados(self): return SimpleNamespace(largura=100, altura=80, total_quadros=2)
    class Calibrator:
        def conectar_linhas(self, marks): return marks
        def calibrar(self, marks, dimensions):
            assert dimensions == (100, 80)
            return SimpleNamespace(salvar=lambda path: path.write_text('calibration'))
    class Extractor:
        def __init__(self, camera, dispositivo):
            assert dispositivo == '0'
            assert camera.read_text() in ('calibration', 'camera')
        def processar(self, video, ao_processar_quadro):
            assert video.read_bytes() == b'video'
            ao_processar_quadro(0, [], [])
            ao_processar_quadro(.2, [], [])
            return [Trajetoria(7, [Posicao(0.0, .5, -.5)])]
    monkeypatch.setattr(main, 'LeitorVideo', Video)
    monkeypatch.setattr(main, 'CalibradorCampo', Calibrator)
    monkeypatch.setattr(main, 'ExtratorTrajetorias', Extractor)
    data = {'calibration_type': kind}
    files = {'video': ('match.mp4', b'video')}
    if kind == 'field': data['field_data'] = json.dumps(field_data())
    else: files['camera'] = ('camera.yaml', b'camera')
    response = client.post('/api/submissions', data=data, files=files)
    assert response.status_code == 201
    result = client.get('/api/submissions/' + response.json()['id']).json()
    assert result['status'] == 'completed'
    assert result['progress']['frames_processed'] == 2
    assert result['progress']['total_frames'] == 2
    assert result['progress']['estimated_seconds_remaining'] == 0
    assert result['trajetorias'] == [{'id_rastreamento': 7, 'posicoes': [{'instante': 0.0, 'x': .5, 'y': -.5}]}]


def test_processing_failure_and_unknown_submission(client, monkeypatch):
    monkeypatch.setattr(main, 'process_submission', real_process_submission)
    class Video:
        def __init__(self, path): pass
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def metadados(self): return SimpleNamespace(largura=100, altura=80, total_quadros=0)
    monkeypatch.setattr(main, 'LeitorVideo', Video)
    class Extractor:
        def __init__(self, camera, dispositivo): raise ValueError('invalid calibration')
    monkeypatch.setattr(main, 'ExtratorTrajetorias', Extractor)
    response = client.post('/api/submissions', data={'calibration_type': 'camera'},
                           files={'video': ('match.mp4', b'video'), 'camera': ('camera.yaml', b'bad')})
    result = client.get('/api/submissions/' + response.json()['id']).json()
    assert result['status'] == 'failed'
    assert result['error']
    assert client.get('/api/submissions/invalid').status_code == 404
