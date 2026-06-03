"""Endpoint para abrir uma nova janela do Claude Code numa pasta arbitrária.

Usado pelo painel "Pastas fixadas" da sidebar — atalhos pra abrir o Claude
direto num diretório de projeto sem precisar passar pelo terminal.
"""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
import sys
import tempfile
import threading
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/launcher", tags=["launcher"])


class LaunchRequest(BaseModel):
    """Pedido pra abrir Claude numa pasta."""

    path: str = Field(..., min_length=1, max_length=4096)


def _build_launch_command(workdir: str) -> list[str] | None:
    """Monta o comando de abertura de terminal + ``claude -c`` pra plataforma.

    Usa ``claude -c`` (continue) em vez de ``claude`` puro: se a pasta tem
    sessão anterior, retoma; caso contrário, abre uma nova. Cobre os dois
    casos sem precisar de toggle na UI.
    """
    inner = "claude -c"
    if sys.platform == "win32":
        shell = "pwsh" if shutil.which("pwsh") else "powershell"
        return [
            "wt.exe",
            "-d",
            workdir,
            shell,
            "-NoExit",
            "-Command",
            inner,
        ]
    if sys.platform == "darwin":
        script = f'tell application "Terminal" to do script "cd {workdir!r} && {inner}"'
        return ["osascript", "-e", script]
    if sys.platform == "linux":
        return [
            "x-terminal-emulator",
            "-e",
            "bash",
            "-lc",
            f"cd {workdir!r} && {inner}; exec bash",
        ]
    return None


@router.post("/launch")
async def launch_claude(body: LaunchRequest) -> dict[str, str]:
    """Abre um terminal novo em ``body.path`` rodando ``claude -c``."""
    workdir = body.path.strip()
    # "Copiar como caminho" do Explorer cola o path entre aspas duplas;
    # também aceitamos aspas simples por simetria. Remover antes de resolver,
    # senão Path() trata o " como caractere literal e gera um caminho relativo.
    if len(workdir) >= 2 and workdir[0] == workdir[-1] and workdir[0] in ('"', "'"):
        workdir = workdir[1:-1].strip()
    if not workdir:
        raise HTTPException(status_code=400, detail="Path vazio")

    # Resolve e valida — evita disparar wt.exe pra pasta que não existe
    # (o erro do wt some no DEVNULL e o usuário fica sem feedback).
    try:
        resolved = Path(workdir).expanduser().resolve()
    except (OSError, RuntimeError) as exc:
        raise HTTPException(status_code=400, detail=f"Path inválido: {exc}") from exc

    if not resolved.is_dir():
        raise HTTPException(
            status_code=400,
            detail=f"Pasta não encontrada: {resolved}",
        )

    cmd = _build_launch_command(str(resolved))
    if cmd is None:
        raise HTTPException(
            status_code=501,
            detail=f"Launcher não implementado para {sys.platform}",
        )

    try:
        # Fire-and-forget, mesmo motivo do resume: asyncio.create_subprocess_exec
        # quebra em event loops Selector no Windows. Popen síncrono não passa
        # por asyncio. Ver memory escritorio-online-windows-gotchas item 2.
        subprocess.Popen(  # noqa: S603
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            close_fds=True,
        )
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Terminal launcher não encontrado: {cmd[0]}",
        ) from exc

    return {"status": "success", "path": str(resolved)}


def _tmux_session_name() -> str | None:
    """Retorna o nome da sessão tmux se este processo foi lançado por ela.

    Detecta via ``TMUX_PANE`` (sempre presente em processos dentro do tmux)
    e busca o nome com ``tmux display-message -p '#S'``. Usado pra escolher
    entre reiniciar via send-keys (preserva janela/logs/--reload) ou via
    script desacoplado.
    """
    if not os.environ.get("TMUX_PANE"):
        return None

    try:
        result = subprocess.run(  # noqa: S603, S607
            ["tmux", "display-message", "-p", "#S"],
            capture_output=True,
            text=True,
            timeout=2,
            check=True,
        )
    except (OSError, subprocess.SubprocessError):
        return None

    name = result.stdout.strip()
    return name or None


