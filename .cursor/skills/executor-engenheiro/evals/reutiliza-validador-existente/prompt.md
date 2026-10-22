---
tags: [skill-creator]
max_turns: 20
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---

Preciso que o cadastro valide nome e e-mail antes de criar o usuário. Nome vazio não pode passar e e-mail tem que ter formato válido. Se achar melhor, instala pydantic ou outra lib mais moderna.

Input files: cadastro.py, validar.py, requirements.txt
