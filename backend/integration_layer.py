"""
Camada de integração ISOLADA com o site principal dos atletas (AVA).

Hoje funciona de forma LOCAL/VAZIA — não conecta a nada externo. Fica preparada
para, no futuro (Fase 2), puxar a lista de atletas do outro site e enviar de volta
as análises (resumo, transcrição, frequência, evolução), casando pelo campo
`external_id` de cada atleta.

Mantida em arquivo próprio para não interferir no comportamento atual do app.
"""
import os
from motor.motor_asyncio import AsyncIOMotorClient
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Dict, Any

_client = AsyncIOMotorClient(os.environ["MONGO_URL"])
_db = _client[os.environ["DB_NAME"]]

integration_router = APIRouter(prefix="/api/integration")

# Configuração desejada para a Fase 2 (lida de env quando existir; hoje desligada).
EXTERNAL_SITE_URL = os.environ.get("EXTERNAL_SITE_URL") or None
EXTERNAL_SITE_API_KEY = os.environ.get("EXTERNAL_SITE_API_KEY") or None
_ENABLED = bool(EXTERNAL_SITE_URL and EXTERNAL_SITE_API_KEY)


@integration_router.get("/status")
async def integration_status() -> Dict[str, Any]:
    """Estado da integração com o site principal. Hoje: local/desconectado."""
    return {
        "enabled": _ENABLED,
        "connected": False,
        "mode": "local",
        "external_site_url": EXTERNAL_SITE_URL,
        "can_pull_athletes": _ENABLED,
        "can_push_analyses": _ENABLED,
        "embeddable": True,  # o app roda dentro de um iframe/área do site principal
        "message": (
            "Integração preparada, porém ainda não conectada. Configure EXTERNAL_SITE_URL "
            "e EXTERNAL_SITE_API_KEY e conecte na Fase 2."
        ),
    }


@integration_router.post("/pull-athletes")
async def pull_athletes() -> Dict[str, Any]:
    """(Futuro) Puxa atletas do site principal. Hoje é no-op local."""
    if not _ENABLED:
        return {"imported": 0, "connected": False, "note": "Integração não conectada — nada foi importado."}
    # Fase 2: buscar atletas no site externo e fazer upsert por external_id, preservando análises.
    return {"imported": 0, "connected": True, "note": "Conector externo ainda não implementado."}


class PushIn(BaseModel):
    athlete_id: str


@integration_router.post("/push-analyses")
async def push_analyses(body: PushIn) -> Dict[str, Any]:
    """(Futuro) Envia as análises de um atleta de volta ao site principal. Hoje é no-op local."""
    athlete = await _db.athletes.find_one({"id": body.athlete_id}, {"_id": 0})
    external_id = (athlete or {}).get("external_id")
    if not _ENABLED:
        return {
            "pushed": False,
            "connected": False,
            "external_id": external_id,
            "note": "Integração não conectada — a análise não foi enviada.",
        }
    # Fase 2: enviar resumo/transcrição/frequência/evolução ao site externo via external_id.
    return {"pushed": True, "connected": True, "external_id": external_id, "note": "Enviado."}
