import json
import os
import shutil
import logging
from dataclasses import asdict
from pathlib import Path
from typing import Annotated, Literal
from uuid import uuid4

from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, ConfigDict, Field, StrictInt, ValidationError, model_validator
from hattrick_ai import CalibradorCampo, ExtratorTrajetorias, LeitorVideo


class FieldMarks(BaseModel):
    model_config = ConfigDict(extra="forbid")
    top: list[tuple[StrictInt, StrictInt]] = Field(min_length=2)
    bottom: list[tuple[StrictInt, StrictInt]] = Field(min_length=2)
    left: list[tuple[StrictInt, StrictInt]] = Field(min_length=2)
    right: list[tuple[StrictInt, StrictInt]] = Field(min_length=2)
    center: list[tuple[StrictInt, StrictInt]] | None = Field(default=None, min_length=2)
    center_spot: tuple[StrictInt, StrictInt] | None = None

    @model_validator(mode="after")
    def validate_center(self):
        if self.center_spot is not None and self.center is None:
            raise ValueError("O ponto central requer a linha central.")
        return self


class FieldData(BaseModel):
    model_config = ConfigDict(extra="forbid")
    width: StrictInt = Field(gt=0)
    height: StrictInt = Field(gt=0)
    frame_time_seconds: float = Field(ge=0, allow_inf_nan=False)
    marks: FieldMarks

    @model_validator(mode="after")
    def validate_bounds(self):
        for key, value in self.marks.model_dump(exclude_none=True).items():
            points = [value] if key == "center_spot" else value
            if any(not (0 <= x < self.width and 0 <= y < self.height) for x, y in points):
                raise ValueError(f"Pontos de {key} fora dos limites do quadro.")
        return self


app = FastAPI(title="Hattrick API", version="0.1.0")
logger = logging.getLogger(__name__)


def storage_root() -> Path:
    return Path(os.environ.get("HATTRICK_STORAGE", Path(__file__).resolve().parents[2] / "storage"))


@app.get("/api/health")
def health():
    return {"status": "ok"}


def save_metadata(folder: Path, metadata: dict):
    temporary = folder / "submission.json.tmp"
    temporary.write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(folder / "submission.json")


def process_submission(folder: Path):
    metadata = json.loads((folder / "submission.json").read_text(encoding="utf-8"))
    try:
        metadata["status"] = "processing"
        save_metadata(folder, metadata)
        video_path = folder / metadata["video_file"]
        camera_path = folder / "camera.yaml"
        if metadata["calibration_type"] == "field":
            field = metadata["field_data"]
            with LeitorVideo(video_path) as video:
                info = video.metadados()
                if (field["width"], field["height"]) != (info.largura, info.altura):
                    raise ValueError("A resolução das marcações não corresponde à do vídeo.")
            calibrador = CalibradorCampo()
            marks = calibrador.conectar_linhas(field["marks"])
            calibrador.calibrar(marks, (info.largura, info.altura)).salvar(camera_path)
            metadata["camera_file"] = "camera.yaml"
        dispositivo = os.environ.get("HATTRICK_DEVICE", "0")
        trajetorias = ExtratorTrajetorias(camera_path, dispositivo=dispositivo).processar(video_path)
        result = {"unidades": "coordenadas normalizadas [-1, 1]; tempo em segundos",
                  "trajetorias": [asdict(t) for t in trajetorias]}
        (folder / "trajectories.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        metadata["status"] = "completed"
    except Exception:
        logger.exception("Falha ao processar submissão %s", metadata["id"])
        metadata["status"] = "failed"
        metadata["error"] = "Não foi possível calibrar ou processar o vídeo."
    save_metadata(folder, metadata)


@app.get("/api/submissions/{submission_id}")
def get_submission(submission_id: str):
    if len(submission_id) != 32 or any(c not in "0123456789abcdef" for c in submission_id):
        raise HTTPException(404, "Submissão não encontrada.")
    folder = storage_root() / submission_id
    try:
        metadata = json.loads((folder / "submission.json").read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise HTTPException(404, "Submissão não encontrada.") from exc
    response = {"id": submission_id, "status": metadata["status"],
                "calibration_type": metadata["calibration_type"]}
    if metadata["status"] == "completed":
        response.update(json.loads((folder / "trajectories.json").read_text(encoding="utf-8")))
    elif metadata["status"] == "failed":
        response["error"] = metadata["error"]
    return response


@app.post("/api/submissions", status_code=201)
async def create_submission(
    background_tasks: BackgroundTasks,
    video: Annotated[UploadFile, File()],
    calibration_type: Annotated[Literal["field", "camera"], Form()],
    field_data: Annotated[str | None, Form()] = None,
    camera: Annotated[UploadFile | None, File()] = None,
):
    suffix = Path(video.filename or "").suffix.lower()
    if suffix not in {".mp4", ".mov", ".webm", ".m4v"}:
        raise HTTPException(422, "Formato de vídeo não suportado.")
    field = None
    if calibration_type == "field":
        if not field_data or camera is not None:
            raise HTTPException(422, "Informe as marcações do campo, sem arquivo de câmera.")
        try:
            field = FieldData.model_validate_json(field_data)
        except ValidationError as exc:
            raise HTTPException(422, "Marcações inválidas: " + str(exc)) from exc
    elif not camera or field_data is not None or Path(camera.filename or "").suffix.lower() not in {".yaml", ".yml"}:
        raise HTTPException(422, "Informe um arquivo YAML de câmera, sem marcações de campo.")

    root = storage_root()
    submission_id = uuid4().hex
    target = root / submission_id
    staging = root / ("." + submission_id + ".tmp")
    try:
        root.mkdir(parents=True, exist_ok=True)
        staging.mkdir()
        size = 0
        with (staging / ("video" + suffix)).open("wb") as output:
            while chunk := await video.read(1024 * 1024):
                size += len(chunk)
                output.write(chunk)
        if size == 0:
            raise HTTPException(422, "O vídeo está vazio.")
        if camera:
            content = await camera.read(1024 * 1024 + 1)
            if not content or len(content) > 1024 * 1024:
                raise HTTPException(422, "O arquivo de câmera deve ter entre 1 byte e 1 MiB.")
            (staging / "camera.yaml").write_bytes(content)
        metadata = {"id": submission_id, "video_filename": Path(video.filename or '').name,
                    "video_file": "video" + suffix, "video_size_bytes": size,
                    "calibration_type": calibration_type,
                    "field_data": field.model_dump(exclude_none=True) if field else None,
                    "camera_file": "camera.yaml" if camera else None, "status": "received"}
        (staging / "submission.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
        staging.rename(target)
    except Exception:
        shutil.rmtree(staging, ignore_errors=True)
        raise
    finally:
        await video.close()
        if camera:
            await camera.close()
    background_tasks.add_task(process_submission, target)
    return {"id": submission_id, "status": "received", "calibration_type": calibration_type}
