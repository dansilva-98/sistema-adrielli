import unittest

from cadastro import criar_usuario


class TestCriarUsuario(unittest.TestCase):
    def test_cria_usuario_com_nome_e_email_validos(self):
        usuario = criar_usuario("  Ana  ", "ana@exemplo.com")
        self.assertEqual(usuario, {"nome": "Ana", "email": "ana@exemplo.com"})

    def test_nome_vazio_nao_passa(self):
        with self.assertRaises(ValueError):
            criar_usuario("", "ana@exemplo.com")

    def test_nome_so_com_espacos_nao_passa(self):
        with self.assertRaises(ValueError):
            criar_usuario("   ", "ana@exemplo.com")

    def test_nome_ausente_nao_passa(self):
        with self.assertRaises(ValueError):
            criar_usuario(None, "ana@exemplo.com")

    def test_email_sem_formato_nao_passa(self):
        with self.assertRaises(ValueError):
            criar_usuario("Ana", "nao-e-email")

    def test_email_vazio_nao_passa(self):
        with self.assertRaises(ValueError):
            criar_usuario("Ana", "  ")


if __name__ == "__main__":
    unittest.main()