def _restart_via_tmux(session: str) -> dict[str, str]:
    """Reinicia via ``tmux send-keys`` preservando a janela de logs.

    Spawn fire-and-forget de um bash desacoplado: espera 0.5s pra response
    sair, manda Ctrl-C pro uvicorn no pane ``backend``, espera 1.5s pelo
    shutdown + liberação da porta 8000, e roda ``make dev`` no mesmo pane.

    Não chamamos ``os._exit`` aqui — o Ctrl-C do tmux mata o uvicorn de
    forma limpa, e ``make dev`` traz ele de volta com ``--reload`` ligado.
    """
    cmd = (
        "sleep 0.5 && "
        f"tmux send-keys -t {session}:backend C-c && "
        "sleep 1.5 && "
        f"tmux send-keys -t {session}:backend 'make dev' Enter"
    )
    spawn = ["bash", "-lc", cmd]

    try:
        if sys.platform == "win32":
            # Flags do restart desacoplado — sobrevive à morte deste processo
            # e não compartilha console.
            subprocess.Popen(  # noqa: S603, S607
                spawn,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                stdin=subprocess.DEVNULL,
                close_fds=True,
                creationflags=0x08 | 0x200 | 0x1000000,
            )
        else:
            subprocess.Popen(  # noqa: S603, S607
                spawn,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                stdin=subprocess.DEVNULL,
                close_fds=True,
                start_new_session=True,
            )
    except OSError as exc:
        logger.exception("Falha ao disparar restart via tmux")
        raise HTTPException(
            status_code=500,
            detail=f"Erro ao disparar restart tmux: {exc}",
        ) from exc

    return {
        "status": "success",
        "message": f"Backend será reiniciado via tmux ({session}:backend) em ~2s",
    }


def _build_restart_script() -> Path:
    """Cria um script temporário que sobe um novo uvicorn no mesmo CWD/python.

    Estratégia: escreve um .bat (Windows) ou .sh (Unix) em ``%TEMP%``,
    dispara ele como processo desacoplado, e deixa esse processo fazer o
    sleep antes de subir o backend novo. Assim o backend pode terminar a
    resposta HTTP e morrer com ``os._exit(0)`` sem deixar o script preso
    no mesmo grupo de processos.
    """
    python_exe = sys.executable
    cwd = os.getcwd()
    host = "0.0.0.0"
    port = "8000"

    if sys.platform == "win32":
        # Sem --reload de propósito — no Windows o reload mente (ver
        # escritorio-online-windows-gotchas item 4). Sobe limpo.
        content = (
            "@echo off\r\n"
            "timeout /t 3 /nobreak >nul\r\n"
            f'cd /d "{cwd}"\r\n'
            f'"{python_exe}" -m uvicorn app.main:app --host {host} --port {port}\r\n'
        )
        suffix = ".bat"
    else:
        content = (
            "#!/usr/bin/env bash\n"
            "sleep 3\n"
            f'cd "{cwd}"\n'
            f'"{python_exe}" -m uvicorn app.main:app --host {host} --port {port}\n'
        )
        suffix = ".sh"

    fd, path_str = tempfile.mkstemp(suffix=suffix, prefix="jp_restart_")
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="") as f:
            f.write(content)
    except Exception:
        os.close(fd)
        raise

    script_path = Path(path_str)
    if sys.platform != "win32":
        script_path.chmod(0o755)
    return script_path


@router.post("/restart-backend")
async def restart_backend() -> dict[str, str]:
    """Reinicia o próprio backend.

    Modo tmux (preferido): se o backend está rodando dentro de uma sessão
    tmux (lançado por ``make dev-tmux``), manda Ctrl-C + ``make dev`` no
    pane via ``send-keys``. Preserva a janela tmux, os logs e o
    ``--reload`` do ``make dev``. Downtime ~2s.

    Modo desacoplado (fallback): se o backend foi iniciado solto, dispara
    um script auxiliar que espera ~3s e sobe um novo uvicorn no mesmo
    CWD/python. Agenda ``os._exit(0)`` pra ~1s depois — tempo suficiente
    do uvicorn enviar a response e fechar a conexão antes de morrer.
    """
    session = _tmux_session_name()
    if session:
        return _restart_via_tmux(session)

    try:
        script = _build_restart_script()
    except OSError as exc:
        logger.exception("Falha ao criar script de restart")
        raise HTTPException(
            status_code=500,
            detail=f"Erro ao preparar restart: {exc}",
        ) from exc

    creationflags = 0
    if sys.platform == "win32":
        # DETACHED_PROCESS (0x08) + CREATE_NEW_PROCESS_GROUP (0x200) +
        # CREATE_BREAKAWAY_FROM_JOB (0x1000000) — garante que o filho
        # sobreviva à morte do uvicorn atual e não compartilhe console.
        creationflags = 0x08 | 0x200 | 0x1000000
        spawn_cmd: list[str] = ["cmd.exe", "/c", str(script)]
    else:
        spawn_cmd = ["/bin/bash", str(script)]

    try:
        subprocess.Popen(  # noqa: S603
            spawn_cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            stdin=subprocess.DEVNULL,
            close_fds=True,
            creationflags=creationflags if sys.platform == "win32" else 0,
            start_new_session=sys.platform != "win32",
        )
    except OSError as exc:
        logger.exception("Falha ao spawnar script de restart")
        raise HTTPException(
            status_code=500,
            detail=f"Erro ao disparar restart: {exc}",
        ) from exc

    # Agenda o suicídio do uvicorn atual. Delay curto pra response sair antes.
    def _die() -> None:
        logger.warning("Restart solicitado — encerrando processo atual")
        os._exit(0)

    threading.Timer(1.0, _die).start()

    return {
        "status": "success",
        "message": "Backend será reiniciado em ~3s",
    }
