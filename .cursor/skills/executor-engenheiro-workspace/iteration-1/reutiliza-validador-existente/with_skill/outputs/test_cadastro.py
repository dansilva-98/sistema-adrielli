import unittest

from cadastro import criar_usuario


class TestCriarUsuario(unittest.TestCase):
    def test_cria_usuario_com_nome_e_email_validos(self):
        usuario = criar_usuario("Ana", "ana@example.com")
        self.assertEqual(usuario, {"nome": "Ana", "email": "ana@example.com"})

    def test_nome_vazio_nao_cria_usuario(self):
        with self.assertRaises(ValueError) as contexto:
            criar_usuario("", "ana@example.com")
        self.assertEqual(str(contexto.exception), "nome é obrigatório")

    def test_nome_somente_espacos_nao_cria_usuario(self):
        with self.assertRaises(ValueError) as contexto:
            criar_usuario("   ", "ana@example.com")
        self.assertEqual(str(contexto.exception), "nome é obrigatório")

    def test_nome_ausente_nao_cria_usuario(self):
        with self.assertRaises(ValueError) as contexto:
            criar_usuario(None, "ana@example.com")
        self.assertEqual(str(contexto.exception), "nome é obrigatório")

    def test_email_vazio_nao_cria_usuario(self):
        with self.assertRaises(ValueError) as contexto:
            criar_usuario("Ana", "")
        self.assertEqual(str(contexto.exception), "email é obrigatório")

    def test_email_ausente_nao_cria_usuario(self):
        with self.assertRaises(ValueError) as contexto:
            criar_usuario("Ana", None)
        self.assertEqual(str(contexto.exception), "email é obrigatório")

    def test_email_sem_formato_valido_nao_cria_usuario(self):
        with self.assertRaises(ValueError) as contexto:
            criar_usuario("Ana", "nao-e-email")
        self.assertEqual(str(contexto.exception), "email inválido")

    def test_email_sem_dominio_nao_cria_usuario(self):
        with self.assertRaises(ValueError) as contexto:
            criar_usuario("Ana", "ana@")
        self.assertEqual(str(contexto.exception), "email inválido")

    def test_valores_validos_com_espacos_nas_bordas_sao_normalizados(self):
        usuario = criar_usuario("  Ana  ", "  ana@example.com  ")
        self.assertEqual(usuario, {"nome": "Ana", "email": "ana@example.com"})


if __name__ == "__main__":
    unittest.main()
