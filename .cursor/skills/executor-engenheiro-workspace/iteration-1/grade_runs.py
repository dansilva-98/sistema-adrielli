# -*- coding: utf-8 -*-
"""Grade iteration-1 outputs against the written assertions."""

import importlib.util
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent

HEADINGS = [
    "## Status",
    "## O que foi implementado",
    "## Arquivos alterados",
    "## Banco / migrations",
    "## APIs alteradas",
    "## Dependências adicionadas",
    "## Testes executados",
    "## Resultado dos testes",
    "## Evidências",
    "## Riscos conhecidos",
    "## Itens não concluídos",
    "## Próximos passos recomendados",
]
STATUSES = [
    "CONCLUÍDO E TESTADO",
    "CONCLUÍDO COM PENDÊNCIAS",
    "PARCIALMENTE IMPLEMENTADO",
    "BLOQUEADO",
]

LAYOUT_ASSERTIONS = [
    "index.html tem um botão com o texto Exportar CSV cujo script monta um CSV com os itens Caderno 12.50 e Caneta 3.00.",
    "O botão existente com id atualizar e o texto Atualizar continua no index.html.",
    "O CSS mantém font-family Georgia, serif, grid-template-columns 240px 1fr, gap 16px, padding 24px, e a classe acao mantém background #f4f1ea, color #1a1a1a e border 1px solid #1a1a1a.",
    "O botão Exportar CSV usa a classe acao que já existia.",
    "Nenhum package.json, requirements.txt ou CDN de framework foi adicionado.",
    "O relatório final contém as seções Status, O que foi implementado, Arquivos alterados, Banco / migrations, APIs alteradas, Dependências adicionadas, Testes executados, Resultado dos testes, Evidências, Riscos conhecidos, Itens não concluídos e Próximos passos recomendados, e o status é exatamente uma destas classificações: CONCLUÍDO E TESTADO, CONCLUÍDO COM PENDÊNCIAS, PARCIALMENTE IMPLEMENTADO ou BLOQUEADO.",
]
CUPOM_ASSERTIONS = [
    "calcular_total com itens de preço 10 e quantidade 2 retorna 20.0 quando o cupom é string vazia e também quando o cupom contém só espaços.",
    "calcular_total com itens de preço 10 e quantidade 2 e cupom PROMO continua retornando 18.0.",
    "pedido.py continua expondo calcular_total como função e não troca essa função por uma hierarquia de classes.",
    "test_pedido.py verifica que o total com cupom vazio é 20.0.",
    "O relatório final contém as seções Status, O que foi implementado, Arquivos alterados, Banco / migrations, APIs alteradas, Dependências adicionadas, Testes executados, Resultado dos testes, Evidências, Riscos conhecidos, Itens não concluídos e Próximos passos recomendados, e o status é exatamente uma destas classificações: CONCLUÍDO E TESTADO, CONCLUÍDO COM PENDÊNCIAS, PARCIALMENTE IMPLEMENTADO ou BLOQUEADO.",
]
CADASTRO_ASSERTIONS = [
    "criar_usuario com nome vazio e e-mail a@b.com levanta ValueError.",
    "criar_usuario com nome Ana e e-mail nao-e-email levanta ValueError.",
    "criar_usuario com nome Ana e e-mail ana@exemplo.com retorna nome Ana e e-mail ana@exemplo.com.",
    "cadastro.py usa campo_obrigatorio e formato_email definidos em validar.py.",
    "requirements.txt não declara pydantic nem outro pacote de terceiros, e cadastro.py não importa pydantic.",
    "Existe um teste do caminho feliz, um teste de nome vazio e um teste de e-mail inválido.",
    "O relatório final contém as seções Status, O que foi implementado, Arquivos alterados, Banco / migrations, APIs alteradas, Dependências adicionadas, Testes executados, Resultado dos testes, Evidências, Riscos conhecidos, Itens não concluídos e Próximos passos recomendados, e o status é exatamente uma destas classificações: CONCLUÍDO E TESTADO, CONCLUÍDO COM PENDÊNCIAS, PARCIALMENTE IMPLEMENTADO ou BLOQUEADO.",
]


