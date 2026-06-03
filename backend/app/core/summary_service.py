"""AI-powered summary generation using Claude Haiku."""

import logging
import re
from typing import Any

from app.config import get_settings

logger = logging.getLogger(__name__)


class SummaryService:
    """Service for generating AI-powered summaries using Claude Haiku."""

    # Curated name mapping for known subagent_type slugs. When the Agent tool
    # reports one of these as the explicit subagent_type, we use the mapped name
    # and skip the AI namer (otherwise the AI rewrites e.g. an "explore" agent
    # into "Data Diva").
    _AGENT_TYPE_NAMES: dict[str, list[str]] = {
        "general-purpose": ["Estagiário", "Faz-Tudo", "Agente X", "Minion"],
        "explore": ["Explorador", "Batedor", "Garimpeiro", "Detetive"],
        "plan": ["Planejador", "Estrategista", "Arquiteto", "Mapeador"],
        "audit-architecture": ["Arquiteto", "Refatorador", "Ninja do Code"],
        "audit-code-quality": ["Crítico", "Rainha do QA", "Inspetor"],
        "audit-security": ["Sentinela", "Cão de Guarda", "Segurança"],
        "audit-documentation": ["Escriba", "Dr. Doc", "Mago da Palavra"],
        "fix-architecture": ["Arquiteto", "Refatorador", "Ninja do Code"],
        "fix-code-quality": ["Esmaga-Bug", "Sr. Conserta", "O Resolve"],
        "fix-security": ["Chaveiro", "Cão de Guarda", "Sentinela"],
        "fix-documentation": ["Dr. Doc", "Escriba", "Anotador"],
        "markdown-docs-writer": ["Escriba", "Dr. Doc", "Mago da Palavra"],
        "webgl-shader-expert": ["Pintor Pixel", "Mago Shader", "Guru GPU"],
    }
    _MAPPED_AGENT_TYPES: frozenset[str] = frozenset(_AGENT_TYPE_NAMES.keys())

    def __init__(self) -> None:
        """Initialize the summary service with OAuth token if available."""
        settings = get_settings()
        self.enabled = bool(settings.CLAUDE_CODE_OAUTH_TOKEN) and settings.SUMMARY_ENABLED
        self.client: Any | None = None
        self.model = settings.SUMMARY_MODEL

        if self.enabled:
            try:
                from anthropic import AsyncAnthropic

                self.client = AsyncAnthropic(auth_token=settings.CLAUDE_CODE_OAUTH_TOKEN)
                logger.info("=" * 50)
                logger.info("AI SUMMARIES ENABLED")
                logger.info(f"  Model: {self.model}")
                logger.info(f"  Max tokens: {settings.SUMMARY_MAX_TOKENS}")
                logger.info("=" * 50)
            except ImportError:
                logger.warning("anthropic package not installed - summaries disabled")
                self.enabled = False
        else:
            if not settings.SUMMARY_ENABLED:
                logger.info("Summary service disabled via SUMMARY_ENABLED=False")
            else:
                logger.info("CLAUDE_CODE_OAUTH_TOKEN not set - using fallback summaries")

    async def summarize_agent_task(self, task_description: str) -> str:
        """Generate a short summary of a subagent's task."""
        fallback = self._extract_first_sentence(task_description, max_len=50)

        if not self.enabled or not self.client:
            return fallback

        desc = task_description[:1000] if len(task_description) > 1000 else task_description

        result = await self._call_with_retry(
            f"Resuma esta tarefa em no máximo 10 palavras, em português brasileiro:\n{desc}"
        )
        return result or fallback

    async def summarize_user_prompt(self, prompt: str) -> str:
        """Generate a summary of the user's prompt for marquee display."""
        if not prompt:
            return ""

        # Normalize newlines and collapse to single line
        prompt_stripped = " ".join(prompt.split())
        is_short = len(prompt_stripped) <= 120
        has_single_sentence = prompt_stripped.count(".") <= 1

        if is_short and has_single_sentence:
            return prompt_stripped

        fallback = self._extract_first_sentence(prompt, max_len=150)

        if not self.enabled or not self.client:
            return fallback

        desc = prompt[:1500] if len(prompt) > 1500 else prompt

        result = await self._call_with_retry(
            f"Em uma frase curta, em português brasileiro, resuma o que esta solicitação pede:\n{desc}"
        )
        if result:
            return " ".join(result.split())
        return fallback

    async def generate_agent_name(
        self,
        description: str,
        existing_names: set[str] | None = None,
        agent_type: str | None = None,
    ) -> str:
        """Generate a fun, creative nickname for an agent based on its task."""
        fallback = self.generate_agent_name_fallback(description, existing_names, agent_type)

        # If the name came from an explicit, curated agent_type mapping, keep it
        # rather than asking the AI to "improve" it.
        if agent_type and agent_type.strip().lower() in self._MAPPED_AGENT_TYPES:
            return fallback

        if not self.enabled or not self.client:
            return fallback

        desc = description[:500] if len(description) > 500 else description

        taken = ""
        if existing_names:
            taken = (
                f"\nNomes já usados (NÃO use estes): {', '.join(sorted(existing_names))}"
            )

        result = await self._call_with_retry(
            "Crie um apelido de 1 a 3 palavras em PORTUGUÊS BRASILEIRO que se "
            "relacione DIRETAMENTE com a tarefa abaixo. "
            "Extraia a AÇÃO ou ASSUNTO principal e construa o nome em torno disso. "
            "Exemplos: 'migrar config YAML' → Doutor YAML ou Rei da Config; "
            "'escrever testes unitários' → Piloto de Testes; "
            "'corrigir queries do banco' → Rainha da Query; "
            "'atualizar documentação' → Escriba; "
            "'debugar auth' → Caça-Bug. "
            "O nome DEVE referenciar o assunto (YAML, testes, banco, docs, etc). "
            "Use trocadilhos, cultura pop brasileira, ou aliteração. Máximo 15 caracteres. "
            f"Tarefa: {desc}{taken}\nApelido:"
        )
        if result:
            clean = re.sub(r'["\'\-:.,!?()]', " ", result.strip())
            clean = re.sub(r"\s+", " ", clean).strip()
            words = [w for w in clean.split() if w and len(w) > 1]

            if len(words) > 3 or len(clean) > 20:
                return fallback

            name = " ".join(words[:3])

            if len(name) > 15:
                name = " ".join(words[:2]) if len(words) > 1 else words[0][:15]

            name = name if name else fallback
            if existing_names and name in existing_names:
                return fallback
            return name
        return fallback

    def generate_agent_name_fallback(
        self,
        description: str,
        existing_names: set[str] | None = None,
        agent_type: str | None = None,
    ) -> str:
        """Generate a fun, creative agent name based on agent_type or task type."""
        import random

        taken = existing_names or set()

        if (not description or not description.strip()) and not (agent_type and agent_type.strip()):
            return self.dedupe_name("Estagiário", existing_names)

        desc_lower = (description or "").strip().lower()
        type_lower = (agent_type or "").strip().lower()

        agent_type_names = self._AGENT_TYPE_NAMES

        # Priority 1: exact match on the explicit subagent_type from the Agent tool.
        if type_lower and type_lower in agent_type_names:
            names = agent_type_names[type_lower]
            available = [n for n in names if n not in taken]
            if available:
                return random.choice(available)
            return self.dedupe_name(random.choice(names), taken)

        # Priority 2: legacy heuristic — description literally starts with a slug.
        for at_key, names in agent_type_names.items():
            if desc_lower == at_key or desc_lower.startswith(at_key):
                available = [n for n in names if n not in taken]
                if available:
                    return random.choice(available)
                return self.dedupe_name(random.choice(names), taken)

        # Mapeamento de categoria → apelidos em PT-BR. Inclui palavras-chave
        # em PT e EN porque a descrição da tarefa pode vir nos dois idiomas
        # (prompt do Pedro em PT, mas slug do subagent_type às vezes em EN).
        task_names: dict[tuple[str, ...], list[str]] = {
            # QA / Revisão / Validação
            (
                "review", "audit", "inspect", "qa", "quality",
                "revisar", "revisão", "auditar", "auditoria", "inspecionar",
                "qualidade",
            ): [
                "Juiz",
                "Crítico",
                "Olho Vivo",
                "Inspetor",
                "Auditor",
            ],
            (
                "test", "spec", "assert", "expect",
                "teste", "testar",
            ): [
                "Piloto Teste",
                "Dr. Teste",
                "Rainha do QA",
                "Caça-Bug",
                "Boneco Teste",
            ],
            (
                "validate", "verify", "check", "ensure",
                "validar", "verificar", "checar", "garantir",
            ): [
                "Checador",
                "Validador",
                "Fiscal",
                "Caça-Verdade",
            ],
            # Limpeza / Formatação / Refatoração
            (
                "clean", "cleanup", "tidy", "organize",
                "limpar", "limpeza", "organizar", "arrumar",
            ): [
                "Faxineiro",
                "Sr. Limpeza",
                "Bot Tidy",
                "Maníaco Limpeza",
            ],
            (
                "format", "prettier", "lint", "style",
                "formatar", "estilo", "estilizar",
            ): [
                "Guru do Estilo",
                "Rei Formato",
                "Lord Lint",
                "Bonitão",
            ],
            (
                "refactor", "restructure", "reorganize",
                "refatorar", "refatoração", "reestruturar",
            ): [
                "Arquiteto",
                "Refatorador",
                "Ninja do Code",
                "Dr. Refator",
            ],
            # Debug / Fix
            (
                "debug", "diagnose", "troubleshoot",
                "debugar", "diagnosticar", "investigar bug",
            ): [
                "Caça-Bug",
                "Dr. Debug",
                "Sherlock",
                "O Debugador",
            ],
            (
                "fix", "repair", "patch", "resolve",
                "consertar", "corrigir", "resolver", "arrumar",
            ): [
                "O Resolve",
                "Patch Adams",
                "Sr. Conserta",
                "Esmaga-Bug",
            ],
            # Documentação / Escrita
            (
                "doc", "document", "readme", "comment",
                "documentação", "documentar", "comentário",
            ): [
                "Escriba",
                "Dr. Doc",
                "Mago da Palavra",
                "Anotador",
            ],
            (
                "write", "create", "draft", "compose",
                "escrever", "redigir", "compor",
            ): [
                "Escritor",
                "Wordsmith",
                "Penalista",
                "Roteirista",
            ],
            # Pesquisa / Exploração
            (
                "research", "investigate", "explore", "analyze",
                "pesquisar", "investigar", "explorar", "analisar",
            ): [
                "Batedor",
                "Explorador",
                "Garimpeiro",
                "Pesquisador",
            ],
            (
                "search", "find", "locate", "discover",
                "buscar", "encontrar", "localizar", "descobrir", "achar",
            ): [
                "O Caçador",
                "Achador",
                "Bot Busca",
                "Rastreador",
            ],
            # Build / Implementação
            (
                "build", "implement", "develop",
                "construir", "implementar", "desenvolver", "criar",
            ): [
                "Construtor",
                "Codador",
                "Dev Bambambã",
                "Pedreiro",
            ],
            (
                "setup", "configure", "install", "init",
                "configurar", "instalar", "iniciar",
            ): [
                "Sr. Setup",
                "Configurador",
                "Iniciador",
                "Boot Boss",
            ],
            # Type checking / análise estática
            (
                "type", "typecheck", "typing", "pyright", "mypy",
                "tipo", "tipagem",
            ): [
                "Tirano dos Tipos",
                "Polícia dos Tipos",
                "Ninja do Tipo",
                "Sr. Rigor",
            ],
            # Migração / Upgrade
            (
                "migrate", "upgrade", "update", "convert",
                "migrar", "atualizar", "converter",
            ): [
                "O Migrador",
                "Mudador",
                "Atualizador",
                "Conversor",
            ],
            # Performance / Otimização
            (
                "optimize", "performance", "speed", "fast",
                "otimizar", "performance", "velocidade", "rápido",
            ): [
                "Demônio da Velocidade",
                "Turbão",
                "Otimizador",
                "Foguete",
            ],
            # Segurança
            (
                "security", "secure", "vulnerability", "auth",
                "segurança", "vulnerabilidade", "autenticação",
            ): [
                "Sentinela",
                "Cão de Guarda",
                "Vigia",
                "Chaveiro",
            ],
            # Banco de dados
            (
                "database", "sql", "query", "migration",
                "banco", "consulta", "migração",
            ): [
                "Dadão",
                "SQL Master",
                "Rainha da Query",
                "Cara do Banco",
            ],
            # API / Backend
            (
                "api", "endpoint", "route", "backend",
                "rota", "endpoint",
            ): [
                "Sr. API",
                "Corredor de Rotas",
                "Sr. Backend",
                "Pontista",
            ],
            # Frontend / UI
            (
                "frontend", "ui", "component", "react", "css",
                "componente", "tela", "interface",
            ): [
                "Sra. Telinha",
                "Pintor Pixel",
                "Front Boy",
                "Estilista",
            ],
        }

        # Check each category for keyword matches
        for keywords, names in task_names.items():
            if any(kw in desc_lower for kw in keywords):
                available = [n for n in names if n not in taken]
                if available:
                    return random.choice(available)
                return self.dedupe_name(random.choice(names), taken)

        # Fallback: nomes genéricos em PT-BR
        generic_names = [
            "Cadete do Code",
            "Bit Bambino",
            "Lógica Larry",
            "Algoritmão",
            "Faz-Tudo",
            "Tropa de Choque",
            "Agente X",
            "Estagiário",
            "Abelha Operária",
            "Minion",
        ]
        available = [n for n in generic_names if n not in taken]
        if available:
            return random.choice(available)
        return self.dedupe_name(random.choice(generic_names), taken)

    @staticmethod
    def dedupe_name(base_name: str, existing_names: set[str] | None) -> str:
        """Append a numeric suffix if base_name collides with existing names."""
        if not existing_names or base_name not in existing_names:
            return base_name
        n = 2
        while f"{base_name} {n}" in existing_names:
            n += 1
        return f"{base_name} {n}"

    async def detect_report_request(self, prompt: str) -> bool:
        """Detect if the user's prompt requests a report or document."""
        if not prompt:
            return False

        prompt_lower = prompt.lower()
        report_keywords = [
            "report",
            "document",
            "documentation",
            "readme",
            "write up",
            "writeup",
            "summary report",
            "create a doc",
            "generate a doc",
            "write a doc",
            "pdf",
            "markdown file",
            "md file",
            ".md",  # Any .md file reference
            "architecture",
            "changelog",
            "contributing",
            "license",
            "guide",
        ]
        keyword_match = any(keyword in prompt_lower for keyword in report_keywords)

        create_md_pattern = re.search(
            r"\b(create|write|generate|update|add)\b.*\.md\b", prompt_lower
        )
        fallback_result = keyword_match or bool(create_md_pattern)

        if not self.enabled or not self.client:
            return fallback_result

        truncated = prompt[:1000] if len(prompt) > 1000 else prompt
        result = await self._call_with_retry(
            "Esta solicitação pede a criação de um relatório, documento ou "
            "documentação? Responda APENAS com 'sim' ou 'não':\n" + truncated
        )

        if result:
            normalized = result.strip().lower()
            # Aceita "sim"/"yes" pra tolerar respostas residuais em inglês
            # caso o modelo escorregue no idioma.
            return normalized in {"sim", "yes"}
        return fallback_result

    async def summarize_response(self, response_text: str) -> str:
        """Generate a short summary of Claude's response."""
        fallback = self._extract_first_sentence(response_text, max_len=100)

        if not self.enabled or not self.client:
            return fallback

        text = response_text[:2000] if len(response_text) > 2000 else response_text

        result = await self._call_with_retry(
            f"Em no máximo 15 palavras, em português brasileiro, resuma esta resposta:\n{text}"
        )
        return result or fallback

    def _extract_first_sentence(self, text: str, max_len: int = 100) -> str:
        """Extract the first sentence as a fallback summary."""
        if not text:
            return ""

        text = text.strip()

        for i, char in enumerate(text[: max_len + 50]):
            if char in ".!?" and i >= 10:  # Ensure minimum sentence length
                result = text[: i + 1].strip()
                if len(result) > max_len:
                    return result[: max_len - 3] + "..."
                return result

        if len(text) > max_len:
            return text[: max_len - 3] + "..."
        return text

    async def _call_with_retry(self, prompt: str, max_retries: int = 1) -> str | None:
        """Call the API with retry on error, returning None on failure."""
        if not self.client:
            return None

        settings = get_settings()

        for attempt in range(max_retries + 1):
            try:
                response = await self.client.messages.create(
                    model=self.model,
                    max_tokens=settings.SUMMARY_MAX_TOKENS,
                    messages=[{"role": "user", "content": prompt}],
                )
                content = response.content
                if content and len(content) > 0:
                    first_block = content[0]
                    if hasattr(first_block, "text"):
                        text = str(first_block.text).strip()
                        if text:
                            return text
                        logger.debug("AI returned empty response, using fallback")
                        return None
                logger.debug("AI response had no content, using fallback")
                return None
            except Exception as e:
                if attempt < max_retries:
                    logger.warning(f"Summary API error, retrying: {e}")
                else:
                    logger.debug(f"Summary API failed after retry, using fallback: {e}")
                    return None

        return None


_summary_service: SummaryService | None = None


def get_summary_service() -> SummaryService:
    """Get the singleton summary service instance."""
    global _summary_service
    if _summary_service is None:
        _summary_service = SummaryService()
    return _summary_service