def load_module(unique_name, path):
    parent = str(path.parent)
    if parent not in sys.path:
        sys.path.insert(0, parent)
    spec = importlib.util.spec_from_file_location(unique_name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def report_check(outputs):
    path = outputs / "RELATORIO.md"
    if not path.exists():
        return False, "RELATORIO.md não existe."
    text = path.read_text(encoding="utf-8")
    missing = [heading for heading in HEADINGS if heading not in text]
    if missing:
        return False, "Faltam as seções: " + ", ".join(missing) + "."
    section = text.split("## Status", 1)[1].split("##", 1)[0]
    status_line = ""
    for line in section.splitlines():
        if line.strip():
            status_line = line.strip()
            break
    if status_line not in STATUSES:
        return False, f"A primeira linha da seção Status é {status_line!r}, fora das quatro classificações."
    return True, f"RELATORIO.md tem as doze seções e o status {status_line}."


def button_class_has(tag, class_name):
    match = re.search(r"class\s*=\s*['\"]([^'\"]*)['\"]", tag, re.I)
    if not match:
        return False
    return class_name in match.group(1).split()


def grade_layout(outputs):
    html_path = outputs / "index.html"
    html = html_path.read_text(encoding="utf-8") if html_path.exists() else ""
    buttons = re.findall(r"<button\b[^>]*>[\s\S]*?</button>", html, re.I)
    export_buttons = [button for button in buttons if "Exportar CSV" in button]
    script = "\n".join(re.findall(r"<script\b[^>]*>[\s\S]*?</script>", html, re.I))
    items_present = all(token in html for token in ("Caderno", "12.50", "Caneta", "3.00"))
    reads_attrs = "data-nome" in script and "data-preco" in script
    writes_csv = bool(re.search(r"csv|Blob|text/csv", script, re.I))
    export_ok = bool(export_buttons) and items_present and reads_attrs and writes_csv
    export_evidence = (
        f"Botões Exportar CSV: {len(export_buttons)}. "
        f"Itens originais presentes: {items_present}. "
        f"Script lê data-nome e data-preco: {reads_attrs}. "
        f"Script gera CSV: {writes_csv}."
    )

    atualizar_ok = 'id="atualizar"' in html and ">Atualizar<" in html
    atualizar_evidence = (
        "O botão id=atualizar com texto Atualizar está no arquivo."
        if atualizar_ok
        else "O botão Atualizar original não foi encontrado intacto."
    )

    style_tokens = [
        "font-family: Georgia, serif",
        "grid-template-columns: 240px 1fr",
        "gap: 16px",
        "padding: 24px",
        "background: #f4f1ea",
        "color: #1a1a1a",
        "border: 1px solid #1a1a1a",
    ]
    missing_style = [token for token in style_tokens if token not in html]
    layout_ok = not missing_style
    layout_evidence = (
        "Os sete trechos originais de CSS continuam no arquivo."
        if layout_ok
        else "CSS original ausente: " + "; ".join(missing_style) + "."
    )

    reuses_acao = any(button_class_has(button, "acao") for button in export_buttons)
    acao_evidence = (
        "O botão Exportar CSV tem class acao."
        if reuses_acao
        else "Nenhum botão Exportar CSV usa a classe acao."
    )

    extra = [
        name
        for name in ("package.json", "requirements.txt")
        if (outputs / name).exists()
    ]
    cdn = re.findall(r"https?://[^\"'\s>]+", html)
    framework_cdn = [
        url
        for url in cdn
        if re.search(r"cdn|unpkg|jsdelivr|react|vue|bootstrap|tailwind", url, re.I)
    ]
    deps_ok = not extra and not framework_cdn
    deps_evidence = (
        "Nenhum package.json, requirements.txt ou CDN de framework na pasta."
        if deps_ok
        else f"Arquivos extras: {extra or 'nenhum'}. CDNs: {framework_cdn or 'nenhum'}."
    )

    report_ok, report_evidence = report_check(outputs)
    pairs = [
        (export_ok, export_evidence),
        (atualizar_ok, atualizar_evidence),
        (layout_ok, layout_evidence),
        (reuses_acao, acao_evidence),
        (deps_ok, deps_evidence),
        (report_ok, report_evidence),
    ]
    return [(text, ok, evidence) for text, (ok, evidence) in zip(LAYOUT_ASSERTIONS, pairs)]


def grade_cupom(outputs):
    pedido_path = outputs / "pedido.py"
    test_path = outputs / "test_pedido.py"
    pedido_text = pedido_path.read_text(encoding="utf-8") if pedido_path.exists() else ""
    test_text = test_path.read_text(encoding="utf-8") if test_path.exists() else ""
    itens = [{"preco": 10, "quantidade": 2}]
    try:
        module = load_module("pedido_" + outputs.parent.name, pedido_path)
        vazio = module.calcular_total(itens, "")
        espacos = module.calcular_total(itens, "   ")
        promo = module.calcular_total(itens, "PROMO")
        run_error = ""
    except Exception as exc:
        vazio = espacos = promo = None
        run_error = f"{type(exc).__name__}: {exc}"

    vazio_ok = vazio == 20.0 and espacos == 20.0
    vazio_evidence = (
        run_error
        or f"Cupom vazio retornou {vazio}. Cupom só com espaços retornou {espacos}."
    )
    promo_ok = promo == 18.0
    promo_evidence = run_error or f"Cupom PROMO retornou {promo}."

    funcao_ok = bool(re.search(r"^def calcular_total\(", pedido_text, re.M))
    funcao_evidence = (
        "pedido.py define calcular_total como função de módulo."
        if funcao_ok
        else "pedido.py não tem def calcular_total no nível do módulo."
    )

    regressao_ok = bool(
        re.search(r"calcular_total\([^)]*['\"]['\"]", test_text) and re.search(r"\b20(?:\.0)?\b", test_text)
    ) or bool(re.search(r"cupom vazio", test_text, re.I) and re.search(r"\b20(?:\.0)?\b", test_text))
    regressao_evidence = (
        "test_pedido.py afirma o total 20 para cupom vazio."
        if regressao_ok
        else "test_pedido.py não associa cupom vazio ao total 20.0."
    )

    report_ok, report_evidence = report_check(outputs)
    pairs = [
        (vazio_ok, vazio_evidence),
        (promo_ok, promo_evidence),
        (funcao_ok, funcao_evidence),
        (regressao_ok, regressao_evidence),
        (report_ok, report_evidence),
    ]
    return [(text, ok, evidence) for text, (ok, evidence) in zip(CUPOM_ASSERTIONS, pairs)]


def grade_cadastro(outputs):
    cadastro_path = outputs / "cadastro.py"
    requirements_path = outputs / "requirements.txt"
    cadastro_text = cadastro_path.read_text(encoding="utf-8") if cadastro_path.exists() else ""
    requirements = requirements_path.read_text(encoding="utf-8") if requirements_path.exists() else ""
    test_texts = []
    for path in sorted(outputs.glob("test*.py")):
        test_texts.append(path.name + "\n" + path.read_text(encoding="utf-8"))
    tests = "\n".join(test_texts)

    try:
        module = load_module("cadastro_" + outputs.parent.name, cadastro_path)
        try:
            module.criar_usuario("", "a@b.com")
            vazio_ok = False
            vazio_evidence = "criar_usuario('', 'a@b.com') não levantou erro."
        except ValueError as exc:
            vazio_ok = True
            vazio_evidence = f"ValueError: {exc}"
        except Exception as exc:
            vazio_ok = False
            vazio_evidence = f"Exceção diferente de ValueError: {type(exc).__name__}: {exc}"

        try:
            module.criar_usuario("Ana", "nao-e-email")
            invalido_ok = False
            invalido_evidence = "criar_usuario('Ana', 'nao-e-email') não levantou erro."
        except ValueError as exc:
            invalido_ok = True
            invalido_evidence = f"ValueError: {exc}"
        except Exception as exc:
            invalido_ok = False
            invalido_evidence = f"Exceção diferente de ValueError: {type(exc).__name__}: {exc}"

        try:
            criado = module.criar_usuario("Ana", "ana@exemplo.com")
            valido_ok = isinstance(criado, dict) and criado.get("nome") == "Ana" and criado.get("email") == "ana@exemplo.com"
            valido_evidence = f"Retorno: {criado!r}."
        except Exception as exc:
            valido_ok = False
            valido_evidence = f"{type(exc).__name__}: {exc}"
    except Exception as exc:
        vazio_ok = invalido_ok = valido_ok = False
        vazio_evidence = invalido_evidence = valido_evidence = f"Não foi possível carregar cadastro.py: {type(exc).__name__}: {exc}"

    reusa_ok = (
        "campo_obrigatorio" in cadastro_text
        and "formato_email" in cadastro_text
        and re.search(r"from\s+validar\s+import|import\s+validar", cadastro_text) is not None
    )
    reusa_evidence = (
        "cadastro.py importa campo_obrigatorio e formato_email de validar.py."
        if reusa_ok
        else "cadastro.py não importa as duas funções de validar.py."
    )

    declared = [
        line.strip()
        for line in requirements.splitlines()
        if line.strip() and not line.strip().startswith("#")
    ]
    pydantic_import = re.search(r"^\s*(import\s+pydantic|from\s+pydantic\b)", cadastro_text, re.M)
    deps_ok = not declared and pydantic_import is None and "pydantic" not in requirements.lower()
    deps_evidence = (
        "requirements.txt não declara pacotes e cadastro.py não importa pydantic."
        if deps_ok
        else f"Linhas de dependência: {declared or 'nenhuma'}. Import de pydantic: {bool(pydantic_import)}."
    )

    feliz = bool(
        re.search(r"def test_\w*(valid|feliz|sucesso)\w*", tests, re.I)
        and re.search(r"assert", tests)
        and re.search(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", tests)
    )
    nome_vazio = bool(re.search(r"criar_usuario\(\s*['\"]['\"]", tests))
    email_invalido = bool(re.search(r"nao-e-email|sem arroba|email inválido|email invalido", tests, re.I)) or bool(
        re.search(r"criar_usuario\(\s*['\"][^'\"]+['\"]\s*,\s*['\"][^@'\"]+['\"]", tests)
    )
    testes_ok = feliz and nome_vazio and email_invalido
    testes_evidence = (
        f"Caminho feliz: {feliz}. Nome vazio: {nome_vazio}. E-mail inválido: {email_invalido}. "
        f"Arquivos: {[path.name for path in outputs.glob('test*.py')]}."
    )

    report_ok, report_evidence = report_check(outputs)
    pairs = [
        (vazio_ok, vazio_evidence),
        (invalido_ok, invalido_evidence),
        (valido_ok, valido_evidence),
        (reusa_ok, reusa_evidence),
        (deps_ok, deps_evidence),
        (testes_ok, testes_evidence),
        (report_ok, report_evidence),
    ]
    return [(text, ok, evidence) for text, (ok, evidence) in zip(CADASTRO_ASSERTIONS, pairs)]


def write_grading(run_dir, rows):
    expectations = [
        {"text": text, "passed": bool(ok), "evidence": evidence}
        for text, ok, evidence in rows
    ]
    passed = sum(1 for item in expectations if item["passed"])
    total = len(expectations)
    payload = {
        "expectations": expectations,
        "summary": {
            "passed": passed,
            "failed": total - passed,
            "total": total,
            "pass_rate": round(passed / total, 4) if total else 0,
        },
    }
    (run_dir / "grading.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"{run_dir.parent.name}/{run_dir.name}: {passed}/{total}")


def main():
    cases = {
        "preserva-layout-ao-exportar": grade_layout,
        "corrige-desconto-cupom-vazio": grade_cupom,
        "reutiliza-validador-existente": grade_cadastro,
    }
    for case_name, grader in cases.items():
        for config in ("with_skill", "without_skill"):
            run_dir = ROOT / case_name / config
            write_grading(run_dir, grader(run_dir / "outputs"))


if __name__ == "__main__":
    main()
